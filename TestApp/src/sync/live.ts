import { getApiBaseUrl } from '@/api/client';
import type { AppNotification } from '@/domain/notifications';

/** Un cambio de unidad no lleva datos completos: obliga a sincronizar SQLite. */
export interface UnitUpdateEvent {
  eventId?: string;
  unitId: number;
  event: string;
  status?: string;
  plant?: string | null;
  createdAt?: string;
}

export type LiveMessage =
  | { type: 'connected' }
  | { type: 'heartbeat' }
  | { type: 'notification'; payload: AppNotification[] }
  | { type: 'unit-update'; payload: UnitUpdateEvent }
  | { type: 'reference-update'; payload: { eventId: string; resource: string } };

export interface LiveHandlers {
  onNotification: (items: AppNotification[]) => void;
  onUnitUpdate: (event: UnitUpdateEvent) => void;
  onReferenceUpdate: (resource: string) => void;
  onStatus?: (connected: boolean) => void;
}

export interface LiveHandle {
  close: () => void;
  /** Fuerza una nueva suscripcion despues de recuperar red o primer plano. */
  reconnect: () => void;
}

const MAX_DELAY_MS = 30_000;
const KEEPALIVE_MS = 20_000;
const AUTH_REJECTED_CLOSE_CODE = 1008;
const WS_TOKEN_PROTOCOL_PREFIX = 'bodyapp.jwt.';

function debug(...args: unknown[]): void {
  if (process.env.EXPO_PUBLIC_REALTIME_DEBUG === 'true') {
    console.info('[realtime]', ...args);
  }
}

function resolveUrl(): string {
  const configured = process.env.EXPO_PUBLIC_REALTIME_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  // En desarrollo no se debe requerir una segunda URL: API y WebSocket son el
  // mismo backend. Esto elimina el caso donde REST funciona pero realtime no.
  return `${getApiBaseUrl().replace(/^http/i, 'ws')}/ws/notifications`;
}

/**
 * Un solo WebSocket por sesion. Reconecta con backoff, ignora callbacks de
 * sockets obsoletos y nunca deja que un error viejo cierre la conexion nueva.
 */
export function openLiveChannel(token: string, handlers: LiveHandlers): LiveHandle {
  const base = resolveUrl();
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  let attempt = 0;
  let intentionallyClosed = false;
  let connected = false;

  const setStatus = (next: boolean) => {
    if (connected === next) return;
    connected = next;
    handlers.onStatus?.(next);
  };

  const clearTimers = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (keepaliveTimer) clearInterval(keepaliveTimer);
    reconnectTimer = null;
    keepaliveTimer = null;
  };

  const scheduleReconnect = () => {
    if (intentionallyClosed || reconnectTimer) return;
    attempt += 1;
    const exponential = Math.min(1_000 * 2 ** (attempt - 1), MAX_DELAY_MS);
    const jitter = Math.floor(Math.random() * Math.min(1_000, exponential * 0.2));
    const delay = exponential + jitter;
    debug('reconnect scheduled', { attempt, delay });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (intentionallyClosed || reconnectTimer) return;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // El JWT no se pone en la URL: esa URL puede guardarse en historial,
    // registros de proxy o telemetria. El servidor confirma este subprotocolo
    // durante el handshake y no acepta el esquema anterior con `?token=`.
    const candidate = new WebSocket(base, [`${WS_TOKEN_PROTOCOL_PREFIX}${token}`]);
    socket = candidate;
    debug('connecting', { attempt, base });

    candidate.onopen = () => {
      if (socket !== candidate || intentionallyClosed) return;
      attempt = 0;
      setStatus(true);
      debug('connected');
      keepaliveTimer = setInterval(() => {
        if (socket === candidate && candidate.readyState === WebSocket.OPEN) {
          candidate.send(JSON.stringify({ type: 'ping' }));
        }
      }, KEEPALIVE_MS);
    };

    candidate.onmessage = (message) => {
      if (socket !== candidate || intentionallyClosed) return;
      try {
        const parsed = JSON.parse(String(message.data)) as LiveMessage;
        if (parsed.type === 'notification') {
          debug('notification received', { count: parsed.payload.length });
          handlers.onNotification(parsed.payload);
        } else if (parsed.type === 'unit-update') {
          debug('unit event received', { event: parsed.payload.event, unitId: parsed.payload.unitId });
          handlers.onUnitUpdate(parsed.payload);
        } else if (parsed.type === 'reference-update') {
          debug('reference event received', { resource: parsed.payload.resource });
          handlers.onReferenceUpdate(parsed.payload.resource);
        }
      } catch (error) {
        // Un payload malformado no invalida una conexion sana. El siguiente
        // evento o una reconexion sincronizara desde la fuente de verdad.
        debug('message ignored', error instanceof Error ? error.message : error);
      }
    };

    candidate.onerror = () => {
      if (socket === candidate) {
        debug('socket error');
        candidate.close();
      }
    };

    candidate.onclose = (event) => {
      if (socket !== candidate) return;
      socket = null;
      if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = null;
      }
      setStatus(false);
      debug('disconnected', { code: event.code, intentional: intentionallyClosed });
      if (!intentionallyClosed && event.code !== AUTH_REJECTED_CLOSE_CODE) {
        scheduleReconnect();
      }
    };
  };

  connect();

  return {
    close: () => {
      intentionallyClosed = true;
      clearTimers();
      const current = socket;
      socket = null;
      setStatus(false);
      if (current && current.readyState < WebSocket.CLOSING) current.close();
      debug('subscription cancelled');
    },
    reconnect: () => {
      if (intentionallyClosed) return;
      clearTimers();
      const current = socket;
      socket = null;
      if (current && current.readyState < WebSocket.CLOSING) current.close();
      setStatus(false);
      debug('manual reconnect');
      connect();
    },
  };
}

export function isLiveConfigured(): boolean {
  return Boolean(resolveUrl());
}
