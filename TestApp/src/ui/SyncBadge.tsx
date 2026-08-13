import { Pressable, Text, View } from 'react-native';
import { useSync } from '@/sync/SyncProvider';

/**
 * Indicador permanente de estado de sincronizacion.
 *
 * Es el componente mas importante de la app en terminos de confianza: el
 * operador necesita saber, sin preguntar a nadie, si lo que capturo ya salio
 * del dispositivo. Tocarlo fuerza un intento de envio.
 *
 * `onDark` lo adapta a la banda oscura del encabezado sin duplicar componente.
 */
export function SyncBadge({ onDark }: { onDark?: boolean }) {
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
      className={`flex-row items-center gap-2 self-start rounded-full px-3 py-2 ${tone.bg} active:opacity-70`}
    >
      <View className={`h-2 w-2 rounded-full ${tone.dot}`} />
      <Text className={`text-xs font-bold ${tone.text}`}>{label}</Text>
    </Pressable>
  );
}
