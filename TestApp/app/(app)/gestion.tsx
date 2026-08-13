import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CirclePlus,
  Image as ImageIcon,
  MapPin,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import {
  addDefectToUnit,
  changeStatus,
  changeStatusBulk,
  retryDefectPhotoUpload,
  updateDefectGrade,
} from "@/data/units";
import { GRADES, type Grade } from "@/domain/constants";
import type { Defect, Unit } from "@/domain/types";
import {
  OFF_DIAGRAM_ZONES,
  ZONES,
  displayLabel,
  findingLabel,
  zoneCode,
  zoneLabel,
} from "@/domain/zones";
import { useRefreshUnits, useUnits } from "@/hooks/useUnits";
import { ActionButton } from "@/ui/ActionButton";
import { BulkAction } from "@/ui/BulkAction";
import { DamageSheet, type DraftDefect } from "@/ui/DamageSheet";
import { GradeDots } from "@/ui/GradeDot";
import { EmptyState, Screen } from "@/ui/Screen";
import { COLORS } from "@/ui/theme";
import { DefectEvidence } from "@/ui/DefectEvidence";

type Tab = "nivelar" | "entregar" | "liberar";

function isTab(value: unknown): value is Tab {
  return value === "nivelar" || value === "entregar" || value === "liberar";
}

const TABS: { key: Tab; label: string; hint: string; icon: LucideIcon }[] = [
  {
    key: "nivelar",
    label: "Nivelar",
    hint: "Revisar daño",
    icon: SlidersHorizontal,
  },
  { key: "entregar", label: "Entregar", hint: "Enviar a Body", icon: Truck },
  {
    key: "liberar",
    label: "Liberar",
    hint: "Salida a carrier",
    icon: CheckCircle2,
  },
];

