import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Cliente HTTP unico. Deliberadamente delgado: la logica de reintento NO vive
 * aqui sino en el motor de sincronizacion, porque en piso un fallo de red no
 * debe bloquear al operador — se encola y sigue.
 */

const DEFAULT_TIMEOUT_MS = 12_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retriable: boolean,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  readonly retriable = true;
  constructor(message = "Sin conexion con el servidor") {
    super(message);
    this.name = "NetworkError";
  }
}

export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const fromConfig = (
    Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined
  )?.apiBaseUrl;
  return (fromConfig ?? "http://localhost:3001").replace(/\/+$/, "");
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  token?: string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface DownloadOptions {
  token?: string | null;
  timeoutMs?: number;
}

interface Envelope<T> {
  ok: boolean;
  data: T;
  detail?: string;
}

/**
 * Un 4xx (salvo 408/429) NO es reintentable: reencolarlo solo consume bateria.
 * Un 5xx o un fallo de red SI lo es.
 */
function isRetriable(status: number): boolean {
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

export async function apiRequest<T>(
  path: string,
  {
    method = "GET",
    body,
    token,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
  }: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();

    let parsed: Envelope<T>;
    try {
      parsed = text ? (JSON.parse(text) as Envelope<T>) : ({} as Envelope<T>);
    } catch {
      // Respuesta que no es JSON (un portal cautivo, un proxy, un HTML de
      // error). No es falta de red: reintentarla eternamente no la va a
      // arreglar, asi que se marca como no reintentable.
      throw new ApiError(
        `Respuesta no valida del servidor (${response.status})`,
        response.status,
        false,
      );
    }

    if (!response.ok) {
      throw new ApiError(
        parsed.detail ?? `Error ${response.status}`,
        response.status,
        isRetriable(response.status),
      );
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // AbortError o fallo de DNS/socket: tratable como falta de red.
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
  }
}

export interface UploadedPhoto {
  /** URL HTTPS estable que se persiste en UnitDefect.photoUrls. */
  url: string;
  /** Identificador de Cloudinary para trazabilidad; la URL permite borrado seguro. */
  publicId?: string;
}

/** Descarga autenticada de reportes binarios (por ejemplo, Excel). */
export async function apiDownload(
  path: string,
  { token, timeoutMs = DEFAULT_TIMEOUT_MS }: DownloadOptions = {},
): Promise<Blob> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      let detail = `Error ${response.status}`;
      try {
        detail = (JSON.parse(text) as { detail?: string }).detail ?? detail;
      } catch {
        // Una respuesta binaria/HTML de error no tiene detalle legible.
      }
      throw new ApiError(detail, response.status, isRetriable(response.status));
    }

    return await response.blob();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * URL de subida de fotos.
 *
 * El backend expone `POST /uploads/photo`, asi que por defecto se deriva del
 * mismo host que el resto de la API: una sola variable que configurar y una
 * cosa menos que se pueda quedar apuntando a un servidor viejo. La variable
 * de entorno sigue existiendo solo para el caso de subir a un host distinto
 * al de la API.
 */
export function getUploadUrl(): string {
  const configured = process.env.EXPO_PUBLIC_UPLOAD_URL?.trim();
  return configured ? configured : `${getApiBaseUrl()}/uploads/photo`;
}

/** Subida de foto como multipart. Separada porque no lleva JSON. */
export async function apiUploadPhoto(
  localUri: string,
  token: string | null,
  defectLocalId: string,
  uploadKey: string,
  timeoutMs = 30_000,
): Promise<UploadedPhoto> {
  const uploadUrl = getUploadUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const form = new FormData();
    const filename = `defecto-${uploadKey}.jpg`;

    // React Native acepta el descriptor {uri, name, type}; en web ese objeto
    // no es un Blob y el navegador no adjunta ningún archivo. Convertir la URI
    // a Blob evita que la subida falle solo en escritorio.
    if (Platform.OS === "web") {
      const source = await fetch(localUri);
      if (!source.ok) {
        throw new NetworkError("No se pudo leer la foto seleccionada");
      }
      const raw = await source.blob();
      const image = new Blob([raw], { type: raw.type || "image/jpeg" });
      form.append("file", image, filename);
    } else {
      form.append("file", {
        uri: localUri,
        name: filename,
        type: "image/jpeg",
      } as unknown as Blob);
    }
    form.append("defectLocalId", defectLocalId);
    // Misma clave durante reintentos: Cloudinary sobrescribe el mismo objeto
    // en vez de dejar copias huérfanas si la red cae después de subirlo.
    form.append("uploadKey", uploadKey);

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: Envelope<UploadedPhoto>;
    try {
      parsed = text
        ? (JSON.parse(text) as Envelope<UploadedPhoto>)
        : ({} as Envelope<UploadedPhoto>);
    } catch {
      throw new ApiError(
        `Respuesta no válida al subir la foto (${response.status})`,
        response.status,
        false,
      );
    }
    if (!response.ok) {
      throw new ApiError(
        parsed.detail ?? `Falló la subida de la foto (${response.status})`,
        response.status,
        isRetriable(response.status),
      );
    }
    if (!parsed.data?.url?.startsWith("https://")) {
      throw new ApiError(
        "El servidor no devolvió una URL segura de la foto",
        502,
        true,
      );
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
  }
}
