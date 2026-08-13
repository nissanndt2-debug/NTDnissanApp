import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronRight, Database } from 'lucide-react-native';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { CanRole } from '@/auth/Can';
import { listByStatus } from '@/data/units';
import { ROLE_IDS, ROLE_NAME_BY_ID, type RoleId, type UnitStatus } from '@/domain/constants';
import {
  SCREEN_HINTS,
  SCREEN_ICONS,
  SCREEN_TITLES,
  operationalScreens,
  type ScreenName,
} from '@/domain/permissions';
import { Screen, SectionTitle } from '@/ui/Screen';
import { COLORS } from '@/ui/theme';

/** Etapas del flujo y la pantalla que las atiende. */
const PIPELINE: { status: UnitStatus; label: string; screen?: ScreenName }[] = [
  { status: 'REPORTED', label: 'Reportadas', screen: 'gestion' },
  { status: 'SENT', label: 'Niveladas', screen: 'gestion' },
  { status: 'DELIVERED', label: 'Entregadas', screen: 'recibir' },
  { status: 'RECEIVED', label: 'Recibidas', screen: 'prioridad' },
  { status: 'IN_REPAIR', label: 'En reparacion', screen: 'reparar' },
  { status: 'WTY_PENDING', label: 'Pendientes WTY', screen: 'validar' },
  { status: 'RELEASED', label: 'Liberadas Body', screen: 'gestion' },
  { status: 'WWS_RELEASED', label: 'Liberadas WWS', screen: 'aceptar' },
];

/**
 * Accion principal por rol y la cola que la alimenta.
 *
 * El panel no pregunta "que quieres hacer": para cada rol hay UNA cosa que hace
 * el 80% del tiempo, y esa ocupa el bloque mas grande de la pantalla con el
 * numero de unidades que le esperan. Todo lo demas baja de jerarquia.
 */
const MAIN_ACTION: Record<RoleId, { screen: ScreenName; label: string; queue?: UnitStatus }> = {
  [ROLE_IDS.CARRIER]: { screen: 'reportar', label: 'Reportar unidad' },
  [ROLE_IDS.WWS]: { screen: 'gestion', label: 'Nivelar reportadas', queue: 'REPORTED' },
  [ROLE_IDS.BODY]: { screen: 'recibir', label: 'Recibir unidades', queue: 'DELIVERED' },
  [ROLE_IDS.SCM]: { screen: 'prioridad', label: 'Ordenar la cola', queue: 'RECEIVED' },
  [ROLE_IDS.WTY]: { screen: 'validar', label: 'Validar garantia', queue: 'WTY_PENDING' },
  [ROLE_IDS.SCM_QUALITY]: { screen: 'validar', label: 'Validar garantia', queue: 'WTY_PENDING' },
  [ROLE_IDS.ADMIN]: { screen: 'operaciones', label: 'Abrir operaciones' },
};

