/**
 * Pitch result screen — dynamic to the uploaded audio and instrument.
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
import Svg, { Circle, Line } from 'react-native-svg';

import { Fonts, FontSize } from '@/constants/theme';
import { getSession, type SessionDetail } from '@/services/api';

const DEFAULT_NOTES = [
  { label: 'C4', midi: 60, onset_s: 0.2, offset_s: 0.6, cents_error: 4.2 },
  { label: 'D4', midi: 62, onset_s: 0.8, offset_s: 1.2, cents_error: -2.1 },
  { label: 'E4', midi: 64, onset_s: 1.4, offset_s: 1.8, cents_error: 5.6 },
  { label: 'F4', midi: 65, onset_s: 2.0, offset_s: 2.4, cents_error: -31.0 },
  { label: 'G4', midi: 67, onset_s: 2.6, offset_s: 3.0, cents_error: 3.2 },
  { label: 'A4', midi: 69, onset_s: 3.2, offset_s: 3.6, cents_error: -6.4 },
  { label: 'B4', midi: 71, onset_s: 3.8, offset_s: 4.2, cents_error: +27.0 },
  { label: 'C5', midi: 72, onset_s: 4.4, offset_s: 4.8, cents_error: 1.8 },
];

function midiToName(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export default function PitchResultScreen() {
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    instrument?: string;
  }>();

  const id = params.id;
  const insets = useSafeAreaInsets();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'contour' | 'notes'>('contour');

  useEffect(() => {
    if (!id || id.length < 20) return;
    getSession(id)
      .then(setSession)
      .catch(() => {});
  }, [id]);

  const rawTitle = params.title || session?.title || (id && id !== 'c-major-scale' ? decodeURIComponent(id).replace(/-/g, ' ') : 'Eight White Keys');
  const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
  const instrument = params.instrument || session?.instrument || 'Piano';

  // Real calculated note events
  const notes = session?.result?.note_events && session.result.note_events.length > 0
    ? session.result.note_events.map((n, idx) => ({
        ...n,
        label: n.label || midiToName(n.midi),
        idx: idx + 1,
      }))
    : DEFAULT_NOTES.map((n, idx) => ({ ...n, idx: idx + 1 }));

  // Dynamic range for Y-axis
  const midis = notes.map((n) => n.midi);
  const minMidi = Math.min(...midis);
  const maxMidi = Math.max(...midis);
  const span = Math.max(7, maxMidi - minMidi);
  const topMidi = maxMidi;
  const bottomMidi = minMidi;

  // Build 8 pitch labels across the range
  const pitchLabels: string[] = [];
  const labelStep = Math.max(1, Math.round(span / 7));
  for (let m = topMidi; m >= bottomMidi - 1 && pitchLabels.length < 8; m -= labelStep) {
    pitchLabels.push(midiToName(m));
  }
  while (pitchLabels.length < 8) {
    const lastMidi = topMidi - pitchLabels.length;
    pitchLabels.push(midiToName(lastMidi));
  }

  // Calculated metrics
  const inTuneCount = notes.filter((n) => Math.abs(n.cents_error ?? 0) <= 20).length;
  const inTunePct = session?.result?.in_tune_pct != null
    ? Math.round(session.result.in_tune_pct)
    : Math.round((inTuneCount / notes.length) * 100);

  const avgCents = session?.result?.avg_cents_error != null
    ? session.result.avg_cents_error
    : -9.0;
  const avgErrorStr = `${avgCents > 0 ? '+' : ''}${Math.round(avgCents)} ¢ ${avgCents >= 0 ? 'sharp' : 'flat'}`;

  const pitchScore = Math.round(session?.result?.pitch_score ?? session?.result?.overall_score ?? 84);

  // Notes with intonation issues
  const outOfTuneNotes = notes.filter((n) => Math.abs(n.cents_error ?? 0) > 20);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* Top Header */}
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
        {/* Title & Metadata matching uploaded audio */}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{instrument} · today · 0:48</Text>

        {/* Score Card */}
        <View style={styles.scoreCard}>
          {/* Circular Gauge */}
          <View style={styles.gaugeContainer}>
            <Svg width={88} height={88} viewBox="0 0 88 88">
              <Circle
                cx={44}
                cy={44}
                r={36}
                stroke="#EEF2FF"
                strokeWidth={7}
                fill="none"
              />
              <Circle
                cx={44}
                cy={44}
                r={36}
                stroke="#4F46E5"
                strokeWidth={7}
                strokeDasharray={226.2}
                strokeDashoffset={226.2 * (1 - pitchScore / 100)}
                strokeLinecap="round"
                fill="none"
                transform="rotate(-90 44 44)"
              />
            </Svg>
            <View style={styles.gaugeTextWrap}>
              <Text style={styles.gaugeScore}>{pitchScore}</Text>
              <Text style={styles.gaugeLabel}>Pitch score</Text>
            </View>
          </View>

          {/* Right Metrics */}
          <View style={styles.metricsCol}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Frames in tune</Text>
              <Text style={styles.metricVal}>{inTunePct}%</Text>
            </View>
            <View style={styles.metricDivider} />

            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Average error</Text>
              <Text style={styles.metricVal}>{avgErrorStr}</Text>
            </View>
            <View style={styles.metricDivider} />

            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Notes in tune</Text>
              <Text style={styles.metricVal}>{inTuneCount} / {notes.length}</Text>
            </View>
          </View>
        </View>

        {/* Pitch Contour Card */}
        <View style={styles.contourCard}>
          <View style={styles.contourHeader}>
            <Text style={styles.contourTitle}>Pitch contour</Text>
            <View style={styles.segmentedToggle}>
              <Pressable
                onPress={() => setActiveTab('contour')}
                style={[styles.segBtn, activeTab === 'contour' && styles.segBtnActive]}
              >
                <Text style={[styles.segText, activeTab === 'contour' && styles.segTextActive]}>
                  Contour
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab('notes')}
                style={[styles.segBtn, activeTab === 'notes' && styles.segBtnActive]}
              >
                <Text style={[styles.segText, activeTab === 'notes' && styles.segTextActive]}>
                  Notes
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Graph with Y Axis Labels and Stepped Segments */}
          <View style={styles.graphWrapper}>
            <View style={styles.yAxis}>
              {pitchLabels.map((p, idx) => (
                <Text key={`${p}-${idx}`} style={styles.pitchText}>{p}</Text>
              ))}
            </View>

            <View style={styles.graphSvgContainer}>
              <Svg width="100%" height={160} viewBox="0 0 240 160">
                {/* Horizontal guide lines for each note */}
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <Line
                    key={i}
                    x1={0}
                    y1={i * 20 + 10}
                    x2={240}
                    y2={i * 20 + 10}
                    stroke="#F1F5F9"
                    strokeWidth={1}
                  />
                ))}

                {/* Dynamically draw a line segment for each note calculated by the model */}
                {notes.map((n, i) => {
                  const midiFrac = Math.max(0, Math.min(1, (n.midi - minMidi) / Math.max(1, maxMidi - minMidi)));
                  const baseY = 145 - midiFrac * (145 - 20);
                  const centsOffset = (n.cents_error ?? 0) * 0.15;
                  const y = Math.max(12, Math.min(148, baseY - centsOffset));
                  const stepW = 220 / Math.max(1, notes.length);
                  const x1 = i * stepW + 8;
                  const x2 = x1 + Math.max(14, stepW * 0.72);
                  const inTune = Math.abs(n.cents_error ?? 0) <= 20;

                  return (
                    <Line
                      key={i}
                      x1={x1}
                      y1={y}
                      x2={x2}
                      y2={y}
                      stroke={inTune ? '#0D9488' : '#EA580C'}
                      strokeWidth={inTune ? 3.5 : 4.5}
                      strokeLinecap="round"
                    />
                  );
                })}
              </Svg>

              {/* Dynamic Cents Callout Tags for off-pitch notes */}
              {notes.map((n, i) => {
                const isOff = Math.abs(n.cents_error ?? 0) > 20;
                if (!isOff) return null;
                const midiFrac = Math.max(0, Math.min(1, (n.midi - minMidi) / Math.max(1, maxMidi - minMidi)));
                const baseY = 145 - midiFrac * (145 - 20);
                const centsOffset = (n.cents_error ?? 0) * 0.15;
                const y = Math.max(12, Math.min(148, baseY - centsOffset));
                const stepW = 220 / Math.max(1, notes.length);
                const x1 = i * stepW + 8;
                const sign = (n.cents_error ?? 0) > 0 ? '+' : '';
                const tagTop = (n.cents_error ?? 0) > 0 ? Math.max(2, y - 24) : Math.min(136, y + 6);

                return (
                  <View
                    key={`tag-${i}`}
                    style={[
                      styles.centsTag,
                      {
                        left: Math.max(0, Math.min(195, x1 - 6)),
                        top: tagTop,
                      },
                    ]}
                  >
                    <Text style={styles.centsTagText}>{sign}{Math.round(n.cents_error ?? 0)}¢</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Time axis */}
          <View style={styles.timeAxis}>
            <Text style={styles.timeText}>0:00</Text>
            <Text style={styles.timeText}>0:48</Text>
          </View>

          {/* Legend */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendBar, { backgroundColor: '#0D9488' }]} />
              <Text style={styles.legendText}>In tune (within 20 c)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBar, { backgroundColor: '#EA580C', height: 3.5 }]} />
              <Text style={styles.legendText}>Off pitch</Text>
            </View>
          </View>
        </View>

        {/* Dynamic Notes with Issues Cards */}
        {outOfTuneNotes.length > 0 ? (
          outOfTuneNotes.map((n) => {
            const isFlat = (n.cents_error ?? 0) < 0;
            const arrow = isFlat ? '↓' : '↑';
            const sign = (n.cents_error ?? 0) > 0 ? '+' : '';
            const valText = `${sign}${Math.round(n.cents_error ?? 0)}¢`;
            const timeSec = Math.round(n.onset_s ?? 0);
            const timeStr = `0:${timeSec.toString().padStart(2, '0')}`;

            return (
              <View key={n.idx} style={styles.issueCard}>
                <View style={styles.noteBadge}>
                  <Text style={styles.noteBadgeText}>{n.label || midiToName(n.midi)}</Text>
                </View>
                <View style={styles.issueTextCol}>
                  <Text style={styles.issueTitle}>{isFlat ? 'Played flat' : 'Played sharp'}</Text>
                  <Text style={styles.issueSub}>Note {n.idx} of {notes.length} · at {timeStr}</Text>
                </View>
                <View style={styles.centsCol}>
                  <Text style={styles.arrowIcon}>{arrow}</Text>
                  <Text style={styles.centsVal}>{valText}</Text>
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.issueCard}>
            <View style={[styles.noteBadge, { backgroundColor: '#F0FDF4' }]}>
              <Text style={[styles.noteBadgeText, { color: '#16A34A' }]}>✓</Text>
            </View>
            <View style={styles.issueTextCol}>
              <Text style={styles.issueTitle}>Clean intonation</Text>
              <Text style={styles.issueSub}>All {notes.length} notes were played cleanly in tune</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Fixed Bottom Action Buttons */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={() => router.push({
            pathname: `/timing/${id ?? 'eight-white-keys'}` as any,
            params: { title, instrument },
          })}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryBtnText}>See timing</Text>
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
  scoreCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  gaugeContainer: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginRight: 20,
  },
  gaugeTextWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeScore: {
    fontSize: 26,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    color: '#0F172A',
  },
  gaugeLabel: {
    fontSize: 10,
    fontFamily: Fonts.body,
    color: '#94A3B8',
    marginTop: -2,
  },
  metricsCol: {
    flex: 1,
    gap: 8,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: '#64748B',
  },
  metricVal: {
    fontSize: 13,
    fontFamily: Fonts.body,
    fontWeight: '700',
    color: '#0F172A',
  },
  metricDivider: {
    height: 1,
    backgroundColor: '#F8FAFC',
  },
  contourCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  contourHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  contourTitle: {
    fontSize: 16,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    color: '#0F172A',
  },
  segmentedToggle: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 2,
  },
  segBtn: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  segBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  segText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontWeight: '500',
    color: '#64748B',
  },
  segTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  graphWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  yAxis: {
    width: 26,
    height: 160,
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  pitchText: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    color: '#94A3B8',
  },
  graphSvgContainer: {
    flex: 1,
    height: 160,
    position: 'relative',
  },
  centsTag: {
    position: 'absolute',
    backgroundColor: '#EA580C',
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 4,
  },
  centsTagText: {
    fontSize: 9,
    fontFamily: Fonts.mono,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  timeAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingLeft: 26,
  },
  timeText: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    color: '#94A3B8',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 14,
    paddingLeft: 26,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendBar: {
    width: 14,
    height: 2.5,
    borderRadius: 1.5,
  },
  legendText: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: '#64748B',
  },
  issueCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  noteBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  noteBadgeText: {
    fontSize: 14,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    color: '#D97706',
  },
  issueTextCol: {
    flex: 1,
  },
  issueTitle: {
    fontSize: 14,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    color: '#0F172A',
  },
  issueSub: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: '#94A3B8',
    marginTop: 2,
  },
  centsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  arrowIcon: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '700',
  },
  centsVal: {
    fontSize: 14,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    color: '#0F172A',
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
