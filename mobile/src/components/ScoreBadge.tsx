/**
 * ScoreBadge — large circular score display with animated SVG arc.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { FontSize, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ScoreBadgeProps {
  score:    number;   // 0-100
  label?:   string;
  size?:    number;
  variant?: 'pitch' | 'timing';
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function ScoreBadge({ score, label, size = 140, variant = 'pitch' }: ScoreBadgeProps) {
  const theme    = useTheme();
  const R        = (size - 16) / 2;
  const circ     = 2 * Math.PI * R;
  const progress = useSharedValue(circ);   // start fully offset (invisible arc)

  useEffect(() => {
    // Animate from full offset (0%) to target offset (score%)
    progress.value = withDelay(
      200,
      withTiming(circ * (1 - score / 100), {
        duration: 1000,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, [score]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: progress.value,
  }));

  const color = variant === 'pitch' ? theme.inTune : theme.accent;

  const scoreColor =
    score >= 80 ? theme.inTune :
    score >= 60 ? theme.accent :
    theme.offPitch;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={R}
          stroke={theme.backgroundElement}
          strokeWidth={8}
          fill="none"
        />
        {/* Progress arc */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={R}
          stroke={color}
          strokeWidth={8}
          fill="none"
          strokeDasharray={circ}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={styles.inner}>
        <Text style={[styles.score, { color: scoreColor, fontFamily: Fonts.mono }]}>
          {Math.round(score)}
        </Text>
        {label && (
          <Text style={[styles.label, { color: theme.textMuted, fontFamily: Fonts.body }]}>
            {label}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
  },
  score: {
    fontSize:   FontSize.xxl,
    fontWeight: '700',
    lineHeight: FontSize.xxl + 4,
  },
  label: {
    fontSize:  FontSize.xs,
    marginTop: 2,
  },
});
