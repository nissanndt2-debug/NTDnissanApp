import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { changeStatus } from '@/data/units';
import { displayLabel } from '@/domain/zones';
import type { Unit } from '@/domain/types';
import { useRefreshUnits, useUnits } from '@/hooks/useUnits';
import { ActionButton } from '@/ui/ActionButton';
import { GradeDots } from '@/ui/GradeDot';
import { EmptyState, Screen } from '@/ui/Screen';

/**
 * Validacion de garantia (WTY / SCM_QUALITY).
 *
 * Solo llegan aqui unidades sin defectos V1. Dos salidas:
 *  - Aprobar  -> WTY_RELEASED (se salta la reparacion fisica)
 *  - Rechazar -> SENT (regresa al flujo normal de Body)
 */
export default function ValidarScreen() {
  const { user } = useAuth();
  const refresh = useRefreshUnits();
  const { data: units, refetch } = useUnits('WTY_PENDING');
  const [busyId, setBusyId] = useState<string | null>(null);

  const decide = async (unit: Unit, approve: boolean) => {
    if (!user) return;
    setBusyId(unit.localId!);
    try {
      await changeStatus(
        unit.localId!,
        unit.statusName,
        approve ? 'WTY_RELEASED' : 'SENT',
        user.id
      );
      await refetch();
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen title="Validar" subtitle="Unidades en revision de garantia">
      <ScrollView contentContainerClassName="px-4 pb-10">
        {units.map((unit) => (
          <View
            key={unit.localId}
            className="mb-3 rounded-2xl border-2 border-line bg-surface p-4"
          >
            <Text className="font-mono text-sm font-bold text-ink">{unit.vin}</Text>
            <Text className="mt-1 text-xs text-muted">
              Carril {unit.lane} · {unit.market}
            </Text>

            <View className="mt-2">
              <GradeDots defects={unit.defects} />
            </View>

            {unit.defects.length > 0 ? (
              <View className="mt-3 rounded-lg bg-canvas p-3">
                {unit.defects.map((defect) => (
                  <Text key={defect.localId} className="text-xs text-ink">
                    · {displayLabel(defect.type)} — {displayLabel(defect.zone)} ({defect.grade})
                  </Text>
                ))}
              </View>
            ) : null}

            <View className="mt-4 gap-2">
              <ActionButton
                label="Aprobar (liberar)"
                variant="success"
                busy={busyId === unit.localId}
                onPress={() => void decide(unit, true)}
              />
              <ActionButton
                label="Rechazar (enviar a Body)"
                variant="neutral"
                busy={busyId === unit.localId}
                onPress={() => void decide(unit, false)}
              />
            </View>
          </View>
        ))}

        {units.length === 0 ? (
          <EmptyState message="No hay unidades pendientes de validacion." />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
