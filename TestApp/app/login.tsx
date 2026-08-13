import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
} from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth as authApi } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthProvider";
import { ROLE_IDS, type RoleId } from "@/domain/constants";
import { COLORS } from "@/ui/theme";

/** Roles con nombre legible: el operador no sabe que es "SCM_QUALITY". */
const DEMO_ROLES: { id: RoleId; label: string; hint: string }[] = [
  { id: ROLE_IDS.CARRIER, label: "Carrier", hint: "Reportar y aceptar" },
  { id: ROLE_IDS.WWS, label: "WWS", hint: "Nivelar y liberar" },
  { id: ROLE_IDS.BODY, label: "Body Shop", hint: "Recibir y reparar" },
  { id: ROLE_IDS.SCM, label: "SCM", hint: "Priorizar la cola" },
  { id: ROLE_IDS.WTY, label: "Garantía", hint: "Validar unidades" },
  { id: ROLE_IDS.ADMIN, label: "Admin", hint: "Acceso completo" },
];

/** Trama ligera inspirada en planos técnicos, sin depender de una imagen. */
function HeaderPattern() {
  return (
    <View
      pointerEvents="none"
      className="absolute inset-0 overflow-hidden opacity-30"
    >
      {[72, 144, 216, 288, 360].map((top) => (
        <View
          key={`h-${top}`}
          style={{ top }}
          className="absolute h-px w-full bg-white/10"
        />
      ))}
      {[64, 144, 224, 304].map((left) => (
        <View
          key={`v-${left}`}
          style={{ left }}
          className="absolute h-full w-px bg-white/10"
        />
      ))}
      <View className="absolute left-[12%] top-20 h-1 w-1 rounded-full bg-primary" />
      <View className="absolute right-[18%] top-32 h-1 w-1 rounded-full bg-white/60" />
      <View className="absolute left-[27%] top-52 h-1 w-1 rounded-full bg-white/40" />
      <View className="absolute right-[9%] top-64 h-1 w-1 rounded-full bg-primary" />
    </View>
  );
}

