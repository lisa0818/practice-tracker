/**
 * Pitch result screen — overall pitch score, % in-tune, avg cents error,
 * pitch contour graph, notes to fix.
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card }             from '@/components/Card';
import { ScoreBadge }       from '@/components/ScoreBadge';
import { PitchContourGraph, PitchLegend } from '@/components/PitchContourGraph';
import { FontSize, Fonts, Radius }        from '@/constants/theme';
import { useTheme }  from '@/hooks/use-theme';
import { getSession, type SessionDetail, type NoteEvent } from '@/services/api';

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ value, label, unit, color }: { value: string; label: string; unit?: string; color?: string }) {
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

// ── Note to fix row ───────────────────────────────────────────────────────────

function NoteFixRow({ note, index }: { note: NoteEvent; index: number }) {
  const theme = useTheme();
  const cents = note.cents_error ?? 0;
  const dir   = cents > 0 ? 'sharp' : 'flat';
  const name  = midiName(note.midi);

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <View style={[styles.noteRow, { borderColor: theme.border }]}>
        <View style={[styles.noteName, { backgroundColor: theme.offPitchLight }]}>
          <Text style={[styles.noteNameText, { color: theme.offPitch, fontFamily: Fonts.mono }]}>{name}</Text>
        </View>
        <View style={styles.noteInfo}>
          <Text style={[styles.noteDesc, { color: theme.text, fontFamily: Fonts.body }]}>
            {Math.abs(Math.round(cents))}¢ {dir}
          </Text>
          <Text style={[styles.noteTime, { color: theme.textMuted }]}>
            at {note.onset_s.toFixed(2)}s
          </Text>
        </View>
        <View style={[
          styles.centBar,
          { backgroundColor: theme.backgroundElement },
        ]}>
          <View style={[
            styles.centFill,
            {
              width:           `${Math.min(100, Math.abs(cents) / 50 * 100)}%`,
              backgroundColor: theme.offPitch,
              alignSelf:       cents < 0 ? 'flex-end' : 'flex-start',
            },
          ]} />
        </View>
      </View>
    </Animated.View>
  );
}

function midiName(midi: number): string {
  const names = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const oct   = Math.floor(midi / 12) - 1;
  return `${names[midi % 12]}${oct}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ResultScreen() {
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
        <Text style={{ color: theme.textMuted }}>No result available yet.</Text>
      </View>
    );
  }

  const r    = session.result;
  const notes = (r.note_events ?? []) as NoteEvent[];
  const badNotes = notes
    .filter(n => n.cents_error !== null && Math.abs(n.cents_error ?? 0) > 20)
    .sort((a, b) => Math.abs(b.cents_error ?? 0) - Math.abs(a.cents_error ?? 0))
    .slice(0, 8);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}
    >
      {/* Back + nav */}
      <Animated.View entering={FadeInUp.delay(50).springify()} style={styles.navRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.back, { color: theme.accent }]}>← Back</Text>
        </Pressable>
        <Pressable onPress={() => router.replace(`/timing/${id}` as any)}>
          <Text style={[styles.next, { color: theme.accent }]}>Timing →</Text>
        </Pressable>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.titleRow}>
        <Text style={[styles.screenTitle, { color: theme.text, fontFamily: Fonts.heading }]}>Pitch Analysis</Text>
        <Text style={[styles.sessionName, { color: theme.textMuted, fontFamily: Fonts.body }]} numberOfLines={1}>
          {session.title}
        </Text>
      </Animated.View>

      {/* Score badge */}
      <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.badgeRow}>
        <ScoreBadge score={r.pitch_score ?? r.overall_score} label="Pitch score" size={160} />
      </Animated.View>

      {/* Stats grid */}
      <Animated.View entering={FadeInDown.delay(120).springify()}>
        <View style={styles.statsGrid}>
          <StatTile
            value={`${Math.round(r.in_tune_pct ?? 0)}`}
            unit="%"
            label="In tune"
            color={theme.inTune}
          />
          <StatTile
            value={`${Math.round(Math.abs(r.avg_cents_error ?? 0))}`}
            unit="¢"
            label="Avg error"
            color={r.avg_cents_error > 25 ? theme.offPitch : theme.inTune}
          />
        </View>
      </Animated.View>

      {/* Contour graph */}
      {!r.is_polyphonic && notes.length > 0 && (
        <Animated.View entering={FadeInDown.delay(160).springify()}>
          <Card noPad style={styles.graphCard}>
            <Text style={[styles.cardTitle, { color: theme.text, fontFamily: Fonts.heading, padding: 16, paddingBottom: 0 }]}>
              Pitch contour
            </Text>
            <View style={{ padding: 12 }}>
              <PitchContourGraph notes={notes} />
              <PitchLegend />
            </View>
          </Card>
        </Animated.View>
      )}

      {r.is_polyphonic && (
        <Card>
          <Text style={[styles.polyNote, { color: theme.textMuted, fontFamily: Fonts.body }]}>
            🎹 Polyphonic instrument detected — cents accuracy not available. Timing analysis below.
          </Text>
        </Card>
      )}

      {/* Notes to fix */}
      {badNotes.length > 0 && (
        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: Fonts.heading }]}>
            Notes to work on
          </Text>
          <Card noPad>
            {badNotes.map((note, i) => (
              <NoteFixRow key={i} note={note} index={i} />
            ))}
          </Card>
        </Animated.View>
      )}

      {/* Timing CTA */}
      <Animated.View entering={FadeInDown.delay(240).springify()}>
        <Pressable
          onPress={() => router.push(`/timing/${id}` as any)}
          style={[styles.timingCta, { backgroundColor: theme.accentLight, borderColor: theme.accent }]}
        >
          <Text style={[styles.timingCtaText, { color: theme.accent, fontFamily: Fonts.body }]}>
            See timing analysis ⏱️ →
          </Text>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
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
  graphCard:   {},
  cardTitle:   { fontSize: FontSize.base, fontWeight: '700' },
  polyNote:    { fontSize: FontSize.sm, lineHeight: FontSize.sm + 6, textAlign: 'center' },
  sectionTitle:{ fontSize: FontSize.md, fontWeight: '700' },
  noteRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  noteName: {
    width:          44,
    height:         36,
    borderRadius:   8,
    alignItems:     'center',
    justifyContent: 'center',
  },
  noteNameText: { fontSize: FontSize.sm, fontWeight: '700' },
  noteInfo:    { flex: 1, gap: 2 },
  noteDesc:    { fontSize: FontSize.base, fontWeight: '600' },
  noteTime:    { fontSize: FontSize.xs },
  centBar: {
    width:        60,
    height:       6,
    borderRadius: 3,
    overflow:     'hidden',
  },
  centFill: {
    height:       '100%',
    borderRadius: 3,
  },
  timingCta: {
    padding:      14,
    borderRadius: 12,
    borderWidth:  1,
    alignItems:   'center',
  },
  timingCtaText: { fontSize: FontSize.base, fontWeight: '600' },
});
