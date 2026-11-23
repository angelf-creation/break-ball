/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { void: '#04060e' },
      fontFamily: {
        // Satoshi 400: body, labels, History text. Satoshi 700: emphasis, active states, key numbers.
        sans: ['Satoshi', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Laginchy (single weight): headlines, sublines, artist names, breath labels.
        display: ['Laginchy', 'ui-serif', 'Georgia', 'serif'],
      },
      transitionDuration: { 1500: '1500ms', 2000: '2000ms' },
      borderRadius: { panel: '12px', btn: '7px' },
    },
  },
  plugins: [],
};
