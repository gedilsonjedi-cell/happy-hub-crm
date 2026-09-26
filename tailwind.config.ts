import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    screens: {
      'xs': '480px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      // Densidade explícita: raiz do navegador continua nativa (16px) e a escala
      // do Tailwind é que define texto, espaços, ícones e controles.
      // Fator 0.9375 (15px no base): mais legível/clicável que o Datacrazy puro,
      // pois o Optimus tem mais ações por tela. Valores arredondados a 0,5px.
      fontSize: {
        xs: ["0.71875rem", { lineHeight: "0.9375rem" }], // 11.5 / 15px
        sm: ["0.8125rem", { lineHeight: "1.1875rem" }], // 13 / 19px
        base: ["0.9375rem", { lineHeight: "1.40625rem" }], // 15 / 22.5px
        lg: ["1.0625rem", { lineHeight: "1.65625rem" }], // 17 / 26.5px
        xl: ["1.1875rem", { lineHeight: "1.65625rem" }], // 19 / 26.5px
        "2xl": ["1.40625rem", { lineHeight: "1.875rem" }], // 22.5 / 30px
        "3xl": ["1.75rem", { lineHeight: "2.125rem" }], // 28 / 34px
        "4xl": ["2.125rem", { lineHeight: "2.34375rem" }], // 34 / 37.5px
      },
      // Escala completa do Tailwind multiplicada por 0.9375 (monotônica,
      // preservando todas as chaves e a relação entre degraus).
      spacing: {
        px: "1px", // 0.9375px
        "0": "0px",
        "0.5": "0.125rem", // 2px
        "1": "0.25rem", // 4px
        "1.5": "0.34375rem", // 5.5px
        "2": "0.46875rem", // 7.5px
        "2.5": "0.59375rem", // 9.5px
        "3": "0.71875rem", // 11.5px
        "3.5": "0.8125rem", // 13px
        "4": "0.9375rem", // 15px
        "5": "1.1875rem", // 19px
        "6": "1.40625rem", // 22.5px
        "7": "1.65625rem", // 26.5px
        "8": "1.875rem", // 30px
        "9": "2.125rem", // 34px
        "10": "2.34375rem", // 37.5px
        "11": "2.59375rem", // 41.5px
        "12": "2.8125rem", // 45px
        "14": "3.28125rem", // 52.5px
        "16": "3.75rem", // 60px
        "20": "4.6875rem", // 75px
        "24": "5.625rem", // 90px
        "28": "6.5625rem", // 105px
        "32": "7.5rem", // 120px
        "36": "8.4375rem", // 135px
        "40": "9.375rem", // 150px
        "44": "10.3125rem", // 165px
        "48": "11.25rem", // 180px
        "52": "12.1875rem", // 195px
        "56": "13.125rem", // 210px
        "60": "14.0625rem", // 225px
        "64": "15rem", // 240px
        "72": "16.875rem", // 270px
        "80": "18.75rem", // 300px
        "96": "22.5rem", // 360px
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        neutral: {
          DEFAULT: "hsl(var(--neutral))",
          foreground: "hsl(var(--neutral-foreground))",
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
          foreground: "hsl(var(--chart-foreground))",
        },
        whatsapp: {
          DEFAULT: "hsl(var(--whatsapp))",
          dark: "hsl(var(--whatsapp-dark))",
          light: "hsl(var(--whatsapp-light))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "scale-in": {
          from: { transform: "scale(0.95)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "slide-in-left": "slide-in-left 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(0, 0, 0, 0.08)',
        'glass-lg': '0 16px 48px rgba(0, 0, 0, 0.12)',
        'whatsapp': '0 4px 20px rgba(37, 211, 102, 0.25)',
        'card': 'var(--shadow-card)',
        'popover': 'var(--shadow-popover)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
