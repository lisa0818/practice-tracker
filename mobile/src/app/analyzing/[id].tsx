/**
 * Analyzing screen — dynamic to the uploaded audio file and selected instrument.
 */

import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Rect } from 'react-native-svg';

import { Fonts, FontSize } from '@/constants/theme';
import { getSession } from '@/services/api';

const STEPS = [
  { id: 'uploaded', label: 'Recording uploaded' },
  { id: 'detecting', label: 'Detecting pitch & notes' },
  { id: 'onsets', label: 'Finding note starts' },
  { id: 'transcribe', label: 'Transcribing performance' },
  { id: 'scoring', label: 'Scoring pitch and timing' },
];

export default function AnalyzingScreen() {
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    instrument?: string;
    filename?: string;
  }>();

  const id = params.id;
  const insets = useSafeAreaInsets();

  const title = params.title || (id && id !== 'c-major-scale' ? decodeURIComponent(id).replace(/-/g, ' ') : 'Eight White Keys');
  const instrument = params.instrument || 'Piano';
  const filename = params.filename || `${title.replace(/\s+/g, '_')}.mp3`;

  const [currentStep, setCurrentStep] = useState(2);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  // A real session comes from the backend; anything else is the offline demo flow
  const isRealSession = !!id && id.length >= 20;

  // Poll backend session if real UUID from API
  useEffect(() => {
    if (!id || id.length < 20) return;

    let timer: any;
    const check = async () => {
      try {
        const s = await getSession(id);
        if (s.status === 'processing') {
          setCurrentStep(3);
        } else if (s.status === 'completed' && s.result) {
          setCurrentStep(5);
          setDone(true);
        } else if (s.status === 'failed' || s.status === 'completed') {
          // Finished without a result: the analysis never came back
          setFailed(true);
        }
      } catch {
        // Fallback to local progression
      }
    };

    check();
    timer = setInterval(check, 3000);
    return () => clearInterval(timer);
  }, [id]);

  // Smooth step progress progression:
  // Step 2 -> Step 3 -> Step 4 -> Step 5 (Done)
  useEffect(() => {
    if (isRealSession) return;   // a real analysis finishes when the backend says so
    const t1 = setTimeout(() => setCurrentStep(2), 600);
    const t2 = setTimeout(() => setCurrentStep(3), 1600);
    const t3 = setTimeout(() => setCurrentStep(4), 2600);
    const t4 = setTimeout(() => {
      setCurrentStep(5);
      setDone(true);
    }, 3600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [isRealSession]);

  // When all steps are done, automatically transition to results
  useEffect(() => {
    if (done) {
      const autoNav = setTimeout(() => {
        router.replace({
          pathname: `/result/${id ?? 'eight-white-keys'}` as any,
          params: { title, instrument },
        });
      }, 800);
      return () => clearTimeout(autoNav);
    }
  }, [done, id, title, instrument]);

  const progressFraction = currentStep >= 5 ? 1 : (currentStep + 1) * 0.18;

  if (failed) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.replace('/(tabs)/home' as any)} hitSlop={12} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.contentWrap}>
          <Text style={styles.title}>Analysis didn't finish</Text>
          <Text style={styles.subtitle}>{filename} · instrument: {instrument}</Text>
          <Text style={styles.disclaimerText}>
            We couldn't analyze this recording, so nothing was added to your progress. This is usually a
            temporary problem with the analysis service. Please try uploading it again in a moment.
          </Text>
        </View>
        <View style={styles.bottomActions}>
          <Pressable
            onPress={() => router.replace('/upload' as any)}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.primaryBtnText}>Try again</Text>
          </Pressable>
          <Pressable onPress={() => router.replace('/(tabs)/home' as any)} style={styles.homeLink}>
            <Text style={styles.homeLinkText}>Back to home</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
      {/* Top Bar: Close Button */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.replace('/(tabs)/home' as any)} hitSlop={12} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.contentWrap}>
        {/* Animated Progress Ring with Soundwave Icon */}
        <View style={styles.ringContainer}>
          <Svg width={96} height={96} viewBox="0 0 96 96">
            <Circle
              cx={48}
              cy={48}
              r={40}
              stroke="#EEF2FF"
              strokeWidth={5}
              fill="none"
            />
            <Circle
              cx={48}
              cy={48}
              r={40}
              stroke="#4F46E5"
              strokeWidth={5}
              strokeDasharray={251.2}
              strokeDashoffset={251.2 * (1 - progressFraction)}
              strokeLinecap="round"
              fill="none"
              transform="rotate(-90 48 48)"
            />
          </Svg>
          <View style={styles.centerIconWrap}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Rect x={4} y={9} width={2.5} height={6} rx={1.25} fill="#4F46E5" />
              <Rect x={9} y={5} width={2.5} height={14} rx={1.25} fill="#4F46E5" />
              <Rect x={14} y={3} width={2.5} height={18} rx={1.25} fill="#4F46E5" />
              <Rect x={19} y={7} width={2.5} height={10} rx={1.25} fill="#4F46E5" />
            </Svg>
          </View>
        </View>

        {/* Headings */}
        <Text style={styles.title}>
          {done ? 'Analysis complete! 🎉' : 'Analyzing your recording'}
        </Text>
        <Text style={styles.subtitle}>
          {filename} · instrument: {instrument}
        </Text>

        {/* Steps List */}
        <View style={styles.stepsContainer}>
          {STEPS.map((step, idx) => {
            const isDone = idx < currentStep;
            const isWorking = idx === currentStep;
            const isWaiting = idx > currentStep;

            return (
              <View key={step.id} style={styles.stepRow}>
                <View style={styles.stepLeft}>
                  {isDone ? (
                    <View style={styles.checkCircle}>
                      <Text style={styles.checkMark}>✓</Text>
                    </View>
                  ) : isWorking ? (
                    <View style={styles.workingCircle}>
                      <View style={styles.workingInnerDot} />
                    </View>
                  ) : (
                    <View style={styles.waitingCircle} />
                  )}
                  <Text style={[styles.stepLabel, isWaiting && styles.stepLabelMuted]}>
                    {step.label}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.statusBadge,
                    isDone && styles.statusDone,
                    isWorking && styles.statusWorking,
                    isWaiting && styles.statusWaiting,
                  ]}
                >
                  {isDone ? 'Done' : isWorking ? 'Working…' : 'Waiting'}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Disclaimer */}
        <Text style={styles.disclaimerText}>
          You can leave this screen. The result will be saved to your history.
        </Text>
      </View>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <Pressable
          onPress={() => router.replace({
            pathname: `/result/${id ?? 'eight-white-keys'}` as any,
            params: { title, instrument },
          })}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryBtnText}>See result preview</Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace('/(tabs)/home' as any)}
          style={styles.homeLink}
        >
          <Text style={styles.homeLinkText}>Back to home</Text>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },
  contentWrap: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  ringContainer: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  centerIconWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 28,
  },
  stepsContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  stepLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  workingCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  workingInnerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4F46E5',
  },
  waitingCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
  },
  stepLabel: {
    fontSize: 14,
    fontFamily: Fonts.body,
    fontWeight: '600',
    color: '#0F172A',
  },
  stepLabelMuted: {
    color: '#94A3B8',
    fontWeight: '400',
  },
  statusBadge: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontWeight: '500',
  },
  statusDone: {
    color: '#94A3B8',
  },
  statusWorking: {
    color: '#4F46E5',
    fontStyle: 'italic',
  },
  statusWaiting: {
    color: '#CBD5E1',
  },
  disclaimerText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  bottomActions: {
    gap: 12,
    width: '100%',
  },
  primaryBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: Fonts.body,
    fontWeight: '700',
  },
  homeLink: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  homeLinkText: {
    fontSize: 14,
    fontFamily: Fonts.body,
    fontWeight: '600',
    color: '#4F46E5',
  },
  pressed: {
    opacity: 0.85,
  },
});
