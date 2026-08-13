import { Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { changeStatus, changeStatusBulk, updateDefectGrade } from '@/data/units';
import { GRADES, type Grade } from '@/domain/constants';
import { displayLabel } from '@/domain/zones';
import type { Defect, Unit } from '@/domain/types';
import { useRefreshUnits, useUnits } from '@/hooks/useUnits';
import { ActionButton } from '@/ui/ActionButton';
import { BulkAction } from '@/ui/BulkAction';
import { GradeDots } from '@/ui/GradeDot';
import { EmptyState, Screen } from '@/ui/Screen';
import { COLORS } from '@/ui/theme';

type Tab = 'nivelar' | 'entregar' | 'liberar';

const TABS: { key: Tab; label: string }[] = [
  { key: 'nivelar', label: 'Nivelar' },
  { key: 'entregar', label: 'Entregar' },
  { key: 'liberar', label: 'Liberar' },
];

/**
 * Pantalla de WWS. Concentra sus tres momentos en el flujo:
 *  1. Nivelar   — revisar/corregir la severidad que reporto el carrier
 *  2. Entregar  — traspaso fisico a Body Shop
 *  3. Liberar   — dar salida hacia el carrier
 */
export default function GestionScreen() {
  const { user } = useAuth();
  const refresh = useRefreshUnits();
  const [tab, setTab] = useState<Tab>('nivelar');

  return (
    <Screen title="Gestion WWS" subtitle="Nivelacion, entrega y liberacion">
      {/* Tres momentos del rol WWS. Segmentado, no pestanas anidadas: la barra
          inferior ya es el nivel de navegacion y duplicarlo confunde. */}
      <View className="mb-3 flex-row gap-2 px-4 pt-3">
        {TABS.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setTab(item.key)}
            className={`min-h-[48px] flex-1 items-center justify-center rounded-2xl border-2 ${
              tab === item.key ? 'border-ink bg-ink' : 'border-line bg-surface'
            }`}
          >
            <Text
              className={`text-sm font-bold ${
                tab === item.key ? 'text-white' : 'text-muted'
              }`}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'nivelar' ? <Nivelar userId={user?.id} onDone={refresh} /> : null}
      {tab === 'entregar' ? <Entregar userId={user?.id} onDone={refresh} /> : null}
      {tab === 'liberar' ? <Liberar userId={user?.id} onDone={refresh} /> : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Nivelar                                                          */
/* ------------------------------------------------------------------ */

function Nivelar({ userId, onDone }: { userId?: number; onDone: () => void }) {
  const { data: units, refetch } = useUnits('REPORTED');
  const [openId, setOpenId] = useState<string | null>(null);

  const cycleGrade = async (unit: Unit, defect: Defect) => {
    if (!userId) return;
    const next = GRADES[(GRADES.indexOf(defect.grade) + 1) % GRADES.length] as Grade;
    await updateDefectGrade(unit.localId!, defect, next, userId);
    await refetch();
  };

  const send = async (unit: Unit, to: 'SENT' | 'WTY_PENDING') => {
    if (!userId) return;
    await changeStatus(unit.localId!, unit.statusName, to, userId);
    setOpenId(null);
    await refetch();
    onDone();
  };

  if (units.length === 0) {
    return <EmptyState message="No hay unidades reportadas por nivelar." />;
  }

  return (
    <ScrollView contentContainerClassName="px-4 pb-10">
      {units.map((unit) => {
        const open = openId === unit.localId;
        const hasV1 = unit.defects.some((defect) => defect.grade === 'V1');

        return (
          <View
            key={unit.localId}
            className="mb-2 rounded-2xl border-2 border-line bg-surface p-4"
          >
            <Pressable onPress={() => setOpenId(open ? null : unit.localId!)}>
              <View className="flex-row items-center justify-between">
                <Text className="font-mono text-sm font-bold text-ink">{unit.vin}</Text>
                {open ? (
                  <ChevronUp color={COLORS.muted} size={20} strokeWidth={2} />
                ) : (
                  <ChevronDown color={COLORS.muted} size={20} strokeWidth={2} />
                )}
              </View>
              <Text className="mt-1 text-xs text-muted">
                Carril {unit.lane} · {unit.market} · {unit.registeredBy ?? 'sin registrar'}
              </Text>
              <View className="mt-2">
                <GradeDots defects={unit.defects} />
              </View>
            </Pressable>

            {open ? (
              <View className="mt-4 border-t border-line pt-4">
                <Text className="mb-2 text-xs font-bold uppercase text-muted">
                  Toca la severidad para corregirla
                </Text>

                {unit.defects.map((defect) => (
                  <View
                    key={defect.localId}
                    className="mb-2 flex-row items-center gap-3 rounded-lg bg-canvas px-3 py-2"
                  >
                    <Pressable
                      onPress={() => void cycleGrade(unit, defect)}
                      className={`h-11 w-11 items-center justify-center rounded-lg ${
                        defect.grade === 'V1'
                          ? 'bg-v1'
                          : defect.grade === 'V2'
                            ? 'bg-v2'
                            : 'bg-v3'
                      }`}
                    >
                      <Text className="text-sm font-bold text-white">{defect.grade}</Text>
                    </Pressable>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink">
                        {displayLabel(defect.type)}
                      </Text>
                      <Text className="text-xs text-muted">{displayLabel(defect.zone)}</Text>
                    </View>
                  </View>
                ))}

                <View className="mt-3 gap-2">
                  <ActionButton
                    label="Enviar a Body"
                    onPress={() => void send(unit, 'SENT')}
                  />
                  <ActionButton
                    label={hasV1 ? 'WTY no aplica (hay V1)' : 'Solicitar validacion WTY'}
                    variant="neutral"
                    disabled={hasV1}
                    onPress={() => void send(unit, 'WTY_PENDING')}
                  />
                </View>

                {hasV1 ? (
                  <Text className="mt-2 text-xs text-muted">
                    Una unidad con defecto V1 debe pasar por reparacion fisica.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Entregar a Body (en lote)                                        */
/* ------------------------------------------------------------------ */

function Entregar({ userId, onDone }: { userId?: number; onDone: () => void }) {
  const { data: units, refetch } = useUnits('SENT');
  return (
    <BulkAction
      units={units}
      emptyMessage="No hay unidades niveladas por entregar."
      actionLabel="Entregar a Body"
      onConfirm={async (selected) => {
        if (!userId) return;
        await changeStatusBulk(
          selected.map((unit) => ({ localId: unit.localId!, from: unit.statusName })),
          'DELIVERED',
          userId
        );
        await refetch();
        onDone();
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* 3. Liberar WWS (en lote)                                            */
/* ------------------------------------------------------------------ */

function Liberar({ userId, onDone }: { userId?: number; onDone: () => void }) {
  const { data: units, refetch } = useUnits(['RELEASED', 'WTY_RELEASED']);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <BulkAction
      units={units}
      emptyMessage="No hay unidades liberadas por Body o WTY."
      actionLabel="Liberar a carrier"
      disabled={!confirmed}
      header={
        <Pressable
          onPress={() => setConfirmed((prev) => !prev)}
          className="mb-3 flex-row items-center gap-3 rounded-2xl border-2 border-line bg-surface p-4"
        >
          <View
            className={`h-7 w-7 items-center justify-center rounded-md border-2 ${
              confirmed ? 'border-primary bg-primary' : 'border-line'
            }`}
          >
            {confirmed ? <Check color={COLORS.white} size={18} strokeWidth={3} /> : null}
          </View>
          <Text className="flex-1 text-sm text-ink">
            Confirmo que las unidades estan fisicamente en el carril correcto.
          </Text>
        </Pressable>
      }
      onConfirm={async (selected) => {
        if (!userId) return;
        await changeStatusBulk(
          selected.map((unit) => ({ localId: unit.localId!, from: unit.statusName })),
          'WWS_RELEASED',
          userId
        );
        setConfirmed(false);
        await refetch();
        onDone();
      }}
    />
  );
}
