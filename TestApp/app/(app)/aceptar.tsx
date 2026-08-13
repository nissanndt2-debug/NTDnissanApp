import {
  Check,
  CheckCircle2,
  Info,
  PackageCheck,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { changeStatus, changeStatusBulk } from '@/data/units';
import type { Unit } from '@/domain/types';
import { useRefreshUnits, useUnits } from '@/hooks/useUnits';
import { ActionButton } from '@/ui/ActionButton';
import { GradeDots } from '@/ui/GradeDot';
import { EmptyState, Screen } from '@/ui/Screen';
import { COLORS } from '@/ui/theme';

/** Aceptación final del flujo por parte de Carrier. */
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

  const openReject = (unit: Unit) => {
    setRejecting(unit);
    setReason('');
  };

  const closeReject = () => {
    if (busy) return;
    setRejecting(null);
    setReason('');
  };

  return (
    <Screen
      title="Aceptar unidades"
      subtitle="Recepción final por Carrier"
      centerLogo
      syncInHeader
    >
      <View className="flex-1">
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerClassName="px-4 pb-56 pt-3"
        >
          <View className="mb-4 rounded-3xl border border-line bg-surface p-4">
            <View className="flex-row items-start gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <PackageCheck color={COLORS.primary} size={25} strokeWidth={2} />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-label font-bold uppercase text-primary">Paso final</Text>
                  <View className="rounded-full bg-ink px-2.5 py-1">
                    <Text className="text-[10px] font-bold text-white">
                      {units.length} {units.length === 1 ? 'unidad' : 'unidades'}
                    </Text>
                  </View>
                </View>
                <Text className="mt-1 text-lg font-bold text-ink">Confirmar recepción</Text>
                <Text className="mt-1 text-xs leading-5 text-muted">
                  Verifica las unidades liberadas por WWS y confirma cuáles recibe Carrier.
                </Text>
              </View>
            </View>
          </View>

          {units.length > 0 ? (
            <View className="mb-3 flex-row items-center justify-between px-1">
              <View>
                <Text className="text-label font-bold uppercase text-muted">Lista de entrega</Text>
                <Text className="mt-0.5 text-xs text-muted">
                  Toca una tarjeta para seleccionarla
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  setSelected(
                    allSelected ? new Set() : new Set(units.map((unit) => unit.localId!))
                  )
                }
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={allSelected ? 'Quitar selección' : 'Seleccionar todas'}
                className="min-h-[44px] justify-center rounded-xl bg-primary/10 px-3 active:opacity-70"
              >
                <Text className="text-xs font-bold text-primary">
                  {allSelected ? 'Quitar selección' : 'Seleccionar todas'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {units.map((unit) => {
            const isSelected = selected.has(unit.localId!);

            return (
              <View
                key={unit.localId}
                className={`mb-3 overflow-hidden rounded-3xl border bg-surface ${
                  isSelected ? 'border-primary' : 'border-line'
                }`}
              >
                <Pressable
                  onPress={() => toggle(unit.localId!)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={`Seleccionar unidad ${unit.vin}`}
                  className={`p-4 active:opacity-80 ${isSelected ? 'bg-primary/5' : ''}`}
                >
                  <View className="flex-row items-start gap-3">
                    <View
                      className={`h-11 w-11 items-center justify-center rounded-2xl ${
                        isSelected ? 'bg-primary' : 'bg-primary/10'
                      }`}
                    >
                      <PackageCheck
                        color={isSelected ? COLORS.white : COLORS.primary}
                        size={22}
                        strokeWidth={2.1}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
                        Liberada por WWS
                      </Text>
                      <Text className="mt-0.5 font-mono text-sm font-bold text-ink">
                        {unit.vin}
                      </Text>
                    </View>
                    <View
                      className={`h-9 w-9 items-center justify-center rounded-xl border-2 ${
                        isSelected
                          ? 'border-primary bg-primary'
                          : 'border-line bg-white'
                      }`}
                    >
                      {isSelected ? (
                        <Check color={COLORS.white} size={19} strokeWidth={3} />
                      ) : null}
                    </View>
                  </View>

                  <View className="mt-3 flex-row flex-wrap gap-2">
                    <View className="rounded-lg bg-canvas px-2.5 py-1.5">
                      <Text className="text-[11px] font-semibold text-ink">
                        Carril {unit.lane}
                      </Text>
                    </View>
                    <View className="rounded-lg bg-canvas px-2.5 py-1.5">
                      <Text className="text-[11px] font-semibold text-ink">{unit.market}</Text>
                    </View>
                    <View className="rounded-lg bg-canvas px-2.5 py-1.5">
                      <Text className="text-[11px] font-semibold text-ink">
                        {unit.defects.length}{' '}
                        {unit.defects.length === 1 ? 'defecto' : 'defectos'}
                      </Text>
                    </View>
                  </View>

                  <View className="mt-3">
                    <GradeDots defects={unit.defects} />
                  </View>
                </Pressable>

                <View
                  className="border-t bg-canvas/50 px-3 py-2"
                  style={{ borderTopColor: COLORS.line }}
                >
                  <Pressable
                    onPress={() => openReject(unit)}
                    accessibilityRole="button"
                    accessibilityLabel={`Rechazar unidad ${unit.vin}`}
                    className="min-h-[44px] flex-row items-center justify-center gap-2 rounded-xl active:bg-red-50"
                  >
                    <XCircle color={COLORS.v1} size={18} strokeWidth={2.2} />
                    <Text className="text-xs font-bold text-v1">Rechazar por incidencia</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {units.length === 0 ? (
            <EmptyState message="No hay unidades liberadas por aceptar." />
          ) : null}
        </ScrollView>

        {selected.size > 0 ? (
          <View
            className="absolute bottom-[104px] left-0 right-0 rounded-t-3xl border-t border-line bg-surface px-4 pb-5 pt-3"
            style={{
              shadowColor: COLORS.ink,
              shadowOffset: { width: 0, height: -5 },
              shadowOpacity: 0.1,
              shadowRadius: 14,
              elevation: 10,
            }}
          >
            <View className="mb-3 flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <CheckCircle2 color={COLORS.primary} size={22} strokeWidth={2.2} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-ink">
                  {selected.size} seleccionada{selected.size === 1 ? '' : 's'}
                </Text>
                <Text className="text-xs text-muted">Listas para confirmar recepción</Text>
              </View>
            </View>
            <ActionButton
              label="Aceptar unidades seleccionadas"
              onPress={() => void acceptSelected()}
              busy={busy}
            />
          </View>
        ) : null}
      </View>

      <Modal
        visible={!!rejecting}
        animationType="slide"
        transparent
        onRequestClose={closeReject}
      >
        <View className="flex-1 justify-end bg-black/50">
          <SafeAreaView edges={['bottom']} className="rounded-t-[32px] bg-surface">
            <View className="items-center pt-3">
              <View className="h-1.5 w-12 rounded-full bg-line" />
            </View>
            <View className="p-5 pt-4">
              <View className="flex-row items-start gap-3">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-red-50">
                  <XCircle color={COLORS.v1} size={25} strokeWidth={2.1} />
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-bold text-ink">Rechazar unidad</Text>
                  <Text className="mt-0.5 text-xs leading-5 text-muted">
                    Registra la incidencia para devolverla al flujo.
                  </Text>
                </View>
                <Pressable
                  onPress={closeReject}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar"
                  className="h-11 w-11 items-center justify-center rounded-full bg-canvas active:opacity-70"
                >
                  <X color={COLORS.ink} size={21} strokeWidth={2.2} />
                </Pressable>
              </View>

              <View className="mt-4 rounded-2xl border border-line bg-canvas p-3">
                <View className="flex-row items-center gap-3">
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-white">
                    <ShieldCheck color={COLORS.primary} size={21} strokeWidth={2} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[10px] font-bold uppercase text-muted">Unidad</Text>
                    <Text className="mt-0.5 font-mono text-sm font-bold text-ink">
                      {rejecting?.vin}
                    </Text>
                  </View>
                  {rejecting ? <GradeDots defects={rejecting.defects} /> : null}
                </View>
              </View>

              <Text className="mb-2 mt-4 text-sm font-bold text-ink">
                Motivo del rechazo
              </Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={3}
                placeholder="Describe qué no coincide o qué debe corregirse"
                placeholderTextColor={COLORS.muted}
                className="min-h-[104px] rounded-2xl border-2 border-line bg-white px-4 py-3 text-base text-ink"
                textAlignVertical="top"
              />

              <View className="mt-3 flex-row items-start gap-2 rounded-2xl bg-primary/5 p-3">
                <Info color={COLORS.primary} size={18} strokeWidth={2.1} />
                <Text className="flex-1 text-xs leading-5 text-muted">
                  La unidad regresará automáticamente al flujo para su corrección.
                </Text>
              </View>

              <View className="mt-4 gap-2">
                <ActionButton
                  label="Confirmar rechazo"
                  variant="danger"
                  disabled={reason.trim().length === 0}
                  busy={busy}
                  onPress={() => void confirmReject()}
                />
                <ActionButton label="Cancelar" variant="neutral" onPress={closeReject} />
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </Screen>
  );
}
