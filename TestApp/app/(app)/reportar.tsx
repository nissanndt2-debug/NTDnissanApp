import { useQueryClient } from "@tanstack/react-query";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  CheckCircle2,
  CirclePlus,
  MapPin,
  ScanLine,
  ShieldCheck,
  Truck,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { PREF_KEYS, getPref, setPref } from "@/data/prefs";
import { createUnit, discardUnit } from "@/data/units";
import {
  ROLE_IDS,
  VIN_LENGTH,
  VIN_REGEX,
  normalizeVin,
  type Grade,
} from "@/domain/constants";
import {
  OFF_DIAGRAM_ZONES,
  findingLabel,
  zoneCode,
  zoneLabel,
} from "@/domain/zones";
import { DamageSheet, type DraftDefect } from "@/ui/DamageSheet";
import { COLORS, GRADE_BG } from "@/ui/theme";
import { VehicleDiagram } from "@/ui/VehicleDiagram";

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

const MARKETS = ["Domestico", "Exportacion", "Traslado"];

export default function ReportarScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();
  const { width } = useWindowDimensions();

  const [vin, setVin] = useState("");
  const [market, setMarket] = useState(MARKETS[0]);
  const [lane, setLane] = useState("");
  const [defects, setDefects] = useState<DraftDefect[]>([]);
  const [activeZone, setActiveZone] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [vinManual, setVinManual] = useState(false);
  const [laneEditor, setLaneEditor] = useState(false);
  const [laneDraft, setLaneDraft] = useState("");
  const [saved, setSaved] = useState<{
    vin: string;
    localId: string;
    photoCount: number;
  } | null>(null);

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
  const isWideLayout = width >= 760;

  const marks = defects.reduce<Record<string, Grade[]>>((acc, defect) => {
    acc[defect.zoneId] = [...(acc[defect.zoneId] ?? []), defect.grade];
    return acc;
  }, {});

  const addDefect = (defect: Omit<DraftDefect, "key" | "zoneId">) => {
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
      initialStatus: user.roleId === ROLE_IDS.WWS ? "SENT" : "REPORTED",
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

    setSaved({
      vin,
      localId,
      photoCount: defects.filter((defect) => Boolean(defect.photoUri)).length,
    });
    setVin("");
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
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      {/* Solo identificación arriba: el vehículo debe dominar la pantalla. */}
      <View className="bg-ink px-4 pb-3 pt-1">
        {vinValid && !vinManual ? (
          <Pressable
            onPress={() => setVinManual(true)}
            className="min-h-[60px] flex-row items-center justify-between rounded-2xl border border-synced/50 bg-synced/10 px-4 active:opacity-80"
          >
            <View className="flex-row items-center gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-synced/20">
                <CheckCircle2 color={COLORS.white} size={20} strokeWidth={2.4} />
              </View>
              <View>
                <Text className="text-[10px] font-bold uppercase tracking-wide text-synced">VIN</Text>
                <Text selectable className="font-mono text-base font-bold text-white">
                  {vin}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center gap-1.5">
              <ScanLine color={COLORS.white} size={17} strokeWidth={2.3} />
              <Text className="text-xs font-bold text-white">Cambiar</Text>
            </View>
          </Pressable>
        ) : (
          <View>
            <View className="flex-row gap-2">
              <Pressable
                onPress={openScanner}
                className="min-h-[64px] flex-[2] flex-row items-center justify-center gap-2 rounded-2xl bg-primary active:opacity-80"
              >
                <ScanLine color={COLORS.white} size={21} strokeWidth={2.2} />
                <Text className="text-sm font-bold text-white">
                  Escanear VIN
                </Text>
              </Pressable>
              <View className="min-h-[64px] flex-[3] justify-center rounded-2xl border border-white/15 bg-white/10 px-6">
                <Text className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-white/45">Manual</Text>
                <TextInput
                  value={vin}
                  onChangeText={(text) => setVin(normalizeVin(text))}
                  autoCapitalize="characters"
                  placeholder="VIN"
                  placeholderTextColor="#8A97A8"
                  className="font-mono text-sm font-bold text-white"
                />
              </View>
            </View>
            <Text
              className={`mt-1.5 text-label uppercase ${
                vinValid
                  ? "text-synced"
                  : vin.length > 0
                    ? "text-v2"
                    : "text-white/40"
              }`}
            >
            </Text>
          </View>
        )}

      </View>
  

      {/* El vehículo es el selector principal, no una lista larga. */}
      <ScrollView
        className="flex-1"
        contentContainerClassName={`w-full max-w-[1180px] self-center px-2 pt-2 ${
          isWideLayout ? "pb-6" : defects.length > 0 || saved ? "pb-72" : "pb-6"
        }`}
      >
        <View className="mb-2 flex-row items-center justify-between gap-3 px-2">
          <View className="flex-1">
            <Text className="text-base font-bold text-ink">Selecciona la zona dañada</Text>
            <Text className="mt-0.5 text-xs text-muted">Toca el vehículo. Zonas amplias para usar con guantes.</Text>
          </View>
          <View className="min-w-[46px] items-center rounded-xl bg-ink px-2 py-1.5">
            <Text className="text-base font-bold text-white">{defects.length}</Text>
            <Text className="text-[8px] font-bold uppercase tracking-wide text-white/60">daños</Text>
          </View>
        </View>

        <View className="overflow-hidden rounded-3xl border border-line bg-surface p-1.5" style={{ boxShadow: "0 2px 8px rgba(15, 22, 32, 0.05)" }}>
          <View className="w-full rounded-[22px] bg-canvas px-1 py-1" style={{ height: isWideLayout ? 680 : 620 }}>
            <VehicleDiagram
              marks={marks}
              selectedZone={activeZone}
              onSelectZone={setActiveZone}
            />
          </View>
        </View>
         {/* Datos secundarios fuera de la cabecera: se usan solo si cambian. */}
        <View className="mb-2 mt-5 flex-row items-center gap-2">
          <ShieldCheck color={COLORS.muted} size={15} strokeWidth={2.2} />
          <Text className="text-label font-bold uppercase text-muted">Datos del reporte</Text>
        </View>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => {
              setLaneDraft(lane);
              setLaneEditor(true);
            }}
            className="min-h-[58px] flex-1 rounded-2xl border border-line bg-surface px-3 py-2 active:bg-canvas"
          >
            <View className="flex-row items-center gap-1.5">
              <MapPin color={COLORS.primary} size={14} strokeWidth={2.3} />
              <Text className="text-label uppercase text-muted">Carril</Text>
            </View>
            <Text className="mt-1 text-sm font-bold text-ink">{lane.trim() || "Definir carril"}</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              setMarket(
                (prev) => MARKETS[(MARKETS.indexOf(prev) + 1) % MARKETS.length],
              )
            }
            className="min-h-[58px] flex-1 rounded-2xl border border-line bg-surface px-3 py-2 active:bg-canvas"
          >
            <View className="flex-row items-center gap-1.5">
              <Truck color={COLORS.primary} size={15} strokeWidth={2.2} />
              <Text className="text-label uppercase text-muted">Mercado</Text>
            </View>
            <Text className="mt-1 text-sm font-bold text-ink" numberOfLines={1}>{market}</Text>
          </Pressable>
        </View>

        <View className="mb-2 mt-5 flex-row items-center justify-between">
          
          <View>
            <Text className="text-label font-bold uppercase text-muted">Otras revisiones</Text>
            <Text className="mt-0.5 text-xs text-muted">No aparecen en la vista superior</Text>
          </View>
          <CirclePlus color={COLORS.primary} size={21} strokeWidth={2.2} />
        </View>
        <View className="flex-row flex-wrap gap-2">
          {OFF_DIAGRAM_ZONES.map((zone) => {
            const count = marks[zone.id]?.length ?? 0;
            return (
              <Pressable
                key={zone.id}
                onPress={() => setActiveZone(zone.id)}
                className={`min-h-[60px] flex-1 basis-[46%] flex-row items-center justify-between rounded-2xl border bg-surface px-3 active:bg-canvas ${
                  count > 0 ? "border-ink bg-ink/5" : "border-line"
                }`}
              >
                <View className="flex-1 pr-2">
                  <Text className="text-[10px] font-bold uppercase tracking-wide text-primary">{zone.code}</Text>
                  <Text className="mt-0.5 text-sm font-bold text-ink" numberOfLines={1}>{zone.label}</Text>
                </View>
                {count > 0 ? (
                  <View className="h-7 min-w-[28px] items-center justify-center rounded-full bg-ink px-1.5">
                    <Text className="text-[11px] font-bold text-white">
                      {count}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {defects.length > 0 ? (
          <>
            <View className="mb-2 mt-5 flex-row items-center justify-between">
              <View>
                <Text className="text-label font-bold uppercase text-primary">Resumen del reporte</Text>
                <Text className="mt-0.5 text-xs text-muted">Revisa o elimina un hallazgo antes de registrar</Text>
              </View>
              <View className="rounded-full bg-ink px-2.5 py-1">
                <Text className="text-[11px] font-bold text-white">{defects.length} capturados</Text>
              </View>
            </View>
            {defects.map((defect) => (
              <View
                key={defect.key}
                className="mb-2 flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-3"
              >
                {/* La miniatura es la prueba de que la evidencia existe.
                    No todos los hallazgos la piden (p.ej. equipo faltante). */}
                {defect.photoUri ? (
                  <Image
                    source={{ uri: defect.photoUri }}
                    className="h-14 w-14 rounded-2xl bg-canvas"
                  />
                ) : (
                  <View className="h-14 w-14 items-center justify-center rounded-2xl bg-canvas">
                    <Text className="text-[9px] font-semibold text-muted">
                      Sin foto
                    </Text>
                  </View>
                )}
                <View
                  className={`h-10 w-10 items-center justify-center rounded-xl ${
                    GRADE_BG[defect.grade]
                  }`}
                >
                  <Text className="text-xs font-bold text-white">
                    {defect.grade}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-ink">
                    {findingLabel(defect.typeId)}
                  </Text>
                  <Text className="text-xs text-muted">
                    {zoneLabel(defect.zoneId)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => removeDefect(defect.key)}
                  hitSlop={10}
                  className="min-h-[40px] justify-center rounded-xl bg-primary/10 px-3 active:bg-primary/15"
                >
                  <Text className="text-sm font-bold text-primary">Quitar</Text>
                </Pressable>
              </View>
            ))}
          </>
        ) : (
          <View className="mt-5 flex-row items-center gap-3 rounded-3xl border border-dashed border-line bg-surface px-4 py-4">
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
              <CirclePlus color={COLORS.primary} size={22} strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-ink">Aún no hay daños capturados</Text>
              <Text className="mt-0.5 text-xs leading-5 text-muted">
                Toca una zona para seleccionar el hallazgo y agregar evidencia.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Paso final fijo: el operador siempre sabe cómo terminar el reporte. */}
      {isWideLayout || defects.length > 0 || saved ? (
      <View
        className={`border-t border-line bg-surface px-4 pb-5 pt-3 ${
          isWideLayout ? "" : "absolute bottom-[104px] left-0 right-0"
        }`}
        style={{ boxShadow: "0 -8px 18px rgba(15, 22, 32, 0.08)" }}
      >
        {saved ? (
          <View className="mb-2 flex-row items-center gap-3 rounded-2xl bg-ink px-4 py-3">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <CheckCircle2 color={COLORS.white} size={22} strokeWidth={2.4} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-white">
                Unidad guardada
              </Text>
              <Text selectable className="font-mono text-xs text-white/60">
                {saved.vin}
              </Text>
              {saved.photoCount > 0 ? (
                <Text className="mt-1 text-[11px] leading-4 text-white/70">
                  {saved.photoCount} foto{saved.photoCount === 1 ? "" : "s"} en
                  cola: se confirma al sincronizar.
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => void undoSave()}
              hitSlop={8}
              className="min-h-[44px] justify-center px-2"
            >
              <Text className="text-sm font-bold text-white underline">
                Deshacer
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View className="mb-2 flex-row items-center justify-between px-1">
          <Text className="text-xs font-semibold text-muted">
            {canSubmit
              ? `${defects.length} daño${defects.length === 1 ? "" : "s"} listo${defects.length === 1 ? "" : "s"} para registrar`
              : !vinValid
                ? "Primero identifica la unidad"
                : lane.trim().length === 0
                  ? "Define el carril para continuar"
                  : "Selecciona la zona y el hallazgo"}
          </Text>
          <Text className={`text-[11px] font-bold ${canSubmit ? "text-synced" : "text-muted"}`}>
            Paso 3 de 3
          </Text>
        </View>

        <Pressable
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
          className={`min-h-[62px] flex-row items-center justify-center gap-3 rounded-2xl ${
            canSubmit ? "bg-synced active:opacity-80" : "bg-canvas"
          }`}
        >
          <CheckCircle2
            color={canSubmit ? COLORS.white : COLORS.muted}
            size={23}
            strokeWidth={2.4}
          />
          <Text
            className={`text-lg font-bold ${canSubmit ? "text-white" : "text-muted"}`}
          >
            {canSubmit
              ? `Guardar unidad · ${defects.length} dano${defects.length === 1 ? "" : "s"}`
              : !vinValid
                ? "Completa el VIN"
                : lane.trim().length === 0
                  ? "Completa el carril"
                  : "Agrega un hallazgo"}
          </Text>
        </Pressable>
      </View>
      ) : null}

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
                <Text className="text-base font-bold text-white">
                  Guardar carril
                </Text>
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
            barcodeScannerSettings={{
              barcodeTypes: ["code39", "code128", "qr", "pdf417"],
            }}
            onBarcodeScanned={({ data }) => {
              setVin(normalizeVin(data));
              setVinManual(false);
              setScannerOpen(false);
            }}
          />
          <SafeAreaView edges={["bottom"]} className="bg-black px-6 py-4">
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
