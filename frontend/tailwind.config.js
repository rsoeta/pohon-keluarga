/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Quicksand', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif']
      },
      colors: {
        brand: {
          50: '#eef7f3',
          100: '#d7efe4',
          200: '#c4ecd9',
          300: '#5cd0b4',
          400: '#35b598',
          500: '#138a7e',
          600: '#0f7268',
          700: '#0d5c55',
          800: '#0a4b45',
          900: '#0f2d29',
          950: '#081e1b'
        },
        heritage: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#e9953f',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03'
        },
        canvas: 'rgb(var(--bg-rgb) / <alpha-value>)',
        surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2-rgb) / <alpha-value>)',
        raised: 'rgb(var(--raised-rgb) / <alpha-value>)',
        side: 'rgb(var(--side-rgb) / <alpha-value>)',
        ink: 'rgb(var(--text-rgb) / <alpha-value>)',
        muted: 'rgb(var(--muted-rgb) / <alpha-value>)',
        faint: 'rgb(var(--faint-rgb) / <alpha-value>)',
        line: 'var(--line)',
        wa: 'rgb(var(--wa-rgb) / <alpha-value>)',
        'wa-hover': 'rgb(var(--wa-hover-rgb) / <alpha-value>)'
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        float: 'var(--shadow-float)'
      },
      borderRadius: {
        card: '1.375rem',
        tile: '1rem'
      },
      minHeight: {
        ctl: '2.125rem',
        touch: '2.375rem',
        cta: '2.625rem'
      },
      minWidth: {
        ctl: '2.125rem',
        touch: '2.375rem'
      }
    }
  },
  plugins: []
};
