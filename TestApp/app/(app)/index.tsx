import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronRight, Database, LogOut } from 'lucide-react-native';
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { getPipelineCounts } from '@/data/stats';
import { ROLE_IDS, ROLE_NAME_BY_ID, type RoleId, type UnitStatus } from '@/domain/constants';
import {
  SCREEN_HINTS,
  SCREEN_ICONS,
  SCREEN_TITLES,
  operationalScreens,
  type ScreenName,
} from '@/domain/permissions';
import { Screen } from '@/ui/Screen';
import { COLORS } from '@/ui/theme';

/** Etapas del flujo y la pantalla que las atiende. */
type GestionStep = 'nivelar' | 'entregar' | 'liberar';

const PIPELINE: { status: UnitStatus; label: string; screen?: ScreenName; step?: GestionStep }[] = [
  { status: 'REPORTED', label: 'Reportadas', screen: 'gestion', step: 'nivelar' },
  { status: 'SENT', label: 'Niveladas', screen: 'gestion', step: 'entregar' },
  { status: 'DELIVERED', label: 'Entregadas', screen: 'recibir' },
  { status: 'RECEIVED', label: 'Recibidas', screen: 'prioridad' },
  { status: 'IN_REPAIR', label: 'En reparación', screen: 'reparar' },
  { status: 'WTY_PENDING', label: 'Pendientes WTY', screen: 'validar' },
  { status: 'RELEASED', label: 'Liberadas Body', screen: 'gestion', step: 'liberar' },
  { status: 'WWS_RELEASED', label: 'Liberadas WWS', screen: 'aceptar' },
];

/** Acción principal por rol y la cola que la alimenta. */
const MAIN_ACTION: Record<RoleId, { screen: ScreenName; label: string; queue?: UnitStatus }> = {
  [ROLE_IDS.CARRIER]: { screen: 'reportar', label: 'Reportar unidad' },
  [ROLE_IDS.WWS]: { screen: 'gestion', label: 'Nivelar reportadas', queue: 'REPORTED' },
  [ROLE_IDS.BODY]: { screen: 'recibir', label: 'Recibir unidades', queue: 'DELIVERED' },
  [ROLE_IDS.SCM]: { screen: 'prioridad', label: 'Ordenar la cola', queue: 'RECEIVED' },
  [ROLE_IDS.WTY]: { screen: 'validar', label: 'Validar garantía', queue: 'WTY_PENDING' },
  [ROLE_IDS.SCM_QUALITY]: {
    screen: 'validar',
    label: 'Validar garantía',
    queue: 'WTY_PENDING',
  },
  [ROLE_IDS.ADMIN]: { screen: 'operaciones', label: 'Abrir operaciones' },
};

