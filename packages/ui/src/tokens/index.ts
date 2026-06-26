export const tokens = {
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
    text: {
      primary: 'oklch(0.18 0.04 280)',
      secondary: 'oklch(0.52 0.03 280)',
      muted: 'oklch(0.6 0.04 280)',
    },
    surface: {
      page: 'oklch(0.97 0.01 280)',
      card: '#ffffff',
      border: 'oklch(0.92 0.02 280)',
    },
    category: {
      'Vitamins & Minerals': { bg: 'oklch(0.95 0.06 145)', text: 'oklch(0.35 0.14 145)' },
      Hormones: { bg: 'oklch(0.95 0.06 310)', text: 'oklch(0.38 0.14 310)' },
      Metabolic: { bg: 'oklch(0.95 0.05 220)', text: 'oklch(0.38 0.12 220)' },
      'Blood Count': { bg: 'oklch(0.95 0.06 30)', text: 'oklch(0.4 0.14 30)' },
      'Cancer Markers': { bg: 'oklch(0.95 0.05 15)', text: 'oklch(0.4 0.14 15)' },
    },
    accent: {
      sky: { primary: 'oklch(0.58 0.18 220)', secondary: 'oklch(0.52 0.18 232)', gradient: 'linear-gradient(135deg, oklch(0.58 0.18 220), oklch(0.52 0.18 232))' },
      indigo: { primary: 'oklch(0.58 0.22 280)', secondary: 'oklch(0.52 0.22 305)', gradient: 'linear-gradient(135deg, oklch(0.58 0.22 280), oklch(0.52 0.22 305))' },
      emerald: { primary: 'oklch(0.56 0.18 155)', secondary: 'oklch(0.5 0.18 168)', gradient: 'linear-gradient(135deg, oklch(0.56 0.18 155), oklch(0.5 0.18 168))' },
    },
  },
  fonts: {
    sans: '"DM Sans", system-ui, sans-serif',
  },
  radii: {
    card: '14px',
    pill: '20px',
    btn: '10px',
  },
  maxWidth: {
    container: '1240px',
  },
} as const;
