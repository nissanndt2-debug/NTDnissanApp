import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { changeStatus, estimateHours } from '@/data/units';
import type { Unit } from '@/domain/types';
import { useRefreshUnits, useUnits } from '@/hooks/useUnits';
import { ActionButton } from '@/ui/ActionButton';
import { GradeDots } from '@/ui/GradeDot';
import { EmptyState, Screen, SectionTitle } from '@/ui/Screen';

/**
 * Cola de reparacion (BODY).
 *
 * Cada tarjeta lleva su accion primaria visible, sin abrir modal. Las horas
 * estimadas se derivan de la severidad (V1=8h, V2=4h, V3=2h) y se aplican
 * solas: el operador no captura numeros.
 */
export default function RepararScreen() {
  const { user } = useAuth();
  const refresh = useRefreshUnits();
  const { data: queue, refetch: refetchQueue } = useUnits('RECEIVED');
  const { data: inRepair, refetch: refetchRepair } = useUnits('IN_REPAIR');
  const [busyId, setBusyId] = useState<string | null>(null);

  const move = async (unit: Unit, to: 'IN_REPAIR' | 'RELEASED' | 'UNAVAILABLE') => {
    if (!user) return;
    setBusyId(unit.localId!);
    try {
      await changeStatus(unit.localId!, unit.statusName, to, user.id, {
        ...(to === 'IN_REPAIR'
          ? { estimatedRepairHours: estimateHours(unit.defects) }
          : {}),
      });
      await Promise.all([refetchQueue(), refetchRepair()]);
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const sorted = [...queue].sort(
    (a, b) => (a.priorityRank ?? 999) - (b.priorityRank ?? 999)
  );

  return (
    <Screen title="Reparar" subtitle="Cola y trabajo en proceso">
      <ScrollView contentContainerClassName="px-4 pb-10">
        <SectionTitle>En reparacion ({inRepair.length})</SectionTitle>

        {inRepair.map((unit) => (
          <Card
            key={unit.localId}
            unit={unit}
            busy={busyId === unit.localId}
            primary={{ label: 'Liberar', variant: 'success', onPress: () => void move(unit, 'RELEASED') }}
            secondary={{ label: 'Marcar no disponible', onPress: () => void move(unit, 'UNAVAILABLE') }}
          />
        ))}

        {inRepair.length === 0 ? <EmptyState message="Nada en proceso." /> : null}

        <SectionTitle>En cola ({sorted.length})</SectionTitle>

        {sorted.map((unit, index) => (
          <Card
            key={unit.localId}
            unit={unit}
            rank={unit.priorityRank ?? index + 1}
            busy={busyId === unit.localId}
            primary={{ label: 'Iniciar reparacion', onPress: () => void move(unit, 'IN_REPAIR') }}
            secondary={{ label: 'Marcar no disponible', onPress: () => void move(unit, 'UNAVAILABLE') }}
          />
        ))}

        {sorted.length === 0 ? <EmptyState message="Sin unidades en cola." /> : null}
      </ScrollView>
    </Screen>
  );
}

function Card({
  unit,
  rank,
  busy,
  primary,
  secondary,
}: {
  unit: Unit;
  rank?: number;
  busy: boolean;
  primary: { label: string; variant?: 'primary' | 'success'; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
}) {
  return (
    <View className="mb-2 rounded-2xl border-2 border-line bg-surface p-4">
      <View className="flex-row items-center gap-3">
        {rank !== undefined ? (
          <View className="h-10 w-10 items-center justify-center rounded-lg bg-canvas">
            <Text className="text-base font-bold text-ink">{rank}</Text>
          </View>
        ) : null}
        <View className="flex-1">
          <Text className="font-mono text-sm font-bold text-ink">{unit.vin}</Text>
          <Text className="mt-0.5 text-xs text-muted">
            Carril {unit.lane} · {estimateHours(unit.defects)} h estimadas
          </Text>
        </View>
      </View>

      <View className="mt-2">
        <GradeDots defects={unit.defects} />
      </View>

      <View className="mt-3 gap-2">
        <ActionButton
          label={primary.label}
          variant={primary.variant ?? 'primary'}
          busy={busy}
          onPress={primary.onPress}
        />
        {secondary ? (
          <ActionButton
            label={secondary.label}
            variant="neutral"
            busy={busy}
            onPress={secondary.onPress}
            compact
          />
        ) : null}
      </View>
    </View>
  );
}
