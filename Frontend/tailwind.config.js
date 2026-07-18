/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#1E2430",
          light: "#2C3444",
          soft: "#4A5468",
        },
        paper: {
          DEFAULT: "#F7F4EC",
          line: "#E4DFC9",
          card: "#FDFCF7",
        },
        gold: {
          DEFAULT: "#B8862E",
          dark: "#8F6822",
          light: "#E4C583",
        },
        rust: "#9C4A3C",
        risk: {
          low: "#3F7D58",
          medium: "#B8862E",
          high: "#9C4A3C",
        },
        line: "#D8D2BC",
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        sans: ["Inter", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

