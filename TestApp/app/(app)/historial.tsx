import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  FileSearch,
  Image as ImageIcon,
  Search,
  Trash2,
  X,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { logs, units } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthProvider";
import { ROLE_IDS, type UnitStatus } from "@/domain/constants";
import type { HistoryRow, Unit } from "@/domain/types";
import { ActionButton } from "@/ui/ActionButton";
import { GradeDots } from "@/ui/GradeDot";
import { EmptyState, Screen } from "@/ui/Screen";
import { COLORS } from "@/ui/theme";
import {
  DefectEvidence,
  evidenceUris as defectEvidenceUris,
} from "@/ui/DefectEvidence";

const STATUS_LABEL: Partial<Record<UnitStatus, string>> = {
  REPORTED: "Reportada",
  SENT: "Nivelada",
  DELIVERED: "Entregada",
  RECEIVED: "Recibida",
  IN_REPAIR: "En reparación",
  RELEASED: "Liberada Body",
  WTY_PENDING: "Validación WTY",
  WTY_RELEASED: "Liberada WTY",
  WWS_RELEASED: "Liberada WWS",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  UNAVAILABLE: "No disponible",
  ARCHIVED: "Archivada",
};

export default function HistorialScreen() {
  const { token, user } = useAuth();
  const [vin, setVin] = useState("");
  const [market, setMarket] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [applied, setApplied] = useState({
    vin: "",
    market: "",
    startDate: "",
    endDate: "",
  });
  const [selected, setSelected] = useState<HistoryRow | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<HistoryRow[]>([]);
  const [downloading, setDownloading] = useState(false);
  const filters = useMemo(
    () => ({
      vin: applied.vin,
      market: applied.market,
      startDate: applied.startDate,
      endDate: applied.endDate,
    }),
    [applied],
  );
  const {
    data: rows = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["history", filters],
    queryFn: () => logs.list(token!, filters),
    enabled: Boolean(token),
  });

  const exportExcel = async () => {
    if (!token || Platform.OS !== "web") return;
    setDownloading(true);
    try {
      const blob = await logs.exportExcel(token, filters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `historial-unidades-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const grouped = useMemo(() => {
    const byVin = new Map<string, HistoryRow[]>();
    rows.forEach((row) =>
      byVin.set(row.vin, [...(byVin.get(row.vin) ?? []), row]),
    );
    return [...byVin.values()];
  }, [rows]);

  return (
    <Screen
      title="Historial"
      subtitle="Consulta, evidencia y exportación"
      centerLogo
      syncInHeader
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-4 pb-32 pt-3"
      >
        <View className="mx-auto w-full max-w-[1180px]">
          <View className="mb-4 overflow-hidden rounded-3xl border border-line bg-surface">
            <View className="flex-row items-start gap-3 p-4">
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <FileSearch
                  color={COLORS.primary}
                  size={24}
                  strokeWidth={2.1}
                />
              </View>
              <View className="flex-1">
                <Text className="text-label font-bold uppercase text-primary">
                  Trazabilidad
                </Text>
                <Text className="mt-1 text-lg font-bold text-ink">
                  Historial de unidades
                </Text>
                <Text className="mt-1 text-xs leading-5 text-muted">
                  Busca por VIN o mercado, revisa cada evento y exporta el
                  reporte completo a Excel.
                </Text>
              </View>
              {Platform.OS === "web" ? (
                <Pressable
                  onPress={() => void exportExcel()}
                  disabled={downloading}
                  className="min-h-[44px] flex-row items-center gap-2 rounded-xl bg-primary px-3 active:opacity-80"
                >
                  <Download color={COLORS.white} size={17} strokeWidth={2.2} />
                  <Text className="text-xs font-bold text-white">
                    {downloading ? "Exportando…" : "Excel"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <View className="flex-row flex-wrap gap-3 border-t border-line bg-canvas/50 p-4">
              <View className="min-w-[200px] flex-1">
                <FilterField
                  label="VIN"
                  value={vin}
                  onChangeText={setVin}
                  placeholder="Busca un VIN"
                />
              </View>
              <View className="min-w-[180px] flex-1">
                <FilterField
                  label="Mercado"
                  value={market}
                  onChangeText={setMarket}
                  placeholder="Ej. MX"
                />
              </View>
              <View className="min-w-[160px] flex-1">
                <FilterField
                  label="Desde"
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="AAAA-MM-DD"
                />
              </View>
              <View className="min-w-[160px] flex-1">
                <FilterField
                  label="Hasta"
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="AAAA-MM-DD"
                />
              </View>
              <View className="min-w-[180px] justify-end">
                <ActionButton
                  label="Aplicar filtros"
                  onPress={() =>
                    setApplied({
                      vin: vin.trim(),
                      market: market.trim(),
                      startDate: startDate.trim(),
                      endDate: endDate.trim(),
                    })
                  }
                  compact
                />
              </View>
            </View>
          </View>

          <View className="mb-3 flex-row items-center justify-between px-1">
            <View>
              <Text className="text-sm font-bold text-ink">
                Unidades encontradas
              </Text>
              <Text className="mt-0.5 text-xs text-muted">
                Selecciona una para revisar eventos y evidencias
              </Text>
            </View>
            <View className="rounded-full bg-ink px-3 py-1.5">
              <Text className="text-xs font-bold text-white">
                {grouped.length}
              </Text>
            </View>
          </View>
          {isLoading ? (
            <Text className="p-5 text-center text-sm text-muted">
              Cargando historial…
            </Text>
          ) : null}
          {error ? (
            <EmptyState message="No se pudo cargar el historial. Revisa la conexión e inténtalo de nuevo." />
          ) : null}
          <View className="flex-row flex-wrap gap-3">
            {grouped.map((events) => (
              <HistoryCard
                key={events[0].unitId}
                events={events}
                onOpen={() => {
                  setSelected(events[0]);
                  setSelectedEvents(events);
                }}
              />
            ))}
          </View>
          {!isLoading && !error && grouped.length === 0 ? (
            <EmptyState message="No hay registros con los filtros seleccionados." />
          ) : null}
          {selected ? (
            <HistoryDetail
              row={selected}
              token={token}
              roleId={user?.roleId}
              userId={user?.id}
              events={selectedEvents}
              onClose={() => {
                setSelected(null);
                setSelectedEvents([]);
              }}
            />
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function HistoryCard({
  events,
  onOpen,
}: {
  events: HistoryRow[];
  onOpen: () => void;
}) {
  const latest = events.find((event) => Boolean(event.newStatus)) ?? events[0];
  return (
    <Pressable
      onPress={onOpen}
      className="min-h-[146px] min-w-[260px] flex-1 basis-[31%] rounded-3xl border border-line bg-surface p-4 active:border-primary"
    >
      <View className="flex-row items-start justify-between gap-2">
        <View>
          <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
            {events.length} eventos
          </Text>
          <Text
            selectable
            className="mt-1 font-mono text-sm font-bold text-ink"
          >
            {latest.vin}
          </Text>
        </View>
        <Search color={COLORS.primary} size={19} strokeWidth={2.2} />
      </View>
      <View className="mt-4 rounded-xl bg-canvas px-3 py-2">
        <Text className="text-xs font-bold text-ink">{eventTitle(latest)}</Text>
        <Text className="mt-0.5 text-[11px] text-muted">
          {formatDate(latest.changedAt)}
        </Text>
      </View>
      <Text className="mt-3 text-xs text-muted">
        Carril {latest.lane ?? "—"} · {latest.market ?? "—"}
      </Text>
    </Pressable>
  );
}

function HistoryDetail({
  row,
  token,
  roleId,
  userId,
  events,
  onClose,
}: {
  row: HistoryRow;
  token: string | null;
  roleId?: number;
  userId?: number;
  events: HistoryRow[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: unit, isLoading } = useQuery({
    queryKey: ["history-unit", row.unitId],
    queryFn: () => units.byId(row.unitId, token!),
    enabled: Boolean(token),
  });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{
    uri: string;
    label: string;
  } | null>(null);
  const canRequestDeletion =
    roleId === ROLE_IDS.CARRIER || roleId === ROLE_IDS.WWS;
  const canDeletePhoto = roleId === ROLE_IDS.SCM || roleId === ROLE_IDS.ADMIN;
  const canArchive =
    canDeletePhoto &&
    unit?.statusName === "UNAVAILABLE" &&
    Boolean(unit.scmDecision);
  const requestDeletion = async () => {
    if (!token || reason.trim().length < 15) return;
    Keyboard.dismiss();
    setBusy(true);
    try {
      await units.requestDeletion(row.unitId, reason.trim(), token);
      setMessage("Solicitud enviada a SCM para decisión.");
      setReason("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo enviar la solicitud.",
      );
    } finally {
      setBusy(false);
    }
  };
  const deletePhoto = async (defectId: number) => {
    if (!token) return;
    setBusy(true);
    try {
      await units.deleteDefectPhoto(row.unitId, defectId, token);
      await queryClient.invalidateQueries({
        queryKey: ["history-unit", row.unitId],
      });
    } finally {
      setBusy(false);
    }
  };
  const archiveUnit = async () => {
    if (!token || !userId) return;
    setBusy(true);
    try {
      await units.archive(row.unitId, userId, token);
      setMessage("Unidad archivada y retirada de la operación activa.");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["history-unit", row.unitId],
        }),
        queryClient.invalidateQueries({ queryKey: ["history"] }),
      ]);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo archivar la unidad.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="mt-5 overflow-hidden rounded-3xl border border-primary bg-surface">
      <View className="flex-row items-start justify-between p-4">
        <View>
          <Text className="text-label font-bold uppercase text-primary">
            Detalle de unidad
          </Text>
          <Text
            selectable
            className="mt-1 font-mono text-lg font-bold text-ink"
          >
            {row.vin}
          </Text>
          <Text className="mt-1 text-xs text-muted">
            {row.market} · Carril {row.lane}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          className="h-10 w-10 items-center justify-center rounded-xl bg-canvas"
        >
          <Text className="text-xl text-ink">×</Text>
        </Pressable>
      </View>
      {isLoading ? (
        <Text className="p-4 text-sm text-muted">Cargando evidencias…</Text>
      ) : (
        <DetailUnit
          unit={unit}
          canDeletePhoto={canDeletePhoto}
          busy={busy}
          onDeletePhoto={deletePhoto}
          onPreviewPhoto={setPhotoPreview}
        />
      )}
      <View className="border-t border-line p-4">
        <Text className="text-sm font-bold text-ink">Eventos y notas</Text>
        <Text className="mt-1 text-xs text-muted">
          Cada cambio conserva fecha, responsable y observación.
        </Text>
        <View className="mt-3">
          {events.map((event) => (
            <View
              key={`${event.changedAt}-${event.newStatus}`}
              className="border-b border-line py-3 last:border-b-0"
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-xs font-bold text-ink">
                    {event.previousStatus
                      ? `${STATUS_LABEL[event.previousStatus] ?? event.previousStatus} → `
                      : ""}
                    {eventTitle(event)}
                  </Text>
                  <Text className="mt-0.5 text-[11px] text-muted">
                    {event.changedByName ?? event.registeredByName ?? "Sistema"}{" "}
                    · {formatDate(event.changedAt)}
                  </Text>
                </View>
              </View>
              {event.note ? (
                <View className="mt-2 rounded-xl bg-canvas px-3 py-2">
                  <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">
                    Enviada a {eventDestination(event)}
                  </Text>
                  <Text selectable className="mt-1 text-xs leading-5 text-ink">
                    {event.note}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
          {events.length === 0 ? (
            <Text className="py-2 text-xs text-muted">
              Sin eventos disponibles.
            </Text>
          ) : null}
        </View>
      </View>
      {canArchive ? (
        <View className="border-t border-line bg-v2/5 p-4">
          <Text className="text-sm font-bold text-ink">
            Archivar desde historial
          </Text>
          <Text className="mt-1 text-xs text-muted">
            Esta unidad ya cuenta con una decisión SCM y puede retirarse de la
            operación activa.
          </Text>
          <View className="mt-3 max-w-[300px]">
            <ActionButton
              label="Archivar unidad"
              variant="neutral"
              onPress={() => void archiveUnit()}
              busy={busy}
              compact
            />
          </View>
        </View>
      ) : null}
      {canRequestDeletion ? (
        <View className="border-t border-line bg-canvas/50 p-4">
          <Text className="text-sm font-bold text-ink">
            Solicitar eliminación
          </Text>
          <Text className="mt-1 text-xs text-muted">
            Solo para registros duplicados o capturados por error. SCM debe
            aprobarla.
          </Text>
          <View className="mt-3">
            <TextInput
              value={reason}
              onChangeText={setReason}
              multiline
              placeholder="Motivo (15 a 500 caracteres)"
              placeholderTextColor={COLORS.muted}
              className="min-h-[84px] rounded-xl border border-line bg-white px-3 py-3 text-sm text-ink"
              textAlignVertical="top"
            />
          </View>
          <View className="mt-3 max-w-[320px]">
            <ActionButton
              label="Enviar solicitud a SCM"
              onPress={() => void requestDeletion()}
              busy={busy}
              disabled={reason.trim().length < 15}
              compact
            />
          </View>
        </View>
      ) : null}
      {message ? (
        <Text className="border-t border-line p-4 text-xs font-medium text-primary">
          {message}
        </Text>
      ) : null}
      <PhotoPreview
        preview={photoPreview}
        onClose={() => setPhotoPreview(null)}
      />
    </View>
  );
}

function DetailUnit({
  unit,
  canDeletePhoto,
  busy,
  onDeletePhoto,
  onPreviewPhoto,
}: {
  unit?: Unit;
  canDeletePhoto: boolean;
  busy: boolean;
  onDeletePhoto: (id: number) => void;
  onPreviewPhoto: (preview: { uri: string; label: string }) => void;
}) {
  const displayUnit = unit;
  if (displayUnit) {
    return (
      <View className="border-t border-line p-4">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-sm font-bold text-ink">Daños y evidencias</Text>
          <GradeDots defects={displayUnit.defects} />
        </View>
        {displayUnit.defects.map((defect) => (
          <View
            key={defect.localId ?? defect.id}
            className="mb-3 rounded-2xl border border-line bg-canvas/50 p-3"
          >
            <Text className="text-xs font-bold text-ink">
              {defect.type} · {defect.zone} · {defect.grade}
            </Text>
            <DefectEvidence defect={defect} unitLabel={displayUnit.vin} />
            {canDeletePhoto && defectEvidenceUris(defect).length > 0 ? (
              <Pressable
                disabled={busy}
                onPress={() => onDeletePhoto(defect.id)}
                className="mt-2 min-h-[38px] flex-row items-center justify-center gap-2 self-start rounded-xl bg-v1/10 px-3 active:opacity-75"
              >
                <Trash2 color={COLORS.v1} size={14} />
                <Text className="text-xs font-bold text-v1">
                  Eliminar evidencia
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
    );
  }

  const legacyUnit = unit as unknown as Unit;
  if (!unit)
    return <EmptyState message="No se encontró el detalle de la unidad." />;
  return (
    <View className="border-t border-line p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-sm font-bold text-ink">Daños y evidencias</Text>
        <GradeDots defects={legacyUnit.defects} />
      </View>
      {legacyUnit.defects.map((defect) => (
        <View
          key={defect.id}
          className="mb-3 rounded-2xl border border-line bg-canvas/50 p-3"
        >
          <Text className="text-xs font-bold text-ink">
            {defect.type} · {defect.zone} · {defect.grade}
          </Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {evidenceUris(defect).length > 0 ? (
              evidenceUris(defect).map((url, index) => (
                <View
                  key={url}
                  className="overflow-hidden rounded-xl border border-line bg-white"
                >
                  <Pressable
                    onPress={() =>
                      onPreviewPhoto({
                        uri: url,
                        label: `${defect.type} · evidencia ${index + 1}`,
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Ver foto ${index + 1} de ${defect.type}`}
                  >
                    <Image
                      source={{ uri: url }}
                      style={{ height: 88, width: 116 }}
                      resizeMode="cover"
                    />
                  </Pressable>
                  <View className="flex-row items-center justify-between p-1.5">
                    <ImageIcon color={COLORS.muted} size={14} />
                    {canDeletePhoto ? (
                      <Pressable
                        disabled={busy}
                        onPress={() => onDeletePhoto(defect.id)}
                        className="h-7 w-7 items-center justify-center rounded-lg bg-v1/10"
                      >
                        <Trash2 color={COLORS.v1} size={14} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))
            ) : (
              <Text className="text-xs text-muted">Sin fotos registradas.</Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

function evidenceUris(defect: Unit["defects"][number]) {
  return [
    ...new Set([...(defect.photoUrls ?? []), ...(defect.pendingPhotos ?? [])]),
  ];
}

function eventTitle(event: HistoryRow) {
  if (event.newStatus) {
    return STATUS_LABEL[event.newStatus] ?? event.newStatus;
  }
  if (event.eventType === "PRIORITY_UPDATED") return "Nota de prioridad";
  if (event.eventType === "SCM_DECISION") return "Decisión SCM";
  return "Actualización operativa";
}

function eventDestination(event: HistoryRow) {
  if (event.noteDestination === "BODY_SHOP") return "Body Shop / Reparar";
  if (event.noteDestination === "SCM") return "SCM";

  const destinations: Partial<Record<UnitStatus, string>> = {
    SENT: "Nivelación WWS",
    DELIVERED: "Body Shop",
    RECEIVED: "Body Shop / Reparar",
    IN_REPAIR: "Body Shop / Reparar",
    WTY_PENDING: "Garantía / SCM Quality",
    WTY_RELEASED: "WWS",
    WWS_RELEASED: "Carrier",
    REJECTED: "Carrier y Nivelación WWS",
  };

  return event.newStatus
    ? (destinations[event.newStatus] ?? "Historial de la unidad")
    : "Historial de la unidad";
}

function PhotoPreview({
  preview,
  onClose,
}: {
  preview: { uri: string; label: string } | null;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={Boolean(preview)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center bg-black/85 px-4 py-10">
        <View className="overflow-hidden rounded-3xl bg-surface">
          <View className="flex-row items-center justify-between border-b border-line px-4 py-3">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-bold text-ink">
                Evidencia fotográfica
              </Text>
              <Text numberOfLines={1} className="mt-0.5 text-xs text-muted">
                {preview?.label}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cerrar foto"
              className="h-10 w-10 items-center justify-center rounded-xl bg-canvas"
            >
              <X color={COLORS.ink} size={20} strokeWidth={2.2} />
            </Pressable>
          </View>
          {preview ? (
            <Image
              source={{ uri: preview.uri }}
              style={{ height: 460, maxHeight: "70%", width: "100%" }}
              resizeMode="contain"
              accessibilityLabel={preview.label}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function FilterField({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <>
      <Text className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.muted}
        className="min-h-[48px] rounded-xl border border-line bg-white px-3 text-sm text-ink"
      />
    </>
  );
}
function formatDate(raw: string) {
  const date = new Date(raw);
  return Number.isNaN(date.getTime())
    ? raw
    : date.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}
