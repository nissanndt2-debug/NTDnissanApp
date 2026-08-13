import { useState } from 'react';
import { Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { changeStatus, changeStatusBulk } from '@/data/units';
import type { Unit } from '@/domain/types';
import { useRefreshUnits, useUnits } from '@/hooks/useUnits';
import { ActionButton } from '@/ui/ActionButton';
import { GradeDots } from '@/ui/GradeDot';
import { EmptyState, Screen } from '@/ui/Screen';
import { UnitRow } from '@/ui/UnitRow';

/**
 * Aceptacion final (CARRIER).
 *
 * Aceptar es en lote (el caso normal: llega la madrina y se lleva todo).
 * Rechazar es individual y exige motivo — el backend convierte REJECTED en
 * SENT automaticamente y la unidad vuelve al flujo.
 */
export default function AceptarScreen() {
  const { user } = useAuth();
  const refresh = useRefreshUnits();
  const { data: units, refetch } = useUnits('WWS_RELEASED');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<Unit | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (localId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(localId)) next.delete(localId);
      else next.add(localId);
      return next;
    });
  };

  const acceptSelected = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await changeStatusBulk(
        units
          .filter((unit) => selected.has(unit.localId!))
          .map((unit) => ({ localId: unit.localId!, from: unit.statusName })),
        'ACCEPTED',
        user.id
      );
      setSelected(new Set());
      await refetch();
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const confirmReject = async () => {
    if (!user || !rejecting || reason.trim().length === 0) return;
    setBusy(true);
    try {
      await changeStatus(rejecting.localId!, rejecting.statusName, 'REJECTED', user.id, {
        note: reason.trim(),
      });
      setRejecting(null);
      setReason('');
      await refetch();
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const allSelected = units.length > 0 && selected.size === units.length;

  return (
    <Screen title="Aceptar" subtitle="Unidades liberadas por WWS">
      <ScrollView contentContainerClassName="px-4 pb-32">
        {units.length > 0 ? (
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-sm text-muted">{units.length} por revisar</Text>
            <Text
              onPress={() =>
                setSelected(
                  allSelected ? new Set() : new Set(units.map((unit) => unit.localId!))
                )
              }
              className="text-sm font-bold text-primary"
            >
              {allSelected ? 'Quitar seleccion' : 'Seleccionar todas'}
            </Text>
          </View>
        ) : null}

        {units.map((unit) => (
          <View key={unit.localId}>
            <UnitRow
              unit={unit}
              selected={selected.has(unit.localId!)}
              onToggle={() => toggle(unit.localId!)}
            />
            <View className="-mt-1 mb-3 items-end">
              <Text
                onPress={() => {
                  setRejecting(unit);
                  setReason('');
                }}
                className="px-2 text-xs font-bold text-v1"
              >
                Rechazar esta unidad
              </Text>
            </View>
          </View>
        ))}

        {units.length === 0 ? (
          <EmptyState message="No hay unidades liberadas por aceptar." />
        ) : null}
      </ScrollView>

      {selected.size > 0 ? (
        <View className="absolute bottom-0 left-0 right-0 border-t border-line bg-surface px-4 py-3">
          <View className="flex-row items-center gap-3">
            <Text className="flex-1 text-base font-bold text-ink">
              {selected.size} seleccionada{selected.size === 1 ? '' : 's'}
            </Text>
            <ActionButton
              label="Aceptar"
              variant="success"
              onPress={() => void acceptSelected()}
              busy={busy}
              compact
            />
          </View>
        </View>
      ) : null}

      {/* Rechazo: motivo obligatorio */}
      <Modal visible={!!rejecting} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/40">
          <SafeAreaView edges={['bottom']} className="rounded-t-3xl bg-surface">
            <View className="p-5">
              <Text className="text-lg font-bold text-ink">Rechazar unidad</Text>
              <Text className="mt-1 font-mono text-sm text-muted">{rejecting?.vin}</Text>

              {rejecting ? (
                <View className="mt-3">
                  <GradeDots defects={rejecting.defects} />
                </View>
              ) : null}

              <Text className="mb-2 mt-4 text-sm font-bold text-ink">
                Motivo del rechazo
              </Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={3}
                placeholder="Describe por que se rechaza la unidad"
                className="min-h-[90px] rounded-2xl border-2 border-line px-4 py-3 text-base"
                textAlignVertical="top"
              />

              <Text className="mt-2 text-xs text-muted">
                La unidad regresara automaticamente al flujo para reparacion.
              </Text>

              <View className="mt-4 gap-2">
                <ActionButton
                  label="Confirmar rechazo"
                  variant="danger"
                  disabled={reason.trim().length === 0}
                  busy={busy}
                  onPress={() => void confirmReject()}
                />
                <ActionButton
                  label="Cancelar"
                  variant="neutral"
                  onPress={() => setRejecting(null)}
                />
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </Screen>
  );
}
