/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        hust: {
          red: '#c0262d',
          darkRed: '#9e1c22',
        },
      },
    },
  },
  plugins: [],
}
