import { Check } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import type { Unit } from '@/domain/types';
import { COLORS } from './theme';
import { GradeDots } from './GradeDot';

/**
 * Fila de unidad seleccionable. Altura minima 64 px: se toca con guantes.
 * La casilla y el cuerpo son areas de toque SEPARADAS — seleccionar no es lo
 * mismo que ver el detalle.
 */
export function UnitRow({
  unit,
  selected,
  onToggle,
  onOpen,
}: {
  unit: Unit;
  selected: boolean;
  onToggle: () => void;
  onOpen?: () => void;
}) {
  return (
    <View
      className={`mb-2 flex-row items-center overflow-hidden rounded-2xl border-2 ${
        selected ? 'border-ink bg-canvas' : 'border-line bg-surface'
      }`}
    >
      <Pressable
        onPress={onToggle}
        className="min-h-[72px] items-center justify-center px-4"
        hitSlop={8}
      >
        <View
          className={`h-8 w-8 items-center justify-center rounded-lg border-2 ${
            selected ? 'border-ink bg-ink' : 'border-line'
          }`}
        >
          {selected ? <Check color={COLORS.white} size={18} strokeWidth={3} /> : null}
        </View>
      </Pressable>

      <Pressable onPress={onOpen} className="min-h-[72px] flex-1 justify-center py-3 pr-4">
        <View className="flex-row items-center gap-2">
          <Text className="font-mono text-sm font-bold text-ink">{unit.vin}</Text>
          {unit._sync !== 'synced' ? (
            <View
              className={`h-2 w-2 rounded-full ${
                unit._sync === 'pending' ? 'bg-pending' : 'bg-failed'
              }`}
            />
          ) : null}
        </View>
        <Text className="mt-0.5 text-xs text-muted">
          Carril {unit.lane} · {unit.market}
        </Text>
        <View className="mt-1.5">
          <GradeDots defects={unit.defects} />
        </View>
      </Pressable>
    </View>
  );
}
