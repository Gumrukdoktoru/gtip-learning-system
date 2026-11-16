/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#14213d', soft: '#2b3a5c', mute: '#64708a' },
        paper: { DEFAULT: '#f6f4ee', card: '#fffdf8', line: '#e2ddd0' },
        kanun: '#8a1c2b',
        yonetmelik: '#0f6b6b',
        diger: '#6b5b2e',
      },
      fontFamily: {
        read: ['"Iowan Old Style"', 'Georgia', '"Times New Roman"', 'serif'],
      },
    },
  },
  plugins: [],
};
