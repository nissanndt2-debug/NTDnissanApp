import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ScanLine } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { PREF_KEYS, getPref, setPref } from '@/data/prefs';
import { createUnit, discardUnit } from '@/data/units';
import { ROLE_IDS, VIN_LENGTH, VIN_REGEX, normalizeVin, type Grade } from '@/domain/constants';
import { OFF_DIAGRAM_ZONES, findingLabel, zoneCode, zoneLabel } from '@/domain/zones';
import { DamageSheet, type DraftDefect } from '@/ui/DamageSheet';
import { SyncBadge } from '@/ui/SyncBadge';
import { COLORS, GRADE_BG } from '@/ui/theme';
import { VehicleDiagram } from '@/ui/VehicleDiagram';

/**
 * Captura de una unidad. Objetivo: menos de 60 s, sin scroll obligatorio.
 *
 * La pantalla es una sola vista con tres bandas fijas:
 *   1. identidad  — VIN (escaner primero, teclado como excepcion)
 *   2. esquema    — donde ocurre el trabajo real
 *   3. dock       — el guardado, siempre visible y siempre en el mismo pixel
 *
 * Lo que NO esta aqui, a proposito:
 *   - campos de carril y mercado: se recuerdan del ultimo reporte y viven como
 *     chips; se tocan solo al cambiar de sitio
 *   - dialogo de confirmacion al guardar: se sustituye por Deshacer, que cuesta
 *     cero toques cuando todo salio bien (el 99% de las veces)
 */

const MARKETS = ['Domestico', 'Exportacion', 'Traslado'];

