/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './App.tsx',
    './src/App.tsx',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#6366f1', // Indigo 500
        secondary: '#1e293b', // Slate 800
      },
    },
  },
  plugins: [],
};
