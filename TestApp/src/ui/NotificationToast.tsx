import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationLabel } from '@/domain/notifications';
import { useNotificationStore } from '@/store/notificationStore';

const AUTO_DISMISS_MS = 5000;

/**
 * Aviso transitorio al llegar una notificacion nueva. Complementa el
 * centro de notificaciones, nunca lo sustituye: el toast desaparece solo,
 * la notificacion se queda guardada en el panel.
 */
export function NotificationToast() {
  const toast = useNotificationStore((state) => state.toast);
  const dismissToast = useNotificationStore((state) => state.dismissToast);
  const openPanel = useNotificationStore((state) => state.openPanel);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismissToast, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, dismissToast]);

  if (!toast) return null;

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 top-0 z-50 items-center px-4"
      style={{ paddingTop: insets.top + 8 }}
    >
      <Pressable
        onPress={() => {
          dismissToast();
          openPanel();
        }}
        className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-ink px-4 py-3"
      >
        <Text className="text-label uppercase text-white/50">
          {notificationLabel(toast.type)}
        </Text>
        <Text className="mt-0.5 text-sm font-semibold text-white" numberOfLines={2}>
          {toast.message}
        </Text>
      </Pressable>
    </View>
  );
}
