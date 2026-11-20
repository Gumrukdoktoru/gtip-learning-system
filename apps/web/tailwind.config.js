/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#1c2430', soft: '#3d4a5c', mute: '#6c7a8d' },
        paper: { DEFAULT: '#f4f5f3', card: '#ffffff', line: '#dfe3e0' },
        shell: '#11161d',
        accent: '#f5b83d',
        kanun: '#b3261e',
        yonetmelik: '#1d5fa8',
        yys: '#6b3fa0',
        diger: '#8a5a00',
      },
      fontFamily: {
        read: ['Charter', '"Bitstream Charter"', 'Cambria', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
