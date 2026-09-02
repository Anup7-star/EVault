/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        warm: {
          bg: "#141312",
          surface: "#1e1c19",
          card: "#26231f",
          border: "#38342e",
          "border-hover": "#4a453d",
          text: "#f5f2eb",
          muted: "#a39e93",
          accent: "#d97706",
          "accent-hover": "#b45309",
          amber: "#f59e0b",
          terracotta: "#e07a5f",
          sage: "#81b29a",
          cream: "#f4f1de",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
