import { Redirect } from 'expo-router';
import { ActivityIndicator, Platform, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { ROLE_IDS } from '@/domain/constants';

/**
 * Puerta de entrada.
 *
 * Regla de plataforma: el ADMIN en escritorio aterriza en su dashboard; en
 * movil (y cualquier otro rol) entra a las pantallas operativas. Es la
 * separacion "admin en PC, trabajadores en la app".
 */
export default function Index() {
  const { token, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator size="large" color="#C3002F" />
      </View>
    );
  }

  if (!token) return <Redirect href="/login" />;

  const isAdminOnDesktop = Platform.OS === 'web' && user?.roleId === ROLE_IDS.ADMIN;

  return <Redirect href={isAdminOnDesktop ? '/dashboard' : '/(app)'} />;
}
