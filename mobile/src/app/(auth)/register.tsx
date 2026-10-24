/**
 * Register screen.
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Input }  from '@/components/Input';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { getErrorMessage } from '@/services/api';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { register } = useAuthStore();

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function handleRegister() {
    if (!name || !email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await register({ full_name: name, email: email.trim().toLowerCase(), password });
      router.replace('/(tabs)/home' as any);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#F8FAFC' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.sub}>Start tracking your musical progress today.</Text>

        <View style={styles.form}>
          <Input
            label="Full name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
            placeholder="Maya Lin"
          />
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
            autoComplete="password-new"
            placeholder="••••••••"
            hint="Use a strong password you'll remember."
          />

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          <Button
            label="Create account"
            onPress={handleRegister}
            loading={loading}
            fullWidth
            size="lg"
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Pressable onPress={() => router.replace('/(auth)/login' as any)}>
            <Text style={styles.link}>Log in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
  },
  back: {
    marginBottom: 20,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
    fontFamily: Fonts.body,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: Fonts.heading,
    marginBottom: 4,
  },
  sub: {
    fontSize: 14,
    color: '#64748B',
    fontFamily: Fonts.body,
    marginBottom: 24,
  },
  form: {
    gap: 4,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    marginBottom: 8,
    fontFamily: Fonts.body,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 13,
    color: '#64748B',
    fontFamily: Fonts.body,
  },
  link: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
    fontFamily: Fonts.body,
  },
});
