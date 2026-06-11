/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  safelist: [
    { pattern: /(bg|text|border)-(emerald|sky|amber|rose|slate|red)-(50|100|200|500|600|700)/ },
  ],
  theme: { extend: {} },
  plugins: [],
};
