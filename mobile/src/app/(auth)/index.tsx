/**
 * Welcome Screen — matches screenshot '1 · Welcome' exactly.
 */

import { router } from 'expo-router';
import React, { useEffect } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Rect } from 'react-native-svg';

import { Fonts, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';

function AppLogo() {
  return (
    <View style={styles.logoRow}>
      <View style={styles.logoIcon}>
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Rect x={3} y={9} width={2.5} height={6} rx={1.25} fill="#FFFFFF" />
          <Rect x={8} y={5} width={2.5} height={14} rx={1.25} fill="#FFFFFF" />
          <Rect x={13} y={3} width={2.5} height={18} rx={1.25} fill="#FFFFFF" />
          <Rect x={18} y={7} width={2.5} height={10} rx={1.25} fill="#FFFFFF" />
        </Svg>
      </View>
      <Text style={styles.logoText}>Practice Tracker</Text>
    </View>
  );
}

function MiniContourPreview() {
  return (
    <View style={styles.previewCard}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.pieceTitle}>Minuet in G</Text>
          <Text style={styles.pieceSub}>Violin · today</Text>
        </View>
        <Text style={styles.pieceScore}>
          <Text style={styles.scoreBold}>86</Text>
          <Text style={styles.scoreTotal}> / 100</Text>
        </Text>
      </View>

      {/* Stepped contour visualization */}
      <View style={styles.graphContainer}>
        <Svg width="100%" height={50} viewBox="0 0 260 50">
          {/* Subtle dotted baseline */}
          <Line x1={10} y1={25} x2={250} y2={25} stroke="#E2E8F0" strokeWidth={1} strokeDasharray="3,3" />

          {/* Stepped note lines: in tune (teal) and off pitch (orange) */}
          {/* Note 1: in tune */}
          <Line x1={15} y1={36} x2={45} y2={36} stroke="#0D9488" strokeWidth={2.5} strokeLinecap="round" />
          {/* Note 2: in tune */}
          <Line x1={55} y1={32} x2={85} y2={32} stroke="#0D9488" strokeWidth={2.5} strokeLinecap="round" />
          {/* Note 3: off pitch (raised) */}
          <Line x1={95} y1={20} x2={130} y2={20} stroke="#EA580C" strokeWidth={3.5} strokeLinecap="round" />
          {/* Note 4: in tune */}
          <Line x1={140} y1={28} x2={175} y2={28} stroke="#0D9488" strokeWidth={2.5} strokeLinecap="round" />
          {/* Note 5: in tune */}
          <Line x1={185} y1={22} x2={220} y2={22} stroke="#0D9488" strokeWidth={2.5} strokeLinecap="round" />
        </Svg>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: '#0D9488' }]} />
            <Text style={styles.legendText}>In tune</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: '#EA580C', height: 3.5 }]} />
            <Text style={styles.legendText}>Off pitch</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function WelcomeScreen() {
  const theme  = useTheme();
  const insets = useSafeAreaInsets();
  const { token } = useAuthStore();

  useEffect(() => {
    if (token) router.replace('/(tabs)/home' as any);
  }, [token]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* App Logo */}
        <AppLogo />

        {/* Headline */}
        <Text style={styles.headline}>
          Practice smarter.{'\n'}Hear every cent.
        </Text>

        {/* Subtitle */}
        <Text style={styles.subheadline}>
          Upload a recording, get instant feedback on pitch and timing, then watch your progress build week after week.
        </Text>

        {/* Preview Card */}
        <MiniContourPreview />

        {/* Works for chips */}
        <View style={styles.chipsSection}>
          <View style={styles.chipRow}>
            <Text style={styles.worksForLabel}>Works for</Text>
            {['Voice', 'Violin', 'Guitar'].map((item) => (
              <View key={item} style={styles.chip}>
                <Text style={styles.chipText}>{item}</Text>
              </View>
            ))}
          </View>
          <View style={styles.chipRowSecond}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>Piano</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom CTAs */}
      <View style={styles.bottomActions}>
        <Pressable
          onPress={() => router.push('/(auth)/register' as any)}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryBtnText}>Create free account</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/(auth)/login' as any)}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryBtnText}>Log in</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 28,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 17,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    color: '#0F172A',
  },
  headline: {
    fontSize: 32,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 38,
    marginBottom: 12,
  },
  subheadline: {
    fontSize: 14,
    fontFamily: Fonts.body,
    color: '#64748B',
    lineHeight: 21,
    marginBottom: 24,
  },
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  pieceTitle: {
    fontSize: 16,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    color: '#0F172A',
  },
  pieceSub: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: '#94A3B8',
    marginTop: 2,
  },
  pieceScore: {
    fontSize: 15,
    color: '#0F172A',
    fontFamily: Fonts.mono,
  },
  scoreBold: {
    fontWeight: '700',
  },
  scoreTotal: {
    color: '#94A3B8',
    fontWeight: '400',
  },
  graphContainer: {
    marginTop: 6,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendLine: {
    width: 14,
    height: 2.5,
    borderRadius: 1.5,
  },
  legendText: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: '#64748B',
  },
  chipsSection: {
    gap: 8,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipRowSecond: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  worksForLabel: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: '#64748B',
    marginRight: 4,
  },
  chip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  chipText: {
    fontSize: 13,
    fontFamily: Fonts.body,
    fontWeight: '500',
    color: '#334155',
  },
  bottomActions: {
    gap: 10,
    paddingTop: 8,
  },
  primaryBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontFamily: Fonts.body,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 15,
    fontFamily: Fonts.body,
    fontWeight: '600',
    color: '#0F172A',
  },
  pressed: {
    opacity: 0.85,
  },
});
