import {
  CheckCircle2,
  ClipboardCheck,
  RotateCcw,
  ShieldCheck,
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
import { changeStatus } from "@/data/units";
import { displayLabel } from "@/domain/zones";
import type { Unit } from "@/domain/types";
import { useRefreshUnits, useUnits } from "@/hooks/useUnits";
import { ActionButton } from "@/ui/ActionButton";
import { GradeDots } from "@/ui/GradeDot";
import { EmptyState, Screen } from "@/ui/Screen";
import { COLORS, GRADE_BG } from "@/ui/theme";

/**
 * Validación de garantía (WTY / SCM Quality).
 *
 * Solo llegan unidades sin daño V1. La decisión define si la unidad se libera
 * por garantía o vuelve a Body Shop para continuar su flujo de reparación.
 */
export default function ValidarScreen() {
  const { user } = useAuth();
  const refresh = useRefreshUnits();
  const { data: units, refetch } = useUnits("WTY_PENDING");
  const [busyId, setBusyId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 960;

  const decide = async (unit: Unit, approve: boolean, reason?: string) => {
    if (!user) return;
    Keyboard.dismiss();

    setBusyId(unit.localId!);
    try {
      await changeStatus(
        unit.localId!,
        unit.statusName,
        approve ? "WTY_RELEASED" : "SENT",
        user.id,
        { note: reason?.trim() || undefined },
      );
      await refetch();
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen
      title="Validar garantía"
      subtitle="Decisión de cobertura y siguiente paso"
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
                <ShieldCheck color={COLORS.primary} size={25} strokeWidth={2} />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-label font-bold uppercase text-primary">
                    Revisión de garantía
                  </Text>
                  <View className="rounded-full bg-ink px-2.5 py-1">
                    <Text className="text-[10px] font-bold text-white">
                      {units.length}{" "}
                      {units.length === 1 ? "unidad" : "unidades"}
                    </Text>
                  </View>
                </View>
                <Text className="mt-1 text-lg font-bold text-ink">
                  Decide el siguiente paso
                </Text>
                <Text className="mt-1 text-xs leading-5 text-muted">
                  Revisa los daños reportados. Aprueba si aplica garantía o
                  devuelve la unidad a Body Shop si requiere reparación.
                </Text>
              </View>
            </View>
            <View className="flex-row border-t border-line bg-canvas/60">
              <OutcomeHint
                icon={CheckCircle2}
                label="Aprobar"
                detail="Libera por garantía"
                positive
              />
              <OutcomeHint
                icon={RotateCcw}
                label="Enviar a Body"
                detail="Regresa a reparación"
              />
            </View>
          </View>

          {units.length > 0 ? (
            <View className="mb-3 flex-row items-center gap-3 px-1">
              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-canvas">
                <ClipboardCheck
                  color={COLORS.ink}
                  size={20}
                  strokeWidth={2.2}
                />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-ink">
                  Pendientes por revisar
                </Text>
                <Text className="mt-0.5 text-xs text-muted">
                  Cada decisión actualiza el flujo de la unidad
                </Text>
              </View>
            </View>
          ) : null}

          <View className={desktop ? "flex-row flex-wrap gap-3" : ""}>
            {units.map((unit) => (
              <ValidationCard
                key={unit.localId}
                unit={unit}
                busy={busyId === unit.localId}
                desktop={desktop}
                onApprove={() => void decide(unit, true)}
                onReject={(reason) => void decide(unit, false, reason)}
              />
            ))}
          </View>

          {units.length === 0 ? (
            <EmptyState message="No hay unidades pendientes de validación de garantía." />
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function OutcomeHint({
  icon: Icon,
  label,
  detail,
  positive = false,
}: {
  icon: typeof CheckCircle2;
  label: string;
  detail: string;
  positive?: boolean;
}) {
  const color = positive ? COLORS.synced : COLORS.muted;

  return (
    <View
      className={`flex-1 flex-row items-center gap-2 px-3 py-3 ${positive ? "border-r border-line" : ""}`}
    >
      <Icon color={color} size={18} strokeWidth={2.2} />
      <View className="flex-1">
        <Text className="text-[11px] font-bold text-ink">{label}</Text>
        <Text className="mt-0.5 text-[10px] text-muted">{detail}</Text>
      </View>
    </View>
  );
}

function ValidationCard({
  unit,
  busy,
  desktop,
  onApprove,
  onReject,
}: {
  unit: Unit;
  busy: boolean;
  desktop: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [rejectionReason, setRejectionReason] = useState("");
  return (
    <View
      className="mb-3 overflow-hidden rounded-3xl border border-line bg-surface"
      style={desktop ? { flexBasis: "49%" } : undefined}
    >
      <View className="p-4">
        <View className="flex-row items-start gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
            <ShieldCheck color={COLORS.primary} size={22} strokeWidth={2.1} />
          </View>
          <View className="flex-1">
            <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
              Solicitud de garantía
            </Text>
            <Text
              selectable
              className="mt-0.5 font-mono text-sm font-bold text-ink"
            >
              {unit.vin}
            </Text>
          </View>
          <View className="rounded-full bg-primary/10 px-2.5 py-1">
            <Text className="text-[10px] font-bold text-primary">
              POR DECIDIR
            </Text>
          </View>
        </View>

        <View className="mt-3 flex-row flex-wrap gap-2">
          <View className="rounded-lg bg-canvas px-2.5 py-1.5">
            <Text className="text-[11px] font-semibold text-ink">
              Carril {unit.lane}
            </Text>
          </View>
          <View className="rounded-lg bg-canvas px-2.5 py-1.5">
            <Text className="text-[11px] font-semibold text-ink">
              {unit.market}
            </Text>
          </View>
          <View className="rounded-lg bg-canvas px-2.5 py-1.5">
            <Text className="text-[11px] font-semibold text-ink">
              {unit.defects.length}{" "}
              {unit.defects.length === 1 ? "daño" : "daños"}
            </Text>
          </View>
        </View>

        <View className="mt-3">
          <GradeDots defects={unit.defects} />
        </View>

        <View className="mt-3 rounded-2xl border border-line bg-canvas/60 p-3">
          <View className="mb-2 flex-row items-center gap-2">
            <Wrench color={COLORS.muted} size={16} strokeWidth={2.1} />
            <Text className="text-[11px] font-bold uppercase tracking-wide text-muted">
              Daños reportados
            </Text>
          </View>
          {unit.defects.map((defect) => (
            <View
              key={defect.localId}
              className="mb-1.5 flex-row items-center gap-2 last:mb-0"
            >
              <View
                className={`min-w-8 items-center rounded-md px-1.5 py-1 ${GRADE_BG[defect.grade]}`}
              >
                <Text className="text-[10px] font-bold text-white">
                  {defect.grade}
                </Text>
              </View>
              <Text className="flex-1 text-xs text-ink">
                {displayLabel(defect.type)} · {displayLabel(defect.zone)}
              </Text>
            </View>
          ))}
        </View>

        <View className="mt-3 rounded-2xl border border-v2/30 bg-v2/5 p-3">
          <Text className="text-[10px] font-bold uppercase tracking-wide text-v2">
            Motivo para enviar a Body Shop
          </Text>
          <TextInput
            value={rejectionReason}
            onChangeText={setRejectionReason}
            placeholder="Indica por qué vuelve a Body Shop"
            placeholderTextColor={COLORS.muted}
            multiline
            maxLength={280}
            className="mt-1 min-h-[38px] text-xs text-ink"
            accessibilityLabel={`Motivo de rechazo para ${unit.vin}`}
          />
          <Text className="mt-1 text-[10px] leading-4 text-muted">
            Solo se envía si rechazas la garantía; lo verá Body Shop y quedará
            en el historial.
          </Text>
        </View>
      </View>

      <View className="border-t border-line bg-canvas/50 p-3">
        <ActionButton
          label="Aprobar y liberar por garantía"
          variant="success"
          busy={busy}
          onPress={onApprove}
        />
        <View className="mt-2 flex-row items-center gap-2">
          <RotateCcw color={COLORS.muted} size={16} strokeWidth={2.1} />
          <Text className="flex-1 text-[11px] leading-4 text-muted">
            Si no aplica garantía, la unidad regresará a Body Shop para su
            reparación.
          </Text>
        </View>
        <View className="mt-2">
          <ActionButton
            label="Rechazar y enviar a Body Shop"
            variant="neutral"
            busy={busy}
            disabled={!rejectionReason.trim()}
            onPress={() => onReject(rejectionReason)}
            compact
          />
        </View>
      </View>
    </View>
  );
}
