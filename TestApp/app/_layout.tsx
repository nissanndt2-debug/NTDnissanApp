import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/auth/AuthProvider';
import { getDb } from '@/db';
import { NotificationProvider } from '@/notifications/NotificationProvider';
import { SyncProvider } from '@/sync/SyncProvider';
import { NotificationPanel } from '@/ui/NotificationPanel';
import { NotificationToast } from '@/ui/NotificationToast';
import { TruckLoader } from '@/ui/TruckLoader';
import '../global.css';

/**
 * Layout raiz. Orden de los providers (importa):
 *   Query -> Auth -> Sync -> Notification
 * Sync necesita el token de Auth para poder drenar la bandeja de salida.
 * Notification necesita el token de Auth y el `syncNow` de Sync (un evento
 * en vivo adelanta el proximo pull).
 *
 * El panel y el toast de notificaciones se montan UNA vez aqui arriba, no por
 * pantalla: leen el mismo store global, asi que cualquier campana en
 * cualquier pantalla abre el mismo panel.
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // La fuente de verdad en pantalla es SQLite, no la red:
      // los reintentos agresivos solo gastan bateria.
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    void getDb().then(() => setDbReady(true));
  }, []);

  if (!dbReady) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <TruckLoader size={132} accessibilityLabel="Preparando NissanNDT" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SyncProvider>
            <NotificationProvider>
              <StatusBar style="dark" />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
                <Stack.Screen name="(app)" />
                {/* Dashboard del admin: fuera del grupo con pestanas, solo web */}
                <Stack.Screen name="dashboard" />
              </Stack>
              <NotificationPanel />
              <NotificationToast />
            </NotificationProvider>
          </SyncProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
