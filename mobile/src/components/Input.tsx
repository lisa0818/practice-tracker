/**
 * Themed text input with label and error state.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { FontSize, Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface InputProps extends TextInputProps {
  label?:       string;
  error?:       string;
  hint?:        string;
}

export function Input({ label, error, hint, style, ...props }: InputProps) {
  const theme   = useTheme();
  const [focus, setFocus] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label && (
        <Text style={[styles.label, { color: theme.textSecondary, fontFamily: Fonts.body }]}>
          {label}
        </Text>
      )}
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            color:           theme.text,
            borderColor:     error ? theme.error : focus ? theme.accent : theme.border,
            fontFamily:      Fonts.body,
          },
          style,
        ]}
        placeholderTextColor={theme.textMuted}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        {...props}
      />
      {error && (
        <Text style={[styles.error, { color: theme.error }]}>{error}</Text>
      )}
      {hint && !error && (
        <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 4 },
  label: {
    fontSize:   FontSize.sm,
    fontWeight: '500',
    marginBottom: 2,
  },
  input: {
    borderRadius:    Radius.md,
    borderWidth:     1.5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize:        FontSize.base,
  },
  error: {
    fontSize:   FontSize.xs,
    marginTop:  2,
  },
  hint: {
    fontSize:   FontSize.xs,
    marginTop:  2,
  },
});
