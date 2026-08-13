import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Redirect, Tabs } from 'expo-router';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import {
  SCREEN_ICONS,
  SCREEN_TITLES,
  canAccess,
  tabsForRole,
  type ScreenName,
} from '@/domain/permissions';
import { COLORS } from '@/ui/theme';

interface FloatingTabBarProps extends BottomTabBarProps {
  visibleTabs: ScreenName[];
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

/** Pestañas visibles y ordenadas según el rol autenticado. */
export default function AppLayout() {
  const { token, user } = useAuth();

  if (!token) return <Redirect href="/login" />;

  const roleId = user?.roleId;
  const visibleTabs = tabsForRole(roleId);
  const visible = new Set<ScreenName>(visibleTabs);

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
  ];

  return (
    <Tabs
      tabBar={(props) => (
        <FloatingTabBar {...props} visibleTabs={visibleTabs} />
      )}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: COLORS.canvas },
      }}
    >
      {all.map(screen)}
    </Tabs>
  );
}
