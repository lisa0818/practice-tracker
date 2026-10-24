/**
 * Welcome screen — sign up or log in.
 * Features a hero gradient, animated instrument icons, and two CTAs.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { FontSize, Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';

const INSTRUMENTS = ['🎵', '🎹', '🎻', '🎸', '🎤'];

function FloatingNote({ emoji, delay, x }: { emoji: string; delay: number; x: number }) {
  const y = useSharedValue(0);
  const op = useSharedValue(0.7);

  useEffect(() => {
    y.value = withRepeat(
      withSequence(
        withTiming(-18, { duration: 1800 + delay * 200 }),
        withTiming(0,   { duration: 1800 + delay * 200 })
      ), -1, true
    );
    op.value = withRepeat(
      withSequence(
        withTiming(1,   { duration: 900 + delay * 100 }),
        withTiming(0.4, { duration: 900 + delay * 100 })
      ), -1, true
    );
  }, []);

  const anim = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity:   op.value,
  }));

  return (
    <Animated.Text style={[styles.floatingNote, { left: x }, anim]}>
      {emoji}
    </Animated.Text>
  );
}

export default function WelcomeScreen() {
  const theme  = useTheme();
  const insets = useSafeAreaInsets();
  const { token } = useAuthStore();

  // Redirect if already logged in
  useEffect(() => {
    if (token) router.replace('/(tabs)/home');
  }, [token]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Hero gradient */}
      <LinearGradient
        colors={['#3730A3', '#4F46E5', '#818CF8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 40 }]}
      >
        {/* Floating instrument notes */}
        {INSTRUMENTS.map((e, i) => (
          <FloatingNote key={e} emoji={e} delay={i} x={40 + i * 62} />
        ))}

        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.heroContent}>
          <Text style={styles.heroTitle}>Practice Tracker</Text>
          <Text style={styles.heroSub}>
            Pitch-perfect practice,{'\n'}every single day.
          </Text>
        </Animated.View>
      </LinearGradient>

      {/* Bottom sheet */}
      <ScrollView
        style={[styles.sheet, { backgroundColor: theme.backgroundCard }]}
        contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + 24 }]}
      >
        <Animated.View entering={FadeInUp.delay(200).springify()}>
          <Text style={[styles.tagline, { color: theme.text, fontFamily: Fonts.heading }]}>
            Duolingo for instrument practice.
          </Text>
          <Text style={[styles.desc, { color: theme.textSecondary, fontFamily: Fonts.body }]}>
            Upload a recording, get instant pitch and timing feedback,
            and watch your score improve every session.
          </Text>

          <View style={styles.features}>
            {[
              { icon: '🎯', text: 'Pitch accuracy to the cent' },
              { icon: '⏱️', text: 'Onset timing & steadiness' },
              { icon: '📈', text: 'Progress trends & streaks' },
            ].map(f => (
              <View key={f.icon} style={styles.featureRow}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <Text style={[styles.featureText, { color: theme.textSecondary, fontFamily: Fonts.body }]}>
                  {f.text}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.ctas}>
            <Button
              label="Get started — sign up"
              onPress={() => router.push('/(auth)/register')}
              fullWidth
              size="lg"
            />
            <Button
              label="I already have an account"
              onPress={() => router.push('/(auth)/login')}
              variant="outline"
              fullWidth
              size="lg"
            />
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  hero: {
    height:          280,
    paddingHorizontal: 24,
    overflow:        'hidden',
  },
  heroContent: { marginTop: 20 },
  heroTitle: {
    fontSize:   FontSize.xxxl,
    fontFamily: Fonts.heading,
    color:      '#FFFFFF',
    lineHeight: FontSize.xxxl + 8,
  },
  heroSub: {
    fontSize:   FontSize.lg,
    color:      'rgba(255,255,255,0.85)',
    marginTop:  8,
    lineHeight: FontSize.lg + 8,
    fontFamily: Fonts.body,
  },
  floatingNote: {
    position: 'absolute',
    top:      60,
    fontSize: 30,
  },
  sheet: {
    flex:           1,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    marginTop:      -28,
  },
  sheetContent: {
    padding:  28,
    gap:      20,
  },
  tagline: {
    fontSize:   FontSize.xl,
    fontWeight: '700',
    lineHeight: FontSize.xl + 8,
    marginBottom: 10,
  },
  desc: {
    fontSize:   FontSize.base,
    lineHeight: FontSize.base + 8,
    marginBottom: 20,
  },
  features: {
    gap:           12,
    marginBottom:  24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  featureIcon: { fontSize: 20 },
  featureText: { fontSize: FontSize.base },
  ctas: { gap: 12 },
});
