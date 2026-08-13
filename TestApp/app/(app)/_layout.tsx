import { Redirect, Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import {
  SCREEN_ICONS,
  SCREEN_TITLES,
  canAccess,
  tabsForRole,
  type ScreenName,
} from '@/domain/permissions';
import { COLORS } from '@/ui/theme';

/**
 * Pestanas filtradas por rol.
 *
 * `href: null` oculta la pestana de la barra PERO deja la ruta navegable por
 * codigo. Eso permite que el hub del ADMIN abra pantallas que no tiene como
 * pestana, sin duplicar rutas ni tener dos navegadores.
 */
export default function AppLayout() {
  const { token, user } = useAuth();

  if (!token) return <Redirect href="/login" />;

  const roleId = user?.roleId;
  const visible = new Set<ScreenName>(tabsForRole(roleId));

  const screen = (name: ScreenName) => {
    const Icon = SCREEN_ICONS[name];
    return (
      <Tabs.Screen
        key={name}
        name={name}
        options={{
          title: SCREEN_TITLES[name],
          tabBarIcon: ({ color }: { color: ColorValue }) => (
            <Icon color={color as string} size={22} strokeWidth={2} />
          ),
          // Visible como pestana solo si pertenece al set del rol.
          // Accesible por navegacion si el rol tiene permiso.
          href: visible.has(name) ? undefined : null,
        }}
        redirect={!canAccess(name, roleId)}
      />
    );
  };

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
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.muted,
        // 72 px: la barra es un objetivo de toque, no un adorno.
        tabBarStyle: {
          height: 72,
          paddingBottom: 12,
          paddingTop: 10,
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.line,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
      }}
    >
      {all.map(screen)}
    </Tabs>
  );
}
