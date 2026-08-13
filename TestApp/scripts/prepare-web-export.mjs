import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Duplica `assets/node_modules/` en `assets/nm/`.
 *
 * Expo publica algunos assets con su ruta de origen dentro de node_modules
 * (el .wasm de expo-sqlite, iconos de expo-router y react-navigation).
 * Vercel descarta de la subida cualquier ruta que contenga `node_modules`,
 * asi que esos archivos nunca llegan: el .wasm responde con el index.html del
 * SPA, el navegador intenta compilarlo como WebAssembly y la app se queda
 * cargando para siempre con un error de "magic word" que no dice nada.
 *
 * Copiar en vez de mover: el bundle sigue pidiendo la ruta original, y un
 * rewrite en `public/vercel.json` la traduce a esta. Asi el mismo export
 * funciona igual servido en local (donde la ruta original si existe).
 */

const dist = process.argv[2] ?? 'dist-web';
const from = join(dist, 'assets', 'node_modules');
const to = join(dist, 'assets', 'nm');

if (!existsSync(from)) {
  console.log(`[web] no existe ${from}; nada que copiar`);
  process.exit(0);
}

cpSync(from, to, { recursive: true });
console.log(`[web] ${from} -> ${to}`);
