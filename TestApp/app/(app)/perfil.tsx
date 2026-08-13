import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, KeyRound, Pencil, Plus, Settings2, Trash2, UsersRound, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { auth, providers, unitModels, users } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { PLANTS, ROLE_IDS, ROLE_NAME_BY_ID, type Plant, type RoleId } from '@/domain/constants';
import type { ManagedUser, Provider, UnitModel } from '@/domain/types';
import { ActionButton } from '@/ui/ActionButton';
import { EmptyState, Screen } from '@/ui/Screen';
import { COLORS } from '@/ui/theme';

type AdminTab = 'users' | 'providers' | 'models';

const ROLE_OPTIONS = Object.values(ROLE_IDS) as RoleId[];

export default function PerfilScreen() {
  const { user, token } = useAuth();
  const isAdmin = user?.roleId === ROLE_IDS.ADMIN;
  const [tab, setTab] = useState<AdminTab>('users');

  return (
    <Screen title="Perfil y seguridad" subtitle="Cuenta, catálogos y acceso" centerLogo syncInHeader>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-4 pb-32 pt-3">
        <View className="mx-auto w-full max-w-[1120px]">
          <PasswordCard token={token} />

          {isAdmin ? (
            <>
              <View className="mb-3 mt-6 flex-row items-center gap-3 px-1">
                <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                  <Settings2 color={COLORS.primary} size={20} strokeWidth={2.2} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-ink">Administración de planta</Text>
                  <Text className="mt-0.5 text-xs text-muted">
                    Mantén los catálogos y los accesos que usa la operación.
                  </Text>
                </View>
              </View>
              <AdminTabs tab={tab} onChange={setTab} />
              {tab === 'users' ? <UsersCatalog token={token} /> : null}
              {tab === 'providers' ? <ProvidersCatalog token={token} /> : null}
              {tab === 'models' ? <ModelsCatalog token={token} /> : null}
            </>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function PasswordCard({ token }: { token: string | null }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!token || newPassword.length < 8 || newPassword !== confirmPassword) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await auth.changePassword({ currentPassword, newPassword }, token);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Contraseña actualizada correctamente.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo actualizar la contraseña.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="overflow-hidden rounded-3xl border border-line bg-surface">
      <View className="flex-row items-start gap-3 p-4">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <KeyRound color={COLORS.primary} size={24} strokeWidth={2.1} />
        </View>
        <View className="flex-1">
          <Text className="text-label font-bold uppercase text-primary">Tu cuenta</Text>
          <Text className="mt-1 text-lg font-bold text-ink">Cambiar contraseña</Text>
          <Text className="mt-1 text-xs leading-5 text-muted">
            Usa al menos 8 caracteres y no compartas tu contraseña con otros operadores.
          </Text>
        </View>
      </View>
      <View className="border-t border-line bg-canvas/50 p-4">
        <Field label="Contraseña actual" value={currentPassword} onChangeText={setCurrentPassword} secure />
        <View className="mt-3 flex-row flex-wrap gap-3">
          <View className="min-w-[220px] flex-1">
            <Field label="Nueva contraseña" value={newPassword} onChangeText={setNewPassword} secure />
          </View>
          <View className="min-w-[220px] flex-1">
            <Field label="Confirmar nueva contraseña" value={confirmPassword} onChangeText={setConfirmPassword} secure />
          </View>
        </View>
        {newPassword.length > 0 && newPassword !== confirmPassword ? (
          <Text className="mt-2 text-xs font-medium text-v1">Las contraseñas no coinciden.</Text>
        ) : null}
        {error ? <Feedback message={error} danger /> : null}
        {message ? <Feedback message={message} /> : null}
        <View className="mt-4 max-w-[360px]">
          <ActionButton
            label="Actualizar contraseña"
            onPress={() => void submit()}
            busy={busy}
            disabled={!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword}
          />
        </View>
      </View>
    </View>
  );
}

function AdminTabs({ tab, onChange }: { tab: AdminTab; onChange: (tab: AdminTab) => void }) {
  const labels: { id: AdminTab; label: string }[] = [
    { id: 'users', label: 'Usuarios' },
    { id: 'providers', label: 'Proveedores' },
    { id: 'models', label: 'Modelos' },
  ];
  return (
    <View className="mb-4 flex-row gap-2 rounded-2xl bg-canvas p-1.5">
      {labels.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => onChange(item.id)}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === item.id }}
          className={`min-h-[44px] flex-1 items-center justify-center rounded-xl px-3 ${
            tab === item.id ? 'bg-primary' : 'active:bg-white'
          }`}
        >
          <Text className={`text-xs font-bold ${tab === item.id ? 'text-white' : 'text-muted'}`}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function UsersCatalog({ token }: { token: string | null }) {
  const queryClient = useQueryClient();
  const { data: list = [], isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => users.list(token!),
    enabled: Boolean(token),
  });
  const { data: providerList = [] } = useQuery({
    queryKey: ['admin', 'providers'],
    queryFn: () => providers.list(token!),
    enabled: Boolean(token),
  });
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState<RoleId>(ROLE_IDS.BODY);
  const [plant, setPlant] = useState<Plant>('A1');
  const [providerId, setProviderId] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEditing(null); setName(''); setEmail(''); setPassword(''); setRoleId(ROLE_IDS.BODY); setPlant('A1'); setProviderId(undefined); setError(null);
  };
  const edit = (item: ManagedUser) => {
    setEditing(item); setName(item.name); setEmail(item.email); setPassword(''); setRoleId(item.roleId); setPlant(item.plant ?? 'A1'); setProviderId(item.providerId ?? undefined); setError(null);
  };
  const save = async () => {
    if (!token || !name.trim() || !email.trim() || (!editing && password.length < 8)) return;
    setBusy(true); setError(null);
    try {
      const body = { name: name.trim(), email: email.trim(), roleId, plant, ...(providerId ? { providerId } : {}), ...(password ? { password } : {}) };
      if (editing) await users.update(editing.id, body, token);
      else await users.create({ ...body, password }, token);
      reset();
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar el usuario.');
    } finally { setBusy(false); }
  };
  const remove = async (item: ManagedUser) => {
    if (!token) return;
    setBusy(true); setError(null);
    try { await users.remove(item.id, token); await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo eliminar el usuario.'); }
    finally { setBusy(false); }
  };

  return (
    <CatalogShell title="Usuarios" description="Crea, edita o retira accesos de la aplicación.">
      <View className="rounded-2xl border border-line bg-canvas/50 p-4">
        <Text className="text-sm font-bold text-ink">{editing ? 'Editar usuario' : 'Nuevo usuario'}</Text>
        <View className="mt-3 flex-row flex-wrap gap-3">
          <View className="min-w-[200px] flex-1"><Field label="Nombre" value={name} onChangeText={setName} /></View>
          <View className="min-w-[200px] flex-1"><Field label="Correo" value={email} onChangeText={setEmail} autoCapitalize="none" /></View>
          <View className="min-w-[200px] flex-1"><Field label={editing ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'} value={password} onChangeText={setPassword} secure /></View>
        </View>
        <ChoiceRow label="Rol" values={ROLE_OPTIONS} selected={roleId} onSelect={setRoleId} render={(value) => ROLE_NAME_BY_ID[value]} />
        <ChoiceRow label="Planta" values={[...PLANTS]} selected={plant} onSelect={setPlant} render={(value) => value} />
        {roleId === ROLE_IDS.CARRIER ? (
          <ChoiceRow label="Proveedor" values={providerList.map((item) => item.id)} selected={providerId} onSelect={setProviderId} render={(value) => providerList.find((item) => item.id === value)?.name ?? String(value)} />
        ) : null}
        {error ? <Feedback message={error} danger /> : null}
        <View className="mt-4 flex-row flex-wrap gap-2">
          <View className="min-w-[220px] flex-1"><ActionButton label={editing ? 'Guardar cambios' : 'Crear usuario'} onPress={() => void save()} busy={busy} disabled={!name || !email || (!editing && password.length < 8)} /></View>
          {editing ? <View className="min-w-[140px]"><ActionButton label="Cancelar" variant="neutral" onPress={reset} compact /></View> : null}
        </View>
      </View>
      {isLoading ? <Text className="p-4 text-sm text-muted">Cargando usuarios…</Text> : null}
      {list.map((item) => <ManageRow key={item.id} title={item.name} detail={`${item.email} · ${ROLE_NAME_BY_ID[item.roleId]} · ${item.plant ?? 'Sin planta'}`} onEdit={() => edit(item)} onRemove={() => void remove(item)} />)}
      {!isLoading && list.length === 0 ? <EmptyState message="No hay usuarios registrados." /> : null}
    </CatalogShell>
  );
}

function ProvidersCatalog({ token }: { token: string | null }) {
  const queryClient = useQueryClient();
  const { data: list = [] } = useQuery({ queryKey: ['admin', 'providers'], queryFn: () => providers.list(token!), enabled: Boolean(token) });
  const [editing, setEditing] = useState<Provider | null>(null);
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const reset = () => { setEditing(null); setName(''); setCode(''); setError(null); };
  const save = async () => { if (!token || !name.trim()) return; setBusy(true); setError(null); try { const body = { name: name.trim(), ...(code.trim() ? { code: code.trim().toUpperCase() } : {}) }; if (editing) await providers.update(editing.id, body, token); else await providers.create(body, token); reset(); await queryClient.invalidateQueries({ queryKey: ['admin', 'providers'] }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar el proveedor.'); } finally { setBusy(false); } };
  const remove = async (item: Provider) => { if (!token) return; setBusy(true); try { await providers.remove(item.id, token); await queryClient.invalidateQueries({ queryKey: ['admin', 'providers'] }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo eliminar el proveedor.'); } finally { setBusy(false); } };
  return <CatalogShell title="Proveedores" description="Catálogo usado para asignar unidades y cuentas Carrier."><View className="rounded-2xl border border-line bg-canvas/50 p-4"><Text className="text-sm font-bold text-ink">{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</Text><View className="mt-3 flex-row flex-wrap gap-3"><View className="min-w-[220px] flex-1"><Field label="Nombre" value={name} onChangeText={setName} /></View><View className="min-w-[160px] flex-1"><Field label="Código (opcional)" value={code} onChangeText={setCode} autoCapitalize="characters" /></View></View>{error ? <Feedback message={error} danger /> : null}<View className="mt-4 flex-row gap-2"><View className="min-w-[220px] flex-1"><ActionButton label={editing ? 'Guardar proveedor' : 'Crear proveedor'} onPress={() => void save()} busy={busy} disabled={!name} /></View>{editing ? <View className="min-w-[140px]"><ActionButton label="Cancelar" variant="neutral" onPress={reset} compact /></View> : null}</View></View>{list.map((item) => <ManageRow key={item.id} title={item.name} detail={item.code ? `Código ${item.code}` : 'Sin código'} onEdit={() => { setEditing(item); setName(item.name); setCode(item.code ?? ''); }} onRemove={() => void remove(item)} />)}{list.length === 0 ? <EmptyState message="No hay proveedores registrados." /> : null}</CatalogShell>;
}

function ModelsCatalog({ token }: { token: string | null }) {
  const queryClient = useQueryClient();
  const { data: list = [] } = useQuery({ queryKey: ['admin', 'models'], queryFn: () => unitModels.list(token!), enabled: Boolean(token) });
  const [editing, setEditing] = useState<UnitModel | null>(null); const [code, setCode] = useState(''); const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const reset = () => { setEditing(null); setCode(''); setName(''); setError(null); };
  const save = async () => { if (!token || !code.trim() || !name.trim()) return; setBusy(true); setError(null); try { const body = { code: code.trim().toUpperCase(), name: name.trim() }; if (editing) await unitModels.update(editing.id, body, token); else await unitModels.create(body, token); reset(); await queryClient.invalidateQueries({ queryKey: ['admin', 'models'] }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar el modelo.'); } finally { setBusy(false); } };
  const toggle = async (item: UnitModel) => { if (!token) return; setBusy(true); try { await unitModels.update(item.id, { isActive: !item.isActive }, token); await queryClient.invalidateQueries({ queryKey: ['admin', 'models'] }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo actualizar el modelo.'); } finally { setBusy(false); } };
  return <CatalogShell title="Modelos" description="Catálogo de modelos para análisis y captura."><View className="rounded-2xl border border-line bg-canvas/50 p-4"><Text className="text-sm font-bold text-ink">{editing ? 'Editar modelo' : 'Nuevo modelo'}</Text><View className="mt-3 flex-row flex-wrap gap-3"><View className="min-w-[160px] flex-1"><Field label="Código" value={code} onChangeText={setCode} autoCapitalize="characters" /></View><View className="min-w-[220px] flex-[2]"><Field label="Nombre" value={name} onChangeText={setName} /></View></View>{error ? <Feedback message={error} danger /> : null}<View className="mt-4 flex-row gap-2"><View className="min-w-[220px] flex-1"><ActionButton label={editing ? 'Guardar modelo' : 'Crear modelo'} onPress={() => void save()} busy={busy} disabled={!code || !name} /></View>{editing ? <View className="min-w-[140px]"><ActionButton label="Cancelar" variant="neutral" onPress={reset} compact /></View> : null}</View></View>{list.map((item) => <ManageRow key={item.id} title={`${item.code} · ${item.name}`} detail={item.isActive ? 'Activo' : 'Inactivo'} muted={!item.isActive} onEdit={() => { setEditing(item); setCode(item.code); setName(item.name); }} onRemove={() => void toggle(item)} removeLabel={item.isActive ? 'Desactivar' : 'Activar'} />)}{list.length === 0 ? <EmptyState message="No hay modelos registrados." /> : null}</CatalogShell>;
}

function CatalogShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <View className="overflow-hidden rounded-3xl border border-line bg-surface"><View className="border-b border-line p-4"><Text className="text-lg font-bold text-ink">{title}</Text><Text className="mt-1 text-xs text-muted">{description}</Text></View><View className="gap-3 p-4">{children}</View></View>; }
function ManageRow({ title, detail, onEdit, onRemove, removeLabel = 'Eliminar', muted = false }: { title: string; detail: string; onEdit: () => void; onRemove: () => void; removeLabel?: string; muted?: boolean }) { return <View className={`flex-row items-center gap-3 rounded-2xl border p-3 ${muted ? 'border-line bg-canvas/50' : 'border-line bg-white'}`}><View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><UsersRound color={COLORS.primary} size={19} strokeWidth={2.1} /></View><View className="flex-1"><Text selectable className="text-sm font-bold text-ink">{title}</Text><Text selectable className="mt-0.5 text-xs text-muted">{detail}</Text></View><Pressable onPress={onEdit} accessibilityLabel={`Editar ${title}`} className="h-10 w-10 items-center justify-center rounded-xl bg-canvas active:opacity-70"><Pencil color={COLORS.ink} size={18} strokeWidth={2.1} /></Pressable><Pressable onPress={onRemove} accessibilityLabel={`${removeLabel} ${title}`} className="min-h-[40px] rounded-xl bg-v1/5 px-3 active:opacity-70"><Text className="text-xs font-bold text-v1">{removeLabel}</Text></Pressable></View>; }
function Field({ label, value, onChangeText, secure = false, autoCapitalize = 'sentences' }: { label: string; value: string; onChangeText: (value: string) => void; secure?: boolean; autoCapitalize?: 'none' | 'sentences' | 'characters' }) { return <><Text className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">{label}</Text><TextInput value={value} onChangeText={onChangeText} secureTextEntry={secure} autoCapitalize={autoCapitalize} className="min-h-[48px] rounded-xl border border-line bg-white px-3 text-sm text-ink" placeholderTextColor={COLORS.muted} /></>; }
function ChoiceRow<T extends string | number>({ label, values, selected, onSelect, render }: { label: string; values: T[]; selected: T | undefined; onSelect: (value: T) => void; render: (value: T) => string }) { return <View className="mt-3"><Text className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">{label}</Text><View className="flex-row flex-wrap gap-2">{values.map((value) => <Pressable key={String(value)} onPress={() => onSelect(value)} className={`min-h-[40px] justify-center rounded-xl px-3 ${selected === value ? 'bg-primary' : 'bg-white border border-line'}`}><Text className={`text-xs font-bold ${selected === value ? 'text-white' : 'text-ink'}`}>{render(value)}</Text></Pressable>)}</View></View>; }
function Feedback({ message, danger = false }: { message: string; danger?: boolean }) { return <View className={`mt-3 flex-row items-center gap-2 rounded-xl p-3 ${danger ? 'bg-v1/5' : 'bg-synced/10'}`}><Check color={danger ? COLORS.v1 : COLORS.synced} size={17} strokeWidth={2.4} /><Text className={`flex-1 text-xs font-medium ${danger ? 'text-v1' : 'text-synced'}`}>{message}</Text></View>; }
