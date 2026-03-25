/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono:    ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        sans:    ['Outfit', 'system-ui', 'sans-serif'],
        display: ['Syne', 'sans-serif'],
      },
      colors: {
        carbon: {
          950: '#08090d',
          900: '#0e0f17',
          800: '#151621',
          700: '#1d1f2e',
          600: '#272a3d',
          500: '#3e4257',
          400: '#636880',
        },
        neon: {
          blue:  '#00c8ff',
          cyan:  '#00e5cc',
          green: '#39ff88',
          amber: '#ffb020',
          red:   '#ff3d5a',
        }
      },
      animation: {
        'pulse-slow':  'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'slide-up':    'slideUp 0.5s cubic-bezier(0.16,1,0.3,1)',
        'fade-in':     'fadeIn 0.5s ease-out',
        'glow-drift':  'glowDrift 8s ease-in-out infinite',
      },
      keyframes: {
        slideUp:   { '0%': { opacity: 0, transform: 'translateY(18px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        fadeIn:    { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        glowDrift: {
          '0%, 100%': { transform: 'translateY(0) translateX(0)' },
          '33%':       { transform: 'translateY(-20px) translateX(10px)' },
          '66%':       { transform: 'translateY(10px) translateX(-8px)' },
        }
      }
    }
  },
  plugins: []
}
