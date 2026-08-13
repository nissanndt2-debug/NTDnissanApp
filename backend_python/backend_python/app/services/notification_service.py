import asyncio
import logging

from app.constants.index import (
    NOTIFICATION_CLEANUP_INTERVAL_HOURS,
    NOTIFICATION_KEEP_RECENT_PER_USER,
    NOTIFICATION_RETENTION_HOURS,
)
from app.constants.index import ROLE_IDS
from app.realtime.notification_hub import notification_hub
from app.repositories.notification_repository import notification_repository
from app.repositories.unit_repository import unit_repository
from app.repositories.user_repository import user_repository
from app.services.push_notification_service import push_notification_service


logger = logging.getLogger("body_app_backend")


class NotificationService:
    async def _create_for_user_ids(self, user_ids: list[int], unit_id: int, notification_type: str, message: str):
        if not user_ids:
            return []

        payload = [
            {
                "userId": user_id,
                "unitId": unit_id,
                "type": notification_type,
                "message": message,
            }
            for user_id in user_ids
        ]

        created = await notification_repository.create_many(payload)
        await notification_hub.broadcast_notifications(created)
        await self._send_push(user_ids, unit_id, notification_type, message)
        return created

    async def _send_push(self, user_ids: list[int], unit_id: int, notification_type: str, message: str) -> None:
        # Best-effort a proposito: la notificacion ya se creo y ya se mando
        # por WebSocket antes de llegar aqui. Que Expo este caido o un token
        # este corrupto no debe tumbar el cambio de estado que disparo todo
        # esto — el operador se entera de todos modos por la campana.
        try:
            await push_notification_service.send_to_users(user_ids, notification_type, message, unit_id)
        except Exception:
            logger.exception("Push notification failed for type=%s unitId=%s", notification_type, unit_id)

    async def _create_for_role_ids(self, role_ids: list[int], unit_id: int, notification_type: str, message: str, carrier_provider_id: int | None = None):
        unit = await unit_repository.find_by_id(unit_id)
        unit_plant = unit.get("plant") if unit else None
        users = await user_repository.find_by_role_ids(role_ids, unit_plant)

        filtered = []
        for user in users:
            if user.get("roleId") != ROLE_IDS["CARRIER"]:
                filtered.append(user)
            elif carrier_provider_id is not None and user.get("providerId") == carrier_provider_id:
                filtered.append(user)

        if not filtered:
            return []

        payload = [
            {
                "userId": user["id"],
                "unitId": unit_id,
                "type": notification_type,
                "message": message,
            }
            for user in filtered
        ]

        if not payload:
            return []

        created = await notification_repository.create_many(payload)
        await notification_hub.broadcast_notifications(created)
        await self._send_push([user["id"] for user in filtered], unit_id, notification_type, message)
        return created

    async def notify_unit_reported(self, unit: dict):
        return await self._create_for_role_ids([ROLE_IDS["WWS"], ROLE_IDS["SCM"], ROLE_IDS["BODY"]], unit["id"], "UNIT_REPORTED", f"Unidad reportada por carrier. VIN: {unit['vin']}")

    async def notify_unit_released(self, unit: dict):
        provider_id = await unit_repository.get_registered_by_provider_id(unit["id"])
        return await self._create_for_role_ids([ROLE_IDS["WWS"], ROLE_IDS["SCM"], ROLE_IDS["CARRIER"]], unit["id"], "UNIT_RELEASED", f"Unidad liberada en BODY. VIN: {unit['vin']}", provider_id)

    async def notify_unit_delivered(self, unit: dict):
        return await self._create_for_role_ids([ROLE_IDS["BODY"], ROLE_IDS["SCM"]], unit["id"], "UNIT_DELIVERED", f"Unidad entregada a Body por WWS. VIN: {unit['vin']}")

    async def notify_unit_wws_released(self, unit: dict):
        provider_id = await unit_repository.get_registered_by_provider_id(unit["id"])
        return await self._create_for_role_ids([ROLE_IDS["CARRIER"], ROLE_IDS["SCM"]], unit["id"], "UNIT_WWS_RELEASED", f"Unidad liberada por WWS. VIN: {unit['vin']}", provider_id)

    async def notify_unit_accepted(self, unit: dict):
        return await self._create_for_role_ids([ROLE_IDS["WWS"], ROLE_IDS["SCM"], ROLE_IDS["BODY"]], unit["id"], "UNIT_ACCEPTED", f"Unidad aceptada por Carrier. VIN: {unit['vin']}")

    async def notify_wty_pending(self, unit: dict, comment: str | None = None):
        msg = f"Unidad enviada a validacion WTY. VIN: {unit['vin']}"
        if comment:
            msg = f"{msg} - Comentario WWS: {comment}"
        return await self._create_for_role_ids([ROLE_IDS["WTY"], ROLE_IDS["SCM_QUALITY"], ROLE_IDS["SCM"]], unit["id"], "WTY_PENDING", msg)

    async def notify_wty_released(self, unit: dict):
        return await self._create_for_role_ids([ROLE_IDS["WWS"], ROLE_IDS["SCM"]], unit["id"], "WTY_RELEASED", f"Unidad aprobada por WTY y lista para liberacion WWS. VIN: {unit['vin']}")

    async def notify_unit_rejected(self, unit: dict, note: str | None = None):
        msg = f"Unidad rechazada por Carrier. VIN: {unit['vin']}"
        if note:
            msg = f"{msg} - Motivo: {note}"
        return await self._create_for_role_ids([ROLE_IDS["WWS"], ROLE_IDS["SCM"], ROLE_IDS["BODY"]], unit["id"], "UNIT_REJECTED", msg)

    async def notify_unit_returned_to_sent(self, unit: dict, rejection_note: str | None = None):
        msg = f"Unidad rechazada regresada a Nivelacion WWS para re-entrega. VIN: {unit['vin']}"
        if rejection_note:
            msg = f"Unidad rechazada regresada a Nivelacion WWS. VIN: {unit['vin']} - Motivo: {rejection_note}"
        return await self._create_for_role_ids([ROLE_IDS["WWS"], ROLE_IDS["SCM"]], unit["id"], "UNIT_RETURNED_TO_SENT", msg)

    async def notify_unit_archived(self, unit: dict):
        return await self._create_for_role_ids([ROLE_IDS["SCM"], ROLE_IDS["WWS"]], unit["id"], "UNIT_ARCHIVED", f"Unidad archivada (no disponible). VIN: {unit['vin']}")

    async def notify_unit_deletion_requested(self, unit: dict, reason: str, requested_by_label: str):
        return await self._create_for_role_ids(
            [ROLE_IDS["SCM"]],
            unit["id"],
            "UNIT_DELETION_REQUESTED",
            f"Solicitud de borrado enviada por {requested_by_label}. VIN: {unit['vin']} - Justificacion: {reason}",
        )

    async def notify_unit_deletion_approved(self, unit: dict, requester_user_id: int, reason: str | None = None):
        msg = f"SCM aprobo y borro la unidad solicitada. VIN: {unit['vin']}"
        if reason:
            msg = f"{msg} - Justificacion original: {reason}"
        return await self._create_for_user_ids([requester_user_id], unit["id"], "UNIT_DELETION_APPROVED", msg)

    async def notify_unit_deletion_rejected(self, unit: dict, requester_user_id: int, decision_note: str | None = None):
        msg = f"SCM rechazo la solicitud de borrado. VIN: {unit['vin']}"
        if decision_note:
            msg = f"{msg} - Comentario: {decision_note}"
        return await self._create_for_user_ids([requester_user_id], unit["id"], "UNIT_DELETION_REJECTED", msg)

    async def cleanup_stale_notifications(
        self,
        keep_recent_per_user: int = NOTIFICATION_KEEP_RECENT_PER_USER,
        max_age_hours: int = NOTIFICATION_RETENTION_HOURS,
    ) -> int:
        deleted_count = await notification_repository.cleanup_stale_keep_recent(
            keep_recent_per_user,
            max_age_hours,
        )
        if deleted_count > 0:
            logger.info(
                "Notification cleanup removed %s stale rows (keep_recent=%s max_age_hours=%s)",
                deleted_count,
                keep_recent_per_user,
                max_age_hours,
            )
        return deleted_count

    async def run_periodic_cleanup(self, stop_event: asyncio.Event) -> None:
        interval_seconds = NOTIFICATION_CLEANUP_INTERVAL_HOURS * 60 * 60

        while not stop_event.is_set():
            try:
                await self.cleanup_stale_notifications()
            except Exception:
                logger.exception("Periodic notification cleanup failed")

            try:
                await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
            except asyncio.TimeoutError:
                continue


notification_service = NotificationService()
