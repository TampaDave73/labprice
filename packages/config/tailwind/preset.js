/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: 'oklch(0.97 0.01 280)',
          100: 'oklch(0.95 0.03 280)',
          200: 'oklch(0.9 0.05 280)',
          300: 'oklch(0.8 0.1 280)',
          400: 'oklch(0.65 0.15 280)',
          500: 'oklch(0.58 0.18 220)',
          600: 'oklch(0.52 0.18 232)',
          700: 'oklch(0.4 0.14 220)',
          800: 'oklch(0.21 0.12 295)',
          900: 'oklch(0.17 0.1 280)',
        },
        success: {
          50: 'oklch(0.97 0.05 145)',
          500: 'oklch(0.52 0.17 145)',
          700: 'oklch(0.38 0.17 145)',
        },
        cat: {
          vitamins: { bg: 'oklch(0.95 0.06 145)', text: 'oklch(0.35 0.14 145)' },
          hormones: { bg: 'oklch(0.95 0.06 310)', text: 'oklch(0.38 0.14 310)' },
          metabolic: { bg: 'oklch(0.95 0.05 220)', text: 'oklch(0.38 0.12 220)' },
          blood: { bg: 'oklch(0.95 0.06 30)', text: 'oklch(0.4 0.14 30)' },
          cancer: { bg: 'oklch(0.95 0.05 15)', text: 'oklch(0.4 0.14 15)' },
        },
      },
      borderRadius: {
        card: '14px',
        pill: '20px',
        btn: '10px',
      },
      maxWidth: {
        container: '1240px',
      },
    },
  },
};
