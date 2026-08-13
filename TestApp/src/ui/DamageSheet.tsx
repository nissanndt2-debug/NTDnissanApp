import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Grade } from '@/domain/constants';
import { GRADES } from '@/domain/constants';
import {
  CATEGORY_LABEL,
  FINDING_BY_ID,
  defaultGradeFor,
  findingsForZone,
  isHourBearing,
  zoneLabel,
  type FindingType,
} from '@/domain/zones';
import { compressPhoto } from '@/media/photo';
import { GRADE_BG } from './theme';

export interface DraftDefect {
  key: string;
  zoneId: string;
  typeId: string;
  grade: Grade;
  /** Ruta local de la foto. Ausente cuando el tipo de hallazgo no la pide. */
  photoUri?: string;
}

type Step = 'tipo' | 'severidad' | 'foto';

/**
 * Hoja de captura de una zona: tipo -> severidad (si aplica) -> foto (si aplica).
 *
 * El tipo va primero porque determina todo lo demas: un "gato faltante" no
 * tiene severidad de carroceria ni necesita foto, mientras que una
 * "corrosion" fija su severidad sola y siempre pide evidencia. Preguntar algo
 * que el tipo ya resuelve es el toque que este diseno evita.
 *
 * El catalogo que decide que aparece en cada zona vive en `domain/zones.ts`,
 * no aqui: este componente solo ejecuta el flujo, no conoce el contenido.
 */
