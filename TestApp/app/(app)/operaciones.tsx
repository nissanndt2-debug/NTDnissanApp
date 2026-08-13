import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import {
  SCREEN_HINTS,
  SCREEN_ICONS,
  SCREEN_TITLES,
  operationalScreens,
} from '@/domain/permissions';
import { Screen } from '@/ui/Screen';
import { COLORS } from '@/ui/theme';

/**
 * Hub del ADMIN en movil.
 *
 * El admin tiene permiso sobre las 7 pantallas operativas; ponerlas todas como
 * pestanas seria ilegible. Aqui aparecen como tarjetas y se abren por
 * navegacion (las rutas existen con `href: null` en el layout de pestanas).
 *
 * El dashboard analitico NO esta aqui a proposito: vive solo en web.
 */
export default function OperacionesScreen() {
  const { user } = useAuth();
  const screens = operationalScreens(user?.roleId);

  return (
    <Screen title="Operaciones" subtitle="Acceso a todas las pantallas del flujo">
      <ScrollView contentContainerClassName="px-4 pb-10">
        {screens.map((name) => {
          const Icon = SCREEN_ICONS[name];
          return (
            <Pressable
              key={name}
              onPress={() => router.push(`/(app)/${name}` as never)}
              className="mb-2 flex-row items-center gap-4 rounded-2xl border-2 border-line bg-surface p-4 active:bg-canvas"
            >
              <View className="h-14 w-14 items-center justify-center rounded-full bg-red-50">
                <Icon color={COLORS.primary} size={26} strokeWidth={2} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-ink">
                  {SCREEN_TITLES[name]}
                </Text>
                <Text className="mt-0.5 text-xs text-muted">{SCREEN_HINTS[name]}</Text>
              </View>
              <ChevronRight color={COLORS.line} size={22} strokeWidth={2} />
            </Pressable>
          );
        })}

        <View className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <Text className="text-sm font-bold text-blue-900">Dashboard analitico</Text>
          <Text className="mt-1 text-xs leading-5 text-blue-800">
            {Platform.OS === 'web'
              ? 'Abre la seccion Dashboard desde el panel principal.'
              : 'El dashboard completo (KPIs, Pareto, tiempos por etapa) esta disponible solo en la version de escritorio. Abrelo desde una PC en la misma red.'}
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
