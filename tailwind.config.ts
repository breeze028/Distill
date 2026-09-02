import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/renderer/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          elevated: 'hsl(var(--surface-elevated))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        }
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px'
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Microsoft YaHei UI', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};

export default config;
