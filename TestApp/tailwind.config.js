/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // La app es solo modo claro (app.json: userInterfaceStyle "light"). Con
  // darkMode por defecto ("media") cualquier intento de fijar el esquema de
  // color a mano truena en web: "Cannot manually set color scheme, as dark
  // mode is type 'media'". "class" lo vuelve explicito y evita el crash.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Identidad de planta
        primary: '#C3002F',
        // Cromo oscuro: barras, encabezados, dock de accion
        ink: '#0F1620',
        slate: '#1C2733',
        // Superficies
        surface: '#FFFFFF',
        canvas: '#EEF1F5',
        line: '#D5DCE5',
        muted: '#5B6878',
        // Severidad de defecto: mismo codigo de color en toda la app.
        // Saturados a proposito: se leen bajo la luz del patio.
        v1: '#E11D2E',
        v2: '#E08A00',
        v3: '#1D6FE0',
        // Estado de sincronizacion
        synced: '#04814B',
        pending: '#E08A00',
        failed: '#E11D2E',
      },
      fontFamily: {
        mono: ['monospace'],
      },
      fontSize: {
        // Escala fija: microetiqueta, dato, titulo. Nada intermedio.
        label: ['11px', { lineHeight: '14px', letterSpacing: '1px' }],
      },
    },
  },
  plugins: [],
};
