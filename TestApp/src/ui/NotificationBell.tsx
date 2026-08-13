import { Bell } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { useNotificationStore } from '@/store/notificationStore';
import { COLORS } from './theme';

/**
 * Campana con contador de no leidas. Un solo store global (`notificationStore`)
 * detras, asi que la misma campana funciona igual en el header oscuro movil y
 * en el navbar del dashboard web sin duplicar estado.
 */
export function NotificationBell({ onDark }: { onDark?: boolean }) {
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const openPanel = useNotificationStore((state) => state.openPanel);
  const color = onDark ? COLORS.white : COLORS.ink;

  return (
    <Pressable
      onPress={openPanel}
      hitSlop={12}
      className="relative h-11 w-11 items-center justify-center"
      accessibilityLabel={
        unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'
      }
    >
      <Bell color={color} size={22} strokeWidth={2} />
      {unreadCount > 0 ? (
        <View className="absolute right-1 top-1 h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1">
          <Text className="text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
