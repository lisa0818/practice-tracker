/**
 * Timing result screen — dynamic to the uploaded audio and instrument.
 */

import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts, FontSize } from '@/constants/theme';
import { getSession, type SessionDetail } from '@/services/api';

const DEFAULT_BEAT_NOTES = [
  { name: 'C4', ms: +12, onBeat: true },
  { name: 'D4', ms: -6,  onBeat: true },
  { name: 'E4', ms: +20, onBeat: true },
  { name: 'F4', ms: +64, onBeat: false }, // off beat
  { name: 'G4', ms: +15, onBeat: true },
  { name: 'A4', ms: +8,  onBeat: true },
  { name: 'B4', ms: -38, onBeat: true },
  { name: 'C5', ms: +22, onBeat: true },
];

function midiToName(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export default function TimingScreen() {
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    instrument?: string;
  }>();

  const id = params.id;
  const insets = useSafeAreaInsets();

  const [session, setSession] = useState<SessionDetail | null>(null);

  useEffect(() => {
    if (!id || id.length < 20) return;
    getSession(id)
      .then(setSession)
      .catch(() => {});
  }, [id]);

  const rawTitle = params.title || session?.title || (id && id !== 'c-major-scale' ? decodeURIComponent(id).replace(/-/g, ' ') : 'Eight White Keys');
  const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
  const instrument = params.instrument || session?.instrument || 'Piano';

  // Real calculated beat notes from the model
  const timedEvents = session?.result?.note_events?.filter((n) => n.onset_error_ms != null) ?? [];
  // The worker leaves timing out when it can't find a reliable pulse (busy or free rhythm)
  const timingUnavailable = !!session?.result && timedEvents.length === 0;

  const beatNotes = timedEvents.length > 0
    ? timedEvents.map((n, i) => {
        const name = n.label || midiToName(n.midi) || `N${i + 1}`;
        const ms = Math.round(n.onset_error_ms ?? 0);
        return { name, ms, onBeat: n.early_late === 'onBeat' };
      })
    : timingUnavailable ? [] : DEFAULT_BEAT_NOTES;

  const onBeatCount = beatNotes.filter((b) => b.onBeat).length;
  const avgOffset = session?.result?.avg_onset_ms != null
    ? `${session.result.avg_onset_ms > 0 ? '+' : ''}${Math.round(session.result.avg_onset_ms)} ms`
    : '+12 ms';
  // Spread of the onset errors, in ms (the stored steadiness value is a 0-100 score)
  const errMs = beatNotes.map((b) => b.ms);
  const meanMs = errMs.reduce((a, b) => a + b, 0) / Math.max(1, errMs.length);
  const stdMs = Math.sqrt(errMs.reduce((a, b) => a + (b - meanMs) ** 2, 0) / Math.max(1, errMs.length));
  const steadiness = errMs.length > 0 ? `±${Math.round(stdMs)} ms` : '±27 ms';
  const tip = session?.result?.practice_tip ?? 'Focus on keeping a steady pulse with a metronome to minimize early and late onsets.';

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.screenLabel}>Session result</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
      >
        {/* Title & Metadata */}
        <Text style={styles.title}>Timing</Text>
        <Text style={styles.subtitle}>{title} · {instrument}</Text>

        {timingUnavailable && (
          <View style={styles.tipCard}>
            <Text style={styles.tipIcon}>ℹ️</Text>
            <Text style={styles.tipText}>
              Timing couldn't be judged reliably for this recording. {tip}
            </Text>
          </View>
        )}

        {/* 3 Top Stat Tiles */}
        {!timingUnavailable && (<>
        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Text style={styles.statLabel}>Average offset</Text>
            <Text style={styles.statValue}>{avgOffset}</Text>
          </View>

          <View style={styles.statTile}>
            <Text style={styles.statLabel}>Steadiness</Text>
            <Text style={styles.statValue}>{steadiness}</Text>
          </View>

          <View style={styles.statTile}>
            <Text style={styles.statLabel}>On the beat</Text>
            <Text style={styles.statValue}>{onBeatCount} / {beatNotes.length}</Text>
          </View>
        </View>

        {/* Beat by Beat Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Beat by beat</Text>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={styles.greenCircle} />
                <Text style={styles.legendText}>On beat</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={styles.orangeDiamond} />
                <Text style={styles.legendText}>Off beat</Text>
              </View>
            </View>
          </View>

          {/* Row of Beats */}
          <View style={styles.beatsContainer}>
            {beatNotes.map((b, idx) => (
              <View key={`${b.name}-${idx}`} style={styles.beatCol}>
                <View style={styles.beatShapeWrap}>
                  {b.onBeat ? (
                    <View style={styles.beatCircle} />
                  ) : (
                    <View style={styles.beatDiamond} />
                  )}
                </View>
                <Text style={styles.beatNoteName}>{b.name}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Onset Error Per Note Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Onset error per note</Text>
            <Text style={styles.inMsLabel}>in ms</Text>
          </View>

          {/* Column subheaders */}
          <View style={styles.chartSubheader}>
            <View style={{ width: 26 }} />
            <View style={styles.chartAxisHeader}>
              <Text style={styles.axisLabel}>← Early</Text>
              <Text style={styles.axisLabelZero}>0</Text>
              <Text style={styles.axisLabel}>Late →</Text>
            </View>
            <View style={{ width: 36 }} />
          </View>

          {/* Chart Rows */}
          <View style={styles.chartContainer}>
            {beatNotes.map((b, idx) => {
              const maxMs = 70;
              const isLate = b.ms >= 0;
              const barWidth = Math.min(Math.abs(b.ms) / maxMs * 70, 70);
              const color = b.onBeat ? '#0D9488' : '#EA580C';

              return (
                <View key={`${b.name}-${idx}`} style={styles.chartRow}>
                  {/* Note Label */}
                  <Text style={styles.chartNoteLabel}>{b.name}</Text>

                  {/* Centered Bar Area */}
                  <View style={styles.barArea}>
                    {/* Tolerance Zone Background */}
                    <View style={styles.toleranceBand} />

                    {/* Center 0 Line */}
                    <View style={styles.zeroLine} />

                    {/* Horizontal Bar */}
                    {isLate ? (
                      <View
                        style={[
                          styles.barLate,
                          {
                            width: barWidth,
                            backgroundColor: color,
                            left: '50%',
                          },
                        ]}
                      />
                    ) : (
                      <View
                        style={[
                          styles.barEarly,
                          {
                            width: barWidth,
                            backgroundColor: color,
                            right: '50%',
                          },
                        ]}
                      />
                    )}
                  </View>

                  {/* Signed ms value */}
                  <Text style={styles.chartMsVal}>
                    {b.ms > 0 ? `+${b.ms}` : `${b.ms}`}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Practice Tip Card */}
        <View style={styles.tipCard}>
          <Text style={styles.tipIcon}>💡</Text>
          <Text style={styles.tipText}>{tip}</Text>
        </View>
        </>)}
      </ScrollView>

      {/* Bottom Action Buttons */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={() => router.push({
            pathname: `/result/${id ?? 'eight-white-keys'}` as any,
            params: { title, instrument },
          })}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryBtnText}>Pitch result</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/upload' as any)}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryBtnText}>Upload another</Text>
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
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 20,
    color: '#0F172A',
    fontWeight: '700',
    marginTop: -2,
  },
  screenLabel: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: '#64748B',
    fontWeight: '500',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  title: {
    fontSize: 26,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: '#64748B',
    marginBottom: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statTile: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statLabel: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: '#94A3B8',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    color: '#0F172A',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    color: '#0F172A',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  greenCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0D9488',
  },
  orangeDiamond: {
    width: 8,
    height: 8,
    backgroundColor: '#EA580C',
    transform: [{ rotate: '45deg' }],
  },
  legendText: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: '#64748B',
  },
  beatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  beatCol: {
    alignItems: 'center',
    gap: 8,
  },
  beatShapeWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beatCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0D9488',
  },
  beatDiamond: {
    width: 12,
    height: 12,
    backgroundColor: '#EA580C',
    transform: [{ rotate: '45deg' }],
  },
  beatNoteName: {
    fontSize: 11,
    fontFamily: Fonts.mono,
    color: '#64748B',
  },
  inMsLabel: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: '#94A3B8',
  },
  chartSubheader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  chartAxisHeader: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  axisLabel: {
    fontSize: 10,
    fontFamily: Fonts.body,
    color: '#94A3B8',
  },
  axisLabelZero: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    fontWeight: '700',
    color: '#64748B',
  },
  chartContainer: {
    gap: 6,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chartNoteLabel: {
    width: 26,
    fontSize: 11,
    fontFamily: Fonts.mono,
    color: '#64748B',
  },
  barArea: {
    flex: 1,
    height: 18,
    backgroundColor: '#F8FAFC',
    borderRadius: 4,
    position: 'relative',
    justifyContent: 'center',
  },
  toleranceBand: {
    position: 'absolute',
    left: '35%',
    right: '35%',
    top: 0,
    bottom: 0,
    backgroundColor: '#F0FDFA',
  },
  zeroLine: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#CBD5E1',
  },
  barLate: {
    position: 'absolute',
    height: 8,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  barEarly: {
    position: 'absolute',
    height: 8,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  chartMsVal: {
    width: 36,
    fontSize: 11,
    fontFamily: Fonts.mono,
    color: '#0F172A',
    textAlign: 'right',
  },
  tipCard: {
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  tipIcon: {
    fontSize: 18,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.body,
    color: '#3730A3',
    lineHeight: 18,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontFamily: Fonts.body,
    fontWeight: '600',
    color: '#0F172A',
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 14,
    fontFamily: Fonts.body,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.85,
  },
});
