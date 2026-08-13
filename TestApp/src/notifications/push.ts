import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Notificaciones del sistema operativo — llegan con la app cerrada o en
 * segundo plano, a diferencia del WebSocket (`sync/live.ts`), que solo
 * entrega mientras la app esta abierta en primer plano.
 *
 * Mientras la app esta en primer plano, ese mismo evento ya llega por
 * WebSocket y se muestra como toast (`ui/NotificationToast.tsx`); mostrar
 * tambien el banner del sistema encima seria el mismo aviso dos veces. Por
 * eso el handler apaga el banner en foreground — el push sigue entregandose
 * igual, solo no se dibuja porque la UI ya lo cubrio.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Pide permiso y obtiene el token de push de este dispositivo. `null` si el
 * usuario nego el permiso, si es un emulador (no tiene APNs/FCM real), o si
 * el proyecto no esta compilado con EAS todavia (Expo Go no soporta push
 * remoto desde SDK 53).
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return null;

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    // Sin Google Play Services en el dispositivo, sin red al obtener el
    // token, etc. — la app sigue funcionando sin push, no es fatal.
    return null;
  }
}
