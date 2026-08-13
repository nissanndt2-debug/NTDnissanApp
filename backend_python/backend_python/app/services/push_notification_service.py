import asyncio
import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config.environment import env
from app.repositories.push_token_repository import push_token_repository


logger = logging.getLogger("body_app_backend")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
# Limite duro de la API de Expo por request; no es un ajuste de rendimiento.
EXPO_BATCH_SIZE = 100

# Mismas etiquetas que TestApp/src/domain/notifications.ts (NOTIFICATION_LABEL)
# — son el titulo de la notificacion del sistema operativo, asi que deben leer
# igual que la campana dentro de la app.
NOTIFICATION_TITLE = {
    "UNIT_REPORTED": "Nueva unidad reportada",
    "UNIT_RELEASED": "Unidad liberada por Body",
    "UNIT_DELIVERED": "Unidad entregada a Body",
    "UNIT_WWS_RELEASED": "Unidad liberada por WWS",
    "UNIT_ACCEPTED": "Unidad aceptada",
    "WTY_PENDING": "Enviada a validacion de garantia",
    "WTY_RELEASED": "Aprobada por garantia",
    "UNIT_REJECTED": "Unidad rechazada",
    "UNIT_RETURNED_TO_SENT": "Regresada a nivelacion",
    "UNIT_ARCHIVED": "Unidad archivada",
    "UNIT_DELETION_REQUESTED": "Solicitud de borrado",
    "UNIT_DELETION_APPROVED": "Borrado aprobado",
    "UNIT_DELETION_REJECTED": "Borrado rechazado",
}


class PushNotificationService:
    """
    Notificaciones que llegan al telefono aunque la app este cerrada.

    Best-effort a proposito, igual que el borrado de fotos de Vercel: un fallo
    aqui (Expo caido, token vencido) nunca debe tumbar la creacion de la
    notificacion ni el WebSocket, que ya corrieron antes de llegar aqui.
    """

    def _post_sync(self, messages: list[dict]) -> list[dict]:
        body = json.dumps(messages).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        # Opcional: sin este token Expo igual manda los pushes, solo que sin
        # la proteccion extra contra que alguien mas mande en tu nombre.
        if env.expo_access_token:
            headers["Authorization"] = f"Bearer {env.expo_access_token}"

        request = Request(url=EXPO_PUSH_URL, data=body, headers=headers, method="POST")
        with urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return payload.get("data", [])

    async def send_to_users(self, user_ids: list[int], notification_type: str, message: str, unit_id: int) -> None:
        if not user_ids:
            return

        rows = await push_token_repository.find_by_user_ids(user_ids)
        if not rows:
            return

        title = NOTIFICATION_TITLE.get(notification_type, "Body App")
        messages = [
            {
                "to": row["token"],
                "title": title,
                "body": message,
                "sound": "default",
                "data": {"type": notification_type, "unitId": unit_id},
            }
            for row in rows
        ]

        stale_tokens: list[str] = []
        for start in range(0, len(messages), EXPO_BATCH_SIZE):
            batch = messages[start : start + EXPO_BATCH_SIZE]
            try:
                tickets = await asyncio.to_thread(self._post_sync, batch)
            except (HTTPError, URLError, TimeoutError, ValueError) as exc:
                logger.warning("Push notification batch failed: %s", exc)
                continue

            for ticket, sent in zip(tickets, batch):
                if ticket.get("status") != "error":
                    continue
                if ticket.get("details", {}).get("error") == "DeviceNotRegistered":
                    stale_tokens.append(sent["to"])
                else:
                    # Errores no fatales para el token (limite de tasa, mensaje
                    # invalido, etc.) — se registran para poder depurarlos, pero
                    # no se borra el token: podria volver a funcionar despues.
                    logger.warning("Expo push error: %s", ticket.get("message"))

        if stale_tokens:
            await push_token_repository.delete_tokens(stale_tokens)


push_notification_service = PushNotificationService()
