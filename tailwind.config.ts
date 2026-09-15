import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/routes/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-fira-code)', 'monospace'],
        display: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        'card-foreground': 'hsl(var(--card-foreground))',
        popover: 'hsl(var(--popover))',
        'popover-foreground': 'hsl(var(--popover-foreground))',
        primary: 'hsl(var(--primary))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        secondary: 'hsl(var(--secondary))',
        'secondary-foreground': 'hsl(var(--secondary-foreground))',
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        accent: 'hsl(var(--accent))',
        'accent-foreground': 'hsl(var(--accent-foreground))',
        destructive: 'hsl(var(--destructive))',
        'destructive-foreground': 'hsl(var(--destructive-foreground))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        // Futuristic brand palette — cyan dominant, violet accents
        ink: {
          900: '#0A0A0B',
          800: '#121214',
          700: '#1A1A1E',
          600: '#242429',
          500: '#2E2E35',
        },
        brand: {
          cyan: '#06B6D4',
          violet: '#7C3AED',
          electric: '#2DD3EE',
          deep: '#0F172A',
          // Gradient ranges
          start: '#06B6D4',
          end: '#7C3AED',
        },
        cyan: {
          400: '#38BDF8',
          500: '#06B6D2',
          600: '#0891B2',
        },
        violet: {
          400: '#A78BFA',
          500: '#7C3AED',
          600: '#6D28D9',
        },
        neutral: {
          100: '#F5F5F7',
          200: '#E5E5E8',
          300: '#D4D4D9',
          600: '#52525B',
          700: '#3F3F4B',
          800: '#2E2E3A',
          900: '#1A1A1F',
        },
        status: {
          checking: '#38BDF8',
          accessible: '#22C55E',
          private: '#F59E0B',
          unavailable: '#EF4444',
          unsupported: '#8B5CF6',
          auth: '#EAB308',
          api: '#F97316',
          error: '#DC2626',
        },
      },
      // Simplified background gradient system
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #06B6D4 0%, #7C3AED 100%)',
        'gradient-brand-reverse': 'linear-gradient(135deg, #7C3AED 0%, #06B6D4 100%)',
        'gradient-glow': 'radial-gradient(circle at 50% 0%, rgba(124, 58, 237, 0.25), transparent 60%)',
        'gradient-panel': 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)',
      },
      boxShadow: {
        'glow-cyan': '0 0 30px -6px rgba(6, 182, 212, 0.5)',
        'glow-violet': '0 0 30px -6px rgba(124, 58, 237, 0.5)',
        'glow-purple': '0 0 24px -6px rgba(124, 58, 237, 0.55)',
        'inner-glow': 'inset 0 0 20px -4px rgba(6, 182, 212, 0.15)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
      },
      backdropBlur: {
        xs: '2px',
        sm: '4px',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        spin: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'aurora-float': {
          '0%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '100%': { transform: 'translate3d(60px, 40px, 0) scale(1.1)' },
        },
        'border-flow': {
          '0%': { '--tw-translate-x': '0%', '--tw-translate-y': '0%' },
          '100%': { '--tw-translate-x': '100%', '--tw-translate-y': '100%' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out',
        'fade-in-up': 'fade-in-up 0.6s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        spin: 'spin 1s linear infinite',
        shimmer: 'shimmer 2s linear infinite',
        'aurora-float': 'aurora-float 16s ease-in-out infinite alternate',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
