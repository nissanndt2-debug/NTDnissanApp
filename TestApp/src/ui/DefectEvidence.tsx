import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  RefreshCw,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, Modal, Pressable, Text, View } from "react-native";
import type { Defect } from "@/domain/types";
import { COLORS } from "./theme";

export function evidenceUris(defect: Defect): string[] {
  return [
    ...new Set([...(defect.photoUrls ?? []), ...(defect.pendingPhotos ?? [])]),
  ];
}

/** Miniaturas, estado de carga y lightbox reutilizable para cualquier módulo. */
export function DefectEvidence({
  defect,
  unitLabel,
  onRetry,
  retrying = false,
}: {
  defect: Defect;
  unitLabel: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const photos = evidenceUris(defect);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const hasPending = (defect.pendingPhotos?.length ?? 0) > 0;

  return (
    <View>
      {photos.length > 0 ? (
        <View className="mt-2 flex-row flex-wrap gap-2">
          {photos.map((uri, index) => (
            <Pressable
              key={`${uri}-${index}`}
              onPress={() => setOpenIndex(index)}
              accessibilityRole="button"
              accessibilityLabel={`Ver foto ${index + 1} de ${defect.type}`}
              className="overflow-hidden rounded-xl border border-line bg-white active:opacity-75"
            >
              <Image
                source={{ uri }}
                style={{ height: 76, width: 98 }}
                resizeMode="cover"
              />
            </Pressable>
          ))}
        </View>
      ) : (
        <View className="mt-2 flex-row items-center gap-2 rounded-xl bg-canvas px-3 py-2">
          <ImageIcon color={COLORS.muted} size={15} strokeWidth={2} />
          <Text className="text-[11px] text-muted">
            Sin evidencia fotográfica.
          </Text>
        </View>
      )}

      {defect.photoError ? (
        <View className="mt-2 flex-row items-center gap-2 rounded-xl bg-v1/10 px-3 py-2">
          <ImageIcon color={COLORS.v1} size={15} strokeWidth={2} />
          <Text selectable className="flex-1 text-[11px] leading-4 text-v1">
            No se subió: {defect.photoError}
          </Text>
          {onRetry ? (
            <Pressable
              onPress={onRetry}
              disabled={retrying}
              accessibilityRole="button"
              accessibilityLabel="Reintentar subir foto"
              className="min-h-[34px] items-center justify-center rounded-lg bg-white px-2 active:opacity-75"
            >
              <RefreshCw color={COLORS.v1} size={15} strokeWidth={2.3} />
            </Pressable>
          ) : null}
        </View>
      ) : hasPending ? (
        <View className="mt-2 flex-row items-center gap-2 rounded-xl bg-primary/5 px-3 py-2">
          <RefreshCw color={COLORS.primary} size={14} strokeWidth={2.2} />
          <Text className="flex-1 text-[11px] leading-4 text-primary">
            Foto pendiente de subir. Se conservará y sincronizará al recuperar
            conexión.
          </Text>
        </View>
      ) : null}

      <EvidenceLightbox
        photos={photos}
        initialIndex={openIndex}
        unitLabel={unitLabel}
        onClose={() => setOpenIndex(null)}
      />
    </View>
  );
}

export function EvidenceLightbox({
  photos,
  initialIndex,
  unitLabel,
  onClose,
}: {
  photos: string[];
  initialIndex: number | null;
  unitLabel: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const visible = initialIndex !== null && photos.length > 0;

  useEffect(() => {
    if (initialIndex !== null) setIndex(initialIndex);
  }, [initialIndex]);

  const photo = photos[index];
  const move = (direction: -1 | 1) => {
    setIndex(
      (current) => (current + direction + photos.length) % photos.length,
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center bg-black/85 px-4 py-10">
        <View className="overflow-hidden rounded-3xl bg-surface">
          <View className="flex-row items-center justify-between border-b border-line px-4 py-3">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-bold text-ink">
                Evidencia fotográfica
              </Text>
              <Text numberOfLines={1} className="mt-0.5 text-xs text-muted">
                {unitLabel} · Foto {index + 1} de {photos.length}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cerrar foto"
              className="h-10 w-10 items-center justify-center rounded-xl bg-canvas"
            >
              <X color={COLORS.ink} size={20} strokeWidth={2.2} />
            </Pressable>
          </View>
          {photo ? (
            <Image
              source={{ uri: photo }}
              style={{ height: 460, maxHeight: "70%", width: "100%" }}
              resizeMode="contain"
              accessibilityLabel={`${unitLabel}, evidencia ${index + 1}`}
            />
          ) : null}
          {photos.length > 1 ? (
            <View className="flex-row items-center justify-between border-t border-line px-4 py-3">
              <Pressable
                onPress={() => move(-1)}
                accessibilityRole="button"
                accessibilityLabel="Foto anterior"
                className="h-10 w-10 items-center justify-center rounded-xl bg-canvas"
              >
                <ChevronLeft color={COLORS.ink} size={21} strokeWidth={2.2} />
              </Pressable>
              <Text className="text-xs font-bold text-muted">
                {index + 1} / {photos.length}
              </Text>
              <Pressable
                onPress={() => move(1)}
                accessibilityRole="button"
                accessibilityLabel="Foto siguiente"
                className="h-10 w-10 items-center justify-center rounded-xl bg-canvas"
              >
                <ChevronRight color={COLORS.ink} size={21} strokeWidth={2.2} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
