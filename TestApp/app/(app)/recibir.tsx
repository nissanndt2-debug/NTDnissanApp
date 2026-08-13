import {
  Check,
  CheckCircle2,
  ClipboardCheck,
  PackageCheck,
  Truck,
} from "lucide-react-native";
import { useState } from "react";
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
import { changeStatusBulk, retryDefectPhotoUpload } from "@/data/units";
import type { Defect, Unit } from "@/domain/types";
import { GradeDots } from "@/ui/GradeDot";
import { useRefreshUnits, useUnits } from "@/hooks/useUnits";
import { ActionButton } from "@/ui/ActionButton";
import { EmptyState, Screen } from "@/ui/Screen";
import { COLORS } from "@/ui/theme";
import { DefectEvidence } from "@/ui/DefectEvidence";
import { useSync } from "@/sync/SyncProvider";

/**
 * Recepción de unidades entregadas por WWS.
 *
 * La recepción sucede por lote: el operador identifica la descarga, selecciona
 * las unidades presentes y las incorpora a la cola de reparación en una acción.
 */
export default function RecibirScreen() {
  const { user } = useAuth();
  const refresh = useRefreshUnits();
  const { syncNow } = useSync();
  const { data: units, refetch } = useUnits("DELIVERED");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [receptionNote, setReceptionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryingPhotoId, setRetryingPhotoId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 960;

  const toggle = (localId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(localId)) next.delete(localId);
      else next.add(localId);
      return next;
    });
  };

  const allSelected = units.length > 0 && selected.size === units.length;

  const retryPhoto = async (unit: Unit, defect: Defect) => {
    if (!defect.localId) return;
    setRetryingPhotoId(defect.localId);
    try {
      await retryDefectPhotoUpload(unit, defect);
      await refetch();
      refresh();
      await syncNow();
    } finally {
      setRetryingPhotoId(null);
    }
  };

  const receiveSelected = async () => {
    if (!user || selected.size === 0) return;
    Keyboard.dismiss();

    setBusy(true);
    try {
      await changeStatusBulk(
        units
          .filter((unit) => selected.has(unit.localId!))
          .map((unit) => ({ localId: unit.localId!, from: unit.statusName })),
        "RECEIVED",
        user.id,
        { note: receptionNote.trim() || undefined },
      );
      setSelected(new Set());
      setReceptionNote("");
      await refetch();
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="Recibir unidades"
      subtitle="Confirmación de entrega en Body Shop"
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
                  <Truck color={COLORS.primary} size={25} strokeWidth={2} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="text-label font-bold uppercase text-primary">
                      Paso 1 de 2
                    </Text>
                    <View className="rounded-full bg-ink px-2.5 py-1">
                      <Text className="text-[10px] font-bold text-white">
                        {units.length}{" "}
                        {units.length === 1 ? "unidad" : "unidades"}
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-1 text-lg font-bold text-ink">
                    Confirmar recepción
                  </Text>
                  <Text className="mt-1 text-xs leading-5 text-muted">
                    Selecciona las unidades que ya están físicamente en Body
                    Shop. Después estarán listas para reparar.
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center gap-2 border-t border-line bg-canvas/60 px-4 py-2.5">
                <ClipboardCheck
                  color={COLORS.primary}
                  size={17}
                  strokeWidth={2.2}
                />
                <Text className="flex-1 text-xs font-medium text-muted">
                  Confirma solo las unidades descargadas y verificadas.
                </Text>
              </View>
            </View>

            {units.length > 0 ? (
              <View className="mb-3 flex-row items-center justify-between px-1">
                <View>
                  <Text className="text-label font-bold uppercase text-muted">
                    Lote entregado
                  </Text>
                  <Text className="mt-0.5 text-xs text-muted">
                    Toca una unidad para marcarla
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    setSelected(
                      allSelected
                        ? new Set()
                        : new Set(units.map((unit) => unit.localId!)),
                    )
                  }
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={
                    allSelected ? "Quitar selección" : "Seleccionar todas"
                  }
                  className="min-h-[44px] justify-center rounded-xl bg-primary/10 px-3 active:opacity-70"
                >
                  <Text className="text-xs font-bold text-primary">
                    {allSelected ? "Quitar selección" : "Seleccionar todas"}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View className={desktop ? "flex-row flex-wrap gap-3" : ""}>
              {units.map((unit) => {
                const isSelected = selected.has(unit.localId!);

                return (
                  <View
                    key={unit.localId}
                    className={`mb-3 overflow-hidden rounded-3xl border bg-surface active:opacity-80 ${
                      isSelected ? "border-primary bg-primary/5" : "border-line"
                    }`}
                    style={desktop ? { flexBasis: "49%" } : undefined}
                  >
                    <Pressable
                      onPress={() => toggle(unit.localId!)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={`Seleccionar unidad ${unit.vin}`}
                      className="p-4 active:opacity-80"
                    >
                      <View className="flex-row items-start gap-3">
                        <View
                          className={`h-11 w-11 items-center justify-center rounded-2xl ${
                            isSelected ? "bg-primary" : "bg-primary/10"
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
                            Entregada por WWS
                          </Text>
                          <Text
                            selectable
                            className="mt-0.5 font-mono text-sm font-bold text-ink"
                          >
                            {unit.vin}
                          </Text>
                        </View>
                        <View
                          className={`h-9 w-9 items-center justify-center rounded-xl border-2 ${
                            isSelected
                              ? "border-primary bg-primary"
                              : "border-line bg-white"
                          }`}
                        >
                          {isSelected ? (
                            <Check
                              color={COLORS.white}
                              size={19}
                              strokeWidth={3}
                            />
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
                          <Text className="text-[11px] font-semibold text-ink">
                            {unit.market}
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
                        <Text
                          className={`text-[11px] font-bold ${isSelected ? "text-primary" : "text-muted"}`}
                        >
                          {isSelected
                            ? "Lista para recibir"
                            : "Toca para seleccionar"}
                        </Text>
                      </View>
                    </Pressable>
                    <View className="border-t border-line bg-canvas/40 px-4 py-3">
                      <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
                        Evidencias del reporte
                      </Text>
                      {unit.defects.map((defect) => (
                        <View
                          key={defect.localId ?? defect.id}
                          className="mt-2 rounded-xl bg-white/60 p-2"
                        >
                          <Text
                            className="text-[11px] font-semibold text-ink"
                            numberOfLines={1}
                          >
                            {defect.type} · {defect.zone}
                          </Text>
                          <DefectEvidence
                            defect={defect}
                            unitLabel={unit.vin}
                            retrying={retryingPhotoId === defect.localId}
                            onRetry={
                              defect.photoError
                                ? () => void retryPhoto(unit, defect)
                                : undefined
                            }
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>

            {units.length === 0 ? (
              <EmptyState message="No hay unidades entregadas pendientes de recibir." />
            ) : null}
          </View>
        </ScrollView>

        {selected.size > 0 ? (
          <View
            className="absolute bottom-[104px] left-0 right-0 rounded-t-3xl border-t border-line bg-surface px-4 pb-5 pt-3"
            style={{
              boxShadow: "0 -5px 14px rgba(16, 24, 40, 0.10)",
            }}
          >
            <View className="mb-3 flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <CheckCircle2
                  color={COLORS.primary}
                  size={22}
                  strokeWidth={2.2}
                />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-ink">
                  {selected.size} unidad{selected.size === 1 ? "" : "es"}{" "}
                  seleccionada
                  {selected.size === 1 ? "" : "s"}
                </Text>
                <Text className="text-xs text-muted">
                  Se enviarán a la cola de reparación
                </Text>
              </View>
            </View>
            <View className="mb-3 rounded-2xl border border-line bg-canvas/60 px-3 py-2">
              <Text className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">
                Nota para Reparar (opcional)
              </Text>
              <TextInput
                value={receptionNote}
                onChangeText={setReceptionNote}
                placeholder="Ej. Descarga verificada en carril 3"
                placeholderTextColor={COLORS.muted}
                multiline
                maxLength={280}
                className="min-h-[38px] text-sm text-ink"
                accessibilityLabel="Nota de recepción"
              />
              <Text className="mt-1 text-[10px] leading-4 text-muted">
                Se enviará al equipo de Body Shop y quedará en el historial de
                cada unidad.
              </Text>
            </View>
            <ActionButton
              label="Confirmar recepción"
              onPress={() => void receiveSelected()}
              busy={busy}
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
