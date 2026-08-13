import { RefreshCw } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { useSync } from '@/sync/SyncProvider';
import { COLORS } from './theme';

/**
 * Botón permanente de sincronización. Además de mostrar el estado, tocarlo
 * fuerza un intento de envío. La variante compacta conserva el estado como
 * un punto sobre el icono para encabezados estrechos.
 */
export function SyncBadge({
  onDark,
  compact = false,
}: {
  onDark?: boolean;
  compact?: boolean;
}) {
  const { online, syncing, pending, syncNow } = useSync();

  const state = !online ? 'offline' : pending > 0 ? 'pending' : 'ok';

  const tone = onDark
    ? {
        bg: 'bg-white/10',
        text: 'text-white',
        dot: state === 'ok' ? 'bg-synced' : state === 'pending' ? 'bg-v3' : 'bg-pending',
      }
    : {
        bg: state === 'ok' ? 'bg-emerald-50' : state === 'pending' ? 'bg-blue-50' : 'bg-amber-50',
        text:
          state === 'ok'
            ? 'text-synced'
            : state === 'pending'
              ? 'text-v3'
              : 'text-v2',
        dot: state === 'ok' ? 'bg-synced' : state === 'pending' ? 'bg-v3' : 'bg-pending',
      };

  const label = !online
    ? pending > 0
      ? `Sin red · ${pending} por subir`
      : 'Sin red'
    : syncing
      ? 'Sincronizando...'
      : pending > 0
        ? `${pending} por subir`
        : 'Todo sincronizado';

  return (
    <Pressable
      onPress={() => void syncNow()}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Toca para sincronizar`}
      className={`relative h-12 flex-row items-center justify-center self-start rounded-full border active:opacity-70 ${
        compact ? 'w-12 px-0' : 'gap-2 px-3.5'
      } ${onDark ? 'border-white/15' : 'border-line'} ${tone.bg}`}
    >
      <RefreshCw
        color={onDark ? COLORS.white : COLORS.ink}
        size={19}
        strokeWidth={2.2}
      />
      {compact ? (
        <View
          className={`absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 ${
            onDark ? 'border-ink' : 'border-white'
          } ${tone.dot}`}
        />
      ) : (
        <>
          <Text className={`text-xs font-bold ${tone.text}`}>{label}</Text>
          <View className={`h-2 w-2 rounded-full ${tone.dot}`} />
        </>
      )}
    </Pressable>
  );
}
