import { useQuery } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { Activity, ArrowRight, Download, RefreshCw } from 'lucide-react-native';
import { Image, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dashboard as dashboardApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { buildUnitsCsv, downloadCsv } from '@/data/csvExport';
import { loadDashboard } from '@/data/stats';
import { ROLE_IDS, ROLE_NAME_BY_ID, type UnitStatus } from '@/domain/constants';
import { displayLabel } from '@/domain/zones';
import { notificationLabel } from '@/domain/notifications';
import { useSync } from '@/sync/SyncProvider';
import { useNotificationStore } from '@/store/notificationStore';
import { BarRow, DonutChart, KpiCard, Panel } from '@/ui/Charts';
import { NotificationBell } from '@/ui/NotificationBell';
import { COLORS, GRADE_COLOR as DONUT_GRADE_COLOR } from '@/ui/theme';
import { TruckLoader } from '@/ui/TruckLoader';

/**
 * Dashboard analitico del ADMIN. Solo web y solo rol ADMIN.
 *
 * Vive fuera del grupo `(app)` a proposito: no lleva barra de pestanas porque
 * no es una pantalla operativa de piso, es un tablero de escritorio.
 */

const PIPELINE: UnitStatus[] = [
  'REPORTED',
  'SENT',
  'DELIVERED',
  'RECEIVED',
  'IN_REPAIR',
  'RELEASED',
  'WTY_PENDING',
  'WTY_RELEASED',
  'WWS_RELEASED',
];

const STAGE_LABELS: Record<string, string> = {
  REPORTED: 'Reportada',
  SENT: 'Nivelada',
  DELIVERED: 'Entregada',
  RECEIVED: 'Recibida',
  IN_REPAIR: 'En reparacion',
  RELEASED: 'Liberada Body',
  WTY_PENDING: 'Pendiente WTY',
  WTY_RELEASED: 'Liberada WTY',
  WWS_RELEASED: 'Liberada WWS',
  UNAVAILABLE: 'No disponible',
};

export default function DashboardScreen() {
  const { user, token, isLoading, signOut } = useAuth();
  const { online, pending, lastPullAt, syncNow, syncing } = useSync();
  const { width } = useWindowDimensions();
  const liveConnected = useNotificationStore((state) => state.connected);
  const recentActivity = useNotificationStore((state) => state.items).slice(0, 10);

  const { data } = useQuery({
    queryKey: ['stats', 'dashboard'],
    queryFn: loadDashboard,
  });
  const { data: monthlyTimeline = [] } = useQuery({
    queryKey: ['dashboard', 'monthly-timeline', user?.plant],
    queryFn: () => dashboardApi.monthlyTimeline(token!),
    enabled: Boolean(token),
  });
  const { data: weeklyByProvider = [] } = useQuery({
    queryKey: ['dashboard', 'weekly-by-provider', user?.plant],
    queryFn: () => dashboardApi.weeklyByProvider(token!),
    enabled: Boolean(token),
  });
  const { data: repairTimeByProvider = [] } = useQuery({
    queryKey: ['dashboard', 'repair-time-by-provider', user?.plant],
    queryFn: () => dashboardApi.repairTimeByProvider(token!),
    enabled: Boolean(token),
  });
  const { data: repairTimeByModel = [] } = useQuery({
    queryKey: ['dashboard', 'repair-time-by-model', user?.plant],
    queryFn: () => dashboardApi.repairTimeByModel(token!),
    enabled: Boolean(token),
  });

  // La sesion se restaura de forma asincrona (SecureStore/sessionStorage):
  // al recargar la pagina en /dashboard, este componente monta ANTES de que
  // esa lectura termine, con `token` todavia en null por el estado inicial.
  // Sin este freno, ese instante se leia como "no hay sesion" y mandaba a
  // /login aunque el token si estuviera guardado — el sintoma exacto de
  // "cada F5 me saca". El mismo freno ya existe en app/index.tsx.
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <TruckLoader size={132} accessibilityLabel="Cargando sesión" />
      </View>
    );
  }

  if (!token) return <Redirect href="/login" />;

  // Doble candado: solo ADMIN y solo web.
  if (user && user.roleId !== ROLE_IDS.ADMIN) return <Redirect href="/(app)" />;
  if (Platform.OS !== 'web') return <Redirect href="/(app)" />;

  const wide = width >= 1000;
  const maxStage = Math.max(1, ...(data?.byStatus.map((row) => row.count) ?? [1]));
  const maxPareto = Math.max(1, ...(data?.pareto.map((row) => row.count) ?? [1]));
  const totalGrades = data?.byGrade.reduce((sum, row) => sum + row.count, 0) ?? 0;
  const topProviders = Object.entries(
    weeklyByProvider.reduce<Record<string, number>>((totals, row) => {
      totals[row.provider] = (totals[row.provider] ?? 0) + row.count;
      return totals;
    }, {})
  )
    .map(([provider, count]) => ({ provider, count }))
    .sort((a, b) => b.count - a.count || a.provider.localeCompare(b.provider))
    .slice(0, 5);
  const maxTopProviders = Math.max(1, ...topProviders.map((row) => row.count));
  const maxProviderHours = Math.max(1, ...repairTimeByProvider.map((row) => row.hours));
  const maxModelHours = Math.max(1, ...repairTimeByModel.map((row) => row.hours));

  const stageCount = (status: UnitStatus) =>
    data?.byStatus.find((row) => row.status === status)?.count ?? 0;

  const bottleneck = [...(data?.byStatus ?? [])]
    .filter((row) => PIPELINE.includes(row.status))
    .sort((a, b) => b.count - a.count)[0];

  const onExportCsv = async () => {
    const csv = await buildUnitsCsv();
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    downloadCsv(csv, `unidades-${stamp}.csv`);
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView contentContainerClassName="p-6 max-w-[1400px] w-full mx-auto">
        <View
          className="mb-5 flex-row flex-wrap items-start justify-between gap-5 overflow-hidden rounded-[28px] bg-ink p-5"
          style={{ boxShadow: '0 8px 24px rgba(15, 22, 32, 0.16)' }}
        >
          <View className="max-w-[620px]">
            <Text className="text-label font-bold uppercase text-white/45">Centro de control</Text>
            <Image
              source={require('../assets/nissan-logo.png')}
              style={{ height: 18, width: 122, marginTop: 12 }}
              resizeMode="contain"
              accessibilityLabel="Nissan"
            />
            <Text className="mt-3 text-3xl font-bold text-white">Body App · Dashboard</Text>
            <Text style={{ display: 'none' }}>
              Visualiza el flujo de unidades, identifica bloqueos y toma decisiones de
              operación desde un solo lugar.
            </Text>
            <Text selectable className="mt-3 text-xs font-semibold text-white/55">
              {user?.name} · {user ? ROLE_NAME_BY_ID[user.roleId] : ''}
              {user?.plant ? ` · Planta ${user.plant}` : ' · Todas las plantas'}
            </Text>
          </View>

          <View className="min-w-[300px] gap-3">
            <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <View className="flex-row items-center gap-2">
                <View
                  className={`h-2.5 w-2.5 rounded-full ${
                    !online ? 'bg-pending' : pending > 0 ? 'bg-v3' : 'bg-synced'
                  }`}
                />
                <Text className="text-xs font-bold text-white">Estado de sincronización</Text>
              </View>
              <Text className="text-xs font-medium text-white/65">
                {!online
                  ? 'Sin conexión'
                  : syncing
                    ? 'Actualizando'
                    : lastPullAt
                      ? lastPullAt.toLocaleTimeString('es-MX', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Pendiente'}
              </Text>
            </View>

            <View className="flex-row flex-wrap items-center gap-2">
              <Pressable
                onPress={() => void syncNow()}
                className="min-h-[44px] flex-row items-center gap-2 rounded-xl bg-primary px-4 active:opacity-80"
              >
                <RefreshCw color={COLORS.white} size={17} strokeWidth={2.3} />
                <Text className="text-sm font-bold text-white">Actualizar</Text>
              </Pressable>
              <Pressable
                onPress={() => void onExportCsv()}
                className="min-h-[44px] flex-row items-center gap-2 rounded-xl bg-white px-4 active:opacity-80"
              >
                <Download color={COLORS.ink} size={16} strokeWidth={2.2} />
                <Text className="text-sm font-bold text-ink">Exportar CSV</Text>
              </Pressable>
              <NotificationBell onDark />
            </View>

            <View className="flex-row items-center justify-between px-1">
              <Pressable
                onPress={() => router.push('/(app)')}
                className="flex-row items-center gap-1.5 py-1 active:opacity-75"
              >
                <Text className="text-xs font-bold text-white">Ir a operaciones</Text>
                <ArrowRight color={COLORS.white} size={15} strokeWidth={2.4} />
              </Pressable>
              <Pressable onPress={() => void signOut()} className="py-1 active:opacity-75">
                <Text className="text-xs font-bold text-white/60">Cerrar sesión</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Encabezado tipo navbar: marca + identidad del usuario */}
        <View style={{ display: 'none' }}>
          <View>
            <Image
              source={require('../assets/nissan-logo.png')}
              style={{ height: 18, width: 122 }}
              resizeMode="contain"
              accessibilityLabel="Nissan"
            />
            <Text className="mt-2 text-3xl font-bold text-ink">Body App · Dashboard</Text>
            <Text className="mt-1 text-sm text-muted">
              {user?.name} · {user ? ROLE_NAME_BY_ID[user.roleId] : ''}
              {user?.plant ? ` · Planta ${user.plant}` : ' · todas las plantas'}
            </Text>
          </View>

          <View className="flex-row items-center gap-3">
            <View className="flex-row items-center gap-2 rounded-full bg-surface px-4 py-2">
              <View
                className={`h-2 w-2 rounded-full ${
                  !online ? 'bg-pending' : pending > 0 ? 'bg-v3' : 'bg-synced'
                }`}
              />
              <Text className="text-xs font-semibold text-ink">
                {!online
                  ? 'Sin conexion'
                  : syncing
                    ? 'Sincronizando'
                    : lastPullAt
                      ? `Actualizado ${lastPullAt.toLocaleTimeString('es-MX', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : 'Sin sincronizar'}
              </Text>
            </View>

            <Pressable
              onPress={() => void syncNow()}
              className="rounded-xl bg-primary px-4 py-2.5 active:opacity-80"
            >
              <Text className="text-sm font-bold text-white">Actualizar</Text>
            </Pressable>

            <Pressable
              onPress={() => void onExportCsv()}
              className="flex-row items-center gap-2 rounded-xl bg-gray-200 px-4 py-2.5 active:opacity-80"
            >
              <Download color={COLORS.ink} size={16} strokeWidth={2} />
              <Text className="text-sm font-bold text-ink">Exportar CSV</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push('/(app)')}
              className="rounded-xl bg-gray-200 px-4 py-2.5 active:opacity-80"
            >
              <Text className="text-sm font-bold text-ink">Operaciones</Text>
            </Pressable>

            <NotificationBell />

            <Pressable onPress={() => void signOut()} className="px-2 py-2.5">
              <Text className="text-sm font-semibold text-primary">Salir</Text>
            </Pressable>
          </View>
        </View>

        <View className="mb-3 flex-row items-center gap-3 px-1">
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
            <Activity color={COLORS.primary} size={20} strokeWidth={2.2} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-ink">Resumen operativo</Text>
            <Text className="mt-0.5 text-xs text-muted">
              Indicadores actualizados desde el flujo de operación.
            </Text>
          </View>
          <View className="rounded-full bg-surface px-3 py-1.5">
            <Text selectable className="text-xs font-bold text-ink">
              {data?.totalUnits ?? 0} activas
            </Text>
          </View>
        </View>

        {/* KPIs */}
        <View className="mb-4 gap-4">
          <View className={wide ? 'flex-row gap-4' : 'gap-4'}>
          <KpiCard
            label="Unidades activas"
            value={data?.totalUnits ?? 0}
            hint="excluye aceptadas y archivadas"
          />
          <KpiCard
            label="Defectos abiertos"
            value={data?.totalDefects ?? 0}
            hint="sin resolver"
          />
          <KpiCard
            label="Carga de trabajo"
            value={`${data?.estimatedBacklogHours ?? 0} h`}
            hint="estimada en cola + reparacion"
            tone={(data?.estimatedBacklogHours ?? 0) > 40 ? 'warn' : 'neutral'}
          />
          </View>
          <View className={wide ? 'flex-row gap-4' : 'gap-4'}>
          <KpiCard
            label="Cuello de botella"
            value={bottleneck ? STAGE_LABELS[bottleneck.status] ?? bottleneck.status : '—'}
            hint={bottleneck ? `${bottleneck.count} unidades detenidas` : 'sin datos'}
            tone={(bottleneck?.count ?? 0) >= 5 ? 'bad' : 'neutral'}
          />
          <KpiCard
            label="Por sincronizar"
            value={data?.pendingSync ?? 0}
            hint="mutaciones en cola"
            tone={(data?.pendingSync ?? 0) > 0 ? 'warn' : 'good'}
          />
          <KpiCard
            label="Defectos por unidad"
            value={data?.defectsPerVehicle ?? 0}
            hint="promedio, unidades activas"
            tone={(data?.defectsPerVehicle ?? 0) > 1.5 ? 'warn' : 'neutral'}
          />
          </View>
        </View>

        {/* Fila principal */}
        <View className={`mb-4 gap-4 ${wide ? 'flex-row' : ''}`}>
          <Panel
            title="Flujo por etapa"
            subtitle="Unidades detenidas en cada paso del proceso"
            className={wide ? 'flex-[2]' : 'mb-4'}
          >
            {PIPELINE.map((status) => {
              const count = stageCount(status);
              return (
                <BarRow
                  key={status}
                  label={STAGE_LABELS[status] ?? status}
                  value={count}
                  max={maxStage}
                  color={count >= 5 ? 'bg-v2' : 'bg-primary'}
                  highlight={count >= 5}
                />
              );
            })}
          </Panel>

          <Panel
            title="Severidad"
            subtitle="Defectos abiertos por grado"
            className={wide ? 'flex-1' : ''}
          >
            <DonutChart
              centerValue={totalGrades}
              centerLabel="Defectos"
              segments={(['V1', 'V2', 'V3'] as const).map((grade) => ({
                label: grade,
                value: data?.byGrade.find((row) => row.grade === grade)?.count ?? 0,
                color: DONUT_GRADE_COLOR[grade],
              }))}
            />

            <View className="mt-4 rounded-xl bg-canvas p-4">
              <Text className="text-xs leading-5 text-muted">
                V1 = 8 h de reparacion · V2 = 4 h · V3 = 2 h.{'\n'}
                Una unidad con V1 no puede ir por la via de garantia (WTY).
              </Text>
            </View>
          </Panel>
        </View>

        {/* Segunda fila */}
        <View className={`mb-4 gap-4 ${wide ? 'flex-row' : ''}`}>
          <Panel
            title="Pareto de defectos"
            subtitle="Tipos mas frecuentes y porcentaje acumulado"
            className={wide ? 'flex-[2]' : 'mb-4'}
          >
            {(data?.pareto ?? []).map((row) => (
              <BarRow
                key={row.type}
                label={`${displayLabel(row.type)}  (acum. ${row.cumulative}%)`}
                value={row.count}
                max={maxPareto}
                color={row.cumulative <= 80 ? 'bg-primary' : 'bg-gray-300'}
                highlight={row.cumulative <= 80}
              />
            ))}
            {(data?.pareto.length ?? 0) === 0 ? (
              <Text className="py-6 text-center text-sm text-muted">
                Sin defectos registrados todavia.
              </Text>
            ) : (
              <Text className="mt-2 text-xs text-muted">
                Los tipos resaltados concentran el 80% de los defectos: ahi esta el
                mayor retorno de cualquier accion correctiva.
              </Text>
            )}
          </Panel>

          <Panel
            title="En reparacion ahora"
            subtitle="Unidades con tiempo estimado de salida"
            className={wide ? 'flex-1' : ''}
          >
            {(data?.inRepair ?? []).map((row) => (
              <View
                key={row.vin}
                className="mb-2 flex-row items-center justify-between rounded-xl bg-canvas px-4 py-3"
              >
                <View className="flex-1">
                  <Text className="font-mono text-xs font-bold text-ink">{row.vin}</Text>
                  <Text className="mt-0.5 text-xs text-muted">{row.lane}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-bold text-ink">{row.hours} h</Text>
                  {row.estimatedCompletion ? (
                    <Text className="text-xs text-muted">
                      {new Date(row.estimatedCompletion).toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
            {(data?.inRepair.length ?? 0) === 0 ? (
              <Text className="py-6 text-center text-sm text-muted">
                Ninguna unidad en reparacion.
              </Text>
            ) : null}
          </Panel>
        </View>

        {/* Histórico del backend: mantiene datos de unidades que el cache operativo ya no conserva. */}
        <View className="mb-4">
          <Panel
            title="Tendencia de unidades"
            subtitle="Registros creados durante los últimos 30 días"
          >
            <TimelineBars rows={monthlyTimeline} />
          </Panel>
        </View>

        <View className={`mb-4 gap-4 ${wide ? 'flex-row' : ''}`}>
          <Panel
            title="Top 5 proveedores"
            subtitle="Unidades registradas en los últimos 7 días"
            className={wide ? 'flex-1' : 'mb-4'}
          >
            {topProviders.map((row, index) => (
              <BarRow
                key={row.provider}
                label={`${index + 1}. ${row.provider}`}
                value={row.count}
                max={maxTopProviders}
                color={index === 0 ? 'bg-primary' : 'bg-v2'}
                suffix=" unidades"
                highlight={index === 0}
              />
            ))}
            {topProviders.length === 0 ? <ChartEmpty message="Aún no hay actividad de proveedores esta semana." /> : null}
          </Panel>

          <Panel
            title="Tiempo por proveedor"
            subtitle="Horas estimadas acumuladas por proveedor"
            className={wide ? 'flex-1' : 'mb-4'}
          >
            {repairTimeByProvider.map((row) => (
              <BarRow
                key={row.provider}
                label={`${row.provider} · ${row.units} unidades`}
                value={row.hours}
                max={maxProviderHours}
                color="bg-primary"
                suffix=" h"
              />
            ))}
            {repairTimeByProvider.length === 0 ? <ChartEmpty message="Sin horas de reparación registradas aún." /> : null}
          </Panel>

          <Panel
            title="Tiempo por modelo"
            subtitle="Carga estimada acumulada por modelo"
            className={wide ? 'flex-1' : ''}
          >
            {repairTimeByModel.map((row) => (
              <BarRow
                key={row.model_code}
                label={`${row.model_name || row.model_code} · ${row.units} unidades`}
                value={row.hours}
                max={maxModelHours}
                color="bg-v3"
                suffix=" h"
              />
            ))}
            {repairTimeByModel.length === 0 ? <ChartEmpty message="Sin modelos con tiempo estimado aún." /> : null}
          </Panel>
        </View>

        {/* Actividad en vivo: mismo feed que alimenta la campana, no un mock
            aparte — si aqui aparece algo, es porque de verdad paso. */}
        <Panel
          title="Actividad en vivo"
          subtitle={
            liveConnected
              ? 'Conectado · los eventos aparecen al instante'
              : 'Sin canal en tiempo real activo — se actualiza con cada sincronizacion'
          }
        >
          <View className="mb-1 flex-row items-center gap-2">
            <View className={`h-2 w-2 rounded-full ${liveConnected ? 'bg-synced' : 'bg-line'}`} />
            <Text className="text-xs font-semibold text-muted">
              {liveConnected ? 'Live' : 'Fuera de linea'}
            </Text>
          </View>
          {recentActivity.length === 0 ? (
            <Text className="py-6 text-center text-sm text-muted">
              Sin eventos todavia. Apareceran aqui en cuanto otra estacion reporte, entregue
              o libere una unidad.
            </Text>
          ) : (
            recentActivity.map((item) => (
              <View
                key={item.id}
                className="flex-row items-center justify-between border-b border-line py-2.5 last:border-b-0"
              >
                <View className="flex-1 pr-3">
                  <Text className="text-sm font-semibold text-ink">
                    {notificationLabel(item.type)}
                  </Text>
                  <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
                    {item.message}
                  </Text>
                </View>
                <Text className="text-xs font-semibold text-muted">
                  {new Date(item.createdAt).toLocaleTimeString('es-MX', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </Text>
              </View>
            ))
          )}
        </Panel>

        <Text className="mt-2 px-1 text-xs leading-5 text-muted">
          Los datos se calculan con SQL sobre la base local, que el motor de
          sincronizacion mantiene al dia contra el backend. El tablero sigue
          respondiendo aunque se caiga la red; el indicador de arriba muestra
          desde cuando no se actualiza.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function TimelineBars({ rows }: { rows: { date: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  const first = rows[0]?.date;
  const middle = rows[Math.floor(rows.length / 2)]?.date;
  const last = rows.at(-1)?.date;
  const formatDate = (value?: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '—';

  if (rows.length === 0) return <ChartEmpty message="No fue posible cargar la tendencia histórica." />;

  return (
    <View>
      <View className="h-28 flex-row items-end">
        {rows.map((row) => (
          <View key={row.date} className="flex-1 justify-end" style={{ marginHorizontal: 1 }}>
            <View
              className={`min-h-[3px] rounded-t-sm ${row.count === max ? 'bg-primary' : 'bg-primary/45'}`}
              style={{ height: `${Math.max(3, (row.count / max) * 100)}%` }}
              accessibilityLabel={`${row.date}: ${row.count} unidades`}
            />
          </View>
        ))}
      </View>
      <View className="mt-2 flex-row justify-between">
        <Text className="text-[10px] font-medium text-muted">{formatDate(first)}</Text>
        <Text className="text-[10px] font-medium text-muted">{formatDate(middle)}</Text>
        <Text className="text-[10px] font-medium text-muted">{formatDate(last)}</Text>
      </View>
      <Text className="mt-3 text-xs text-muted">Máximo diario: {max} unidades · datos del servidor</Text>
    </View>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return <Text className="py-6 text-center text-sm text-muted">{message}</Text>;
}
