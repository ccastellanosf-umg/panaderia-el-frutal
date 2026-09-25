/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        masa: {
          50: "#fdf8f0",
          100: "#f8ecd8",
          200: "#eed4ac",
          300: "#e0b378",
          400: "#d1934f",
          500: "#b8722f",
          600: "#965a25",
          700: "#794620",
          800: "#5f371d",
          900: "#4c2d1a",
        },
        trigo: {
          50: "#fffaf0",
          100: "#fff0d6",
        },
      },
      fontFamily: {
        display: ["Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
