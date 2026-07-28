/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Design tokens — values live in CSS variables (index.css :root / .dark)
        bg:      "rgb(var(--c-bg) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        ink:     "rgb(var(--c-ink) / <alpha-value>)",
        muted:   "rgb(var(--c-muted) / <alpha-value>)",
        edge:    "rgb(var(--c-edge) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--c-accent) / <alpha-value>)",
          soft:    "rgb(var(--c-accent-soft) / <alpha-value>)",
          ink:     "rgb(var(--c-accent-ink) / <alpha-value>)",
        },
        warning: "rgb(var(--c-warning) / <alpha-value>)",
        danger:  "rgb(var(--c-danger) / <alpha-value>)",
        success: "rgb(var(--c-accent) / <alpha-value>)",
        // Premium landing palette — fixed, not affected by theme toggle
        night: {
          DEFAULT: "#0E1512",
          soft: "#13201B",
          line: "#243A31",
        },
        gold: {
          DEFAULT: "#E8B964",
          soft: "#F5D89B",
        },
        jade: {
          DEFAULT: "#4FD1A5",
          deep: "#2F6F5E",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        card: "14px",
        pill: "999px",
        "2xl": "20px",
        "3xl": "28px",
      },
      boxShadow: {
        receipt: "var(--shadow-receipt)",
        lift:    "var(--shadow-lift)",
        glow:    "var(--shadow-glow)",
        float:   "0 30px 80px -30px rgba(0, 0, 0, 0.6)",
      },
      maxWidth: {
        app: "480px",
        site: "1200px",
      },
      keyframes: {
        "float-y": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        aurora: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)", opacity: "0.7" },
          "33%":  { transform: "translate(6%, -8%) scale(1.15)", opacity: "0.9" },
          "66%":  { transform: "translate(-6%, 6%) scale(0.95)", opacity: "0.6" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "reveal-up": {
          "0%":   { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        marquee: {
          "0%":   { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "spin-slow": {
          "0%":   { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "pulse-ring": {
          "0%":   { transform: "scale(0.9)", opacity: "0.7" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
        "stars-scroll": {
          "0%":   { transform: "translateY(0)" },
          "100%": { transform: "translateY(-2000px)" },
        },
      },
      animation: {
        "float-y":     "float-y 6s ease-in-out infinite",
        aurora:        "aurora 18s ease-in-out infinite",
        shimmer:       "shimmer 2.5s linear infinite",
        "reveal-up":   "reveal-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        marquee:       "marquee 28s linear infinite",
        "spin-slow":   "spin-slow 22s linear infinite",
        "pulse-ring":  "pulse-ring 2.4s ease-out infinite",
        "stars-scroll-sm":  "stars-scroll 50s linear infinite",
        "stars-scroll-md":  "stars-scroll 100s linear infinite",
        "stars-scroll-lg":  "stars-scroll 150s linear infinite",
      },
    },
  },
  plugins: [],
};
