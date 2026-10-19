/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        vault: {
          bg: "#080b11",
          surface: "#0e131f",
          card: "#141c2b",
          "card-hover": "#1a2438",
          border: "#1e293b",
          "border-hover": "#334155",
          muted: "#94a3b8",
          text: "#f1f5f9",
        },
        cyber: {
          cyan: "#06b6d4",
          emerald: "#10b981",
          amber: "#f59e0b",
          rose: "#f43f5e",
          purple: "#8b5cf6",
        },
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