export default function LoginScreen() {
  const { signIn, signInDemo } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "change-password">("sign-in");

  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    (mode === "sign-in" ||
      (newPassword.length >= 8 && newPassword === confirmPassword)) &&
    !busy;

  const handleSubmit = async () => {
    Keyboard.dismiss();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/");
    } catch {
      setError("No pudimos iniciar sesión. Verifica tus datos o tu conexión.");
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async () => {
    if (!canSubmit) return;

    Keyboard.dismiss();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      // Se autentica solo para esta operación: no deja una sesión persistida
      // en un equipo compartido hasta que la persona entre normalmente.
      const session = await authApi.login(email.trim(), password);
      await authApi.changePassword(
        { currentPassword: password, newPassword },
        session.token,
      );
      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowNewPassword(false);
      setMode("sign-in");
      setNotice(
        "Contraseña actualizada. Inicia sesión con tu nueva contraseña.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo actualizar la contraseña.",
      );
    } finally {
      setBusy(false);
    }
  };

  const openSignIn = () => {
    setMode("sign-in");
    setError("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const openPasswordChange = () => {
    setMode("change-password");
    setError("");
    setNotice("");
    setDemoOpen(false);
  };

  const enterDemo = async (roleId: RoleId) => {
    setBusy(true);
    try {
      await signInDemo(roleId);
      router.replace("/");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["left", "right"]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerClassName="flex-grow pb-10"
        >
          <View className="min-h-[395px] overflow-hidden bg-ink px-6 pt-44">
            <HeaderPattern />
            <View className="mx-auto w-full max-w-[480px] items-center">
              <Image
                source={require("../assets/nissan-logo.png")}
                style={{ height: 48, width: 300 }}
                resizeMode="contain"
                accessibilityLabel="Nissan"
              />
              <Text className="mt-3 text-center text-[15px] leading-6 text-white/65">
                Control de daños en carrocería
              </Text>
            </View>
          </View>

          <View className="mx-auto -mt-[108px] w-full max-w-[528px] px-6">
            <View
              className="rounded-[24px] border border-black/5 bg-surface p-6"
              style={{
                shadowColor: "#0F1620",
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.1,
                shadowRadius: 28,
                elevation: 8,
              }}
            >
              <View className="mb-5 flex-row items-start gap-3">
                {mode === "change-password" ? (
                  <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                    <KeyRound
                      color={COLORS.primary}
                      size={21}
                      strokeWidth={2.2}
                    />
                  </View>
                ) : null}
                <View className="flex-1">
                  <Text className="text-xl font-bold text-ink">
                    {mode === "sign-in" ? "Bienvenido" : "Cambiar contraseña"}
                  </Text>
                  <Text className="mt-1 text-xs leading-5 text-muted">
                    {mode === "sign-in"
                      ? "Ingresa con tu cuenta para continuar a la operación."
                      : "Confirma tus credenciales actuales antes de crear una nueva contraseña."}
                  </Text>
                </View>
              </View>

              <Text className="mb-2 text-label font-semibold uppercase text-muted">
                Correo
              </Text>
              <View className="min-h-[58px] flex-row items-center rounded-2xl border border-line bg-white px-4">
                <Mail color={COLORS.muted} size={20} strokeWidth={1.8} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  placeholder="usuario@nissan.com"
                  placeholderTextColor={COLORS.muted}
                  className="ml-3 flex-1 py-4 text-base text-ink outline-none"
                  returnKeyType="next"
                />
              </View>

              <Text className="mb-2 mt-5 text-label font-semibold uppercase text-muted">
                {mode === "sign-in" ? "Contraseña" : "Contraseña actual"}
              </Text>
              <View className="min-h-[58px] flex-row items-center rounded-2xl border border-line bg-white px-4">
                <LockKeyhole color={COLORS.muted} size={20} strokeWidth={1.8} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  textContentType="password"
                  autoComplete="current-password"
                  placeholder={
                    mode === "sign-in"
                      ? "Ingresa tu contraseña"
                      : "Tu contraseña actual"
                  }
                  placeholderTextColor={COLORS.muted}
                  className="ml-3 flex-1 py-4 text-base text-ink outline-none"
                  returnKeyType={mode === "sign-in" ? "go" : "next"}
                  onSubmitEditing={() =>
                    mode === "sign-in" && canSubmit && void handleSubmit()
                  }
                />
                <Pressable
                  onPress={() => setShowPassword((value) => !value)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  className="ml-2 p-1 active:opacity-50"
                >
                  {showPassword ? (
                    <EyeOff color={COLORS.muted} size={20} />
                  ) : (
                    <Eye color={COLORS.muted} size={20} />
                  )}
                </Pressable>
              </View>

              {mode === "change-password" ? (
                <>
                  <Text className="mb-2 mt-5 text-label font-semibold uppercase text-muted">
                    Nueva contraseña
                  </Text>
                  <View className="min-h-[58px] flex-row items-center rounded-2xl border border-line bg-white px-4">
                    <LockKeyhole
                      color={COLORS.muted}
                      size={20}
                      strokeWidth={1.8}
                    />
                    <TextInput
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showNewPassword}
                      textContentType="newPassword"
                      autoComplete="new-password"
                      placeholder="Mínimo 8 caracteres"
                      placeholderTextColor={COLORS.muted}
                      className="ml-3 flex-1 py-4 text-base text-ink outline-none"
                      returnKeyType="next"
                      accessibilityLabel="Nueva contraseña"
                    />
                    <Pressable
                      onPress={() => setShowNewPassword((value) => !value)}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={
                        showNewPassword
                          ? "Ocultar nueva contraseña"
                          : "Mostrar nueva contraseña"
                      }
                      className="ml-2 p-1 active:opacity-50"
                    >
                      {showNewPassword ? (
                        <EyeOff color={COLORS.muted} size={20} />
                      ) : (
                        <Eye color={COLORS.muted} size={20} />
                      )}
                    </Pressable>
                  </View>

                  <Text className="mb-2 mt-5 text-label font-semibold uppercase text-muted">
                    Confirmar nueva contraseña
                  </Text>
                  <View className="min-h-[58px] flex-row items-center rounded-2xl border border-line bg-white px-4">
                    <Check color={COLORS.muted} size={20} strokeWidth={2} />
                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showNewPassword}
                      textContentType="newPassword"
                      autoComplete="new-password"
                      placeholder="Repite la nueva contraseña"
                      placeholderTextColor={COLORS.muted}
                      className="ml-3 flex-1 py-4 text-base text-ink outline-none"
                      returnKeyType="go"
                      onSubmitEditing={() =>
                        canSubmit && void handleChangePassword()
                      }
                      accessibilityLabel="Confirmar nueva contraseña"
                    />
                  </View>
                  {newPassword.length > 0 && newPassword !== confirmPassword ? (
                    <Text className="mt-2 text-xs font-medium text-v1">
                      Las contraseñas no coinciden.
                    </Text>
                  ) : null}
                </>
              ) : null}

              {error ? (
                <View className="mt-4 rounded-xl border border-v1/20 bg-v1/5 px-4 py-3">
                  <Text className="text-sm font-medium leading-5 text-v1">
                    {error}
                  </Text>
                </View>
              ) : null}

              {notice ? (
                <View className="mt-4 flex-row items-center gap-2 rounded-xl border border-synced/20 bg-synced/5 px-4 py-3">
                  <CheckCircle2
                    color={COLORS.synced}
                    size={18}
                    strokeWidth={2.3}
                  />
                  <Text className="flex-1 text-sm font-medium leading-5 text-synced">
                    {notice}
                  </Text>
                </View>
              ) : null}

              <View className="my-5 self-start flex-row items-center py-1">
                <View className="h-5 w-5 items-center justify-center rounded-md border border-primary bg-primary">
                  <Check color={COLORS.white} size={14} strokeWidth={3} />
                </View>
                <Text className="ml-2.5 text-sm text-muted">
                  Sesión segura en este dispositivo
                </Text>
              </View>

              <Pressable
                onPress={() =>
                  void (mode === "sign-in"
                    ? handleSubmit()
                    : handleChangePassword())
                }
                disabled={!canSubmit}
                className="min-h-[58px] items-center justify-center rounded-2xl bg-primary active:opacity-85 disabled:opacity-40"
                style={{
                  shadowColor: COLORS.primary,
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: canSubmit ? 0.24 : 0,
                  shadowRadius: 14,
                  elevation: canSubmit ? 4 : 0,
                }}
              >
                {busy ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text className="text-base font-bold text-white">
                    {mode === "sign-in"
                      ? "Iniciar sesión"
                      : "Actualizar contraseña"}
                  </Text>
                )}
              </Pressable>

              {mode === "sign-in" ? (
                <View className="mt-5 items-center gap-3">
                  <Text className="text-center text-xs leading-5 text-muted">
                    El acceso es proporcionado por tu administrador de planta.
                  </Text>
                  <Pressable
                    onPress={openPasswordChange}
                    className="min-h-[40px] justify-center px-3 active:opacity-60"
                  >
                    <Text className="text-sm font-bold text-primary">
                      Cambiar contraseña
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={openSignIn}
                  className="mt-5 min-h-[40px] flex-row items-center justify-center gap-2 active:opacity-60"
                >
                  <ArrowLeft
                    color={COLORS.primary}
                    size={16}
                    strokeWidth={2.5}
                  />
                  <Text className="text-sm font-bold text-primary">
                    Volver a iniciar sesión
                  </Text>
                </Pressable>
              )}
            </View>

            {mode === "sign-in" ? (
              <View className="mt-5">
                {demoOpen ? (
                  <View className="rounded-[24px] border border-line bg-white p-5">
                    <View className="mb-4 flex-row items-center justify-between">
                      <View>
                        <Text className="text-base font-bold text-ink">
                          Acceso de demostración
                        </Text>
                        <Text className="mt-1 text-xs text-muted">
                          Selecciona un perfil de prueba
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setDemoOpen(false)}
                        className="px-2 py-2"
                      >
                        <Text className="text-sm font-bold text-primary">
                          Cerrar
                        </Text>
                      </Pressable>
                    </View>
                    <View className="flex-row flex-wrap gap-2">
                      {DEMO_ROLES.map((role) => (
                        <Pressable
                          key={role.id}
                          onPress={() => void enterDemo(role.id)}
                          disabled={busy}
                          className="min-h-[66px] flex-1 basis-[46%] justify-center rounded-2xl border border-line bg-canvas/60 px-4 active:border-primary active:bg-primary/5 disabled:opacity-40"
                        >
                          <Text className="text-sm font-bold text-ink">
                            {role.label}
                          </Text>
                          <Text className="mt-1 text-[11px] text-muted">
                            {role.hint}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setDemoOpen(true)}
                    className="min-h-[48px] items-center justify-center active:opacity-60"
                  >
                    <Text className="text-sm font-bold text-primary">
                      Explorar en modo demo
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
