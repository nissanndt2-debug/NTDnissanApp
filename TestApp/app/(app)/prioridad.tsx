import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { addToQueue, estimateHours, reorderPriority } from '@/data/units';
import type { Unit } from '@/domain/types';
import { useRefreshUnits, useUnits } from '@/hooks/useUnits';
import { ActionButton } from '@/ui/ActionButton';
import { GradeDots } from '@/ui/GradeDot';
import { EmptyState, Screen, SectionTitle } from '@/ui/Screen';
import { COLORS } from '@/ui/theme';

/**
 * Cola de reparacion (SCM).
 *
 * Se usan botones subir/bajar en vez de arrastrar: funciona igual en web que en
 * movil, es preciso con guantes, y no depende de gestos que compiten con el
 * scroll. El orden se persiste local y se envia como UNA sola mutacion.
 */
export default function PrioridadScreen() {
  const { user } = useAuth();
  const refresh = useRefreshUnits();
  const { data: received, refetch } = useUnits('RECEIVED');

  const [order, setOrder] = useState<Unit[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const queued = received.filter((unit) => unit.priorityRank != null);
  const pending = received.filter((unit) => unit.priorityRank == null);

  // Sincroniza el orden local cuando llegan datos nuevos, salvo que el usuario
  // tenga cambios sin guardar (no le movemos la lista bajo los dedos).
  useEffect(() => {
    if (dirty) return;
    setOrder([...queued].sort((a, b) => (a.priorityRank ?? 0) - (b.priorityRank ?? 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [received, dirty]);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setDirty(true);
  };

  const save = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await reorderPriority(order, user.id);
      setDirty(false);
      await refetch();
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const add = async (unit: Unit) => {
    if (!user) return;
    await addToQueue(unit, user.id);
    await refetch();
    refresh();
  };

  return (
    <Screen title="Prioridad" subtitle="Orden de la cola de Body Shop">
      <ScrollView contentContainerClassName="px-4 pb-32">
        <SectionTitle>En cola ({order.length})</SectionTitle>

        {order.map((unit, index) => (
          <View
            key={unit.localId}
            className="mb-2 flex-row items-center rounded-2xl border-2 border-line bg-surface p-3"
          >
            <View className="mr-3 h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <Text className="text-base font-bold text-white">{index + 1}</Text>
            </View>

            <View className="flex-1">
              <Text className="font-mono text-sm font-bold text-ink">{unit.vin}</Text>
              <Text className="mt-0.5 text-xs text-muted">
                Carril {unit.lane} · {estimateHours(unit.defects)} h
              </Text>
              <View className="mt-1">
                <GradeDots defects={unit.defects} />
              </View>
            </View>

            <View className="gap-1">
              <Pressable
                onPress={() => move(index, -1)}
                disabled={index === 0}
                className={`h-10 w-10 items-center justify-center rounded-lg bg-canvas ${
                  index === 0 ? 'opacity-30' : ''
                }`}
              >
                <ChevronUp color={COLORS.ink} size={20} strokeWidth={2} />
              </Pressable>
              <Pressable
                onPress={() => move(index, 1)}
                disabled={index === order.length - 1}
                className={`h-10 w-10 items-center justify-center rounded-lg bg-canvas ${
                  index === order.length - 1 ? 'opacity-30' : ''
                }`}
              >
                <ChevronDown color={COLORS.ink} size={20} strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        ))}

        {order.length === 0 ? <EmptyState message="La cola esta vacia." /> : null}

        <SectionTitle>Pendientes de agregar ({pending.length})</SectionTitle>

        {pending.map((unit) => (
          <View
            key={unit.localId}
            className="mb-2 flex-row items-center gap-3 rounded-2xl border-2 border-dashed border-line bg-surface p-3"
          >
            <View className="flex-1">
              <Text className="font-mono text-sm font-bold text-ink">{unit.vin}</Text>
              <Text className="mt-0.5 text-xs text-muted">
                Carril {unit.lane} · {estimateHours(unit.defects)} h
              </Text>
            </View>
            <ActionButton label="Agregar" onPress={() => void add(unit)} compact />
          </View>
        ))}

        {pending.length === 0 ? (
          <Text className="text-xs text-muted">Todas las unidades recibidas ya estan en cola.</Text>
        ) : null}
      </ScrollView>

      {dirty ? (
        <View className="absolute bottom-0 left-0 right-0 border-t border-line bg-surface px-4 py-3">
          <View className="flex-row items-center gap-3">
            <Text className="flex-1 text-sm font-semibold text-ink">
              Orden modificado
            </Text>
            <ActionButton
              label="Guardar orden"
              onPress={() => void save()}
              busy={busy}
              compact
            />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
