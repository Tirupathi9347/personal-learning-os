/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "sans-serif"],
        heading: ["var(--font-heading)", "Manrope", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      colors: {
        executive: {
          bg: "#F5F6F8",
          surface: "#FFFFFF",
          surfaceSecondary: "#F8F9FB",
          silver: "#EEF0F3",
          border: "#E2E5E9",
          borderHover: "#CBD5E1",
          text: "#17191D",
          textMuted: "#646A73",
          textSubtle: "#8C929B",
          accent: "#0284C7",
          accentLight: "#E0F2FE",
          accentHover: "#0369A1",
          darkGraphite: "#25282D",
        },
        cyber: {
          cyan: "#0284C7",
          cyanBright: "#38BDF8",
          cyanDark: "#0369A1",
        },
        royal: {
          purple: "#6366F1",
          purpleLight: "#EEF2FF",
        },
        amberGold: "#D97706",
        emeraldSuccess: "#059669",
        crimsonError: "#DC2626",
        background: "#F5F6F8",
        foreground: "#17191D",
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#17191D",
        },
        popover: {
          DEFAULT: "#FFFFFF",
          foreground: "#17191D",
        },
        primary: {
          DEFAULT: "#17191D",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#EEF0F3",
          foreground: "#17191D",
        },
        muted: {
          DEFAULT: "#F8F9FB",
          foreground: "#646A73",
        },
        accent: {
          DEFAULT: "#E0F2FE",
          foreground: "#0284C7",
        },
        destructive: {
          DEFAULT: "#FEE2E2",
          foreground: "#DC2626",
        },
        border: "#E2E5E9",
        input: "#FFFFFF",
        ring: "#0284C7",
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      animation: {
        "fade-in-up": "fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "pulse-slow": "pulse 3s infinite ease-in-out",
        "scale-in": "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(8px) scale(0.995)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};