export default function PanelScreen() {
  const { user, signOut } = useAuth();
  const roleId = user?.roleId;
  const myScreens = operationalScreens(roleId);
  const main = roleId ? MAIN_ACTION[roleId] : null;

  const { data: counts } = useQuery<Partial<Record<UnitStatus, number>>>({
    queryKey: ['pipeline'],
    queryFn: async () => {
      const entries = await Promise.all(
        PIPELINE.map(
          async ({ status }) => [status, (await listByStatus(status)).length] as const
        )
      );
      return Object.fromEntries(entries) as Partial<Record<UnitStatus, number>>;
    },
    initialData: {},
    // Sin esto, `initialData` cuenta como recien traida y el `staleTime` de 30 s
    // deja el panel en ceros los primeros 30 s tras abrir la app.
    initialDataUpdatedAt: 0,
    refetchInterval: 15_000,
  });

  const total = PIPELINE.reduce((sum, { status }) => sum + (counts[status] ?? 0), 0);
  const waiting = main?.queue ? (counts[main.queue] ?? 0) : null;
  const secondary = myScreens.filter((name) => name !== main?.screen);

  return (
    <Screen
      title="Panel del dia"
      subtitle={`${user?.name ?? ''} · ${roleId ? ROLE_NAME_BY_ID[roleId] : ''}${
        user?.plant ? ` · Planta ${user.plant}` : ''
      }`}
      right={
        <Pressable onPress={() => void signOut()} hitSlop={12} className="px-1 py-1">
          <Text className="text-sm font-bold text-white/70">Salir</Text>
        </Pressable>
      }
    >
      <ScrollView contentContainerClassName="px-4 pb-10">
        {/* Lo que toca hacer ahora */}
        {main ? (
          <Pressable
            onPress={() => router.push(`/(app)/${main.screen}` as never)}
            className="mt-4 rounded-3xl bg-primary p-5 active:opacity-90"
          >
            <Text className="text-label uppercase text-white/60">Tu trabajo ahora</Text>
            <View className="mt-1 flex-row items-end justify-between">
              <Text className="flex-1 text-2xl font-bold text-white">{main.label}</Text>
              {waiting != null ? (
                <View className="items-end">
                  <Text className="text-4xl font-bold text-white">{waiting}</Text>
                  <Text className="text-label uppercase text-white/60">esperando</Text>
                </View>
              ) : (
                <ChevronRight color={COLORS.white} size={28} strokeWidth={2} />
              )}
            </View>
          </Pressable>
        ) : null}

        {/* Solo ADMIN y solo web: se oculta por completo para cualquier otro
            rol o plataforma, no se muestra deshabilitado. */}
        {Platform.OS === 'web' ? (
          <CanRole roles={[ROLE_IDS.ADMIN]}>
            <Pressable
              onPress={() => router.push('/dashboard')}
              className="mt-2 flex-row items-center justify-between rounded-2xl border-2 border-line bg-surface p-4 active:bg-canvas"
            >
              <View>
                <Text className="text-base font-bold text-ink">Abrir dashboard</Text>
                <Text className="mt-0.5 text-xs text-muted">
                  KPIs, Pareto y cuellos de botella
                </Text>
              </View>
              <ChevronRight color={COLORS.line} size={22} strokeWidth={2} />
            </Pressable>
          </CanRole>
        ) : null}

        {secondary.length > 0 ? (
          <>
            <SectionTitle>Tambien puedes</SectionTitle>
            <View className="flex-row flex-wrap gap-2">
              {secondary.map((name) => {
                const Icon = SCREEN_ICONS[name];
                return (
                <Pressable
                  key={name}
                  onPress={() => router.push(`/(app)/${name}` as never)}
                  className="min-h-[92px] flex-1 basis-[46%] items-center justify-center gap-2 rounded-2xl border-2 border-line bg-surface px-4 py-3 active:bg-canvas"
                >
                  <View className="h-11 w-11 items-center justify-center rounded-full bg-red-50">
                    <Icon color={COLORS.primary} size={22} strokeWidth={2} />
                  </View>
                  <View className="items-center">
                    <Text className="text-center text-base font-bold text-ink">
                      {SCREEN_TITLES[name]}
                    </Text>
                    <Text
                      className="mt-0.5 text-center text-[11px] text-muted"
                      numberOfLines={2}
                    >
                      {SCREEN_HINTS[name]}
                    </Text>
                  </View>
                </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <SectionTitle>Flujo del dia · {total} unidades activas</SectionTitle>

        {PIPELINE.map(({ status, label, screen }) => {
          const count = counts[status] ?? 0;
          const stuck = count >= 5;
          const canOpen = screen && myScreens.includes(screen);

          return (
            <Pressable
              key={status}
              disabled={!canOpen}
              onPress={() => canOpen && router.push(`/(app)/${screen}` as never)}
              className={`mb-2 min-h-[64px] flex-row items-center justify-between rounded-2xl bg-surface px-4 py-3 ${
                canOpen ? 'active:bg-canvas' : ''
              }`}
            >
              <View className="flex-1">
                <Text
                  className={`text-base font-semibold ${
                    count > 0 ? 'text-ink' : 'text-muted'
                  }`}
                >
                  {label}
                </Text>
                {/* La marca ambar aparece SOLO cuando hay acumulacion: si estuviera
                    en todas las filas dejaria de querer decir algo. */}
                {stuck ? (
                  <View className="mt-1 flex-row items-center gap-1.5">
                    <View className="h-1.5 w-1.5 rounded-full bg-v2" />
                    <Text className="text-label uppercase text-v2">
                      acumulacion detectada
                    </Text>
                  </View>
                ) : null}
              </View>
              <View className="flex-row items-center gap-3">
                <Text
                  className={`text-2xl font-bold ${count > 0 ? 'text-ink' : 'text-line'}`}
                >
                  {count}
                </Text>
                {canOpen ? (
                  <ChevronRight color={COLORS.line} size={20} strokeWidth={2} />
                ) : null}
              </View>
            </Pressable>
          );
        })}

        <View className="mt-4 flex-row items-center justify-center gap-1.5">
          <Database color={COLORS.muted} size={13} strokeWidth={2} />
          <Text className="text-xs text-muted">
            Los datos se leen del dispositivo: el panel funciona sin red.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
