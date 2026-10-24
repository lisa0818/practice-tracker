/**
 * Timing result screen — avg onset offset, steadiness, notes on beat,
 * per-note early/late bar chart, practice tip.
 */

import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card }       from '@/components/Card';
import { ScoreBadge } from '@/components/ScoreBadge';
import { FontSize, Fonts } from '@/constants/theme';
import { useTheme }   from '@/hooks/use-theme';
import { getSession, type SessionDetail, type NoteEvent } from '@/services/api';

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ value, label, unit, color }: { value: string | number; label: string; unit?: string; color?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.statValueRow}>
        <Text style={[styles.statValue, { color: color ?? theme.text, fontFamily: Fonts.mono }]}>{value}</Text>
        {unit && <Text style={[styles.statUnit, { color: theme.textMuted }]}>{unit}</Text>}
      </View>
      <Text style={[styles.statLabel, { color: theme.textMuted, fontFamily: Fonts.body }]}>{label}</Text>
    </View>
  );
}

// ── Early/Late bar chart ──────────────────────────────────────────────────────

function OnsetChart({ notes }: { notes: NoteEvent[] }) {
  const theme    = useTheme();
  const W        = 340;
  const BAR_H    = 18;
  const GAP      = 6;
  const PAD_L    = 44;
  const PAD_R    = 10;
  const MAX_MS   = 200;  // clip at ±200ms for visual
  const chartW   = W - PAD_L - PAD_R;
  const midX     = PAD_L + chartW / 2;

  const onsetNotes = notes.filter(n => n.onset_error_ms !== undefined);
  if (onsetNotes.length === 0) {
    return (
      <View style={[styles.chartEmpty, { backgroundColor: theme.backgroundElement }]}>
        <Text style={{ color: theme.textMuted, fontFamily: Fonts.body, fontSize: FontSize.sm }}>
          No onset data
        </Text>
      </View>
    );
  }

  const midiName = (m: number) => {
    const names = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
    return `${names[m % 12]}${Math.floor(m / 12) - 1}`;
  };

  const H = onsetNotes.length * (BAR_H + GAP) + 40;

  return (
    <ScrollView style={{ maxHeight: 280 }}>
      <Svg width={W} height={H}>
        {/* Center line (on-beat) */}
        <Line x1={midX} y1={16} x2={midX} y2={H - 20} stroke={theme.border} strokeWidth={1} strokeDasharray="3 3" />
        {/* Labels */}
        <SvgText x={midX - 60} y={12} fontSize={8} textAnchor="end" fill={theme.textMuted} fontFamily={Fonts.mono}>early</SvgText>
        <SvgText x={midX + 60} y={12} fontSize={8} textAnchor="start" fill={theme.textMuted} fontFamily={Fonts.mono}>late</SvgText>

        {onsetNotes.map((note, i) => {
          const ms    = note.onset_error_ms ?? 0;
          const clipped = Math.max(-MAX_MS, Math.min(MAX_MS, ms));
          const barW  = Math.abs(clipped) / MAX_MS * (chartW / 2);
          const barX  = ms < 0 ? midX - barW : midX;
          const y     = 22 + i * (BAR_H + GAP);
          const color = ms < -20 ? theme.accent : ms > 20 ? theme.offPitch : theme.inTune;

          return (
            <React.Fragment key={i}>
              {/* Note name */}
              <SvgText x={PAD_L - 4} y={y + BAR_H / 2 + 4} fontSize={9} textAnchor="end" fill={theme.textMuted} fontFamily={Fonts.mono}>
                {midiName(note.midi)}
              </SvgText>
              {/* Bar */}
              <Rect x={barX} y={y} width={barW || 2} height={BAR_H} rx={4} fill={color} fillOpacity={0.85} />
              {/* ms label */}
              {Math.abs(ms) > 15 && (
                <SvgText
                  x={ms < 0 ? barX - 2 : barX + barW + 2}
                  y={y + BAR_H / 2 + 4}
                  fontSize={8}
                  textAnchor={ms < 0 ? 'end' : 'start'}
                  fill={color}
                  fontFamily={Fonts.mono}
                >
                  {Math.round(ms)}ms
                </SvgText>
              )}
            </React.Fragment>
          );
        })}
      </Svg>
    </ScrollView>
  );
}

// ── On-beat legend ────────────────────────────────────────────────────────────

