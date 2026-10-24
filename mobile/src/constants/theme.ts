/**
 * Practice Tracker design tokens.
 * Palette: pale cool-grey bg, deep navy text, indigo accent,
 * teal for in-tune, orange for off-pitch.
 * Fonts: Bricolage Grotesque (headings), DM Sans (body), DM Mono (numbers).
 */

import '@/global.css';
import { Platform } from 'react-native';

export const Colors = {
  light: {
    // Backgrounds
    background:        '#F4F6FA',   // pale cool-grey
    backgroundCard:    '#FFFFFF',
    backgroundElement: '#E8ECF4',
    backgroundSelected:'#D6DCF0',

    // Text
    text:          '#0F1E3C',   // deep navy
    textSecondary: '#4A5472',
    textMuted:     '#8891A8',

    // Accent / brand
    accent:        '#4F46E5',   // indigo-600
    accentLight:   '#EEF2FF',   // indigo-50
    accentDark:    '#3730A3',   // indigo-800

    // Semantic
    inTune:        '#0D9488',   // teal-600
    inTuneLight:   '#F0FDFA',
    offPitch:      '#F97316',   // orange-500
    offPitchLight: '#FFF7ED',
    success:       '#22C55E',
    error:         '#EF4444',
    streak:        '#FBBF24',   // amber-400

    // Borders
    border:        '#D1D9ED',
    borderLight:   '#EEF2FF',

    // Tab bar
    tabBar:        '#FFFFFF',
    tabActive:     '#4F46E5',
    tabInactive:   '#8891A8',
  },
  dark: {
    background:        '#0A0F1E',
    backgroundCard:    '#111827',
    backgroundElement: '#1C2436',
    backgroundSelected:'#243049',
    text:          '#F0F4FF',
    textSecondary: '#A8B4D0',
    textMuted:     '#5A6585',
    accent:        '#6366F1',
    accentLight:   '#1E2048',
    accentDark:    '#818CF8',
    inTune:        '#14B8A6',
    inTuneLight:   '#0D2926',
    offPitch:      '#FB923C',
    offPitchLight: '#2D1A0A',
    success:       '#4ADE80',
    error:         '#F87171',
    streak:        '#FBBF24',
    border:        '#243049',
    borderLight:   '#1C2436',
    tabBar:        '#111827',
    tabActive:     '#818CF8',
    tabInactive:   '#5A6585',
  },
} as const;

export type ColorScheme = 'light' | 'dark';
export type ThemeColors = typeof Colors.light;
/** @deprecated use ThemeColors */
export type ThemeColor = keyof ThemeColors;

export const Fonts = {
  heading: 'BricolageGrotesque',
  body:    'DMSans',
  mono:    'DMMono',
};

export const Spacing = {
  // New named keys
  xs:   4,
  sm:   8,
  md:   12,
  base: 16,
  lg:   20,
  xl:   24,
  xxl:  32,
  xxxl: 48,
  huge: 64,
  // Backward-compatible numeric aliases (used by old scaffold components)
  half:  2,
  one:   4,
  two:   8,
  three: 16,
  four:  24,
  five:  32,
  six:   64,
} as const;

export const Radius = {
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  full:9999,
} as const;

export const FontSize = {
  xs:   11,
  sm:   13,
  base: 15,
  md:   17,
  lg:   20,
  xl:   24,
  xxl:  30,
  xxxl: 36,
} as const;

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
};

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 430;
