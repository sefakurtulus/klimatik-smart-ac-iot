/**
 * SMART AIR Theme configuration
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#101010',
    background: '#F0F0F0',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E0E0E0',
    textSecondary: '#A6A6A6',
    primary: '#1976FF',
    accent: '#00C2FF',
    danger: '#FF4545',
    error: '#FF4545',
    success: '#33D17A',
    warn: '#f59e0b',
    card: '#FFFFFF',
    border: '#E5E5E5',
  },
  dark: {
    text: '#FFFFFF',
    background: '#0a0f16', // Darker, richer background
    backgroundElement: '#1e293b', // Tailwind slate-800 equivalent for cards
    backgroundSelected: '#334155', // Tailwind slate-700
    textSecondary: '#94a3b8', // Tailwind slate-400
    primary: '#02dac5', // v0 Brand color (cyan)
    accent: '#0ea5e9', // v0 secondary accent
    danger: '#ef4444', 
    error: '#ef4444',
    success: '#10b981', // v0 Eco color
    warn: '#f59e0b', // added warn color for weather
    card: '#1e293b',
    border: '#1e293b', // Or rgba(255,255,255,0.08) in styles
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'Inter, normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
});

export const Spacing = {
  half: 4,
  one: 8,
  two: 12,
  three: 16,
  four: 24,
  five: 32,
  six: 48,
  seven: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  full: 9999,
};

export const Shadows = {
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  }
};

export const MaxContentWidth = 960;
export const BottomTabInset = 90;
