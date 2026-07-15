/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        aegis: {
          50: "#ecfeff",
          100: "#cffafe",
          200: "#a5f3fc",
          300: "#67e8f9",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
          800: "#155e75",
          900: "#164e63",
          950: "#083344",
        },
        neon: {
          cyan: "#22d3ee",
          blue: "#3b82f6",
          violet: "#a78bfa",
          magenta: "#e879f9",
          emerald: "#34d399",
        },
        surface: {
          DEFAULT: "rgba(15, 23, 42, 0.6)",
          light: "rgba(30, 41, 59, 0.5)",
          dark: "rgba(10, 14, 23, 0.8)",
        },
      },
      fontFamily: {
        display: ["Orbitron", "sans-serif"],
        sans: ["Exo 2", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        "neon-sm": "0 0 8px rgba(34, 211, 238, 0.3)",
        "neon-md": "0 0 16px rgba(34, 211, 238, 0.4), 0 0 32px rgba(34, 211, 238, 0.1)",
        "neon-lg": "0 0 24px rgba(34, 211, 238, 0.5), 0 0 48px rgba(34, 211, 238, 0.2)",
        glass: "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
        "glow-violet": "0 0 20px rgba(167, 139, 250, 0.4)",
        "glow-emerald": "0 0 20px rgba(52, 211, 153, 0.4)",
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(34, 211, 238, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 211, 238, 0.03) 1px, transparent 1px)",
        "radial-glow-cyan":
          "radial-gradient(ellipse at 20% 0%, rgba(34, 211, 238, 0.12) 0%, transparent 50%)",
        "radial-glow-violet":
          "radial-gradient(ellipse at 80% 100%, rgba(167, 139, 250, 0.1) 0%, transparent 50%)",
        "gradient-primary": "linear-gradient(135deg, #22d3ee 0%, #3b82f6 50%, #a78bfa 100%)",
        "gradient-success": "linear-gradient(135deg, #34d399 0%, #06b6d4 100%)",
        "gradient-user-bubble": "linear-gradient(135deg, #0891b2 0%, #3b82f6 100%)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
        "typing-dot": "typing-dot 1.4s ease-in-out infinite",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 8px rgba(34, 211, 238, 0.3)" },
          "50%": { boxShadow: "0 0 20px rgba(34, 211, 238, 0.6)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "typing-dot": {
          "0%, 60%, 100%": { opacity: "0.3", transform: "translateY(0)" },
          "30%": { opacity: "1", transform: "translateY(-4px)" },
        },
      },
    },
  },
  plugins: [],
};
