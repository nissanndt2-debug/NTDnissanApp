import { router } from 'expo-router';
import { Bell, X } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { notifications as notificationsApi } from '@/api/endpoints';
import { NOTIFICATION_SCREEN, notificationLabel, type AppNotification } from '@/domain/notifications';
import { canAccess, type ScreenName } from '@/domain/permissions';
import { useNotificationStore } from '@/store/notificationStore';
import { COLORS } from './theme';

const DEMO_TOKEN = 'demo';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

/**
 * Bandeja de notificaciones. Bottom sheet en vez de dropdown: mismo
 * componente sirve en movil y web (el sheet cierra hasta abajo tambien
 * funciona bien con mouse), y evita mantener dos implementaciones.
 */
export function NotificationPanel() {
  const { token, user } = useAuth();
  const panelOpen = useNotificationStore((state) => state.panelOpen);
  const items = useNotificationStore((state) => state.items);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const closePanel = useNotificationStore((state) => state.closePanel);
  const markRead = useNotificationStore((state) => state.markRead);
  const markAllRead = useNotificationStore((state) => state.markAllRead);

  const isReal = !!token && token !== DEMO_TOKEN;

  const onMarkAll = () => {
    markAllRead();
    if (isReal) void notificationsApi.markAllRead(token).catch(() => {});
  };

  const onTapItem = (item: AppNotification) => {
    markRead(item.id);
    if (isReal) void notificationsApi.markRead(item.id, token).catch(() => {});

    const screen = NOTIFICATION_SCREEN[item.type as keyof typeof NOTIFICATION_SCREEN];
    closePanel();
    if (screen && canAccess(screen as ScreenName, user?.roleId)) {
      router.push(`/(app)/${screen}` as never);
    }
  };

  return (
    <Modal visible={panelOpen} animationType="slide" transparent onRequestClose={closePanel}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={closePanel}>
        <Pressable className="max-h-[78%] rounded-t-3xl bg-canvas" onPress={() => {}}>
          <SafeAreaView edges={['bottom']}>
            <View className="items-center pb-1 pt-2">
              <View className="h-1 w-10 rounded-full bg-line" />
            </View>

            <View className="flex-row items-center justify-between px-5 pb-3 pt-2">
              <Text className="text-xl font-bold text-ink">Notificaciones</Text>
              <Pressable onPress={closePanel} hitSlop={12} className="p-1">
                <X color={COLORS.muted} size={22} strokeWidth={2} />
              </Pressable>
            </View>

            {unreadCount > 0 ? (
              <Pressable onPress={onMarkAll} className="px-5 pb-3" hitSlop={8}>
                <Text className="text-sm font-bold text-primary">
                  Marcar las {unreadCount} como leidas
                </Text>
              </Pressable>
            ) : null}

            <ScrollView contentContainerClassName="px-5 pb-8">
              {items.length === 0 ? (
                <View className="items-center gap-3 py-16">
                  <Bell color={COLORS.line} size={32} strokeWidth={1.5} />
                  <Text className="text-center text-sm text-muted">
                    Sin notificaciones todavia.{'\n'}Aqui apareceran los avisos de la siguiente
                    estacion del flujo.
                  </Text>
                </View>
              ) : (
                items.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => onTapItem(item)}
                    className={`mb-2 rounded-2xl border p-4 ${
                      item.isRead ? 'border-line bg-surface' : 'border-primary bg-surface'
                    }`}
                  >
                    <View className="flex-row items-start justify-between gap-3">
                      <Text className="flex-1 text-sm font-bold text-ink">
                        {notificationLabel(item.type)}
                      </Text>
                      {!item.isRead ? <View className="mt-1 h-2 w-2 rounded-full bg-primary" /> : null}
                    </View>
                    <Text className="mt-1 text-xs text-muted">{item.message}</Text>
                    <Text className="mt-2 text-[11px] font-semibold text-muted">
                      {timeAgo(item.createdAt)}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