/** Tres pasos operativos de WWS en una sola pantalla. */
export default function GestionScreen() {
  const { step } = useLocalSearchParams<{ step?: string }>();
  const { user } = useAuth();
  const refresh = useRefreshUnits();
  const [tab, setTab] = useState<Tab>(isTab(step) ? step : "nivelar");

  useEffect(() => {
    setTab(isTab(step) ? step : "nivelar");
  }, [step]);

  return (
    <Screen
      title="Gestión WWS"
      subtitle="Revisa, entrega y libera unidades"
      centerLogo
      syncInHeader
    >
      <View className="px-4 pb-3 pt-3">
        <View className="mb-2 flex-row items-center justify-between px-1">
          <Text className="text-label font-bold uppercase text-muted">
            Flujo WWS
          </Text>
          <Text className="text-[11px] text-muted">Selecciona el paso</Text>
        </View>

        <View className="flex-row gap-2">
          {TABS.map((item, index) => {
            const Icon = item.icon;
            const selected = tab === item.key;

            return (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                className={`min-h-[78px] flex-1 items-center justify-center rounded-2xl border px-1 outline-none active:opacity-80 ${
                  selected
                    ? "border-primary bg-primary"
                    : "border-line bg-surface"
                }`}
              >
                <View className="flex-row items-center gap-1.5">
                  <View
                    className={`h-6 w-6 items-center justify-center rounded-full ${
                      selected ? "bg-white/15" : "bg-primary/10"
                    }`}
                  >
                    <Text
                      className={`text-[10px] font-bold ${
                        selected ? "text-white" : "text-primary"
                      }`}
                    >
                      {index + 1}
                    </Text>
                  </View>
                  <Icon
                    color={selected ? COLORS.white : COLORS.primary}
                    size={20}
                    strokeWidth={2.1}
                  />
                </View>
                <Text
                  className={`mt-1 text-xs font-bold ${
                    selected ? "text-white" : "text-ink"
                  }`}
                >
                  {item.label}
                </Text>
                <Text
                  className={`mt-0.5 text-center text-[9px] ${
                    selected ? "text-white/65" : "text-muted"
                  }`}
                  numberOfLines={1}
                >
                  {item.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {tab === "nivelar" ? (
        <Nivelar userId={user?.id} onDone={refresh} />
      ) : null}
      {tab === "entregar" ? (
        <Entregar userId={user?.id} onDone={refresh} />
      ) : null}
      {tab === "liberar" ? (
        <Liberar userId={user?.id} onDone={refresh} />
      ) : null}
    </Screen>
  );
}

function StageIntro({
  icon: Icon,
  step,
  title,
  description,
  count,
}: {
  icon: LucideIcon;
  step: string;
  title: string;
  description: string;
  count: number;
}) {
  return (
    <View className="mb-4 rounded-3xl border border-line bg-surface p-4">
      <View className="flex-row items-start gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <Icon color={COLORS.primary} size={25} strokeWidth={2} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-label font-bold uppercase text-primary">
              {step}
            </Text>
            <View className="rounded-full bg-ink px-2.5 py-1">
              <Text className="text-[10px] font-bold text-white">
                {count} {count === 1 ? "unidad" : "unidades"}
              </Text>
            </View>
          </View>
          <Text className="mt-1 text-lg font-bold text-ink">{title}</Text>
          <Text className="mt-1 text-xs leading-5 text-muted">
            {description}
          </Text>
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Nivelar: revisar y corregir la severidad.                        */
/* ------------------------------------------------------------------ */

function Nivelar({ userId, onDone }: { userId?: number; onDone: () => void }) {
  const { data: units, refetch } = useUnits("REPORTED");
  const [openId, setOpenId] = useState<string | null>(null);
  const [addUnit, setAddUnit] = useState<Unit | null>(null);
  const [addZone, setAddZone] = useState<string | null>(null);
  const [zonePickerOpen, setZonePickerOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<{
    uri: string;
    label: string;
  } | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [retryingPhotoId, setRetryingPhotoId] = useState<string | null>(null);

  const cycleGrade = async (unit: Unit, defect: Defect) => {
    if (!userId) return;
    const next = GRADES[
      (GRADES.indexOf(defect.grade) + 1) % GRADES.length
    ] as Grade;
    await updateDefectGrade(unit.localId!, defect, next, userId);
    await refetch();
  };

  const send = async (unit: Unit, to: "SENT" | "WTY_PENDING") => {
    if (!userId) return;
    await changeStatus(unit.localId!, unit.statusName, to, userId);
    setOpenId(null);
    await refetch();
    onDone();
  };

  const openAdditionalFinding = (unit: Unit) => {
    setAddUnit(unit);
    setAddZone(null);
    setAddError(null);
    setZonePickerOpen(true);
  };

  const saveAdditionalFinding = (
    draft: Omit<DraftDefect, "key" | "zoneId">,
  ) => {
    const target = addUnit;
    const zoneId = addZone;
    if (!target || !zoneId || !userId) return;

    setAddZone(null);
    setAddUnit(null);
    void (async () => {
      try {
        await addDefectToUnit(target, {
          type: `${draft.typeId} - ${findingLabel(draft.typeId)}`,
          zone: zoneCode(zoneId),
          grade: draft.grade,
          registeredById: userId,
          photoUri: draft.photoUri,
        });
        await refetch();
        onDone();
      } catch (reason) {
        setOpenId(target.localId ?? null);
        setAddError(
          reason instanceof Error
            ? reason.message
            : "No se pudo agregar el hallazgo.",
        );
      }
    })();
  };

  const retryPhoto = async (unit: Unit, defect: Defect) => {
    if (!defect.localId) return;
    setRetryingPhotoId(defect.localId);
    try {
      await retryDefectPhotoUpload(unit, defect);
      await refetch();
      onDone();
    } catch (reason) {
      setOpenId(unit.localId ?? null);
      setAddError(
        reason instanceof Error
          ? reason.message
          : "No se pudo preparar el reintento de la foto.",
      );
    } finally {
      setRetryingPhotoId(null);
    }
  };

  return (
    <ScrollView contentContainerClassName="px-4 pb-32">
      <StageIntro
        icon={SlidersHorizontal}
        step="Paso 1 de 3"
        title="Revisar severidad"
        description="Abre una unidad, comprueba sus defectos y toca el grado para corregirlo."
        count={units.length}
      />

      {units.length === 0 ? (
        <EmptyState message="No hay unidades reportadas por nivelar." />
      ) : null}

      {units.map((unit) => {
        const open = openId === unit.localId;
        const hasV1 = unit.defects.some((defect) => defect.grade === "V1");

        return (
          <View
            key={unit.localId}
            className={`mb-3 overflow-hidden rounded-3xl border bg-surface ${
              open ? "border-primary" : "border-line"
            }`}
          >
            <Pressable
              onPress={() => setOpenId(open ? null : unit.localId!)}
              accessibilityLabel={`${open ? "Cerrar" : "Revisar"} unidad ${unit.vin}`}
              className="p-4 active:bg-canvas/60"
            >
              <View className="flex-row items-start gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                  <SlidersHorizontal
                    color={COLORS.primary}
                    size={21}
                    strokeWidth={2}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
                    Unidad reportada
                  </Text>
                  <Text className="mt-0.5 font-mono text-sm font-bold text-ink">
                    {unit.vin}
                  </Text>
                </View>
                <View className="h-10 w-10 items-center justify-center rounded-full bg-canvas">
                  {open ? (
                    <ChevronUp
                      color={COLORS.primary}
                      size={20}
                      strokeWidth={2.2}
                    />
                  ) : (
                    <ChevronDown
                      color={COLORS.muted}
                      size={20}
                      strokeWidth={2.2}
                    />
                  )}
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
                <Text className="text-[11px] font-bold text-primary">
                  {open ? "Ocultar detalle" : "Toca para revisar"}
                </Text>
              </View>
            </Pressable>

            {open ? (
              <View className="border-t border-line bg-canvas/50 p-4">
                <View className="mb-3 flex-row items-center gap-3 rounded-2xl bg-white p-3">
                  <View className="h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                    <RefreshCw
                      color={COLORS.primary}
                      size={18}
                      strokeWidth={2.2}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-ink">
                      Corregir severidad
                    </Text>
                    <Text className="mt-0.5 text-xs text-muted">
                      Toca V1, V2 o V3 para cambiar al siguiente grado.
                    </Text>
                  </View>
                </View>

                {addError ? (
                  <View className="mb-3 rounded-2xl border border-v1/20 bg-v1/5 p-3">
                    <Text className="text-xs font-medium leading-5 text-v1">
                      {addError}
                    </Text>
                  </View>
                ) : null}

                {unit.defects.map((defect) => (
                  <View
                    key={defect.localId}
                    className="mb-2 rounded-2xl border border-line bg-white p-3"
                  >
                    <View className="flex-row items-center gap-3">
                      <Pressable
                        onPress={() => void cycleGrade(unit, defect)}
                        accessibilityLabel={`Cambiar severidad ${defect.grade}`}
                        className={`h-12 w-12 items-center justify-center rounded-2xl ${
                          defect.grade === "V1"
                            ? "bg-v1"
                            : defect.grade === "V2"
                              ? "bg-v2"
                              : "bg-v3"
                        }`}
                      >
                        <Text className="text-sm font-bold text-white">
                          {defect.grade}
                        </Text>
                      </Pressable>
                      <View className="flex-1">
                        <Text className="text-sm font-bold text-ink">
                          {displayLabel(defect.type)}
                        </Text>
                        <Text className="mt-0.5 text-xs text-muted">
                          {displayLabel(defect.zone)} · Toca el grado para
                          cambiar
                        </Text>
                      </View>
                      <EvidenceSummary
                        defect={defect}
                        onOpen={(uri) =>
                          setPhotoPreview({
                            uri,
                            label: `${displayLabel(defect.type)} · ${unit.vin}`,
                          })
                        }
                      />
                    </View>
                    <DefectPhotos
                      defect={defect}
                      unitLabel={unit.vin}
                      retrying={retryingPhotoId === defect.localId}
                      onRetry={
                        defect.photoError
                          ? () => void retryPhoto(unit, defect)
                          : undefined
                      }
                      onOpen={(uri) =>
                        setPhotoPreview({
                          uri,
                          label: `${displayLabel(defect.type)} · ${unit.vin}`,
                        })
                      }
                    />
                  </View>
                ))}

                <Pressable
                  onPress={() => openAdditionalFinding(unit)}
                  className="mb-3 min-h-[58px] flex-row items-center gap-3 rounded-2xl border-2 border-dashed border-primary/35 bg-primary/5 px-4 active:bg-primary/10"
                  accessibilityRole="button"
                  accessibilityLabel={`Agregar otro fallo a la unidad ${unit.vin}`}
                >
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary">
                    <CirclePlus
                      color={COLORS.white}
                      size={21}
                      strokeWidth={2.2}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-primary">
                      Agregar otro fallo
                    </Text>
                    <Text className="mt-0.5 text-xs text-muted">
                      Registra un hallazgo que no apareció en el reporte
                      inicial.
                    </Text>
                  </View>
                </Pressable>

                <View className="mt-3 gap-2">
                  <ActionButton
                    label="Enviar a Body"
                    onPress={() => void send(unit, "SENT")}
                  />
                  <ActionButton
                    label={
                      hasV1
                        ? "WTY no aplica (hay V1)"
                        : "Solicitar validación WTY"
                    }
                    variant="neutral"
                    disabled={hasV1}
                    onPress={() => void send(unit, "WTY_PENDING")}
                  />
                </View>

                {hasV1 ? (
                  <Text className="mt-2 text-xs leading-5 text-muted">
                    Una unidad con defecto V1 debe pasar por reparación física.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
      <ZonePicker
        visible={zonePickerOpen}
        unit={addUnit}
        onClose={() => {
          setZonePickerOpen(false);
          setAddUnit(null);
        }}
        onSelect={(zoneId) => {
          setAddZone(zoneId);
          setZonePickerOpen(false);
        }}
      />
      <DamageSheet
        zoneId={addZone}
        defects={[]}
        onAdd={saveAdditionalFinding}
        onRemove={() => {}}
        onClose={() => {
          setAddZone(null);
          setAddUnit(null);
        }}
      />
      <PhotoPreview
        photo={photoPreview}
        onClose={() => setPhotoPreview(null)}
      />
    </ScrollView>
  );
}

function evidenceUris(defect: Defect): string[] {
  return [
    ...new Set([...(defect.photoUrls ?? []), ...(defect.pendingPhotos ?? [])]),
  ];
}

function EvidenceSummary({
  defect,
  onOpen,
}: {
  defect: Defect;
  onOpen: (uri: string) => void;
}) {
  const photos = evidenceUris(defect);
  if (photos.length === 0) {
    return (
      <View className="items-center gap-0.5 rounded-xl bg-canvas px-2 py-1.5">
        <ImageIcon color={COLORS.muted} size={16} strokeWidth={2} />
        <Text className="text-[9px] font-semibold text-muted">Sin foto</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onOpen(photos[0])}
      accessibilityRole="button"
      accessibilityLabel={`Ver evidencia, ${photos.length} foto${photos.length === 1 ? "" : "s"}`}
      className="relative overflow-hidden rounded-xl border border-line bg-canvas active:opacity-75"
    >
      <Image
        source={{ uri: photos[0] }}
        style={{ height: 46, width: 46 }}
        resizeMode="cover"
      />
      {photos.length > 1 ? (
        <View className="absolute bottom-0 right-0 min-w-5 items-center rounded-tl-md bg-ink px-1 py-0.5">
          <Text className="text-[9px] font-bold text-white">
            {photos.length}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function DefectPhotos({
  defect,
  onOpen,
  unitLabel,
  onRetry,
  retrying = false,
}: {
  defect: Defect;
  onOpen: (uri: string) => void;
  unitLabel: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <DefectEvidence
      defect={defect}
      unitLabel={unitLabel}
      onRetry={onRetry}
      retrying={retrying}
    />
  );

  /* Legacy evidence renderer retained temporarily below for source history.

  const photos = evidenceUris(defect);
  if (photos.length === 0) {
    return (
      <View className="mt-3 flex-row items-center gap-2 rounded-xl bg-canvas/70 px-3 py-2">
        <ImageIcon color={COLORS.muted} size={15} strokeWidth={2} />
        <Text className="text-[11px] text-muted">
          No se adjuntó evidencia fotográfica.
        </Text>
      </View>
    );
  }

  return (
    <View className="mt-3 flex-row flex-wrap gap-2">
      {photos.map((uri, index) => (
        <Pressable
          key={`${uri}-${index}`}
          onPress={() => onOpen(uri)}
          accessibilityRole="button"
          accessibilityLabel={`Ver foto ${index + 1} del defecto`}
          className="overflow-hidden rounded-xl border border-line bg-canvas active:opacity-75"
        >
          <Image
            source={{ uri }}
            style={{ height: 88, width: 112 }}
            resizeMode="cover"
          />
        </Pressable>
      ))}
    </View>
  );
  */
}

function ZonePicker({
  visible,
  unit,
  onClose,
  onSelect,
}: {
  visible: boolean;
  unit: Unit | null;
  onClose: () => void;
  onSelect: (zoneId: string) => void;
}) {
  const zones = [...ZONES, ...OFF_DIAGRAM_ZONES];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/50">
        <View className="max-h-[82%] rounded-t-[32px] bg-surface">
          <View className="flex-row items-start gap-3 border-b border-line px-5 pb-4 pt-5">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
              <MapPin color={COLORS.primary} size={22} strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <Text className="text-label font-bold uppercase text-primary">
                Hallazgo adicional
              </Text>
              <Text className="mt-1 text-lg font-bold text-ink">
                ¿En qué zona está el fallo?
              </Text>
              <Text selectable className="mt-1 font-mono text-xs text-muted">
                {unit?.vin ?? ""}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              className="h-10 w-10 items-center justify-center rounded-xl bg-canvas"
            >
              <X color={COLORS.ink} size={19} strokeWidth={2.2} />
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="flex-row flex-wrap gap-2 px-5 py-5">
            {zones.map((zone) => (
              <Pressable
                key={zone.id}
                onPress={() => onSelect(zone.id)}
                className="min-h-[54px] min-w-[145px] flex-1 basis-[46%] justify-center rounded-2xl border border-line bg-canvas/60 px-3 active:border-primary active:bg-primary/5"
                accessibilityRole="button"
                accessibilityLabel={`Seleccionar ${zone.label}`}
              >
                <Text className="text-sm font-bold text-ink" numberOfLines={2}>
                  {zone.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PhotoPreview({
  photo,
  onClose,
}: {
  photo: { uri: string; label: string } | null;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={Boolean(photo)}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-ink px-5 pb-8 pt-12">
        <View className="mb-5 flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-label font-bold uppercase text-white/50">
              Evidencia fotográfica
            </Text>
            <Text
              className="mt-1 text-sm font-bold text-white"
              numberOfLines={1}
            >
              {photo?.label}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar foto"
            className="h-11 w-11 items-center justify-center rounded-2xl bg-white/10 active:bg-white/20"
          >
            <X color={COLORS.white} size={22} strokeWidth={2.3} />
          </Pressable>
        </View>
        {photo ? (
          <Image
            source={{ uri: photo.uri }}
            className="flex-1 rounded-3xl bg-slate"
            resizeMode="contain"
          />
        ) : null}
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Entregar: seleccionar unidades y enviarlas a Body.              */
/* ------------------------------------------------------------------ */

function Entregar({ userId, onDone }: { userId?: number; onDone: () => void }) {
  const { data: units, refetch } = useUnits("SENT");

  return (
    <BulkAction
      units={units}
      emptyMessage="No hay unidades niveladas por entregar."
      actionLabel="Entregar a Body"
      header={
        <StageIntro
          icon={Truck}
          step="Paso 2 de 3"
          title="Entregar a Body Shop"
          description="Selecciona una o varias unidades y confirma su entrega física a Body."
          count={units.length}
        />
      }
      onConfirm={async (selected) => {
        if (!userId) return;
        await changeStatusBulk(
          selected.map((unit) => ({
            localId: unit.localId!,
            from: unit.statusName,
          })),
          "DELIVERED",
          userId,
        );
        await refetch();
        onDone();
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* 3. Liberar: confirmar ubicación y devolver al carrier.             */
/* ------------------------------------------------------------------ */

function Liberar({ userId, onDone }: { userId?: number; onDone: () => void }) {
  const { data: units, refetch } = useUnits(["RELEASED", "WTY_RELEASED"]);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <BulkAction
      units={units}
      emptyMessage="No hay unidades liberadas por Body o WTY."
      actionLabel="Liberar a carrier"
      disabled={!confirmed}
      header={
        <>
          <StageIntro
            icon={CheckCircle2}
            step="Paso 3 de 3"
            title="Liberar hacia Carrier"
            description="Comprueba la ubicación física, selecciona las unidades y confirma la salida."
            count={units.length}
          />
          <Pressable
            onPress={() => setConfirmed((prev) => !prev)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmed }}
            className={`mb-4 flex-row items-center gap-3 rounded-2xl border p-4 active:opacity-80 ${
              confirmed
                ? "border-primary bg-primary/5"
                : "border-line bg-surface"
            }`}
          >
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
              <ShieldCheck color={COLORS.primary} size={23} strokeWidth={2} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-ink">
                Confirmación física
              </Text>
              <Text className="mt-0.5 text-xs leading-5 text-muted">
                Las unidades están en el carril correcto.
              </Text>
            </View>
            <View
              className={`h-8 w-8 items-center justify-center rounded-lg border-2 ${
                confirmed ? "border-primary bg-primary" : "border-line bg-white"
              }`}
            >
              {confirmed ? (
                <Check color={COLORS.white} size={19} strokeWidth={3} />
              ) : null}
            </View>
          </Pressable>
        </>
      }
      onConfirm={async (selected) => {
        if (!userId) return;
        await changeStatusBulk(
          selected.map((unit) => ({
            localId: unit.localId!,
            from: unit.statusName,
          })),
          "WWS_RELEASED",
          userId,
        );
        setConfirmed(false);
        await refetch();
        onDone();
      }}
    />
  );
}