export function DamageSheet({
  zoneId,
  defects,
  onAdd,
  onRemove,
  onClose,
}: {
  zoneId: string | null;
  defects: DraftDefect[];
  onAdd: (defect: Omit<DraftDefect, 'key' | 'zoneId'>) => void;
  onRemove: (key: string) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>('tipo');
  const [showMore, setShowMore] = useState(false);
  const [selected, setSelected] = useState<FindingType | null>(null);
  const [grade, setGrade] = useState<Grade>('V2');
  const [busy, setBusy] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const inZone = defects.filter((defect) => defect.zoneId === zoneId);
  const menu = zoneId ? findingsForZone(zoneId) : { primary: [], secondary: [] };

  // Cada apertura empieza limpia: la zona anterior no arrastra su seleccion.
  useEffect(() => {
    if (zoneId) {
      setStep('tipo');
      setShowMore(false);
      setSelected(null);
    }
  }, [zoneId]);

  const finish = (finding: FindingType, finalGrade: Grade, photoUri?: string) => {
    onAdd({ typeId: finding.id, grade: finalGrade, photoUri });
  };

  const goToPhotoOrFinish = (finding: FindingType, finalGrade: Grade) => {
    if (finding.requiresPhoto === 'never') {
      finish(finding, finalGrade);
      return;
    }
    setStep('foto');
  };

  const selectType = (finding: FindingType) => {
    setSelected(finding);
    if (finding.mandatoryRepair) {
      setGrade('V1');
      goToPhotoOrFinish(finding, 'V1');
      return;
    }
    if (isHourBearing(finding.category)) {
      setGrade(defaultGradeFor(finding));
      setStep('severidad');
      return;
    }
    const placeholder = defaultGradeFor(finding);
    setGrade(placeholder);
    goToPhotoOrFinish(finding, placeholder);
  };

  const confirmSeveridad = () => {
    if (!selected) return;
    goToPhotoOrFinish(selected, grade);
  };

  const goBack = () => {
    if (step === 'severidad') {
      setStep('tipo');
      return;
    }
    if (step === 'foto') {
      if (selected && !selected.mandatoryRepair && isHourBearing(selected.category)) {
        setStep('severidad');
      } else {
        setStep('tipo');
      }
      return;
    }
    onClose();
  };

  const shoot = async (skip: boolean) => {
    if (!selected || busy) return;
    if (skip) {
      finish(selected, grade);
      return;
    }
    setBusy(true);
    try {
      const shot = await cameraRef.current?.takePictureAsync({ quality: 1 });
      if (!shot?.uri) return;

      // Comprimir antes de encolar: 3-5 MB por foto es el mayor costo de subida
      // en el WiFi de planta. Si fallara, se guarda el original.
      let uri = shot.uri;
      try {
        uri = (await compressPhoto(shot.uri)).uri;
      } catch {
        uri = shot.uri;
      }

      finish(selected, grade, uri);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!zoneId} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable className="rounded-t-3xl bg-canvas" onPress={() => {}}>
          <SafeAreaView edges={['bottom']}>
            <View className="items-center pb-1 pt-2">
              <View className="h-1 w-10 rounded-full bg-line" />
            </View>

            <View className="flex-row items-center justify-between px-5 pb-3 pt-2">
              <View className="flex-1">
                <Text className="text-label uppercase text-muted">
                  {step === 'tipo' || !selected
                    ? 'Zona'
                    : `${selected.label} · ${CATEGORY_LABEL[selected.category]}`}
                </Text>
                <Text className="text-xl font-bold text-ink">
                  {zoneId ? zoneLabel(zoneId) : ''}
                </Text>
              </View>
              <Pressable onPress={goBack} hitSlop={12} className="min-h-[44px] justify-center px-2">
                <Text className="text-sm font-bold text-primary">
                  {step === 'tipo' ? 'Cerrar' : 'Atras'}
                </Text>
              </Pressable>
            </View>

            {step === 'tipo' ? (
              <ScrollView className="max-h-[560px]" contentContainerClassName="px-5 pb-5">
                <View className="flex-row flex-wrap gap-2">
                  {menu.primary.map((finding) => (
                    <FindingChip key={finding.id} finding={finding} onPress={() => selectType(finding)} />
                  ))}
                  {showMore
                    ? menu.secondary.map((finding) => (
                        <FindingChip key={finding.id} finding={finding} onPress={() => selectType(finding)} />
                      ))
                    : null}
                </View>

                {menu.secondary.length > 0 && !showMore ? (
                  <Pressable
                    onPress={() => setShowMore(true)}
                    className="mt-3 min-h-[44px] items-center justify-center rounded-2xl border-2 border-dashed border-line"
                  >
                    <Text className="text-sm font-bold text-muted">
                      Mas hallazgos ({menu.secondary.length})
                    </Text>
                  </Pressable>
                ) : null}

                {inZone.length > 0 ? (
                  <>
                    <Text className="mb-2 mt-5 text-label uppercase text-muted">
                      En esta zona ({inZone.length})
                    </Text>
                    {inZone.map((defect) => (
                      <CapturedRow key={defect.key} defect={defect} onRemove={() => onRemove(defect.key)} />
                    ))}
                  </>
                ) : null}
              </ScrollView>
            ) : null}

            {step === 'severidad' && selected ? (
              <View className="px-5 pb-5">
                <Text className="mb-2 text-label uppercase text-muted">Severidad</Text>
                <View className="mb-4 flex-row gap-2">
                  {GRADES.map((option) => {
                    const active = grade === option;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => setGrade(option)}
                        className={`min-h-[56px] flex-1 items-center justify-center rounded-2xl border-2 ${
                          active ? `${GRADE_BG[option]} border-transparent` : 'border-line bg-surface'
                        }`}
                      >
                        <Text className={`text-lg font-bold ${active ? 'text-white' : 'text-ink'}`}>
                          {option}
                        </Text>
                        <Text
                          className={`text-[10px] font-semibold ${
                            active ? 'text-white/80' : 'text-muted'
                          }`}
                        >
                          {option === 'V1' ? '8 h' : option === 'V2' ? '4 h' : '2 h'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable
                  onPress={confirmSeveridad}
                  className="min-h-[56px] items-center justify-center rounded-2xl bg-primary active:opacity-80"
                >
                  <Text className="text-base font-bold text-white">Continuar</Text>
                </Pressable>
              </View>
            ) : null}

            {step === 'foto' && selected ? (
              <View className="px-5 pb-5">
                {permission?.granted ? (
                  <>
                    <View className="h-[340px] overflow-hidden rounded-3xl bg-ink">
                      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
                    </View>
                    <Text className="mt-3 text-center text-xs text-muted">
                      {selected.requiresPhoto === 'always'
                        ? 'Encuadra el hallazgo completo. La foto se comprime y se sube sola.'
                        : 'Foto opcional: agregala si hay algo visible que respalde el reporte.'}
                    </Text>
                    <Pressable
                      onPress={() => void shoot(false)}
                      disabled={busy}
                      className="mt-3 min-h-[64px] items-center justify-center rounded-2xl bg-primary active:opacity-80"
                    >
                      {busy ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text className="text-lg font-bold text-white">Tomar foto y agregar</Text>
                      )}
                    </Pressable>
                    {selected.requiresPhoto === 'optional' ? (
                      <Pressable
                        onPress={() => void shoot(true)}
                        disabled={busy}
                        className="mt-2 min-h-[48px] items-center justify-center rounded-2xl"
                      >
                        <Text className="text-sm font-bold text-muted">Agregar sin foto</Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : (
                  <View className="rounded-3xl border-2 border-line bg-surface p-5">
                    <Text className="text-base font-bold text-ink">Falta permiso de camara</Text>
                    <Text className="mt-1 text-sm text-muted">
                      {selected.requiresPhoto === 'always'
                        ? 'Este hallazgo necesita foto: es la evidencia que revisa Body Shop y garantia. Concede el permiso para continuar.'
                        : 'Puedes continuar sin foto, o conceder el permiso para adjuntar una.'}
                    </Text>
                    <Pressable
                      onPress={() => void requestPermission()}
                      className="mt-4 min-h-[56px] items-center justify-center rounded-2xl bg-primary"
                    >
                      <Text className="text-base font-bold text-white">Permitir camara</Text>
                    </Pressable>
                    {selected.requiresPhoto === 'optional' ? (
                      <Pressable
                        onPress={() => finish(selected, grade)}
                        className="mt-2 min-h-[48px] items-center justify-center"
                      >
                        <Text className="text-sm font-bold text-muted">Continuar sin foto</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>
            ) : null}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FindingChip({ finding, onPress }: { finding: FindingType; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="min-h-[64px] flex-1 basis-[46%] items-center justify-center rounded-2xl border-2 border-line bg-surface px-2 py-1 active:border-ink active:bg-canvas"
    >
      <View className="flex-row items-center gap-1.5">
        {/* Punto rojo: este hallazgo fija la severidad en V1 solo — el
            operador lo sabe antes de tocarlo, no como sorpresa despues. */}
        {finding.mandatoryRepair ? <View className="h-1.5 w-1.5 rounded-full bg-v1" /> : null}
        <Text className="text-center text-sm font-bold text-ink">{finding.label}</Text>
      </View>
      {finding.mandatoryRepair ? (
        <Text className="mt-0.5 text-[10px] font-semibold text-v1">Reparacion obligatoria</Text>
      ) : null}
    </Pressable>
  );
}

function CapturedRow({ defect, onRemove }: { defect: DraftDefect; onRemove: () => void }) {
  const finding = FINDING_BY_ID[defect.typeId];
  return (
    <View className="mb-2 flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-2">
      {defect.photoUri ? (
        <Image source={{ uri: defect.photoUri }} className="h-12 w-12 rounded-xl bg-canvas" />
      ) : (
        <View className="h-12 w-12 items-center justify-center rounded-xl bg-canvas">
          <Text className="text-[9px] font-semibold text-muted">Sin foto</Text>
        </View>
      )}
      <View className={`h-8 w-8 items-center justify-center rounded-lg ${GRADE_BG[defect.grade]}`}>
        <Text className="text-[11px] font-bold text-white">{defect.grade}</Text>
      </View>
      <Text className="flex-1 text-base font-semibold text-ink">
        {finding?.label ?? defect.typeId}
      </Text>
      <Pressable onPress={onRemove} hitSlop={10} className="min-h-[44px] justify-center px-3">
        <Text className="text-sm font-bold text-primary">Quitar</Text>
      </Pressable>
    </View>
  );
}
