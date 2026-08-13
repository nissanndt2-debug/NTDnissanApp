import logging
from datetime import datetime, timezone

from app.realtime.unit_event_stream import unit_event_stream
from app.repositories.unit_deletion_request_repository import unit_deletion_request_repository
from app.repositories.unit_repository import unit_repository
from app.repositories.user_repository import user_repository
from app.services.blob_storage_service import blob_storage_service
from app.services.notification_service import notification_service
from app.constants.index import ROLE_IDS


logger = logging.getLogger("body_app_backend")


class UnitDeletionRequestService:
    def _validate_reason(self, reason: str):
        if len(reason) < 15 or len(reason) > 500:
            raise ValueError("Reason must be between 15 and 500 characters")

    async def request_deletion(self, unit_id: int, requested_by_id: int, reason: str):
        self._validate_reason(reason)

        unit = await unit_repository.find_by_id(unit_id)
        if not unit:
            raise ValueError("Unit not found")

        existing_pending = await unit_deletion_request_repository.find_pending_by_unit_id(unit_id)
        if existing_pending:
            raise ValueError("There is already a pending deletion request for this unit")

        created = await unit_deletion_request_repository.create(unit_id, requested_by_id, reason)
        requester = await user_repository.find_by_id(requested_by_id)
        role_label_by_id = {
            ROLE_IDS["CARRIER"]: "Carrier",
            ROLE_IDS["WWS"]: "WWS",
        }
        requester_role = role_label_by_id.get((requester or {}).get("roleId"), "Usuario")
        requester_label = f"{requester.get('name')} ({requester_role})" if requester and requester.get("name") else requester_role

        await unit_event_stream.broadcast(
            {
                "unitId": unit_id,
                "status": unit.get("statusName"),
                "event": "UNIT_DELETION_REQUESTED",
                "plant": unit.get("plant"),
                "createdAt": datetime.now(timezone.utc).isoformat(),
            }
        )

        await notification_service.notify_unit_deletion_requested(
            {"id": unit["id"], "vin": unit["vin"]},
            reason,
            requester_label,
        )

        return created

    async def list_requests(self, status: str, plant: str | None = None):
        normalized = status.upper()
        if normalized not in {"PENDING", "APPROVED", "REJECTED"}:
            raise ValueError("Invalid status. Use PENDING, APPROVED or REJECTED")
        return await unit_deletion_request_repository.list_by_status(normalized, plant)

    async def decide_request(self, request_id: int, decision: str, decision_note: str | None, decided_by_id: int):
        normalized_decision = decision.upper()

        if normalized_decision == "REJECT":
            request = await unit_deletion_request_repository.find_by_id(request_id)
            if not request:
                raise ValueError("Deletion request not found")

            rejected = await unit_deletion_request_repository.reject(request_id, decision_note, decided_by_id)

            await unit_event_stream.broadcast(
                {
                    "unitId": request["unitId"],
                    "status": request.get("status"),
                    "event": "UNIT_DELETION_DECIDED",
                    "plant": request.get("plant"),
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                }
            )

            await notification_service.notify_unit_deletion_rejected(
                {"id": request["unitId"], "vin": request["vin"]},
                request["requestedById"],
                decision_note,
            )
            return rejected

        if normalized_decision != "APPROVE":
            raise ValueError("Invalid decision. Use APPROVE or REJECT")

        request = await unit_deletion_request_repository.find_by_id(request_id)
        if not request:
            raise ValueError("Deletion request not found")
        if request.get("status") != "PENDING":
            raise ValueError("Request is not pending")

        photo_urls = await unit_repository.get_unit_photo_urls(request["unitId"])
        if photo_urls:
            try:
                await blob_storage_service.delete_urls(photo_urls)
            except Exception:
                logger.exception(
                    "Blob cleanup failed while approving deletion request %s for unit %s",
                    request_id,
                    request["unitId"],
                )

        approved = await unit_deletion_request_repository.approve_and_delete_unit(request_id, decided_by_id)

        await unit_event_stream.broadcast(
            {
                "unitId": approved["unitId"],
                "status": "DELETED",
                "event": "UNIT_DELETION_DECIDED",
                "plant": approved.get("plant"),
                "createdAt": datetime.now(timezone.utc).isoformat(),
            }
        )

        return {
            "requestId": request_id,
            "unitId": approved["unitId"],
            "status": "APPROVED",
        }


unit_deletion_request_service = UnitDeletionRequestService()
