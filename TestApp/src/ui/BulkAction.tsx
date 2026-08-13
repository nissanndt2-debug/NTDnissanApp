import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Unit } from '@/domain/types';
import { ActionButton } from './ActionButton';
import { EmptyState } from './Screen';
import { UnitRow } from './UnitRow';

/**
 * Lista con seleccion multiple + barra de accion.
 *
 * Es el componente que hace posible el objetivo de tiempo: recibir o aceptar
 * un lote completo son dos toques ("seleccionar todas" + la accion), en vez de
 * un ciclo de modal por unidad como en la version web.
 */
export function BulkAction({
  units,
  actionLabel,
  actionVariant = 'primary',
  emptyMessage,
  onConfirm,
  disabled,
  header,
  renderExtra,
}: {
  units: Unit[];
  actionLabel: string;
  actionVariant?: 'primary' | 'success' | 'danger';
  emptyMessage: string;
  onConfirm: (selected: Unit[]) => Promise<void>;
  disabled?: boolean;
  header?: ReactNode;
  renderExtra?: (unit: Unit) => ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (localId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(localId)) next.delete(localId);
      else next.add(localId);
      return next;
    });
  };

  const allSelected = units.length > 0 && selected.size === units.length;

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(units.filter((unit) => selected.has(unit.localId!)));
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1">
      <ScrollView contentContainerClassName="px-4 pb-32">
        {header}

        {units.length > 0 ? (
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-label uppercase text-muted">
              {units.length} disponibles
            </Text>
            <Pressable
              onPress={() =>
                setSelected(
                  allSelected ? new Set() : new Set(units.map((unit) => unit.localId!))
                )
              }
              hitSlop={12}
              className="min-h-[44px] justify-center"
            >
              <Text className="text-sm font-bold text-primary">
                {allSelected ? 'Quitar seleccion' : 'Seleccionar todas'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {units.map((unit) => (
          <View key={unit.localId}>
            <UnitRow
              unit={unit}
              selected={selected.has(unit.localId!)}
              onToggle={() => toggle(unit.localId!)}
            />
            {renderExtra?.(unit)}
          </View>
        ))}

        {units.length === 0 ? <EmptyState message={emptyMessage} /> : null}
      </ScrollView>

      {selected.size > 0 ? (
        <View className="absolute bottom-0 left-0 right-0 border-t border-line bg-surface px-4 pb-5 pt-3">
          <View className="flex-row items-center gap-3">
            <Text className="flex-1 text-base font-bold text-ink">
              {selected.size} seleccionada{selected.size === 1 ? '' : 's'}
            </Text>
            <ActionButton
              label={actionLabel}
              variant={actionVariant}
              onPress={() => void confirm()}
              disabled={disabled}
              busy={busy}
              compact
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
