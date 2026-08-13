import { useEffect, useRef } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { notifications as notificationsApi } from '@/api/endpoints';
import { openLiveChannel, type LiveHandle } from '@/sync/live';
import { useSync } from '@/sync/SyncProvider';
import { useNotificationStore } from '@/store/notificationStore';

const DEMO_TOKEN = 'demo';

/**
 * Ciclo de vida de las notificaciones: carga inicial por REST + canal en
 * vivo por WebSocket. Vive fuera de `SyncProvider` a proposito — son
 * responsabilidades distintas (bandeja de salida vs. bandeja de entrada) que
 * conviene poder tocar una sin arriesgar la otra.
 *
 * El modo demo (token='demo') no tiene backend real detras: no intenta ni
 * REST ni WebSocket, para no generar peticiones a un servidor que no
 * reconoce ese token.
 */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const { syncNow } = useSync();
  const setInitial = useNotificationStore((state) => state.setInitial);
  const addIncoming = useNotificationStore((state) => state.addIncoming);
  const setConnected = useNotificationStore((state) => state.setConnected);
  const reset = useNotificationStore((state) => state.reset);
  const handleRef = useRef<LiveHandle | null>(null);

  useEffect(() => {
    if (!token || token === DEMO_TOKEN) {
      reset();
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const initial = await notificationsApi.list(token);
        if (!cancelled) setInitial(initial);
      } catch {
        // Sin red o backend caido: la campana arranca en 0 y se llena
        // cuando el canal en vivo o el proximo login lo permitan.
      }
    })();

    handleRef.current = openLiveChannel(
      token,
      (items) => {
        addIncoming(items);
        // Un evento de notificacion siempre implica que algo cambio del lado
        // del servidor que a este dispositivo le interesa: es la senal mas
        // rapida disponible para adelantar el proximo pull en vez de esperar
        // al sondeo periodico.
        void syncNow();
      },
      setConnected
    );

    return () => {
      cancelled = true;
      handleRef.current?.close();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return <>{children}</>;
}
