import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  CirclePlus,
  ClipboardList,
  Clock3,
  Info,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import {
  addToQueue,
  estimateHours,
  reorderPriority,
  updatePriorityNote,
} from "@/data/units";
import type { Unit } from "@/domain/types";
import { useRefreshUnits, useUnits } from "@/hooks/useUnits";
import { ActionButton } from "@/ui/ActionButton";
import { GradeDots } from "@/ui/GradeDot";
import { EmptyState, Screen } from "@/ui/Screen";
import { COLORS } from "@/ui/theme";

/**
 * Orden de trabajo de SCM.
 *
 * El orden se ajusta con botones, no con arrastre: conserva precisión en móvil
 * y se puede usar con guantes. Los cambios se guardan en una sola acción.
 */
export default function PrioridadScreen() {
  const { user } = useAuth();
  const refresh = useRefreshUnits();
  const { data: received, refetch } = useUnits("RECEIVED");
  const [order, setOrder] = useState<Unit[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [noteBusyId, setNoteBusyId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 960;

  const queued = received.filter((unit) => unit.priorityRank != null);
  const pending = received.filter((unit) => unit.priorityRank == null);

  useEffect(() => {
    if (dirty) return;
    setOrder(
      [...queued].sort((a, b) => (a.priorityRank ?? 0) - (b.priorityRank ?? 0)),
    );
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
    setAddingId(unit.localId!);
    try {
      await addToQueue(unit, user.id);
      await refetch();
      refresh();
    } finally {
      setAddingId(null);
    }
  };

  const saveNote = async (unit: Unit, note: string) => {
    if (!user) return;
    Keyboard.dismiss();
    setNoteBusyId(unit.localId!);
    try {
      await updatePriorityNote(unit, note, user.id);
      await refetch();
      refresh();
    } finally {
      setNoteBusyId(null);
    }
  };

  return (
    <Screen
      title="Prioridad"
      subtitle="Orden de atención de Body Shop"
      centerLogo
      syncInHeader
    >
      <View className="flex-1">
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-4 pb-56 pt-3"
        >
          <View
            style={{
              width: "100%",
              maxWidth: desktop ? 1180 : undefined,
              alignSelf: "center",
            }}
          >
            <View className="mb-4 overflow-hidden rounded-3xl border border-line bg-surface">
              <View className="flex-row items-start gap-3 p-4">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <ArrowUpDown
                    color={COLORS.primary}
                    size={25}
                    strokeWidth={2}
                  />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="text-label font-bold uppercase text-primary">
                      Plan de trabajo
                    </Text>
                    <View className="rounded-full bg-ink px-2.5 py-1">
                      <Text className="text-[10px] font-bold text-white">
                        {order.length}{" "}
                        {order.length === 1 ? "unidad" : "unidades"}
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-1 text-lg font-bold text-ink">
                    Define el siguiente vehículo
                  </Text>
                  <Text className="mt-1 text-xs leading-5 text-muted">
                    Usa las flechas para ordenar la cola. La unidad 1 es la
                    siguiente que verá el equipo de reparación.
                  </Text>
                </View>
              </View>
              <View className="flex-row border-t border-line bg-canvas/60">
                <QueueCounter label="En cola" count={order.length} primary />
                <QueueCounter label="Sin asignar" count={pending.length} />
              </View>
            </View>

            <View className="mb-3 mt-1 flex-row items-center gap-3 px-1">
              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <ClipboardList
                  color={COLORS.primary}
                  size={20}
                  strokeWidth={2.2}
                />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-ink">
                  Cola de reparación
                </Text>
                <Text className="mt-0.5 text-xs text-muted">
                  Ajusta el orden antes de guardarlo
                </Text>
              </View>
            </View>

            {order.map((unit, index) => (
              <PriorityCard
                key={unit.localId}
                unit={unit}
                rank={index + 1}
                first={index === 0}
                last={index === order.length - 1}
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
                noteBusy={noteBusyId === unit.localId}
                onSaveNote={(note) => void saveNote(unit, note)}
              />
            ))}

            {order.length === 0 ? (
              <EmptyState message="La cola de reparación está vacía." />
            ) : null}

            <View className="mb-3 mt-6 flex-row items-center gap-3 px-1">
              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-canvas">
                <CirclePlus color={COLORS.ink} size={20} strokeWidth={2.2} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-ink">
                  Pendientes de priorizar
                </Text>
                <Text className="mt-0.5 text-xs text-muted">
                  Agrégalos cuando deban entrar a la cola
                </Text>
              </View>
              <View className="min-w-8 items-center rounded-full bg-canvas px-2.5 py-1">
                <Text selectable className="text-xs font-bold text-ink">
                  {pending.length}
                </Text>
              </View>
            </View>

            <View className={desktop ? "flex-row flex-wrap gap-3" : ""}>
              {pending.map((unit) => (
                <PendingCard
                  key={unit.localId}
                  unit={unit}
                  busy={addingId === unit.localId}
                  desktop={desktop}
                  onAdd={() => void add(unit)}
                />
              ))}
            </View>

            {pending.length === 0 ? (
              <View className="flex-row items-center gap-2 rounded-2xl bg-primary/5 p-3">
                <CheckCircle2
                  color={COLORS.primary}
                  size={18}
                  strokeWidth={2.2}
                />
                <Text className="flex-1 text-xs leading-5 text-muted">
                  Todas las unidades recibidas ya están incluidas en la cola.
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        {dirty ? (
          <View
            className="absolute bottom-[104px] left-0 right-0 rounded-t-3xl border-t border-line bg-surface px-4 pb-5 pt-3"
            style={{ boxShadow: "0 -5px 14px rgba(16, 24, 40, 0.10)" }}
          >
            <View className="mb-3 flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <Info color={COLORS.primary} size={21} strokeWidth={2.2} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-ink">
                  Orden modificado
                </Text>
                <Text className="text-xs text-muted">
                  Guarda para actualizar la cola de reparación
                </Text>
              </View>
            </View>
            <ActionButton
              label="Guardar orden de prioridad"
              onPress={() => void save()}
              busy={busy}
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function QueueCounter({
  label,
  count,
  primary = false,
}: {
  label: string;
  count: number;
  primary?: boolean;
}) {
  return (
    <View
      className={`flex-1 px-4 py-3 ${primary ? "border-r border-line" : ""}`}
    >
      <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
        {label}
      </Text>
      <Text
        selectable
        className={`mt-0.5 text-xl font-bold ${primary ? "text-primary" : "text-ink"}`}
      >
        {count}
      </Text>
    </View>
  );
}

function PriorityCard({
  unit,
  rank,
  first,
  last,
  onMoveUp,
  onMoveDown,
  noteBusy,
  onSaveNote,
}: {
  unit: Unit;
  rank: number;
  first: boolean;
  last: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  noteBusy: boolean;
  onSaveNote: (note: string) => void;
}) {
  const next = rank === 1;
  const [note, setNote] = useState(unit.priorityNote ?? "");

  return (
    <View
      className={`mb-3 overflow-hidden rounded-3xl border bg-surface ${next ? "border-primary" : "border-line"}`}
    >
      <View className="flex-row items-stretch">
        <View
          className={`w-14 items-center justify-center ${next ? "bg-primary" : "bg-canvas"}`}
        >
          <Text
            selectable
            className={`text-xl font-bold ${next ? "text-white" : "text-ink"}`}
          >
            {rank}
          </Text>
          <Text
            className={`mt-0.5 text-[9px] font-bold uppercase ${next ? "text-white/70" : "text-muted"}`}
          >
            {next ? "Sigue" : "Orden"}
          </Text>
        </View>

        <View className="flex-1 p-4">
          <View className="flex-row items-start gap-2">
            <View className="flex-1">
              <Text
                className={`text-[10px] font-bold uppercase tracking-wide ${next ? "text-primary" : "text-muted"}`}
              >
                {next ? "Próxima a reparar" : "En espera"}
              </Text>
              <Text
                selectable
                className="mt-0.5 font-mono text-sm font-bold text-ink"
              >
                {unit.vin}
              </Text>
            </View>
            <View className="flex-row items-center gap-1 rounded-lg bg-canvas px-2 py-1">
              <Clock3 color={COLORS.muted} size={13} strokeWidth={2.2} />
              <Text className="text-[11px] font-bold text-ink">
                {estimateHours(unit.defects)} h
              </Text>
            </View>
          </View>

          <View className="mt-3 flex-row items-center justify-between gap-2">
            <View className="rounded-lg bg-canvas px-2.5 py-1.5">
              <Text className="text-[11px] font-semibold text-ink">
                Carril {unit.lane}
              </Text>
            </View>
            <GradeDots defects={unit.defects} />
          </View>

          <View className="mt-3 rounded-2xl border border-line bg-canvas/60 p-3">
            <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
              Nota para Reparar
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Motivo u observación para esta posición"
              placeholderTextColor={COLORS.muted}
              multiline
              maxLength={240}
              className="mt-1 min-h-[34px] text-xs text-ink"
              accessibilityLabel={`Nota de prioridad para ${unit.vin}`}
            />
            <Text className="mt-1 text-[10px] leading-4 text-muted">
              Se muestra al equipo de Body Shop y queda registrada en el
              historial.
            </Text>
            <View className="mt-2 self-start">
              <ActionButton
                label="Guardar nota"
                compact
                variant="neutral"
                busy={noteBusy}
                disabled={note.trim() === (unit.priorityNote ?? "").trim()}
                onPress={() => onSaveNote(note)}
              />
            </View>
          </View>
        </View>

        <View className="justify-center gap-2 border-l border-line px-2">
          <ReorderButton
            direction="up"
            disabled={first}
            onPress={onMoveUp}
            vin={unit.vin}
          />
          <ReorderButton
            direction="down"
            disabled={last}
            onPress={onMoveDown}
            vin={unit.vin}
          />
        </View>
      </View>
    </View>
  );
}

function ReorderButton({
  direction,
  disabled,
  onPress,
  vin,
}: {
  direction: "up" | "down";
  disabled: boolean;
  onPress: () => void;
  vin: string;
}) {
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  const label = direction === "up" ? "Subir" : "Bajar";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label} prioridad de ${vin}`}
      className={`h-11 w-11 items-center justify-center rounded-xl bg-canvas active:opacity-70 ${disabled ? "opacity-30" : ""}`}
    >
      <Icon color={COLORS.ink} size={20} strokeWidth={2.4} />
    </Pressable>
  );
}

function PendingCard({
  unit,
  busy,
  desktop,
  onAdd,
}: {
  unit: Unit;
  busy: boolean;
  desktop: boolean;
  onAdd: () => void;
}) {
  return (
    <View
      className="mb-3 rounded-3xl border border-dashed border-line bg-surface p-4"
      style={desktop ? { flexBasis: "49%" } : undefined}
    >
      <View className="flex-row items-start gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-2xl bg-canvas">
          <CirclePlus color={COLORS.primary} size={21} strokeWidth={2.1} />
        </View>
        <View className="flex-1">
          <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
            Sin prioridad
          </Text>
          <Text
            selectable
            className="mt-0.5 font-mono text-sm font-bold text-ink"
          >
            {unit.vin}
          </Text>
          <Text className="mt-1 text-xs text-muted">
            Carril {unit.lane} · {estimateHours(unit.defects)} h estimadas
          </Text>
        </View>
      </View>
      <View className="mt-3">
        <ActionButton
          label="Agregar al final de la cola"
          onPress={onAdd}
          busy={busy}
          compact
        />
      </View>
    </View>
  );
}
