import type { AppNotification } from '@/domain/notifications';

/**
 * Canal en vivo (WebSocket) contra `backend_python`'s
 * `ws://host/ws/notifications?token=<JWT>`.
 *
 * El contrato es real, no especulativo: el servidor manda
 * `{"type": "connected"}` al conectar y
 * `{"type": "notification", "payload": Notification[]}` cada vez que
 * `notification_service` crea notificaciones para este usuario (ver
 * `app/realtime/notification_hub.py`). No hace falta ningun endpoint nuevo.
 *
 * Sin `EXPO_PUBLIC_REALTIME_URL` el canal queda inerte — la app sigue
 * funcionando por REST (`GET /notifications`) y el sondeo normal de
 * `SyncProvider`. No hace falta hardware de ningun tipo.
 */

export type LiveMessage =
  | { type: 'connected' }
  | { type: 'notification'; payload: AppNotification[] };

export interface LiveHandle {
  close: () => void;
}

function resolveUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_REALTIME_URL?.trim();
  return configured ? configured.replace(/\/+$/, '') : null;
}

/** Tope del backoff. Reconectar mas seguido no arregla un servidor caido. */
const MAX_DELAY_MS = 30_000;

/**
 * Abre el canal y llama a `onNotification` con cada lote que llegue.
 * Reconecta con backoff exponencial. Devuelve null si no hay canal
 * configurado (no hay nada que cerrar en ese caso).
 */
export function openLiveChannel(
  token: string,
  onNotification: (items: AppNotification[]) => void,
  onStatus?: (connected: boolean) => void
): LiveHandle | null {
  const base = resolveUrl();
  if (!base) return null;

  let socket: WebSocket | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const connect = () => {
    if (closed) return;

    socket = new WebSocket(`${base}?token=${encodeURIComponent(token)}`);

    socket.onopen = () => {
      attempt = 0;
      onStatus?.(true);
    };

    socket.onmessage = (message) => {
      try {
        const parsed = JSON.parse(String(message.data)) as LiveMessage;
        if (parsed.type === 'notification') onNotification(parsed.payload);
      } catch {
        // Mensaje que no es JSON: se ignora, no vale tirar la conexion por el.
      }
    };

    socket.onerror = () => socket?.close();

    socket.onclose = () => {
      onStatus?.(false);
      if (closed) return;
      attempt += 1;
      const delay = Math.min(2 ** attempt * 1000, MAX_DELAY_MS);
      timer = setTimeout(connect, delay);
    };
  };

  connect();

  return {
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    },
  };
}

export function isLiveConfigured(): boolean {
  return resolveUrl() !== null;
}
