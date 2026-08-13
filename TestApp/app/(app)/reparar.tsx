import {
  CircleAlert,
  ClipboardList,
  Clock3,
  Play,
  Wrench,
} from "lucide-react-native";
import { useState } from "react";
import {
  Keyboard,
  Platform,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import {
  changeStatus,
  estimateHours,
  updateEstimatedRepairHours,
} from "@/data/units";
import type { Unit } from "@/domain/types";
import { useRefreshUnits, useUnits } from "@/hooks/useUnits";
import { ActionButton } from "@/ui/ActionButton";
import { GradeDots } from "@/ui/GradeDot";
import { EmptyState, Screen } from "@/ui/Screen";
import { COLORS } from "@/ui/theme";

/**
 * Mesa de trabajo de Body Shop.
 *
 * Separa la prioridad que espera de las unidades que ya están en reparación,
 * para que el operador siempre identifique el siguiente trabajo sin recorrer
 * información que no corresponde a su estado actual.
 */
export default function RepararScreen() {
  const { user } = useAuth();
  const refresh = useRefreshUnits();
  const { data: queue, refetch: refetchQueue } = useUnits("RECEIVED");
  const { data: inRepair, refetch: refetchRepair } = useUnits("IN_REPAIR");
  const { data: unavailable, refetch: refetchUnavailable } =
    useUnits("UNAVAILABLE");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [estimateBusyId, setEstimateBusyId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 960;

  const move = async (
    unit: Unit,
    to: "IN_REPAIR" | "RELEASED" | "UNAVAILABLE",
  ) => {
    if (!user) return;
    Keyboard.dismiss();

    setBusyId(unit.localId!);
    try {
      await changeStatus(
        unit.localId!,
        unit.statusName,
        to,
        user.id,
        to === "IN_REPAIR"
          ? {
              estimatedRepairHours:
                unit.estimatedRepairHours ?? estimateHours(unit.defects),
            }
          : undefined,
      );
      await Promise.all([
        refetchQueue(),
        refetchRepair(),
        refetchUnavailable(),
      ]);
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const updateEstimate = async (unit: Unit, hours: number) => {
    if (!user) return;
    Keyboard.dismiss();
    setEstimateBusyId(unit.localId!);
    try {
      await updateEstimatedRepairHours(unit, hours, user.id);
      await refetchRepair();
      refresh();
    } finally {
      setEstimateBusyId(null);
    }
  };

  const sorted = [...queue].sort(
    (a, b) =>
      (a.priorityRank ?? Number.MAX_SAFE_INTEGER) -
      (b.priorityRank ?? Number.MAX_SAFE_INTEGER),
  );
  const totalWork = inRepair.length + sorted.length;

  return (
    <Screen
      title="Reparar"
      subtitle="Prioriza, repara y libera unidades"
      centerLogo
      syncInHeader
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-4 pb-32 pt-3"
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
                <Wrench color={COLORS.primary} size={25} strokeWidth={2} />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-label font-bold uppercase text-primary">
                    Mesa de trabajo
                  </Text>
                  <View className="rounded-full bg-ink px-2.5 py-1">
                    <Text className="text-[10px] font-bold text-white">
                      {totalWork} {totalWork === 1 ? "unidad" : "unidades"}
                    </Text>
                  </View>
                </View>
                <Text className="mt-1 text-lg font-bold text-ink">
                  Trabajo pendiente
                </Text>
                <Text className="mt-1 text-xs leading-5 text-muted">
                  Atiende primero las unidades en proceso. Al liberar una, pasa
                  al siguiente vehículo de la cola.
                </Text>
              </View>
            </View>
            <View className="flex-row border-t border-line bg-canvas/60">
              <WorkCounter
                label="En reparación"
                count={inRepair.length}
                active
              />
              <WorkCounter label="En cola" count={sorted.length} />
            </View>
          </View>

          <SectionHeading
            icon={Wrench}
            title="En reparación"
            description="Unidades que están siendo trabajadas ahora"
            count={inRepair.length}
            tone="active"
          />

          <View className={desktop ? "flex-row flex-wrap gap-3" : ""}>
            {inRepair.map((unit) => (
              <RepairCard
                key={unit.localId}
                unit={unit}
                state="active"
                busy={busyId === unit.localId}
                desktop={desktop}
                primary={{
                  label: "Liberar unidad reparada",
                  variant: "success",
                  onPress: () => void move(unit, "RELEASED"),
                }}
                secondary={{
                  label: "Marcar no disponible",
                  onPress: () => void move(unit, "UNAVAILABLE"),
                }}
                estimateBusy={estimateBusyId === unit.localId}
                onUpdateEstimate={(hours) => void updateEstimate(unit, hours)}
              />
            ))}
          </View>

          {inRepair.length === 0 ? (
            <EmptyState message="No hay unidades en reparación en este momento." />
          ) : null}

          <SectionHeading
            icon={ClipboardList}
            title="Siguiente en cola"
            description="Ordenadas por prioridad de atención"
            count={sorted.length}
          />

          <View className={desktop ? "flex-row flex-wrap gap-3" : ""}>
            {sorted.map((unit, index) => (
              <RepairCard
                key={unit.localId}
                unit={unit}
                rank={unit.priorityRank ?? index + 1}
                busy={busyId === unit.localId}
                desktop={desktop}
                primary={{
                  label: "Iniciar reparación",
                  onPress: () => void move(unit, "IN_REPAIR"),
                }}
                secondary={{
                  label: "Marcar no disponible",
                  onPress: () => void move(unit, "UNAVAILABLE"),
                }}
              />
            ))}
          </View>

          {sorted.length === 0 ? (
            <EmptyState message="No hay unidades esperando reparación." />
          ) : null}

          <SectionHeading
            icon={CircleAlert}
            title="Trabajo pausado"
            description="Unidades no disponibles que pueden reactivarse"
            count={unavailable.length}
          />
          <View className={desktop ? "flex-row flex-wrap gap-3" : ""}>
            {unavailable.map((unit) => (
              <RepairCard
                key={unit.localId}
                unit={unit}
                state="paused"
                busy={busyId === unit.localId}
                desktop={desktop}
                primary={{
                  label: "Reactivar reparación",
                  onPress: () => void move(unit, "IN_REPAIR"),
                }}
              />
            ))}
          </View>
          {unavailable.length === 0 ? (
            <EmptyState message="No hay unidades pausadas." />
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function WorkCounter({
  label,
  count,
  active = false,
}: {
  label: string;
  count: number;
  active?: boolean;
}) {
  return (
    <View
      className={`flex-1 px-4 py-3 ${active ? "border-r border-line" : ""}`}
    >
      <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
        {label}
      </Text>
      <Text
        selectable
        className={`mt-0.5 text-xl font-bold ${active ? "text-primary" : "text-ink"}`}
      >
        {count}
      </Text>
    </View>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  count,
  tone = "queue",
}: {
  icon: typeof Wrench;
  title: string;
  description: string;
  count: number;
  tone?: "active" | "queue";
}) {
  const active = tone === "active";

  return (
    <View className="mb-3 mt-5 flex-row items-center gap-3 px-1">
      <View
        className={`h-10 w-10 items-center justify-center rounded-2xl ${active ? "bg-primary/10" : "bg-canvas"}`}
      >
        <Icon
          color={active ? COLORS.primary : COLORS.ink}
          size={20}
          strokeWidth={2.2}
        />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-ink">{title}</Text>
        <Text className="mt-0.5 text-xs text-muted">{description}</Text>
      </View>
      <View
        className={`min-w-8 items-center rounded-full px-2.5 py-1 ${active ? "bg-primary/10" : "bg-canvas"}`}
      >
        <Text
          selectable
          className={`text-xs font-bold ${active ? "text-primary" : "text-ink"}`}
        >
          {count}
        </Text>
      </View>
    </View>
  );
}

function RepairCard({
  unit,
  rank,
  state = "queue",
  busy,
  desktop,
  primary,
  secondary,
  estimateBusy = false,
  onUpdateEstimate,
}: {
  unit: Unit;
  rank?: number;
  state?: "active" | "queue" | "paused";
  busy: boolean;
  desktop: boolean;
  primary: {
    label: string;
    variant?: "primary" | "success";
    onPress: () => void;
  };
  secondary?: { label: string; onPress: () => void };
  estimateBusy?: boolean;
  onUpdateEstimate?: (hours: number) => void;
}) {
  const active = state === "active";
  const paused = state === "paused";
  const hours = unit.estimatedRepairHours ?? estimateHours(unit.defects);
  const [hoursDraft, setHoursDraft] = useState(String(hours));
  const parsedHours = Number(hoursDraft.replace(",", "."));

  return (
    <View
      className={`mb-3 overflow-hidden rounded-3xl border bg-surface ${active ? "border-primary" : "border-line"}`}
      style={desktop ? { flexBasis: "49%" } : undefined}
    >
      <View className="p-4">
        <View className="flex-row items-start gap-3">
          <View
            className={`h-11 w-11 items-center justify-center rounded-2xl ${active ? "bg-primary" : paused ? "bg-v2/15" : "bg-canvas"}`}
          >
            {active ? (
              <Wrench color={COLORS.white} size={22} strokeWidth={2.1} />
            ) : paused ? (
              <CircleAlert color={COLORS.v2} size={22} strokeWidth={2.1} />
            ) : (
              <Text selectable className="text-base font-bold text-ink">
                {rank}
              </Text>
            )}
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text
                className={`text-[10px] font-bold uppercase tracking-wide ${active ? "text-primary" : paused ? "text-v2" : "text-muted"}`}
              >
                {active
                  ? "Reparación en curso"
                  : paused
                    ? "Trabajo pausado"
                    : `Prioridad ${rank}`}
              </Text>
              {active ? (
                <View className="h-1.5 w-1.5 rounded-full bg-primary" />
              ) : null}
            </View>
            <Text
              selectable
              className="mt-0.5 font-mono text-sm font-bold text-ink"
            >
              {unit.vin}
            </Text>
          </View>
          {active ? (
            <View className="rounded-full bg-primary/10 px-2 py-1">
              <Text className="text-[10px] font-bold text-primary">ACTIVA</Text>
            </View>
          ) : null}
        </View>

        <View className="mt-3 flex-row flex-wrap gap-2">
          <View className="flex-row items-center gap-1.5 rounded-lg bg-canvas px-2.5 py-1.5">
            <Clock3 color={COLORS.muted} size={14} strokeWidth={2.2} />
            <Text className="text-[11px] font-semibold text-ink">
              {hours} h estimadas
            </Text>
          </View>
          <View className="rounded-lg bg-canvas px-2.5 py-1.5">
            <Text className="text-[11px] font-semibold text-ink">
              Carril {unit.lane}
            </Text>
          </View>
          <View className="rounded-lg bg-canvas px-2.5 py-1.5">
            <Text className="text-[11px] font-semibold text-ink">
              {unit.defects.length}{" "}
              {unit.defects.length === 1 ? "defecto" : "defectos"}
            </Text>
          </View>
        </View>

        <View className="mt-3 flex-row items-center justify-between gap-2">
          <GradeDots defects={unit.defects} />
          <Text className="text-[11px] font-medium text-muted">
            {unit.market}
          </Text>
        </View>
        {unit.priorityNote ? (
          <View className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
            <Text className="text-[10px] font-bold uppercase tracking-wide text-primary">
              Nota recibida de Prioridad
            </Text>
            <Text selectable className="mt-1 text-xs leading-5 text-ink">
              {unit.priorityNote}
            </Text>
          </View>
        ) : null}
        {active && onUpdateEstimate ? (
          <View className="mt-3 rounded-2xl border border-line bg-canvas/60 p-3">
            <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
              Tiempo estimado de reparación
            </Text>
            <View className="mt-2 flex-row items-center gap-2">
              <TextInput
                value={hoursDraft}
                onChangeText={setHoursDraft}
                keyboardType="decimal-pad"
                className="h-11 w-24 rounded-xl border border-line bg-white px-3 text-center text-sm font-bold text-ink"
                accessibilityLabel={`Horas estimadas para ${unit.vin}`}
              />
              <Text className="text-xs font-medium text-muted">horas</Text>
              <View className="ml-auto">
                <ActionButton
                  label="Actualizar"
                  compact
                  variant="neutral"
                  busy={estimateBusy}
                  disabled={
                    !Number.isFinite(parsedHours) ||
                    parsedHours <= 0 ||
                    parsedHours === hours
                  }
                  onPress={() => onUpdateEstimate(parsedHours)}
                />
              </View>
            </View>
          </View>
        ) : null}
      </View>

      <View className="border-t border-line bg-canvas/50 p-3">
        <ActionButton
          label={primary.label}
          variant={primary.variant ?? "primary"}
          busy={busy}
          onPress={primary.onPress}
        />
        <View className="mt-2 flex-row items-center gap-2">
          {active || paused ? (
            <CircleAlert color={COLORS.muted} size={16} strokeWidth={2.1} />
          ) : (
            <Play color={COLORS.primary} size={16} strokeWidth={2.1} />
          )}
          <Text className="flex-1 text-[11px] leading-4 text-muted">
            {active
              ? "Libera la unidad cuando la reparación esté terminada."
              : paused
                ? "Reactívala cuando el bloqueo esté resuelto para volver a la mesa de trabajo."
                : "Al iniciar, esta unidad pasará a trabajo activo."}
          </Text>
        </View>
        {secondary ? (
          <View className="mt-2">
            <ActionButton
              label={secondary.label}
              variant="neutral"
              busy={busy}
              onPress={secondary.onPress}
              compact
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}
