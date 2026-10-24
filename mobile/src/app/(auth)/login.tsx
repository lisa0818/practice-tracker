/**
 * Login screen.
 */

import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Input }  from '@/components/Input';
import { FontSize, Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { getErrorMessage } from '@/services/api';

export default function LoginScreen() {
  const theme  = useTheme();
  const insets = useSafeAreaInsets();
  const { login } = useAuthStore();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function handleLogin() {
    if (!email || !password) {
      setError('Please fill in both fields.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace('/(tabs)/home');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInDown.delay(50).springify()}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Text style={[styles.backText, { color: theme.accent }]}>← Back</Text>
          </Pressable>

          <Text style={[styles.title, { color: theme.text, fontFamily: Fonts.heading }]}>
            Welcome back
          </Text>
          <Text style={[styles.sub, { color: theme.textSecondary, fontFamily: Fonts.body }]}>
            Log in to continue your practice journey.
          </Text>

          <View style={styles.form}>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="you@example.com"
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              placeholder="••••••••"
            />

            {error ? (
              <Text style={[styles.error, { color: theme.error }]}>{error}</Text>
            ) : null}

            <Button
              label="Log in"
              onPress={handleLogin}
              loading={loading}
              fullWidth
              size="lg"
            />
          </View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: theme.textMuted }]}>
              Don't have an account?{' '}
            </Text>
            <Pressable onPress={() => router.replace('/(auth)/register')}>
              <Text style={[styles.link, { color: theme.accent }]}>Sign up</Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 28, gap: 0 },
  back:    { marginBottom: 24 },
  backText:{ fontSize: FontSize.base, fontWeight: '500' },
  title: {
    fontSize:   FontSize.xxl,
    fontWeight: '700',
    marginBottom: 8,
  },
  sub: {
    fontSize:   FontSize.base,
    marginBottom: 32,
  },
  form:  { gap: 16 },
  error: {
    fontSize:  FontSize.sm,
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent:'center',
    alignItems:    'center',
    marginTop:     28,
  },
  footerText: { fontSize: FontSize.sm },
  link: {
    fontSize:   FontSize.sm,
    fontWeight: '600',
  },
});
