/**
 * Themed text input matching exact design tokens.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { FontSize, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?:  string;
}

export function Input({ label, error, hint, style, ...props }: InputProps) {
  const theme = useTheme();
  const [focus, setFocus] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label && (
        <Text style={[styles.label, { color: '#0F172A', fontFamily: Fonts.body }]}>
          {label}
        </Text>
      )}
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: '#FFFFFF',
            color:           '#0F172A',
            borderColor:     error ? '#EF4444' : focus ? '#4F46E5' : '#E2E8F0',
            fontFamily:      Fonts.body,
          },
          style,
        ]}
        placeholderTextColor="#94A3B8"
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        {...props}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}
      {hint && !error ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 4,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  error: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 2,
  },
  hint: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
});
