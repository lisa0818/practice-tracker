/**
 * Analyzing screen — polls session status and shows progress steps.
 * User can navigate away; result is saved when worker finishes.
 */

import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
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

import { FontSize, Fonts, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getSession } from '@/services/api';

const STEPS = [
  { id: 'uploaded',  label: 'File uploaded',           emoji: '📤' },
  { id: 'detecting', label: 'Detecting pitch',          emoji: '🔍' },
  { id: 'onsets',    label: 'Finding note starts',      emoji: '🎵' },
  { id: 'matching',  label: 'Matching to target',       emoji: '🎯' },
  { id: 'scoring',   label: 'Computing score',          emoji: '📊' },
];

function PulsingDot() {
  const theme = useTheme();
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 600 }),
        withTiming(1.0, { duration: 600 })
      ), -1, true
    );
  }, []);

  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[styles.dot, { backgroundColor: theme.accent }, anim]} />
  );
}

function StepRow({
  step, status, delay,
}: {
  step:   typeof STEPS[number];
  status: 'done' | 'active' | 'pending';
  delay:  number;
}) {
  const theme = useTheme();
  const color = status === 'done'
    ? theme.inTune
    : status === 'active'
    ? theme.accent
    : theme.textMuted;

  return (
    <Animated.View entering={FadeInDown.delay(delay).springify()} style={styles.stepRow}>
      <View style={[styles.stepDot, { backgroundColor: status === 'pending' ? theme.backgroundElement : color }]}>
        {status === 'active' ? (
          <PulsingDot />
        ) : (
          <Text style={styles.stepEmoji}>{status === 'done' ? '✓' : '·'}</Text>
        )}
      </View>
      <Text style={[
        styles.stepLabel,
        { color, fontFamily: Fonts.body, fontWeight: status === 'active' ? '600' : '400' }
      ]}>
        {step.label}
      </Text>
      {status === 'active' && (
        <Text style={styles.stepActiveEmoji}>{step.emoji}</Text>
      )}
    </Animated.View>
  );
}

const STATUS_TO_STEP: Record<string, number> = {
  pending:    0,
  processing: 2,
  completed:  5,
  failed:     -1,
};

export default function AnalyzingScreen() {
  const theme   = useTheme();
  const insets  = useSafeAreaInsets();
  const { id }  = useLocalSearchParams<{ id: string }>();

  const [currentStep, setCurrentStep] = useState(0);
  const [done,   setDone]   = useState(false);
  const [failed, setFailed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Simulate progress steps even while waiting
  useEffect(() => {
    // Step advance animation (visual only, up to step 4)
    const stepTimer = setInterval(() => {
      setCurrentStep(prev => (prev < 4 ? prev + 1 : prev));
    }, 2200);
    return () => clearInterval(stepTimer);
  }, []);

  // Poll for real result
  useEffect(() => {
    if (!id) return;
    const poll = async () => {
      try {
        const session = await getSession(id);
        if (session.status === 'completed') {
          clearInterval(pollRef.current!);
          setCurrentStep(5);
          setDone(true);
        } else if (session.status === 'failed') {
          clearInterval(pollRef.current!);
          setFailed(true);
        }
      } catch { /* ignore */ }
    };

    pollRef.current = setInterval(poll, 3000);
    poll(); // first call immediately
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [id]);

  // Auto-navigate when done
  useEffect(() => {
    if (done) {
      setTimeout(() => router.replace(`/result/${id}` as any), 600);
    }
  }, [done]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <Animated.View entering={FadeInUp.delay(50).springify()} style={styles.top}>
        {/* Animated waveform illustration */}
        <View style={styles.waveContainer}>
          {[...Array(9)].map((_, i) => (
            <WaveBar key={i} index={i} />
          ))}
        </View>

        <Text style={[styles.title, { color: theme.text, fontFamily: Fonts.heading }]}>
          {failed ? 'Analysis failed' : done ? 'Done! 🎉' : 'Analyzing your recording…'}
        </Text>
        <Text style={[styles.sub, { color: theme.textMuted, fontFamily: Fonts.body }]}>
          {failed
            ? 'Something went wrong. Please try again.'
            : done
            ? 'Your results are ready!'
            : "You can leave \u2014 we'll save the result."}
        </Text>
      </Animated.View>

      {/* Steps */}
      <View style={styles.steps}>
        {STEPS.map((step, i) => (
          <StepRow
            key={step.id}
            step={step}
            status={i < currentStep ? 'done' : i === currentStep ? 'active' : 'pending'}
            delay={i * 80}
          />
        ))}
      </View>

      {/* Actions */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        {done && (
          <Animated.View entering={FadeInDown.springify()}>
            <Pressable
              onPress={() => router.replace(`/result/${id}` as any)}
              style={[styles.viewBtn, { backgroundColor: theme.accent }]}
            >
              <Text style={[styles.viewBtnText, { fontFamily: Fonts.body }]}>View results →</Text>
            </Pressable>
          </Animated.View>
        )}
        {!done && !failed && (
          <Pressable onPress={() => router.replace('/(tabs)/home')}>
            <Text style={[styles.leaveText, { color: theme.textMuted }]}>Go to Home — we'll notify you</Text>
          </Pressable>
        )}
        {failed && (
          <Pressable onPress={() => router.replace('/upload')} style={[styles.viewBtn, { backgroundColor: theme.error }]}>
            <Text style={[styles.viewBtnText, { fontFamily: Fonts.body }]}>Try again</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function WaveBar({ index }: { index: number }) {
  const theme  = useTheme();
  const height = useSharedValue(8);
  useEffect(() => {
    const delay = index * 120;
    height.value = withRepeat(
      withSequence(
        withTiming(8,  { duration: 300 + delay }),
        withTiming(32 + (index % 3) * 12, { duration: 300 + delay }),
        withTiming(8,  { duration: 300 + delay }),
      ), -1, true
    );
  }, []);
  const anim = useAnimatedStyle(() => ({ height: height.value }));
  return (
    <Animated.View
      style={[
        styles.waveBar,
        { backgroundColor: theme.accent, opacity: 0.6 + (index % 3) * 0.13 },
        anim,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, paddingHorizontal: 28 },
  top:     { alignItems: 'center', paddingTop: 40, paddingBottom: 32 },
  waveContainer: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
    height:        60,
    marginBottom:  28,
  },
  waveBar: {
    width:        6,
    borderRadius: 3,
  },
  title:   { fontSize: FontSize.xl, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  sub:     { fontSize: FontSize.base, textAlign: 'center', lineHeight: FontSize.base + 8 },
  steps:   { gap: 18, paddingVertical: 8 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepDot: {
    width:          28,
    height:         28,
    borderRadius:   14,
    alignItems:     'center',
    justifyContent: 'center',
  },
  dot: {
    width:        10,
    height:       10,
    borderRadius: 5,
  },
  stepEmoji:      { fontSize: 12, color: '#fff', fontWeight: '700' },
  stepLabel:      { fontSize: FontSize.base, flex: 1 },
  stepActiveEmoji:{ fontSize: 18 },
  bottom: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', gap: 14 },
  viewBtn: {
    paddingVertical:   14,
    paddingHorizontal: 36,
    borderRadius:      28,
  },
  viewBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: '700' },
  leaveText:   { fontSize: FontSize.sm, textDecorationLine: 'underline' },
});
