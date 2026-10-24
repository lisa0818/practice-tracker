/**
 * Primary button, outline button, ghost button.
 * Accessible tap area, subtle press animation.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
  TextStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { FontSize, Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';
type Size    = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label:     string;
  onPress:   () => void;
  variant?:  Variant;
  size?:     Size;
  loading?:  boolean;
  disabled?: boolean;
  style?:    ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
  icon?:     React.ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  label, onPress, variant = 'primary', size = 'md',
  loading, disabled, style, textStyle, fullWidth, icon,
}: ButtonProps) {
  const theme  = useTheme();
  const scale  = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn  = () => { scale.value = withSpring(0.96, { damping: 20 }); };
  const handlePressOut = () => { scale.value = withSpring(1,    { damping: 20 }); };

  // Colors by variant
  const bg: Record<Variant, string> = {
    primary: theme.accent,
    outline: 'transparent',
    ghost:   'transparent',
    danger:  theme.error,
  };
  const fg: Record<Variant, string> = {
    primary: '#FFFFFF',
    outline: theme.accent,
    ghost:   theme.textSecondary,
    danger:  '#FFFFFF',
  };
  const borderColor: Record<Variant, string> = {
    primary: 'transparent',
    outline: theme.accent,
    ghost:   'transparent',
    danger:  'transparent',
  };

  // Sizes
  const padV: Record<Size, number>  = { sm: 8,  md: 13, lg: 16 };
  const padH: Record<Size, number>  = { sm: 14, md: 20, lg: 24 };
  const fs:   Record<Size, number>  = { sm: FontSize.sm, md: FontSize.base, lg: FontSize.md };

  const isDisabled = disabled || loading;

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      style={[
        animStyle,
        styles.base,
        {
          backgroundColor: bg[variant],
          borderColor:     borderColor[variant],
          borderWidth:     variant === 'outline' ? 1.5 : 0,
          paddingVertical: padV[size],
          paddingHorizontal: padH[size],
          opacity: isDisabled ? 0.5 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} size="small" />
      ) : (
        <>
          {icon}
          <Text style={[
            styles.label,
            { color: fg[variant], fontSize: fs[size], fontFamily: Fonts.body },
            textStyle,
          ]}>
            {label}
          </Text>
        </>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent:'center',
    gap:           6,
  },
  label: {
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