export default function PanelScreen() {
  const { user, signOut } = useAuth();
  const roleId = user?.roleId;
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 960;
  const myScreens = operationalScreens(roleId);
  const main = roleId ? MAIN_ACTION[roleId] : null;

  const { data: counts } = useQuery<Partial<Record<UnitStatus, number>>>( {
    queryKey: ['pipeline'],
    queryFn: getPipelineCounts,
    initialData: {},
    initialDataUpdatedAt: 0,
  });

  const total = PIPELINE.reduce((sum, { status }) => sum + (counts[status] ?? 0), 0);
  const waiting = main?.queue ? (counts[main.queue] ?? 0) : null;
  const secondary = [...myScreens.filter((name) => name !== main?.screen), 'perfil' as ScreenName];
  const actionScreens = main ? [main.screen, ...secondary] : secondary;
  const queueShare = waiting != null && total > 0 ? Math.min((waiting / total) * 100, 100) : 0;
  const userContext = `${user?.name ?? ''} · ${roleId ? ROLE_NAME_BY_ID[roleId] : ''}${
    user?.plant ? ` · Planta ${user.plant}` : ''
  }`;

  return (
    <Screen
      title=""
      subtitle={userContext}
      centeredHeader
      right={
        <Pressable
          onPress={() => void signOut()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
          className="h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 active:bg-primary"
        >
          <LogOut color={COLORS.white} size={21} strokeWidth={2.2} />
        </Pressable>
      }
    >
      <ScrollView
        className="bg-ink"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="flex-grow"
      >
        {/* Resumen superior: equivalente al bloque de balance de la referencia. */}
        <View className="bg-ink px-6 pb-11 pt-3">
          <View
            className="mx-auto w-full"
            style={{ maxWidth: desktop ? 1240 : 720 }}
          >
            <View className="flex-row items-stretch">
              <View className="flex-1 pr-5">
                <Text className="text-xs font-medium text-white/55">Unidades activas</Text>
                <Text className="mt-0.5 text-[26px] font-bold leading-8 text-white">{total}</Text>
              </View>
              <View className="w-px bg-white/20" />
              <View className="flex-1 pl-5">
                <Text className="text-xs font-medium text-white/55">
                  {waiting != null ? 'En tu cola' : 'Accesos disponibles'}
                </Text>
                <Text className="mt-0.5 text-[26px] font-bold leading-8 text-primary">
                  {waiting ?? actionScreens.length}
                </Text>
              </View>
            </View>

            <View className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/15">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: waiting != null ? `${queueShare}%` : '100%' }}
              />
            </View>
            <View className="mt-2.5 flex-row items-center">
              <View className="mr-2 h-4 w-4 items-center justify-center rounded-md border border-primary bg-primary">
                <View className="h-1.5 w-1.5 rounded-full bg-white" />
              </View>
              <Text className="flex-1 text-sm text-white/75">
                {waiting != null
                  ? `${waiting} ${waiting === 1 ? 'unidad lista' : 'unidades listas'} para atender`
                  : main?.label ?? 'Operación disponible'}
              </Text>
            </View>
          </View>
        </View>

        {/* Gran hoja clara y redondeada, como la zona de categorías. */}
        <View className="-mt-6 min-h-[560px] rounded-t-[40px] bg-canvas px-4 pb-32 pt-8">
          <View
            className="mx-auto w-full"
            style={{ maxWidth: desktop ? 1240 : 720 }}
          >
            <View className="mb-5 flex-row items-end justify-between px-1">
              <View>
                <Text className="text-xl font-bold text-ink">Accesos rápidos</Text>
                <Text className="mt-1 text-xs text-muted">Selecciona la operación que necesitas</Text>
              </View>
              <Text className="text-xs font-bold uppercase text-primary">
                {actionScreens.length} {actionScreens.length === 1 ? 'opción' : 'opciones'}
              </Text>
            </View>

            <View className="flex-row flex-wrap gap-3">
              {actionScreens.map((name, index) => {
                const Icon = SCREEN_ICONS[name];
                const isMain = index === 0;
                const count = isMain ? waiting : null;
                const actionTitle = isMain
                  ? (main?.label ?? SCREEN_TITLES[name])
                  : SCREEN_TITLES[name];
                const actionHint = SCREEN_HINTS[name];

                return (
                  <Pressable
                    key={name}
                    onPress={() => router.push(`/(app)/${name}` as never)}
                    accessibilityLabel={`${actionTitle}. ${actionHint}`}
                    className={`min-h-[148px] flex-1 rounded-[26px] border p-4 active:opacity-80 ${
                      isMain
                        ? 'border-primary bg-primary'
                        : 'border-line bg-surface active:border-primary'
                    }`}
                    style={
                      {
                        flexBasis: desktop ? '31.8%' : '47%',
                        flexGrow: desktop ? 0 : 1,
                        minHeight: desktop ? 178 : 148,
                        ...(isMain
                          ? {
                            shadowColor: COLORS.primary,
                            shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: 0.2,
                            shadowRadius: 14,
                            elevation: 5,
                          }
                          : {}),
                      }
                    }
                  >
                    <View className="flex-row items-start justify-between">
                      <View
                        className={`h-14 w-14 items-center justify-center rounded-2xl border ${
                          isMain
                            ? 'border-white/20 bg-white/15'
                            : 'border-primary/10 bg-primary/10'
                        }`}
                      >
                        <Icon
                          color={isMain ? COLORS.white : COLORS.primary}
                          size={29}
                          strokeWidth={2}
                        />
                      </View>
                      <View className="items-end gap-2">
                        {count != null && count > 0 ? (
                          <View
                            className={`rounded-full px-2.5 py-1 ${
                              isMain ? 'bg-white/15' : 'bg-ink'
                            }`}
                          >
                            <Text className="text-[10px] font-bold text-white">
                              {count} pendientes
                            </Text>
                          </View>
                        ) : null}
                        <ChevronRight
                          color={isMain ? 'rgba(255,255,255,0.65)' : COLORS.line}
                          size={20}
                          strokeWidth={2}
                        />
                      </View>
                    </View>
                    <Text
                      className={`mt-4 text-base font-bold ${isMain ? 'text-white' : 'text-ink'}`}
                      numberOfLines={2}
                    >
                      {actionTitle}
                    </Text>
                    {actionHint ? (
                      <Text
                        className={`mt-1 text-xs leading-4 ${
                          isMain ? 'text-white/65' : 'text-muted'
                        }`}
                        numberOfLines={2}
                      >
                        {actionHint}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <View className="mb-3 mt-5 flex-row items-end justify-between px-1">
              <View>
                <Text className="text-xl font-bold text-ink">Flujo del día</Text>
                <Text className="mt-1 text-xs text-muted">Estado actual de las unidades</Text>
              </View>
              <View className="rounded-full bg-ink px-3 py-1.5">
                <Text className="text-xs font-bold text-white">{total} activas</Text>
              </View>
            </View>

            <View className="flex-row flex-wrap gap-2">
            {PIPELINE.map(({ status, label, screen, step }) => {
                const count = counts[status] ?? 0;
                const stuck = count >= 5;
                const canOpen = Boolean(screen && myScreens.includes(screen));

                return (
                  <Pressable
                    key={status}
                    disabled={!canOpen}
                  onPress={() => {
                    if (!canOpen) return;
                    if (screen === 'gestion' && step) {
                      router.push({ pathname: '/(app)/gestion', params: { step } } as never);
                      return;
                    }
                    router.push(`/(app)/${screen}` as never);
                  }}
                    className={`min-h-[84px] flex-1 justify-between rounded-2xl border bg-surface p-4 ${
                      canOpen ? 'border-line active:border-primary' : 'border-transparent'
                    }`}
                    style={{
                      flexBasis: desktop ? '23.5%' : '47%',
                      flexGrow: desktop ? 0 : 1,
                    }}
                  >
                    <View className="flex-row items-start justify-between">
                      <Text
                        className={`mr-2 flex-1 text-sm font-semibold ${
                          count > 0 ? 'text-ink' : 'text-muted'
                        }`}
                        numberOfLines={2}
                      >
                        {label}
                      </Text>
                      {canOpen ? (
                        <ChevronRight color={COLORS.line} size={17} strokeWidth={2} />
                      ) : null}
                    </View>
                    <View className="mt-2 flex-row items-end justify-between">
                      <Text className={`text-2xl font-bold ${count > 0 ? 'text-primary' : 'text-line'}`}>
                        {count}
                      </Text>
                      {stuck ? (
                        <View className="mb-1 flex-row items-center gap-1">
                          <View className="h-1.5 w-1.5 rounded-full bg-v2" />
                          <Text className="text-[9px] font-bold uppercase text-v2">Acumulación</Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
