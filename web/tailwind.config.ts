import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0b0b0b", 2: "#52514e", muted: "#6f6d67" },
        line: "#e4e3dd",
        plane: "#f7f7f5",
        surface: "#ffffff",
        accent: { DEFAULT: "#2a78d6", strong: "#1c5cab", soft: "#e8f1fc" },
        neutralbar: "#b4b2a9",
        risk: {
          good: "#0ca30c",
          warn: "#fab219",
          serious: "#ec835a",
          critical: "#d03b3b",
          severe: "#8f1f1f",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
