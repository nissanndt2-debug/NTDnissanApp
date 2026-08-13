import asyncio
import logging
from collections.abc import Awaitable
from datetime import datetime, timezone

from app.constants.index import ROLE_IDS
from app.realtime.unit_event_stream import unit_event_stream
from app.repositories.unit_repository import unit_repository
from app.services.blob_storage_service import blob_storage_service
from app.services.notification_service import notification_service


logger = logging.getLogger("body_app_backend")


class UnitService:
    def _run_in_background(self, coro: Awaitable[object], context: str) -> None:
        task = asyncio.create_task(coro)

        def _done_callback(done_task: asyncio.Task[object]) -> None:
            try:
                done_task.result()
            except Exception:
                logger.exception("Background task failed: %s", context)

        task.add_done_callback(_done_callback)

    async def _emit_event(self, unit_id: int, event: str):
        unit = await unit_repository.find_by_id(unit_id)
        if unit:
            await unit_event_stream.broadcast(
                {
                    "unitId": unit["id"],
                    "status": unit.get("statusName"),
                    "event": event,
                    "plant": unit.get("plant"),
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                }
            )
        return unit

    async def list_units(self, limit=None, provider_id=None, plant=None):
        return await unit_repository.find_all(limit or 50, provider_id, plant)

    async def list_units_by_status(self, name, limit=None, provider_id=None, plant=None):
        return await unit_repository.find_by_status_name(name, limit or 50, provider_id, plant)

    async def create_unit(self, payload: dict, registered_by_role_id=None):
        existing = await unit_repository.find_by_vin(payload["vin"], payload.get("plant"))
        if existing:
            raise ValueError(f"Unit with VIN {payload['vin']} already exists")
        initial_status = "SENT" if registered_by_role_id == ROLE_IDS["WWS"] else "REPORTED"
        unit_id = await unit_repository.create(payload, initial_status)
        unit = await self._emit_event(unit_id, "UNIT_REPORTED")
        if unit:
            self._run_in_background(
                notification_service.notify_unit_reported({"id": unit["id"], "vin": unit["vin"]}),
                "notify_unit_reported",
            )
            return unit
        return {"id": unit_id, **payload}

    async def update_unit_status(self, unit_id, new_status, changed_by_id, estimated_repair_hours=None, is_available_today=None, note=None, wty_comment=None):
        if new_status == "ACCEPTED":
            photo_urls = await unit_repository.get_unit_photo_urls(unit_id)
            if photo_urls:
                try:
                    cleanup_success = await blob_storage_service.delete_urls(photo_urls)
                    if cleanup_success:
                        await unit_repository.clear_unit_photo_urls(unit_id)
                    else:
                        logger.warning(
                            "Blob cleanup incomplete during ACCEPTED transition for unit %s; keeping photo URLs for retry",
                            unit_id,
                        )
                except Exception:
                    logger.exception("Blob cleanup failed during ACCEPTED transition for unit %s", unit_id)

        await unit_repository.update_status(unit_id, new_status, changed_by_id, estimated_repair_hours, is_available_today, note, wty_comment)
        unit = await self._emit_event(unit_id, "STATUS_CHANGED")

        notifiers = {
            "RELEASED": notification_service.notify_unit_released,
            "DELIVERED": notification_service.notify_unit_delivered,
            "WTY_PENDING": lambda u: notification_service.notify_wty_pending(u, wty_comment),
            "WTY_RELEASED": notification_service.notify_wty_released,
            "WWS_RELEASED": notification_service.notify_unit_wws_released,
            "ACCEPTED": notification_service.notify_unit_accepted,
            "REJECTED": lambda u: notification_service.notify_unit_rejected(u, note),
        }
        if unit and new_status in notifiers:
            payload = {"id": unit["id"], "vin": unit["vin"]}
            self._run_in_background(notifiers[new_status](payload), f"notify_status_{new_status.lower()}")

        if new_status == "REJECTED":
            await unit_repository.update_status(unit_id, "SENT", changed_by_id)
            updated = await self._emit_event(unit_id, "STATUS_CHANGED")
            if updated:
                self._run_in_background(
                    notification_service.notify_unit_returned_to_sent({"id": updated["id"], "vin": updated["vin"]}, note),
                    "notify_unit_returned_to_sent",
                )
            return updated

        return unit

    async def update_unit_priority(self, unit_id: int, note: str | None, rank: int | None, assigned_by_id: int):
        await unit_repository.update_priority(unit_id, note, rank, assigned_by_id)
        return await self._emit_event(unit_id, "PRIORITY_UPDATED")

    async def reorder_unit_priority(self, unit_ids: list[int], assigned_by_id: int):
        await unit_repository.reorder_priority(unit_ids, assigned_by_id)
        items = await unit_repository.find_by_status_name("RECEIVED")
        for unit in items:
            await unit_event_stream.broadcast(
                {
                    "unitId": unit["id"],
                    "status": unit.get("statusName"),
                    "event": "PRIORITY_UPDATED",
                    "plant": unit.get("plant"),
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                }
            )
        return items

    async def add_defect_to_unit(self, unit_id, defect_type, zone, grade, registered_by_id, description=None, photo_urls=None, options=None):
        await unit_repository.create_defect(unit_id, defect_type, zone, grade, description, registered_by_id, photo_urls, options)
        await self._emit_event(unit_id, "DEFECT_UPDATED")
        return await unit_repository.find_by_id_with_defects(unit_id)

    async def attach_defect_photo(self, unit_id: int, defect_id: int, photo_url: str):
        defect = await unit_repository.append_defect_photo(unit_id, defect_id, photo_url)
        if not defect:
            return None
        await self._emit_event(unit_id, "DEFECT_UPDATED")
        return await unit_repository.find_by_id_with_defects(unit_id)

    async def delete_defect_photo(self, unit_id: int, defect_id: int):
        photo_urls = await unit_repository.get_defect_photo_urls(unit_id, defect_id)
        if not photo_urls:
            return await unit_repository.find_by_id_with_defects(unit_id)

        try:
            await blob_storage_service.delete_urls(photo_urls)
        except Exception:
            logger.exception(
                "Blob cleanup failed while deleting defect photo for unit %s, defect %s",
                unit_id,
                defect_id,
            )
        await unit_repository.clear_defect_photo_urls(unit_id, defect_id)
        await self._emit_event(unit_id, "DEFECT_UPDATED")
        return await unit_repository.find_by_id_with_defects(unit_id)

    async def update_defect_grade(self, unit_id, defect_id, new_grade, updated_by_id):
        await unit_repository.update_defect_grade(defect_id, new_grade, updated_by_id)
        await self._emit_event(unit_id, "DEFECT_UPDATED")
        return await unit_repository.find_by_id_with_defects(unit_id)

    async def get_defect_stats(self, today_only=False, plant=None, provider_id=None):
        return await unit_repository.get_defect_stats(today_only, plant, provider_id)

    async def get_today_units(self, provider_id=None, plant=None):
        return await unit_repository.get_today_units(provider_id, plant)

    async def set_scm_decision(self, unit_id, decision, note, decided_by_id):
        await unit_repository.set_scm_decision(unit_id, decision, note, decided_by_id)
        return await self._emit_event(unit_id, "SCM_DECISION")

    async def get_status_stats(self, plant=None, provider_id=None):
        return await unit_repository.get_status_stats(plant, provider_id)

    async def update_estimated_repair_time(self, unit_id, estimated_repair_hours, updated_by_id):
        await unit_repository.update_estimated_repair_time(unit_id, estimated_repair_hours, updated_by_id)
        return await self._emit_event(unit_id, "REPAIR_TIME_UPDATED")

    async def get_units_in_repair(self, provider_id=None, plant=None, include_archived: bool = False):
        return await unit_repository.get_units_in_repair(provider_id, plant, include_archived)

    async def get_unit_with_defects(self, unit_id):
        return await unit_repository.find_by_id_with_defects(unit_id)

    async def get_unit(self, unit_id: int):
        """Metadatos para autorizar una unidad antes de mutarla o exponerla."""
        return await unit_repository.find_by_id(unit_id)

    async def archive_unit(self, unit_id, archived_by_id):
        await unit_repository.archive_unit(unit_id, archived_by_id)
        unit = await self._emit_event(unit_id, "STATUS_CHANGED")
        if unit:
            self._run_in_background(
                notification_service.notify_unit_archived({"id": unit["id"], "vin": unit["vin"]}),
                "notify_unit_archived",
            )
        return unit

    async def get_archivable_units(self, plant=None):
        return await unit_repository.get_archivable_units(plant)

    async def reset_daily_queue_partial(self, executed_by_id: int | None = None):
        result = await unit_repository.reset_daily_queue_partial(executed_by_id)
        if result["updatedCount"] > 0:
            await unit_event_stream.broadcast(
                {
                    "unitId": 0,
                    "event": "DAILY_QUEUE_RESET",
                    "createdAt": result["executedAt"],
                }
            )
        return result


unit_service = UnitService()
