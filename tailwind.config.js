/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        lab: {
          950: '#0b0f14', 900: '#11161d', 850: '#161c25', 800: '#1b2230', 700: '#252e3e',
          600: '#334055', 500: '#4a5a73', 400: '#7286a3', 300: '#9fb0c8', 200: '#cbd5e3', 100: '#e8edf4',
        },
        accent: { DEFAULT: '#2f9bff', soft: '#1d4f80' },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
