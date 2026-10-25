/**
 * Progress screen — per-piece progress.
 * Every upload of the same piece (same title + instrument, or the same melody)
 * is grouped together so you can see how that piece improves attempt by attempt.
 */

import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import {
  getErrorMessage,
  getProgress,
  type PieceAttempt,
  type PieceProgress,
} from '@/services/api';

const COLORS = {
  overall: '#4F46E5',
  pitch:   '#0D9488',
  timing:  '#EA580C',
};

// Score chart geometry — each attempt gets a fixed-width column, so the chart scrolls sideways
const CHART_H      = 210;
const Y_AXIS_W     = 30;
const PLOT_TOP     = 18;
const PLOT_BOTTOM  = 44;   // room for "#n" and date labels
const COL_W        = 64;
const SIDE_PAD     = 28;

const METRICS: { key: keyof PieceAttempt; label: string; unit: string }[] = [
  { key: 'overall_score',     label: 'Overall score',  unit: '' },
  { key: 'pitch_score',       label: 'Pitch score',    unit: '' },
  { key: 'timing_score',      label: 'Timing score',   unit: '' },
  { key: 'in_tune_pct',       label: 'Notes in tune',  unit: '%' },
  { key: 'notes_on_beat_pct', label: 'Notes on beat',  unit: '%' },
];

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function round(v: number | null | undefined): string {
  return v == null ? '–' : String(Math.round(v));
}

function Delta({ value, unit = '' }: { value: number | null; unit?: string }) {
  if (value == null) return <Text style={[styles.delta, { color: '#94A3B8' }]}>–</Text>;
  const r = Math.round(value);
  if (r === 0) return <Text style={[styles.delta, { color: '#94A3B8' }]}>no change</Text>;
  return (
    <Text style={[styles.delta, { color: r > 0 ? '#0D9488' : '#EA580C' }]}>
      {r > 0 ? '↑' : '↓'} {Math.abs(r)}{unit}
    </Text>
  );
}

// ─── Score chart ──────────────────────────────────────────────────────────────