function OnBeatLegend() {
  const theme = useTheme();
  return (
    <View style={styles.legend}>
      {[
        { color: theme.inTune,  label: 'On beat (±20ms)' },
        { color: theme.accent,  label: 'Early' },
        { color: theme.offPitch,label: 'Late' },
      ].map(({ color, label }) => (
        <View key={label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: color }]} />
          <Text style={[styles.legendText, { color: theme.textMuted, fontFamily: Fonts.body }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TimingScreen() {
  const theme  = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getSession(id)
      .then(setSession)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  if (!session?.result) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textMuted }}>No result available.</Text>
      </View>
    );
  }

  const r     = session.result;
  const notes = (r.note_events ?? []) as NoteEvent[];

  // Derive timing metrics if the API doesn't supply dedicated fields
  const avgOnset      = r.avg_onset_ms       ?? 0;
  const steadiness    = r.steadiness         ?? 0;
  const notesOnBeat   = r.notes_on_beat_pct  ?? 0;
  const timingScore   = r.timing_score       ?? r.overall_score;

  const tip = r.practice_tip ?? deriveTip(avgOnset, steadiness);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}
    >
      {/* Nav */}
      <Animated.View entering={FadeInUp.delay(50).springify()} style={styles.navRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.back, { color: theme.accent }]}>← Pitch</Text>
        </Pressable>
        <Pressable onPress={() => router.replace('/(tabs)/home')} hitSlop={12}>
          <Text style={[styles.next, { color: theme.accent }]}>Home</Text>
        </Pressable>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.titleRow}>
        <Text style={[styles.screenTitle, { color: theme.text, fontFamily: Fonts.heading }]}>Timing Analysis</Text>
        <Text style={[styles.sessionName, { color: theme.textMuted, fontFamily: Fonts.body }]} numberOfLines={1}>
          {session.title}
        </Text>
      </Animated.View>

      {/* Score badge */}
      <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.badgeRow}>
        <ScoreBadge score={timingScore} label="Timing score" size={160} variant="timing" />
      </Animated.View>

      {/* Stats */}
      <Animated.View entering={FadeInDown.delay(120).springify()}>
        <View style={styles.statsGrid}>
          <StatTile
            value={`${Math.round(Math.abs(avgOnset))}`}
            unit="ms"
            label="Avg onset offset"
            color={Math.abs(avgOnset) < 30 ? theme.inTune : theme.offPitch}
          />
          <StatTile
            value={`${Math.round(notesOnBeat)}`}
            unit="%"
            label="Notes on beat"
            color={notesOnBeat >= 70 ? theme.inTune : theme.offPitch}
          />
        </View>
        <View style={[styles.statsGrid, { marginTop: 10 }]}>
          <StatTile
            value={`${Math.round(steadiness)}`}
            unit="%"
            label="Steadiness"
            color={steadiness >= 70 ? theme.inTune : theme.offPitch}
          />
        </View>
      </Animated.View>

      {/* Per-note chart */}
      <Animated.View entering={FadeInDown.delay(160).springify()}>
        <Card noPad>
          <Text style={[styles.cardTitle, { color: theme.text, fontFamily: Fonts.heading, padding: 16, paddingBottom: 8 }]}>
            Early / Late per note
          </Text>
          <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
            <OnsetChart notes={notes} />
            <OnBeatLegend />
          </View>
        </Card>
      </Animated.View>

      {/* Practice tip */}
      <Animated.View entering={FadeInDown.delay(200).springify()}>
        <Card style={[styles.tipCard, { borderColor: theme.inTune, backgroundColor: theme.inTuneLight }]}>
          <Text style={styles.tipEmoji}>💡</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.tipTitle, { color: theme.inTune, fontFamily: Fonts.heading }]}>Practice tip</Text>
            <Text style={[styles.tipText,  { color: theme.text,   fontFamily: Fonts.body   }]}>{tip}</Text>
          </View>
        </Card>
      </Animated.View>

      {/* Done CTA */}
      <Animated.View entering={FadeInDown.delay(240).springify()}>
        <Pressable
          onPress={() => router.replace('/(tabs)/home')}
          style={[styles.doneCta, { backgroundColor: theme.accent }]}
        >
          <Text style={[styles.doneCtaText, { fontFamily: Fonts.body }]}>Done — back to Home 🏠</Text>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

function deriveTip(avgMs: number, steadiness: number): string {
  if (Math.abs(avgMs) > 80) {
    return avgMs > 0
      ? 'You tend to rush — try counting eighth notes aloud or with a metronome.'
      : 'You tend to drag — try tapping your foot to the beat while playing.';
  }
  if (steadiness < 60) {
    return 'Focus on evenness: use a metronome at half your current tempo until each note lands solidly on the beat.';
  }
  return 'Great timing! Keep consistent by recording yourself weekly and checking the onset chart.';
}

const styles = StyleSheet.create({
  container:   { paddingHorizontal: 20, gap: 20 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back:        { fontSize: FontSize.base, fontWeight: '500' },
  next:        { fontSize: FontSize.base, fontWeight: '500' },
  titleRow:    { gap: 4 },
  screenTitle: { fontSize: FontSize.xl, fontWeight: '700' },
  sessionName: { fontSize: FontSize.sm },
  badgeRow:    { alignItems: 'center', paddingVertical: 8 },
  statsGrid:   { flexDirection: 'row', gap: 12 },
  stat: {
    flex:           1,
    padding:        16,
    borderRadius:   12,
    alignItems:     'center',
    gap:            4,
  },
  statValueRow:{ flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  statValue:   { fontSize: FontSize.xxl, fontWeight: '700' },
  statUnit:    { fontSize: FontSize.sm },
  statLabel:   { fontSize: FontSize.xs },
  cardTitle:   { fontSize: FontSize.base, fontWeight: '700' },
  chartEmpty: {
    height: 80, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  legend: {
    flexDirection: 'row',
    gap:           14,
    marginTop:     8,
    flexWrap:      'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: FontSize.xs },
  tipCard: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           10,
    borderWidth:   1,
  },
  tipEmoji: { fontSize: 22 },
  tipTitle: { fontSize: FontSize.sm, fontWeight: '700', marginBottom: 4 },
  tipText:  { fontSize: FontSize.sm, lineHeight: FontSize.sm + 7 },
  doneCta: {
    padding:      16,
    borderRadius: 28,
    alignItems:   'center',
  },
  doneCtaText: { color: '#fff', fontSize: FontSize.base, fontWeight: '700' },
});
