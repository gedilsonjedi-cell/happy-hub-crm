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
      // Densidade compacta explícita: mantém a raiz acessível em 16px e escala
      // texto, espaços, ícones e controles que usam as utilities do Tailwind.
      fontSize: {
        xs: ["0.625rem", { lineHeight: "0.875rem" }],
        sm: ["0.75rem", { lineHeight: "1rem" }],
        base: ["0.8125rem", { lineHeight: "1.125rem" }],
        lg: ["0.9375rem", { lineHeight: "1.25rem" }],
        xl: ["1.0625rem", { lineHeight: "1.375rem" }],
        "2xl": ["1.25rem", { lineHeight: "1.625rem" }],
        "3xl": ["1.5rem", { lineHeight: "1.875rem" }],
        "4xl": ["1.875rem", { lineHeight: "2.25rem" }],
      },
      spacing: {
        "0.5": "0.125rem",
        "1": "0.1875rem",
        "1.5": "0.3125rem",
        "2": "0.4375rem",
        "2.5": "0.5rem",
        "3": "0.625rem",
        "3.5": "0.6875rem",
        "4": "0.8125rem",
        "5": "1rem",
        "6": "1.25rem",
        "7": "1.4375rem",
        "8": "1.625rem",
        "9": "1.8125rem",
        "10": "2rem",
        "11": "2.25rem",
        "12": "2.4375rem",
        "14": "2.875rem",
        "16": "3.25rem",
        "20": "4.0625rem",
        "24": "4.875rem",
        "28": "5.6875rem",
        "32": "6.5rem",
        "36": "7.3125rem",
        "40": "8.125rem",
        "48": "9.75rem",
        "56": "11.375rem",
        "64": "13rem",
        "72": "14.625rem",
        "80": "16.25rem",
        "96": "19.5rem",
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
