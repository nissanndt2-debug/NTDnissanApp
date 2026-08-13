# Dashboard web (admin)

Los operadores usan el APK en el telefono; el ADMIN ve los KPIs en el
navegador. Es la **misma** base de codigo: `app/dashboard.tsx` ya tiene doble
candado (`roleId === ADMIN` y `Platform.OS === 'web'`), asi que no hay un
segundo proyecto que mantener.

**En produccion:** https://dist-web-ivory-rho.vercel.app

## Generar y publicar

```bash
cd TestApp
EXPO_PUBLIC_API_BASE_URL=https://body-app-backend-latest.onrender.com \
EXPO_PUBLIC_REALTIME_URL=wss://body-app-backend-latest.onrender.com/ws/notifications \
npm run export:web

cd dist-web && vercel deploy --prod
```

Las variables se hornean en el bundle: si cambia la URL del backend hay que
volver a exportar, no basta con reiniciar el hosting.

Se publica el contenido de `dist-web/`. Es estatico: no necesita servidor Node.

Usa `npm run export:web`, no `expo export` a secas — el script encadena
`scripts/prepare-web-export.mjs`, que es obligatorio para Vercel (ver abajo).

## Requisito no obvio: aislamiento cross-origin

El dashboard calcula los KPIs con SQL sobre SQLite local (ver
`src/data/stats.ts`), y en web `expo-sqlite` corre sobre wa-sqlite (WASM), que
necesita `SharedArrayBuffer`. El navegador solo lo habilita si la pagina se
sirve con:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Sin esas dos cabeceras la base local nunca abre y el login falla con "No se
pudo iniciar sesion"** — un error que apunta a credenciales o red, no a lo que
de verdad esta pasando. Es el fallo mas caro de diagnosticar de todo esto.

Ya vienen resueltas: `public/` se copia tal cual al export, y ahi estan
`_headers` (Netlify / Cloudflare Pages), `vercel.json` (Vercel) y `serve.json`
(para probar en local). No hay que tocarlas al desplegar.

Esto descarta **GitHub Pages**: no permite definir cabeceras propias.

## Segundo requisito no obvio: assets bajo `node_modules`

Expo publica algunos assets conservando su ruta de origen
(`assets/node_modules/expo-sqlite/.../wa-sqlite.wasm`, iconos de expo-router
y react-navigation). **Vercel descarta de la subida cualquier ruta que
contenga `node_modules`**, asi que esos archivos no llegan nunca: el `.wasm`
acaba respondiendo el `index.html` del SPA, el navegador intenta compilarlo
como WebAssembly y la app se queda en el spinner con un error de "magic word"
que no menciona ni a Vercel ni a node_modules.

`npm run export:web` lo resuelve: copia ese arbol a `assets/nm/`, y el rewrite
de `public/vercel.json` traduce la ruta original. Se **copia** en vez de
mover para que el mismo export siga funcionando servido en local.

Comprobacion rapida despues de cada deploy:

```bash
curl -sI https://<tu-url>/assets/node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite.<hash>.wasm | grep -i content-type
```

Debe decir `application/wasm`. Si dice `text/html`, el asset no se subio.

## Probar el export en local

```bash
npx serve -s dist-web -l 4173
```

Y comprobar en la consola del navegador que `crossOriginIsolated` sea `true`.
Si es `false`, el hosting no esta mandando las cabeceras y nada mas va a
funcionar.

## Notas

- El backend ya corre con `CORS_ORIGIN=*`, asi que el dominio del dashboard no
  necesita darse de alta en ningun lado. Para produccion conviene fijarlo a la
  URL real del dashboard.
- El backend en capa gratuita de Render se duerme tras 15 min sin trafico: la
  primera carga del dia puede tardar ~50 s. No es un fallo del dashboard.
