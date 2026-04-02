/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './App.tsx',
    './src/App.tsx',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#6366f1',
        secondary: '#1e293b',
        // Semantic theme colors backed by CSS variables
        th: {
          base: 'rgb(var(--c-base) / <alpha-value>)',
          surface: 'rgb(var(--c-surface) / <alpha-value>)',
          card: 'rgb(var(--c-card) / <alpha-value>)',
          input: 'rgb(var(--c-input) / <alpha-value>)',
          deep: 'rgb(var(--c-deep) / <alpha-value>)',
          primary: 'rgb(var(--c-text) / <alpha-value>)',
          secondary: 'rgb(var(--c-text-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--c-text-tertiary) / <alpha-value>)',
          muted: 'rgb(var(--c-text-muted) / <alpha-value>)',
          faint: 'rgb(var(--c-text-faint) / <alpha-value>)',
          edge: 'rgb(var(--c-border) / <alpha-value>)',
          divider: 'rgb(var(--c-divider) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
