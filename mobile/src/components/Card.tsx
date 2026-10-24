/**
 * Reusable Card component — white card with soft shadow.
 */

import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  noPad?: boolean;
}

export function Card({ children, style, noPad, ...props }: CardProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundCard, borderColor: theme.border },
        !noPad && styles.pad,
        Shadow.sm,
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pad: {
    padding: 16,
  },
});