export default function ReportarScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();

  const [vin, setVin] = useState('');
  const [market, setMarket] = useState(MARKETS[0]);
  const [lane, setLane] = useState('');
  const [defects, setDefects] = useState<DraftDefect[]>([]);
  const [activeZone, setActiveZone] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [vinManual, setVinManual] = useState(false);
  const [laneEditor, setLaneEditor] = useState(false);
  const [laneDraft, setLaneDraft] = useState('');
  const [saved, setSaved] = useState<{ vin: string; localId: string } | null>(null);

  // Valores por defecto del turno anterior: el operador no vuelve a teclearlos.
  useEffect(() => {
    void (async () => {
      const [savedLane, savedMarket] = await Promise.all([
        getPref(PREF_KEYS.lane),
        getPref(PREF_KEYS.market),
      ]);
      if (savedLane) setLane(savedLane);
      if (savedMarket) setMarket(savedMarket);
    })();
  }, []);

  const vinValid = VIN_REGEX.test(vin);
  const canSubmit = vinValid && lane.trim().length > 0 && defects.length > 0;

  const marks = defects.reduce<Record<string, Grade[]>>((acc, defect) => {
    acc[defect.zoneId] = [...(acc[defect.zoneId] ?? []), defect.grade];
    return acc;
  }, {});

  const addDefect = (defect: Omit<DraftDefect, 'key' | 'zoneId'>) => {
    if (!activeZone) return;
    setDefects((prev) => [
      ...prev,
      { ...defect, key: `${Date.now()}-${prev.length}`, zoneId: activeZone },
    ]);
    setActiveZone(null);
  };

  const removeDefect = (key: string) => {
    setDefects((prev) => prev.filter((defect) => defect.key !== key));
  };

  const handleSubmit = async () => {
    if (!user || !canSubmit) return;

    const localId = await createUnit({
      vin,
      market,
      lane: lane.trim(),
      registeredById: user.id,
      registeredByName: user.name,
      plant: user.plant ?? null,
      // WWS reporta directo en SENT; el resto entra en REPORTED.
      initialStatus: user.roleId === ROLE_IDS.WWS ? 'SENT' : 'REPORTED',
      defects: defects.map((defect) => ({
        type: `${defect.typeId} - ${findingLabel(defect.typeId)}`,
        // Codigo estable, no solo la etiqueta: agrupar por zona en SQL o en
        // el backend no depende de que el texto no cambie nunca.
        zone: zoneCode(defect.zoneId),
        grade: defect.grade,
        // Queda en `pending_photos` solo si el hallazgo trajo foto; el motor
        // la sube cuando haya red. Ausente para hallazgos que no la piden.
        photoUri: defect.photoUri,
      })),
    });

    await Promise.all([
      setPref(PREF_KEYS.lane, lane.trim()),
      setPref(PREF_KEYS.market, market),
    ]);

    setSaved({ vin, localId });
    setVin('');
    setDefects([]);
    setVinManual(false);
    void queryClient.invalidateQueries();
    setTimeout(() => setSaved(null), 6000);
  };

  const undoSave = async () => {
    if (!saved) return;
    await discardUnit(saved.localId);
    setVin(saved.vin);
    setSaved(null);
    void queryClient.invalidateQueries();
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setVinManual(true);
        return;
      }
    }
    setScannerOpen(true);
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      {/* 1. Identidad de la unidad */}
      <View className="bg-ink px-4 pb-4 pt-2">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-white">Reportar</Text>
          <SyncBadge onDark />
        </View>

        {vinValid && !vinManual ? (
          <Pressable
            onPress={() => setVinManual(true)}
            className="min-h-[56px] flex-row items-center justify-between rounded-2xl border border-white/15 bg-white/10 px-4"
          >
            <View>
              <Text className="text-label uppercase text-white/50">VIN</Text>
              <Text className="font-mono text-base font-bold text-white">{vin}</Text>
            </View>
            <Text className="text-sm font-bold text-white/70">Cambiar</Text>
          </Pressable>
        ) : (
          <View>
            <View className="flex-row gap-2">
              <Pressable
                onPress={openScanner}
                className="min-h-[56px] flex-[2] flex-row items-center justify-center gap-2 rounded-2xl bg-primary active:opacity-80"
              >
                <ScanLine color={COLORS.white} size={20} strokeWidth={2} />
                <Text className="text-base font-bold text-white">Escanear VIN</Text>
              </Pressable>
              <View className="min-h-[56px] flex-[3] justify-center rounded-2xl border border-white/15 bg-white/10 px-4">
                <TextInput
                  value={vin}
                  onChangeText={(text) => setVin(normalizeVin(text))}
                  autoCapitalize="characters"
                  placeholder="o teclealo"
                  placeholderTextColor="#8A97A8"
                  className="font-mono text-base font-bold text-white"
                />
              </View>
            </View>
            <Text
              className={`mt-1.5 text-label uppercase ${
                vinValid ? 'text-synced' : vin.length > 0 ? 'text-v2' : 'text-white/40'
              }`}
            >
              {vin.length}/{VIN_LENGTH} caracteres
            </Text>
          </View>
        )}

        {/* Contexto recordado: se toca solo si cambio */}
        <View className="mt-3 flex-row gap-2">
          <Pressable
            onPress={() => {
              setLaneDraft(lane);
              setLaneEditor(true);
            }}
            className="min-h-[44px] flex-1 justify-center rounded-xl border border-white/15 px-3"
          >
            <Text className="text-label uppercase text-white/50">Carril</Text>
            <Text className="text-sm font-bold text-white">
              {lane.trim() || 'Sin definir'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              setMarket((prev) => MARKETS[(MARKETS.indexOf(prev) + 1) % MARKETS.length])
            }
            className="min-h-[44px] flex-1 justify-center rounded-xl border border-white/15 px-3"
          >
            <Text className="text-label uppercase text-white/50">Mercado</Text>
            <Text className="text-sm font-bold text-white">{market}</Text>
          </Pressable>
        </View>
      </View>

      {/* 2. El esquema: donde se trabaja */}
      <ScrollView contentContainerClassName="px-4 pb-40 pt-3">
        <Text className="mb-1 text-label uppercase text-muted">
          Toca la parte danada
        </Text>

        <View className="rounded-3xl border border-line bg-surface p-3">
          <View className="h-[420px] w-full">
            <VehicleDiagram
              marks={marks}
              selectedZone={activeZone}
              onSelectZone={setActiveZone}
            />
          </View>
        </View>

        <Text className="mb-2 mt-4 text-label uppercase text-muted">
          No se ve desde arriba
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {OFF_DIAGRAM_ZONES.map((zone) => {
            const count = marks[zone.id]?.length ?? 0;
            return (
              <Pressable
                key={zone.id}
                onPress={() => setActiveZone(zone.id)}
                className={`min-h-[48px] flex-1 basis-[46%] flex-row items-center justify-center gap-2 rounded-2xl border-2 bg-surface ${
                  count > 0 ? 'border-ink' : 'border-line'
                }`}
              >
                <Text className="text-base font-bold text-ink">{zone.label}</Text>
                {count > 0 ? (
                  <View className="h-6 w-6 items-center justify-center rounded-full bg-ink">
                    <Text className="text-xs font-bold text-white">{count}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {defects.length > 0 ? (
          <>
            <Text className="mb-2 mt-5 text-label uppercase text-muted">
              Danos capturados ({defects.length})
            </Text>
            {defects.map((defect) => (
              <View
                key={defect.key}
                className="mb-2 flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-2"
              >
                {/* La miniatura es la prueba de que la evidencia existe.
                    No todos los hallazgos la piden (p.ej. equipo faltante). */}
                {defect.photoUri ? (
                  <Image
                    source={{ uri: defect.photoUri }}
                    className="h-14 w-14 rounded-xl bg-canvas"
                  />
                ) : (
                  <View className="h-14 w-14 items-center justify-center rounded-xl bg-canvas">
                    <Text className="text-[9px] font-semibold text-muted">Sin foto</Text>
                  </View>
                )}
                <View
                  className={`h-10 w-10 items-center justify-center rounded-xl ${
                    GRADE_BG[defect.grade]
                  }`}
                >
                  <Text className="text-xs font-bold text-white">{defect.grade}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-ink">
                    {findingLabel(defect.typeId)}
                  </Text>
                  <Text className="text-xs text-muted">{zoneLabel(defect.zoneId)}</Text>
                </View>
                <Pressable
                  onPress={() => removeDefect(defect.key)}
                  hitSlop={10}
                  className="min-h-[44px] justify-center px-3"
                >
                  <Text className="text-sm font-bold text-primary">Quitar</Text>
                </Pressable>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

      {/* 3. Dock: el guardado nunca se mueve de sitio */}
      <View className="absolute bottom-0 left-0 right-0 border-t border-line bg-surface px-4 pb-6 pt-3">
        {saved ? (
          <View className="mb-2 flex-row items-center gap-3 rounded-2xl bg-ink px-4 py-3">
            <View className="flex-1">
              <Text className="text-sm font-bold text-white">Unidad guardada</Text>
              <Text className="font-mono text-xs text-white/60">{saved.vin}</Text>
            </View>
            <Pressable
              onPress={() => void undoSave()}
              hitSlop={8}
              className="min-h-[44px] justify-center px-2"
            >
              <Text className="text-sm font-bold text-white underline">Deshacer</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
          className={`min-h-[60px] flex-row items-center justify-center gap-3 rounded-2xl ${
            canSubmit ? 'bg-synced active:opacity-80' : 'bg-canvas'
          }`}
        >
          <Text
            className={`text-lg font-bold ${canSubmit ? 'text-white' : 'text-muted'}`}
          >
            {canSubmit
              ? `Guardar unidad · ${defects.length} dano${defects.length === 1 ? '' : 's'}`
              : !vinValid
                ? 'Falta el VIN'
                : lane.trim().length === 0
                  ? 'Falta el carril'
                  : 'Toca una parte del vehiculo'}
          </Text>
        </Pressable>
      </View>

      <DamageSheet
        zoneId={activeZone}
        defects={defects}
        onAdd={addDefect}
        onRemove={removeDefect}
        onClose={() => setActiveZone(null)}
      />

      {/* Carril: teclado numerico, un solo campo, se cierra al aceptar */}
      <Modal visible={laneEditor} animationType="fade" transparent>
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="w-full rounded-3xl bg-surface p-5">
            <Text className="text-label uppercase text-muted">Carril</Text>
            <TextInput
              value={laneDraft}
              onChangeText={setLaneDraft}
              autoFocus
              placeholder="Ej. 12"
              className="mt-2 min-h-[56px] rounded-2xl border-2 border-line px-4 text-lg font-bold text-ink"
            />
            <Text className="mt-2 text-xs text-muted">
              Se recuerda para los siguientes reportes del turno.
            </Text>
            <View className="mt-4 flex-row gap-2">
              <Pressable
                onPress={() => setLaneEditor(false)}
                className="min-h-[56px] flex-1 items-center justify-center rounded-2xl bg-canvas"
              >
                <Text className="text-base font-bold text-ink">Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setLane(laneDraft);
                  setLaneEditor(false);
                }}
                className="min-h-[56px] flex-1 items-center justify-center rounded-2xl bg-primary"
              >
                <Text className="text-base font-bold text-white">Guardar carril</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Escaner */}
      <Modal visible={scannerOpen} animationType="slide">
        <View className="flex-1 bg-black">
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ['code39', 'code128', 'qr', 'pdf417'] }}
            onBarcodeScanned={({ data }) => {
              setVin(normalizeVin(data));
              setVinManual(false);
              setScannerOpen(false);
            }}
          />
          <SafeAreaView edges={['bottom']} className="bg-black px-6 py-4">
            <Text className="mb-3 text-center text-sm text-white/70">
              Apunta al codigo del VIN
            </Text>
            <Pressable
              onPress={() => setScannerOpen(false)}
              className="min-h-[56px] items-center justify-center rounded-2xl bg-white/20"
            >
              <Text className="text-base font-bold text-white">Cancelar</Text>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
