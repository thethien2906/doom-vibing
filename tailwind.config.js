/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          base: '#121212',
          sidebar: '#181818',
          hover: '#222222',
          active: '#2A2A2A',
          border: '#282828',
          subtle: '#333333',
        },
        text: {
          primary: '#EDEDED',
          secondary: '#A3A3A3',
          muted: '#737373',
          faint: '#525252',
        },
        accent: {
          cyan: '#38bdf8',
          green: '#4ade80',
          yellow: '#facc15',
          magenta: '#c084fc',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      lineHeight: {
        relaxed: '1.6',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [],
}
