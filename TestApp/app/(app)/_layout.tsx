import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Redirect, router, Tabs } from 'expo-router';
import { Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import {
  SCREEN_ICONS,
  SCREEN_TITLES,
  canAccess,
  tabsForRole,
  type ScreenName,
} from '@/domain/permissions';
import { ROLE_IDS } from '@/domain/constants';
import { COLORS } from '@/ui/theme';
import { TruckLoader } from '@/ui/TruckLoader';

interface FloatingTabBarProps extends BottomTabBarProps {
  visibleTabs: ScreenName[];
  canViewDashboard?: boolean;
}

/**
 * Barra propia: evita que React Navigation recalcule alturas y etiquetas
 * alrededor del botón central. Cada zona conserva un objetivo táctil amplio.
 */
function FloatingTabBar({
  state,
  navigation,
  visibleTabs,
}: FloatingTabBarProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 10);
  const barWidth = Math.min(Math.max(width, 300), 600);

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0 items-center"
    >
      <View
        className="rounded-t-[32px] bg-surface px-3 pt-3"
        style={{
          width: barWidth,
          height: 84 + bottomInset,
          paddingBottom: bottomInset,
          shadowColor: COLORS.ink,
          shadowOffset: { width: 0, height: -5 },
          shadowOpacity: 0.1,
          shadowRadius: 16,
          elevation: 12,
        }}
      >
        <View className="h-[72px] flex-row items-center gap-2">
        {visibleTabs.map((name) => {
          const route = state.routes.find((item) => item.name === name);
          if (!route) return null;

          const focused = state.routes[state.index]?.key === route.key;
          const Icon = SCREEN_ICONS[name];
          const label = SCREEN_TITLES[name];

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={focused ? { selected: true } : {}}
              className={`h-[66px] flex-1 items-center justify-center rounded-[22px] outline-none active:opacity-75 ${
                focused ? 'bg-primary' : 'bg-transparent'
              }`}
              style={{
                shadowColor: focused ? COLORS.primary : COLORS.ink,
                shadowOffset: { width: 0, height: focused ? 7 : 5 },
                shadowOpacity: focused ? 0.28 : 0,
                shadowRadius: focused ? 12 : 10,
                elevation: focused ? 9 : 0,
              }}
            >
              <Icon
                color={focused ? COLORS.white : COLORS.muted}
                size={25}
                strokeWidth={focused ? 2.3 : 2}
              />
              <Text
                className={`mt-1 text-xs font-bold ${
                  focused ? 'text-white' : 'text-muted'
                }`}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
        </View>
      </View>
    </View>
  );
}

/**
 * Navegación de escritorio: las mismas rutas y permisos que la barra móvil,
 * pero siempre visibles para que el operador no tenga que abrir un menú ni
 * perder espacio vertical en una pantalla ancha.
 */
function DesktopSidebar({
  state,
  navigation,
  visibleTabs,
  canViewDashboard = false,
}: FloatingTabBarProps) {
  return (
    <View
      className="absolute bottom-0 left-0 top-0 w-[252px] border-r border-white/10 bg-ink px-4 pb-6 pt-10"
      style={{ boxShadow: '2px 0 18px rgba(15, 22, 32, 0.12)' }}
    >
      <Text className="text-[11px] font-bold uppercase tracking-[2px] text-white/45">
        Body App
      </Text>
      <Text className="mt-2 text-2xl font-bold text-white">Operaciones</Text>
      <Text className="mt-1 text-xs leading-5 text-white/55">
        Selecciona una etapa del flujo.
      </Text>

      <View className="mt-8 gap-2">
        {visibleTabs.map((name) => {
          const route = state.routes.find((item) => item.name === name);
          if (!route) return null;

          const focused = state.routes[state.index]?.key === route.key;
          const Icon = SCREEN_ICONS[name];
          const label = SCREEN_TITLES[name];

          return (
            <Pressable
              key={route.key}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={focused ? { selected: true } : {}}
              className={`min-h-[56px] flex-row items-center gap-3 rounded-2xl px-4 active:opacity-80 ${
                focused ? 'bg-primary' : 'bg-white/0'
              }`}
            >
              <Icon color={COLORS.white} size={21} strokeWidth={focused ? 2.5 : 2} />
              <Text className="flex-1 text-sm font-bold text-white">{label}</Text>
              {focused ? <View className="h-2 w-2 rounded-full bg-white" /> : null}
            </Pressable>
          );
        })}
      </View>

      {canViewDashboard ? (
        <Pressable
          onPress={() => router.push('/dashboard')}
          accessibilityRole="button"
          accessibilityLabel="Ver KPIs y dashboard"
          className="mt-5 min-h-[72px] flex-row items-center gap-3 rounded-2xl border border-primary/35 bg-primary/10 px-4 active:bg-primary"
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <SCREEN_ICONS.index color={COLORS.white} size={20} strokeWidth={2.2} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-white">Ver KPIs</Text>
            <Text className="mt-0.5 text-[11px] text-white/60">Dashboard ejecutivo</Text>
          </View>
        </Pressable>
      ) : null}

      <Pressable
        onPress={() => router.push('/(app)/perfil')}
        accessibilityRole="button"
        accessibilityLabel="Abrir perfil y seguridad"
        className="mt-3 min-h-[56px] flex-row items-center gap-3 rounded-2xl px-4 active:bg-white/10"
      >
        <SCREEN_ICONS.perfil color={COLORS.white} size={20} strokeWidth={2.1} />
        <Text className="flex-1 text-sm font-bold text-white">Perfil y seguridad</Text>
      </Pressable>

      <View className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-3">
        <Text className="text-[10px] font-bold uppercase tracking-wide text-white/45">
          Operación en línea
        </Text>
        <Text className="mt-1 text-xs leading-5 text-white/70">
          Los cambios se sincronizan con el mismo flujo de la app móvil.
        </Text>
      </View>
    </View>
  );
}

/** Pestañas visibles y ordenadas según el rol autenticado. */
export default function AppLayout() {
  const { token, user, isLoading } = useAuth();
  const { width } = useWindowDimensions();

  // Mismo freno que dashboard.tsx y index.tsx: la sesion se restaura de forma
  // asincrona, y este layout puede montar antes de que esa lectura termine
  // (por ejemplo, al reabrir la app en frio ya en una pestana de /(app)).
  // Sin esto, ese instante inicial con token=null expulsaba a /login aunque
  // la sesion guardada fuera valida.
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <TruckLoader size={132} accessibilityLabel="Cargando sesión" />
      </View>
    );
  }

  if (!token) return <Redirect href="/login" />;

  const roleId = user?.roleId;
  const visibleTabs = tabsForRole(roleId);
  const visible = new Set<ScreenName>(visibleTabs);
  const desktopWeb = Platform.OS === 'web' && width >= 960;

  const screen = (name: ScreenName) => (
    <Tabs.Screen
      key={name}
      name={name}
      options={{
        title: SCREEN_TITLES[name],
        href: visible.has(name) ? undefined : null,
      }}
      redirect={!canAccess(name, roleId)}
    />
  );

  const all: ScreenName[] = [
    'index',
    'operaciones',
    'reportar',
    'gestion',
    'recibir',
    'reparar',
    'prioridad',
    'validar',
    'aceptar',
    'historial',
    'control',
    'perfil',
  ];

  return (
    <Tabs
      tabBar={(props) => (
        desktopWeb ? (
          <DesktopSidebar
            {...props}
            visibleTabs={visibleTabs}
            canViewDashboard={roleId === ROLE_IDS.ADMIN}
          />
        ) : (
          <FloatingTabBar {...props} visibleTabs={visibleTabs} />
        )
      )}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        sceneStyle: {
          backgroundColor: COLORS.canvas,
          marginLeft: desktopWeb ? 252 : 0,
        },
      }}
    >
      {all.map(screen)}
    </Tabs>
  );
}
