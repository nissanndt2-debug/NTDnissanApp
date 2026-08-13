import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { ROLE_IDS, type RoleId } from '@/domain/constants';
import { COLORS } from '@/ui/theme';

/** Roles con nombre legible: el operador no sabe que es "SCM_QUALITY". */
const DEMO_ROLES: { id: RoleId; label: string; hint: string }[] = [
  { id: ROLE_IDS.CARRIER, label: 'Carrier', hint: 'Reportar y aceptar' },
  { id: ROLE_IDS.WWS, label: 'WWS', hint: 'Nivelar, entregar, liberar' },
  { id: ROLE_IDS.BODY, label: 'Body Shop', hint: 'Recibir y reparar' },
  { id: ROLE_IDS.SCM, label: 'SCM', hint: 'Prioridad de la cola' },
  { id: ROLE_IDS.WTY, label: 'Garantia', hint: 'Validar unidades' },
  { id: ROLE_IDS.ADMIN, label: 'Admin', hint: 'Todas las pantallas' },
];

export default function LoginScreen() {
  const { signIn, signInDemo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch {
      setError('No se pudo iniciar sesion. Revisa tus datos o la conexion.');
    } finally {
      setBusy(false);
    }
  };

  const enterDemo = async (roleId: RoleId) => {
    setBusy(true);
    try {
      await signInDemo(roleId);
      router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-ink">
      <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-10">
        <View className="mb-10 items-center">
          <Image
            source={require('../assets/nissan-logo.png')}
            style={{ height: 40, width: 272 }}
            resizeMode="contain"
            accessibilityLabel="Nissan"
          />
          <View className="mt-5 h-1 w-12 bg-primary" />
          <Text className="mt-4 text-3xl font-bold text-white">Body App</Text>
          <Text className="mt-1 text-base text-white/60">
            Trazabilidad de planchas · Piso de planta
          </Text>
        </View>

        {error ? (
          <View className="mb-4 rounded-2xl border border-v1 bg-v1/10 px-4 py-3">
            <Text className="text-sm font-semibold text-white">{error}</Text>
          </View>
        ) : null}

        <Text className="mb-2 text-label uppercase text-white/50">Correo</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="usuario@nissan.com"
          placeholderTextColor="#5B6878"
          className="mb-4 min-h-[56px] rounded-2xl border border-white/15 bg-white/10 px-4 text-base text-white"
        />

        <Text className="mb-2 text-label uppercase text-white/50">Contrasena</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          className="mb-6 min-h-[56px] rounded-2xl border border-white/15 bg-white/10 px-4 text-base text-white"
        />

        <Pressable
          onPress={() => void handleSubmit()}
          disabled={busy || !email || !password}
          className="min-h-[60px] items-center justify-center rounded-2xl bg-primary active:opacity-80 disabled:opacity-40"
        >
          {busy ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text className="text-lg font-bold text-white">Entrar</Text>
          )}
        </Pressable>

        {/* Revision de interfaz sin backend */}
        <View className="mt-8 border-t border-white/10 pt-6">
          {demoOpen ? (
            <>
              <Text className="mb-3 text-label uppercase text-white/50">
                Entrar como · datos de ejemplo
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {DEMO_ROLES.map((role) => (
                  <Pressable
                    key={role.id}
                    onPress={() => void enterDemo(role.id)}
                    disabled={busy}
                    className="min-h-[64px] flex-1 basis-[46%] justify-center rounded-2xl border border-white/15 px-4 active:bg-white/10"
                  >
                    <Text className="text-base font-bold text-white">{role.label}</Text>
                    <Text className="mt-0.5 text-xs text-white/50">{role.hint}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <Pressable
              onPress={() => setDemoOpen(true)}
              className="min-h-[48px] items-center justify-center"
            >
              <Text className="text-sm font-bold text-white/70">
                Ver la app sin backend (modo demo)
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
