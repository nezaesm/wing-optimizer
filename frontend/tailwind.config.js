/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono:    ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        sans:    ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['Syne', 'sans-serif'],
      },
      colors: {
        carbon: {
          950: '#04040a',
          900: '#070710',
          800: '#0e0e1e',
          700: '#151528',
          600: '#1e1e35',
          500: '#2d2d4e',
          400: '#4a4a70',
        },
        violet: {
          DEFAULT: '#8b5cf6',
          deep:    '#6d28d9',
          soft:    '#c084fc',
        },
        lime: {
          DEFAULT: '#a3e635',
          bright:  '#bef264',
        },
        neon: {
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
        'streamline':  'streamline 3s linear infinite',
        'halo-orbit':  'haloOrbit 4s linear infinite',
      },
      keyframes: {
        slideUp:    { '0%': { opacity: 0, transform: 'translateY(18px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        fadeIn:     { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        glowDrift: {
          '0%, 100%': { transform: 'translateY(0) translateX(0)' },
          '33%':       { transform: 'translateY(-20px) translateX(10px)' },
          '66%':       { transform: 'translateY(10px) translateX(-8px)' },
        },
        streamline: {
          '0%':   { strokeDashoffset: '1000' },
          '100%': { strokeDashoffset: '0' },
        },
        haloOrbit: {
          '0%':   { transform: 'rotate(0deg) translateX(48px) rotate(0deg)' },
          '100%': { transform: 'rotate(360deg) translateX(48px) rotate(-360deg)' },
        },
      }
    }
  },
  plugins: []
}