function ScoreChart({ attempts }: { attempts: PieceAttempt[] }) {
  const { width } = useWindowDimensions();
  const n = attempts.length;

  // Y range: always up to 100, down to a round number just under the lowest score
  const all = attempts.flatMap((a) => [a.overall_score, a.pitch_score, a.timing_score])
    .filter((v): v is number => v != null);
  const lo = Math.max(0, Math.floor((Math.min(...all, 100) - 10) / 10) * 10);
  const hi = 100;
  const ticks = [lo, lo + (hi - lo) / 2, hi].map(Math.round);

  const plotW = Math.max(width - 40 - 32 - Y_AXIS_W, n * COL_W);
  const y = (v: number) => PLOT_TOP + ((hi - v) / (hi - lo)) * (CHART_H - PLOT_TOP - PLOT_BOTTOM);
  const x = (i: number) => (n === 1 ? plotW / 2 : SIDE_PAD + (i * (plotW - SIDE_PAD * 2)) / (n - 1));

  function line(key: 'overall_score' | 'pitch_score' | 'timing_score', color: string, w: number) {
    const pts = attempts
      .map((a, i) => (a[key] == null ? null : { px: x(i), py: y(a[key] as number) }))
      .filter((p): p is { px: number; py: number } => p != null);
    if (pts.length === 0) return null;
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.px} ${p.py}`).join(' ');
    return (
      <React.Fragment key={key}>
        {pts.length > 1 && (
          <Path d={d} stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {pts.map((p, i) => (
          <Circle key={i} cx={p.px} cy={p.py} r={key === 'overall_score' ? 5 : 3.5}
                  fill={key === 'overall_score' ? '#FFFFFF' : color} stroke={color} strokeWidth={2} />
        ))}
      </React.Fragment>
    );
  }

  return (
    <View>
      <View style={styles.chartRow}>
        <Svg width={Y_AXIS_W} height={CHART_H}>
          {ticks.map((t) => (
            <SvgText key={t} x={Y_AXIS_W - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#94A3B8">
              {t}
            </SvgText>
          ))}
        </Svg>

        <ScrollView horizontal showsHorizontalScrollIndicator={n * COL_W > plotW - 1}>
          <Svg width={plotW} height={CHART_H}>
            {ticks.map((t) => (
              <Line key={t} x1={0} y1={y(t)} x2={plotW} y2={y(t)} stroke="#F1F5F9" strokeWidth={1} />
            ))}

            {/* Pitch and timing sit behind the overall line */}
            {line('pitch_score',  COLORS.pitch,  2)}
            {line('timing_score', COLORS.timing, 2)}
            {line('overall_score', COLORS.overall, 3)}

            {attempts.map((a, i) => (
              <React.Fragment key={a.session_id}>
                {a.overall_score != null && (
                  <SvgText x={x(i)} y={y(a.overall_score) - 11} textAnchor="middle" fontSize={11} fontWeight="700" fill={COLORS.overall}>
                    {Math.round(a.overall_score)}
                  </SvgText>
                )}
                <SvgText x={x(i)} y={CHART_H - 24} textAnchor="middle" fontSize={11} fontWeight="700" fill="#0F172A">
                  #{i + 1}
                </SvgText>
                <SvgText x={x(i)} y={CHART_H - 10} textAnchor="middle" fontSize={10} fill="#94A3B8">
                  {fmtDate(a.created_at)}
                </SvgText>
              </React.Fragment>
            ))}
          </Svg>
        </ScrollView>
      </View>

      <View style={styles.legendRow}>
        {([['Overall', COLORS.overall], ['Pitch', COLORS.pitch], ['Timing', COLORS.timing]] as const).map(([label, c]) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: c }]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>
      {n > 4 && <Text style={styles.scrollHint}>Swipe sideways to see every attempt</Text>}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuthStore();

  const [pieces,     setPieces]     = useState<PieceProgress[] | null>(null);
  const [selected,   setSelected]   = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    if (!token) router.replace('/(auth)' as any);
  }, [token]);

  const loadData = useCallback(async () => {
    try {
      const prog = await getProgress();
      setPieces(prog.pieces ?? []);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
      setPieces((prev) => prev ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Reload whenever the tab is opened, so a just-uploaded attempt shows up
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const piece = useMemo(
    () => pieces?.find((p) => p.piece_key === selected) ?? pieces?.[0] ?? null,
    [pieces, selected],
  );

  const attempts = piece?.attempts ?? [];
  const first    = attempts[0];
  const latest   = attempts[attempts.length - 1];
  const tone     = piece?.summary.tone ?? 'flat';
  const toneColor = tone === 'up' ? '#0D9488' : tone === 'down' ? '#EA580C' : '#64748B';

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData(); }}
            tintColor="#4F46E5"
          />
        }
      >
        <Text style={styles.title}>Progress</Text>
        <Text style={styles.subtitle}>See how each piece improves every time you practise it.</Text>

        {pieces === null && <ActivityIndicator style={{ marginTop: 40 }} color="#4F46E5" />}

        {error !== '' && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Couldn't load your progress: {error}</Text>
            <Pressable onPress={loadData}><Text style={styles.retry}>Try again</Text></Pressable>
          </View>
        )}

        {pieces !== null && pieces.length === 0 && error === '' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>No pieces yet</Text>
            <Text style={styles.bodyText}>
              Upload a recording and its score will appear here. Upload the same piece again after practising
              and you'll see exactly how much you've improved.
            </Text>
            <Pressable style={styles.cta} onPress={() => router.push('/upload' as any)}>
              <Text style={styles.ctaText}>Upload a recording</Text>
            </Pressable>
          </View>
        )}

        {pieces !== null && pieces.length > 0 && piece && (
          <>
            {/* Piece picker */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
              {pieces.map((p) => {
                const active = p.piece_key === piece.piece_key;
                return (
                  <Pressable
                    key={p.piece_key}
                    onPress={() => setSelected(p.piece_key)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipTitle, active && styles.chipTitleActive]} numberOfLines={1}>
                      {p.title}
                    </Text>
                    <Text style={[styles.chipSub, active && styles.chipSubActive]}>
                      {p.instrument ?? 'Instrument'} · {p.session_count} {p.session_count === 1 ? 'attempt' : 'attempts'}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Hero */}
            <View style={styles.card}>
              <Text style={styles.pieceName}>{piece.title}</Text>
              <Text style={styles.pieceMeta}>
                {piece.instrument ?? ''} · {piece.session_count} {piece.session_count === 1 ? 'attempt' : 'attempts'}
                {piece.last_practiced ? ` · last ${fmtDate(piece.last_practiced)}` : ''}
              </Text>

              <View style={styles.heroRow}>
                <View>
                  <Text style={styles.heroLabel}>Latest score</Text>
                  <Text style={styles.heroScore}>{round(piece.latest_score)}</Text>
                </View>
                <View style={styles.heroStats}>
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatVal}>{round(piece.first_score)}</Text>
                    <Text style={styles.heroStatLabel}>First</Text>
                  </View>
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatVal}>{round(piece.best_score)}</Text>
                    <Text style={styles.heroStatLabel}>Best</Text>
                  </View>
                  {piece.session_count > 1 && (
                    <View style={styles.heroStat}>
                      <Delta value={piece.score_change} />
                      <Text style={styles.heroStatLabel}>vs last</Text>
                    </View>
                  )}
                </View>
              </View>

              <Text style={[styles.headline, { color: toneColor }]}>{piece.summary.headline}</Text>
            </View>

            {/* Score by attempt */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Score by attempt</Text>
              <ScoreChart attempts={attempts} />
              {attempts.length === 1 && (
                <Text style={styles.bodyText}>
                  This is your first attempt. Upload this piece again after practising to see the line move.
                </Text>
              )}
            </View>

            {/* First vs latest */}
            {attempts.length > 1 && first && latest && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>First attempt vs latest</Text>
                <View style={styles.tableHead}>
                  <Text style={[styles.th, { flex: 1.6 }]} />
                  <Text style={styles.th}>First</Text>
                  <Text style={styles.th}>Latest</Text>
                  <Text style={[styles.th, { flex: 1.2 }]}>Change</Text>
                </View>
                {METRICS.map((m) => {
                  const a = first[m.key] as number | null;
                  const b = latest[m.key] as number | null;
                  return (
                    <View key={m.key} style={styles.tableRow}>
                      <Text style={[styles.td, styles.tdLabel, { flex: 1.6 }]}>{m.label}</Text>
                      <Text style={styles.td}>{round(a)}{a != null ? m.unit : ''}</Text>
                      <Text style={[styles.td, styles.tdStrong]}>{round(b)}{b != null ? m.unit : ''}</Text>
                      <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                        <Delta value={a != null && b != null ? b - a : null} unit={m.unit} />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Summary */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Summary</Text>
              {piece.summary.bullets.map((b, i) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bulletDot, { backgroundColor: toneColor }]} />
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>

            {/* Attempt history */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>All attempts</Text>
              {[...attempts].map((a, i) => ({ a, n: i + 1 })).reverse().map(({ a, n }, idx, arr) => (
                <Pressable
                  key={a.session_id}
                  onPress={() => router.push({
                    pathname: `/result/${a.session_id}` as any,
                    params: { title: piece.title, instrument: piece.instrument ?? '' },
                  })}
                  style={({ pressed }) => [
                    styles.attemptRow,
                    idx < arr.length - 1 && styles.attemptDivider,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={styles.attemptNum}><Text style={styles.attemptNumText}>#{n}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.attemptDate}>{fmtDate(a.created_at)}</Text>
                    <Text style={styles.attemptSub}>
                      Pitch {round(a.pitch_score)} · Timing {round(a.timing_score)}
                    </Text>
                  </View>
                  <Text style={styles.attemptScore}>{round(a.overall_score)}</Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', paddingHorizontal: 20 },
  scrollContent: { paddingTop: 8 },
  title: { fontSize: 26, fontFamily: Fonts.heading, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 13, fontFamily: Fonts.body, color: '#64748B', marginTop: 4, marginBottom: 16 },

  chips: { marginBottom: 14, flexGrow: 0 },
  chip: {
    backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0',
    paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, maxWidth: 200,
  },
  chipActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  chipTitle: { fontSize: 14, fontFamily: Fonts.heading, fontWeight: '700', color: '#0F172A' },
  chipTitleActive: { color: '#FFFFFF' },
  chipSub: { fontSize: 11, fontFamily: Fonts.body, color: '#94A3B8', marginTop: 1 },
  chipSubActive: { color: '#C7D2FE' },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0',
    marginBottom: 14, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
  },
  cardTitle: { fontSize: 16, fontFamily: Fonts.heading, fontWeight: '800', color: '#0F172A', marginBottom: 10 },
  bodyText: { fontSize: 13, fontFamily: Fonts.body, color: '#64748B', lineHeight: 19 },

  pieceName: { fontSize: 20, fontFamily: Fonts.heading, fontWeight: '800', color: '#0F172A' },
  pieceMeta: { fontSize: 12, fontFamily: Fonts.body, color: '#94A3B8', marginTop: 2, marginBottom: 14 },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 },
  heroLabel: { fontSize: 12, fontFamily: Fonts.body, color: '#64748B' },
  heroScore: { fontSize: 44, fontFamily: Fonts.heading, fontWeight: '800', color: '#0F172A', lineHeight: 50 },
  heroStats: { flexDirection: 'row', gap: 18 },
  heroStat: { alignItems: 'center', minWidth: 44 },
  heroStatVal: { fontSize: 18, fontFamily: Fonts.heading, fontWeight: '800', color: '#0F172A' },
  heroStatLabel: { fontSize: 11, fontFamily: Fonts.body, color: '#94A3B8', marginTop: 2 },
  headline: { fontSize: 14, fontFamily: Fonts.heading, fontWeight: '700', marginTop: 14 },
  delta: { fontSize: 13, fontFamily: Fonts.body, fontWeight: '700' },

  chartRow: { flexDirection: 'row' },
  legendRow: { flexDirection: 'row', gap: 16, marginTop: 8, paddingLeft: Y_AXIS_W, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, fontFamily: Fonts.body, color: '#64748B' },
  scrollHint: { fontSize: 11, fontFamily: Fonts.body, color: '#94A3B8', marginTop: 6, paddingLeft: Y_AXIS_W },

  tableHead: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  th: { flex: 1, fontSize: 11, fontFamily: Fonts.body, color: '#94A3B8', textAlign: 'right' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  td: { flex: 1, fontSize: 14, fontFamily: Fonts.body, color: '#64748B', textAlign: 'right' },
  tdLabel: { textAlign: 'left', color: '#0F172A' },
  tdStrong: { color: '#0F172A', fontWeight: '700' },

  bulletRow: { flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'flex-start' },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 14, fontFamily: Fonts.body, color: '#334155', lineHeight: 20 },

  attemptRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  attemptDivider: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  attemptNum: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  attemptNumText: { fontSize: 12, fontFamily: Fonts.heading, fontWeight: '800', color: '#4F46E5' },
  attemptDate: { fontSize: 14, fontFamily: Fonts.heading, fontWeight: '700', color: '#0F172A' },
  attemptSub: { fontSize: 12, fontFamily: Fonts.body, color: '#94A3B8', marginTop: 1 },
  attemptScore: { fontSize: 18, fontFamily: Fonts.heading, fontWeight: '800', color: '#0F172A' },
  chevron: { fontSize: 22, color: '#CBD5E1' },

  cta: { backgroundColor: '#4F46E5', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  ctaText: { color: '#FFFFFF', fontSize: 14, fontFamily: Fonts.heading, fontWeight: '700' },
  errorBox: { backgroundColor: '#FFF7ED', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#FED7AA' },
  errorText: { fontSize: 13, fontFamily: Fonts.body, color: '#9A3412' },
  retry: { fontSize: 13, fontFamily: Fonts.heading, fontWeight: '700', color: '#4F46E5', marginTop: 6 },
});
