import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CheckCircle2,
  ClipboardCheck,
  ShieldAlert,
  XCircle,
} from "lucide-react-native";
import { useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { units } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthProvider";
import { SCM_DECISIONS, type ScmDecision } from "@/domain/constants";
import type { DeletionRequest, Unit } from "@/domain/types";
import { useRefreshUnits, useUnits } from "@/hooks/useUnits";
import { ActionButton } from "@/ui/ActionButton";
import { GradeDots } from "@/ui/GradeDot";
import { EmptyState, Screen } from "@/ui/Screen";
import { COLORS } from "@/ui/theme";

const DECISION_LABEL: Record<ScmDecision, string> = {
  LOAD_WITHOUT: "Cargar sin unidad",
  WAIT: "Esperar disponibilidad",
  REORGANIZE: "Reorganizar viaje",
  NEW_TRIP: "Programar nuevo viaje",
};

export default function ControlScreen() {
  const { user, token } = useAuth();
  const refresh = useRefreshUnits();
  const queryClient = useQueryClient();
  const { data: unavailable = [], refetch } = useUnits("UNAVAILABLE");
  const { data: requests = [] } = useQuery({
    queryKey: ["deletion-requests"],
    queryFn: () => units.listDeletionRequests(token!),
    enabled: Boolean(token),
  });
  const { data: archivable = [] } = useQuery({
    queryKey: ["archivable"],
    queryFn: () => units.listArchivable(token!),
    enabled: Boolean(token),
  });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const decide = async (unit: Unit, decision: ScmDecision, note?: string) => {
    if (!token || !user || !unit.id) return;
    Keyboard.dismiss();
    setBusyId(unit.id);
    try {
      await units.setScmDecision(
        unit.id,
        { decision, note: note?.trim() || undefined, decidedById: user.id },
        token,
      );
      setMessage(`Decisión registrada para ${unit.vin}.`);
      await refetch();
      refresh();
    } finally {
      setBusyId(null);
    }
  };
  const archive = async (unit: Unit) => {
    if (!token || !user || !unit.id) return;
    setBusyId(unit.id);
    try {
      await units.archive(unit.id, user.id, token);
      setMessage(`${unit.vin} fue archivada.`);
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ["archivable"] }),
      ]);
      refresh();
    } finally {
      setBusyId(null);
    }
  };
  const resolveRequest = async (
    request: DeletionRequest,
    decision: "APPROVE" | "REJECT",
  ) => {
    if (!token) return;
    setBusyId(request.id);
    try {
      await units.decideDeletionRequest(request.id, { decision }, token);
      setMessage(
        decision === "APPROVE"
          ? `Solicitud aprobada: ${request.vin} se eliminó.`
          : `Solicitud rechazada para ${request.vin}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["deletion-requests"] });
      refresh();
    } finally {
      setBusyId(null);
    }
  };
  return (
    <Screen
      title="Control SCM"
      subtitle="Excepciones, archivo y solicitudes"
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
                <ShieldAlert
                  color={COLORS.primary}
                  size={24}
                  strokeWidth={2.1}
                />
              </View>
              <View className="flex-1">
                <Text className="text-label font-bold uppercase text-primary">
                  Mesa de excepciones
                </Text>
                <Text className="mt-1 text-lg font-bold text-ink">
                  Resuelve lo que bloquea el flujo
                </Text>
                <Text className="mt-1 text-xs leading-5 text-muted">
                  Define la decisión SCM sobre unidades no disponibles, archiva
                  cierres y revisa solicitudes de eliminación.
                </Text>
              </View>
            </View>
            <View className="flex-row border-t border-line bg-canvas/50">
              <Counter label="No disponibles" value={unavailable.length} />
              <Counter label="Solicitudes" value={requests.length} />
              <Counter label="Archivables" value={archivable.length} />
            </View>
          </View>
          {message ? (
            <View className="mb-4 rounded-2xl bg-synced/10 p-3">
              <Text className="text-xs font-semibold text-synced">
                {message}
              </Text>
            </View>
          ) : null}
          <Section
            title="Unidades no disponibles"
            description="Registra la decisión para que el flujo pueda continuar."
            count={unavailable.length}
          />
          <View className="flex-row flex-wrap gap-3">
            {unavailable.map((unit) => (
              <UnavailableCard
                key={unit.localId}
                unit={unit}
                busy={busyId === unit.id}
                onDecide={(value, note) => void decide(unit, value, note)}
              />
            ))}
          </View>
          {unavailable.length === 0 ? (
            <EmptyState message="No hay unidades no disponibles pendientes de decisión." />
          ) : null}
          <Section
            title="Solicitudes de eliminación"
            description="Carrier y WWS pueden solicitar; SCM aprueba o rechaza."
            count={requests.length}
          />
          <View className="flex-row flex-wrap gap-3">
            {requests.map((request) => (
              <DeletionCard
                key={request.id}
                request={request}
                busy={busyId === request.id}
                onResolve={(decision) => void resolveRequest(request, decision)}
              />
            ))}
          </View>
          {requests.length === 0 ? (
            <EmptyState message="No hay solicitudes de eliminación pendientes." />
          ) : null}
          <Section
            title="Unidades archivables"
            description="Cierres de flujo que pueden salir de la operación activa."
            count={archivable.length}
          />
          <View className="flex-row flex-wrap gap-3">
            {archivable.map((unit) => (
              <ArchiveCard
                key={unit.id}
                unit={unit}
                busy={busyId === unit.id}
                onArchive={() => void archive(unit)}
              />
            ))}
          </View>
          {archivable.length === 0 ? (
            <EmptyState message="No hay unidades listas para archivar." />
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
function Counter({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-1 px-4 py-3">
      <Text className="text-[10px] font-bold uppercase text-muted">
        {label}
      </Text>
      <Text selectable className="mt-0.5 text-xl font-bold text-ink">
        {value}
      </Text>
    </View>
  );
}
function Section({
  title,
  description,
  count,
}: {
  title: string;
  description: string;
  count: number;
}) {
  return (
    <View className="mb-3 mt-6 flex-row items-center gap-3 px-1">
      <View className="flex-1">
        <Text className="text-sm font-bold text-ink">{title}</Text>
        <Text className="mt-0.5 text-xs text-muted">{description}</Text>
      </View>
      <View className="rounded-full bg-ink px-3 py-1">
        <Text className="text-xs font-bold text-white">{count}</Text>
      </View>
    </View>
  );
}
function UnavailableCard({
  unit,
  busy,
  onDecide,
}: {
  unit: Unit;
  busy: boolean;
  onDecide: (decision: ScmDecision, note?: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <View className="min-w-[290px] flex-1 basis-[31%] rounded-3xl border border-line bg-surface p-4">
      <Text className="text-[10px] font-bold uppercase tracking-wide text-v1">
        No disponible
      </Text>
      <Text selectable className="mt-1 font-mono text-sm font-bold text-ink">
        {unit.vin}
      </Text>
      <Text className="mt-1 text-xs text-muted">
        Carril {unit.lane} · {unit.market}
      </Text>
      <View className="mt-3">
        <GradeDots defects={unit.defects} />
      </View>
      <View className="mt-4 rounded-xl border border-line bg-canvas/50 p-3">
        <Text className="text-[10px] font-bold uppercase text-muted">
          Comentario para SCM (opcional)
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Contexto del bloqueo o del viaje"
          placeholderTextColor={COLORS.muted}
          multiline
          className="mt-1 min-h-[38px] text-xs text-ink"
        />
        <Text className="mt-1 text-[10px] leading-4 text-muted">
          Se registra para SCM y se puede consultar después en el historial de
          la unidad.
        </Text>
      </View>
      <Text className="mb-2 mt-4 text-[10px] font-bold uppercase text-muted">
        Decisión SCM
      </Text>
      <View className="gap-2">
        {SCM_DECISIONS.map((decision) => (
          <Pressable
            key={decision}
            disabled={busy}
            onPress={() => onDecide(decision, note)}
            className="min-h-[42px] justify-center rounded-xl bg-canvas px-3 active:bg-primary/10"
          >
            <Text className="text-xs font-bold text-ink">
              {DECISION_LABEL[decision]}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
function DeletionCard({
  request,
  busy,
  onResolve,
}: {
  request: DeletionRequest;
  busy: boolean;
  onResolve: (decision: "APPROVE" | "REJECT") => void;
}) {
  return (
    <View className="min-w-[290px] flex-1 basis-[47%] rounded-3xl border border-line bg-surface p-4">
      <View className="flex-row items-start justify-between">
        <View>
          <Text className="text-[10px] font-bold uppercase text-v1">
            Solicitud pendiente
          </Text>
          <Text
            selectable
            className="mt-1 font-mono text-sm font-bold text-ink"
          >
            {request.vin}
          </Text>
        </View>
        <ClipboardCheck color={COLORS.primary} size={21} strokeWidth={2.1} />
      </View>
      <Text className="mt-2 text-xs text-muted">
        Solicitada por {request.requestedByName ?? "Usuario"} · Carril{" "}
        {request.lane ?? "—"}
      </Text>
      <View className="mt-3 rounded-xl bg-canvas p-3">
        <Text className="text-xs leading-5 text-ink">{request.reason}</Text>
      </View>
      <View className="mt-3 flex-row gap-2">
        <View className="flex-1">
          <ActionButton
            label="Aprobar"
            variant="danger"
            busy={busy}
            onPress={() => onResolve("APPROVE")}
            compact
          />
        </View>
        <View className="flex-1">
          <ActionButton
            label="Rechazar"
            variant="neutral"
            busy={busy}
            onPress={() => onResolve("REJECT")}
            compact
          />
        </View>
      </View>
    </View>
  );
}
function ArchiveCard({
  unit,
  busy,
  onArchive,
}: {
  unit: Unit;
  busy: boolean;
  onArchive: () => void;
}) {
  return (
    <View className="min-w-[290px] flex-1 basis-[31%] rounded-3xl border border-line bg-surface p-4">
      <View className="flex-row items-start justify-between">
        <View>
          <Text className="text-[10px] font-bold uppercase text-muted">
            Cierre completado
          </Text>
          <Text
            selectable
            className="mt-1 font-mono text-sm font-bold text-ink"
          >
            {unit.vin}
          </Text>
        </View>
        <Archive color={COLORS.primary} size={22} strokeWidth={2.1} />
      </View>
      <Text className="mt-2 text-xs text-muted">
        Carril {unit.lane} · {unit.market}
      </Text>
      <View className="mt-4">
        <ActionButton
          label="Archivar unidad"
          variant="neutral"
          busy={busy}
          onPress={onArchive}
          compact
        />
      </View>
    </View>
  );
}
