/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#2a1840', soft: '#4a3566', mute: '#7b6c91' },
        paper: { DEFAULT: '#ece6f5', card: '#ffffff', line: '#d6cbe6' },
        kanun: '#b3261e',
        yonetmelik: '#1d5fa8',
        diger: '#8a5a00',
      },
      fontFamily: {
        read: ['Charter', '"Bitstream Charter"', 'Cambria', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
