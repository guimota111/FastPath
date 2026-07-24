/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#28C76F",
          dark: "#1FA862",
        },
        ink: "#241F2E",
        muted: "#8A8398",
        cream: "#ECE2D0",
        card: "#FBF5EC",
        sand: "#F4ECDD",
        line: "#EEE6D9",
        mint: "#EAFBF1",
        "mint-line": "#C7EFD6",
        "mint-ink": "#15914F",
      },
      fontFamily: {
        display: ["Fredoka", "system-ui", "sans-serif"],
        sans: ["Nunito", "system-ui", "sans-serif"],
      },
      keyframes: {
        pulseMic: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(40,199,111,.45)" },
          "50%": { boxShadow: "0 0 0 9px rgba(40,199,111,0)" },
        },
      },
      animation: {
        pulseMic: "pulseMic 1.4s infinite",
      },
    },
  },
  plugins: [],
};
