const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// expo-sqlite en web corre sobre wa-sqlite (WebAssembly). Metro no trata los
// .wasm como asset por defecto, asi que hay que declararlo o el bundle de web
// falla al resolver `./wa-sqlite/wa-sqlite.wasm`.
config.resolver.assetExts.push('wasm');

// wa-sqlite usa SharedArrayBuffer, que el navegador solo habilita en contextos
// con aislamiento de origen cruzado. Sin estas cabeceras el dashboard web
// arranca pero no puede abrir la base local.
config.server = config.server ?? {};
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  return middleware(req, res, next);
};

module.exports = withNativeWind(config, { input: './global.css' });
