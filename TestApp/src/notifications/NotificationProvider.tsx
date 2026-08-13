import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { notifications as notificationsApi, pushTokens as pushTokensApi } from '@/api/endpoints';
import { NOTIFICATION_SCREEN } from '@/domain/notifications';
import { canAccess, type ScreenName } from '@/domain/permissions';
import { registerForPushNotificationsAsync } from './push';
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
  const { token, user } = useAuth();
  const { syncNow } = useSync();
  const setInitial = useNotificationStore((state) => state.setInitial);
  const addIncoming = useNotificationStore((state) => state.addIncoming);
  const setConnected = useNotificationStore((state) => state.setConnected);
  const reset = useNotificationStore((state) => state.reset);
  const handleRef = useRef<LiveHandle | null>(null);
  const deviceTokenRef = useRef<string | null>(null);

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

    // Push del sistema operativo: cubre lo que el WebSocket no puede (app
    // cerrada o en segundo plano). Web no tiene push de Expo, asi que ni se
    // intenta — evita un permiso del navegador que no serviria de nada aqui.
    if (Platform.OS !== 'web') {
      void (async () => {
        const deviceToken = await registerForPushNotificationsAsync();
        if (cancelled || !deviceToken) return;
        deviceTokenRef.current = deviceToken;
        try {
          await pushTokensApi.register(deviceToken, token);
        } catch {
          // Sin red justo al loguearse: no es grave, el proximo cambio de
          // pantalla que dispare este efecto (p.ej. un refresh de token) lo
          // reintenta solo.
        }
      })();
    }

    return () => {
      cancelled = true;
      handleRef.current?.close();
      handleRef.current = null;

      if (deviceTokenRef.current) {
        // Best-effort: si falla (sin red al cerrar sesion), el peor caso es
        // que este dispositivo siga recibiendo pushes del usuario anterior
        // hasta el proximo login, que sobreescribe el dueno del token.
        void pushTokensApi.unregister(deviceTokenRef.current, token).catch(() => {});
        deviceTokenRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Tocar la notificacion del sistema (app en segundo plano) navega igual que
  // tocar la misma fila dentro del panel (`ui/NotificationPanel.tsx`, funcion
  // onTapItem) — mismo mapeo tipo -> pantalla, mismo candado de rol. Efecto
  // aparte y sin depender de `token`: debe seguir armado aunque el ciclo de
  // arriba se reinicie por un refresh de sesion.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { type?: string; unitId?: number }
        | undefined;
      const screen = data?.type
        ? NOTIFICATION_SCREEN[data.type as keyof typeof NOTIFICATION_SCREEN]
        : undefined;
      if (screen && canAccess(screen as ScreenName, user?.roleId)) {
        router.push(`/(app)/${screen}` as never);
      }
    });

    return () => subscription.remove();
  }, [user?.roleId]);

  return <>{children}</>;
}
