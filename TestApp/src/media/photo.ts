import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Compresion ANTES de encolar la subida.
 *
 * Por que importa: en la version web las fotos de defecto se suben crudas
 * (el endpoint acepta hasta 5 MB y una foto de celular moderno pesa 3-5 MB).
 * En WiFi de planta eso son decenas de segundos por foto y es el mayor costo
 * de tiempo del reporte. Reducir a 1280 px y calidad 0.6 deja el archivo en
 * ~150-250 KB: entre 15x y 30x menos datos, con evidencia igual de legible
 * para evaluar un golpe de carroceria.
 */

const MAX_WIDTH = 1280;
const QUALITY = 0.6;

export interface CompressedPhoto {
  uri: string;
  width: number;
  height: number;
}

export async function compressPhoto(sourceUri: string): Promise<CompressedPhoto> {
  const context = ImageManipulator.manipulate(sourceUri);
  context.resize({ width: MAX_WIDTH });

  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: QUALITY,
    format: SaveFormat.JPEG,
  });

  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** Comprime varias fotos en paralelo (la version web lo hacia en serie). */
export async function compressAll(uris: string[]): Promise<CompressedPhoto[]> {
  return Promise.all(uris.map(compressPhoto));
}
