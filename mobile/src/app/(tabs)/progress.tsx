/**
 * Progress screen — score trend line, practice-days calendar heatmap,
 * per-piece list with latest score and change.
 */

import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Polyline, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/Card';
import { FontSize, Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { getProgress, type ProgressData } from '@/services/api';

// ── Trend line chart ──────────────────────────────────────────────────────────

function TrendChart({ sessions }: { sessions: ProgressData['sessions'] }) {
  const theme = useTheme();
  const W = 320;
  const H = 120;
  const PAD = 20;
  const scored = sessions
    .filter(s => s.overall_score != null)
    .slice(-14); // last 14 sessions

  if (scored.length < 2) {
    return (
      <View style={[styles.chartEmpty, { backgroundColor: theme.backgroundElement }]}>
        <Text style={{ color: theme.textMuted, fontFamily: Fonts.body }}>
          Complete at least 2 sessions to see your trend.
        </Text>
      </View>
    );
  }

  const scores = scored.map(s => s.overall_score!);
  const maxS = Math.max(...scores);
  const minS = Math.max(0, Math.min(...scores) - 5);

  function px(i: number) { return PAD + (i / (scored.length - 1)) * (W - PAD * 2); }
  function py(s: number) { return PAD + H - PAD - ((s - minS) / (maxS - minS + 0.001)) * (H - PAD * 2); }

  const pts = scored.map((s, i) => `${px(i)},${py(s.overall_score!)}`).join(' ');

  // Area fill path
  const area = `M${px(0)},${py(scored[0].overall_score!)} ` +
    scored.slice(1).map((s, i) => `L${px(i + 1)},${py(s.overall_score!)}`).join(' ') +
    ` L${px(scored.length - 1)},${H} L${px(0)},${H} Z`;

  return (
    <Svg width={W} height={H}>
      {/* Area fill */}
      <Path d={area} fill={theme.accent} fillOpacity={0.12} />
      {/* Line */}
      <Polyline points={pts} fill="none" stroke={theme.accent} strokeWidth={2.5} strokeLinejoin="round" />
      {/* Dots */}
      {scored.map((s, i) => (
        <Circle
          key={i}
          cx={px(i)} cy={py(s.overall_score!)}
          r={3.5}
          fill={theme.accent}
          stroke={theme.backgroundCard}
          strokeWidth={1.5}
        />
      ))}
      {/* Y labels */}
      {[minS, (minS + maxS) / 2, maxS].map((v, i) => (
        <SvgText
          key={i}
          x={PAD - 4} y={py(v) + 4}
          textAnchor="end"
          fontSize={8}
          fill={theme.textMuted}
          fontFamily={Fonts.mono}
        >
          {Math.round(v)}
        </SvgText>
      ))}
    </Svg>
  );
}

// ── Calendar heatmap ──────────────────────────────────────────────────────────

function CalendarHeatmap({ practiceDays }: { practiceDays: string[] }) {
  const theme  = useTheme();
  const today  = new Date();

  // Last 7 weeks × 7 days grid
  const cells: { date: Date; inDay: boolean }[] = [];
  for (let w = 6; w >= 0; w--) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() - w * 7 - (6 - d));
      const iso  = date.toISOString().slice(0, 10);
      cells.push({ date, inDay: practiceDays.includes(iso) });
    }
  }

  const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const CELL = 34;
  const GAP  = 4;

  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {DAY_LABELS.map((l, i) => (
          <View key={i} style={{ width: CELL, alignItems: 'center' }}>
            <Text style={[styles.calLabel, { color: theme.textMuted, fontFamily: Fonts.mono }]}>{l}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map(({ date, inDay }, i) => {
          const isToday = date.toDateString() === today.toDateString();
          return (
            <View
              key={i}
              style={[
                styles.calCell,
                {
                  width:           CELL - GAP,
                  height:          CELL - GAP,
                  margin:          GAP / 2,
                  backgroundColor: inDay ? theme.inTune : theme.backgroundElement,
                  borderRadius:    6,
                  borderWidth:     isToday ? 2 : 0,
                  borderColor:     theme.accent,
                },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.calLegend}>
        <View style={[styles.calCell, { width: 12, height: 12, backgroundColor: theme.backgroundElement, borderRadius: 3 }]} />
        <Text style={[styles.calLegendText, { color: theme.textMuted }]}>No practice</Text>
        <View style={[styles.calCell, { width: 12, height: 12, backgroundColor: theme.inTune, borderRadius: 3 }]} />
        <Text style={[styles.calLegendText, { color: theme.textMuted }]}>Practiced</Text>
      </View>
    </View>
  );
}

// ── Per-piece list ────────────────────────────────────────────────────────────

function PieceRow({ piece }: { piece: ProgressData['pieces'][number] }) {
  const theme = useTheme();
  const up    = piece.score_change >= 0;

  return (
    <View style={[styles.pieceRow, { borderColor: theme.border }]}>
      <View style={styles.pieceLeft}>
        <Text style={[styles.pieceTitle, { color: theme.text, fontFamily: Fonts.body }]} numberOfLines={1}>
          {piece.title}
        </Text>
        <Text style={[styles.pieceSub, { color: theme.textMuted }]}>
          {piece.session_count} session{piece.session_count !== 1 ? 's' : ''}
        </Text>
      </View>
      <View style={styles.pieceRight}>
        <Text style={[styles.pieceScore, { color: theme.text, fontFamily: Fonts.mono }]}>
          {Math.round(piece.latest_score)}
        </Text>
        <Text style={[styles.pieceChange, { color: up ? theme.inTune : theme.offPitch }]}>
          {up ? '▲' : '▼'}{Math.abs(Math.round(piece.score_change))}
        </Text>
      </View>
    </View>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const theme  = useTheme();
  const insets = useSafeAreaInsets();
  const { token, logout } = useAuthStore();

  const [data,      setData]      = useState<ProgressData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);

  useEffect(() => {
    if (!token) router.replace('/(auth)' as any);
  }, [token]);

  const load = useCallback(async () => {
    try {
      const prog = await getProgress();
      setData(prog);
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!token) return null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 80 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.accent} />}
    >
      {/* Header */}
      <Animated.View entering={FadeInDown.delay(50).springify()} style={styles.header}>
        <Text style={[styles.title, { color: theme.text, fontFamily: Fonts.heading }]}>Progress</Text>
        <Pressable onPress={() => { logout(); router.replace('/(auth)' as any); }} style={styles.logoutBtn}>
          <Text style={[styles.logoutText, { color: theme.textMuted }]}>Log out</Text>
        </Pressable>
      </Animated.View>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 60 }} />
      ) : (
        <>
          {/* Score trend */}
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: Fonts.heading }]}>Score trend</Text>
            <Card noPad style={styles.chartCard}>
              <TrendChart sessions={data?.sessions ?? []} />
            </Card>
          </Animated.View>

          {/* Heatmap */}
          <Animated.View entering={FadeInDown.delay(150).springify()}>
            <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: Fonts.heading }]}>Practice calendar</Text>
            <Card style={styles.heatmapCard}>
              <CalendarHeatmap practiceDays={data?.practice_days ?? []} />
            </Card>
          </Animated.View>

          {/* Per-piece */}
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: Fonts.heading }]}>Pieces</Text>
            {(data?.pieces ?? []).length === 0 ? (
              <Card style={styles.emptyCard}>
                <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: Fonts.body }]}>
                  No pieces recorded yet. Upload your first session!
                </Text>
              </Card>
            ) : (
              <Card noPad>
                {(data?.pieces ?? []).map((p, i) => (
                  <PieceRow key={`${p.title}-${i}`} piece={p} />
                ))}
              </Card>
            )}
          </Animated.View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { paddingHorizontal: 20, gap: 20 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:        { fontSize: FontSize.xl, fontWeight: '700' },
  logoutBtn:    { padding: 8 },
  logoutText:   { fontSize: FontSize.sm },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', marginBottom: 10 },
  chartCard:    { paddingVertical: 12, paddingHorizontal: 4, overflow: 'hidden' },
  chartEmpty: {
    height:         100,
    borderRadius:   12,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        16,
  },
  heatmapCard:  {},
  calLabel:     { fontSize: 9, fontWeight: '600' },
  calCell:      {},
  calLegend: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    marginTop:     10,
  },
  calLegendText: { fontSize: FontSize.xs, color: '#888' },
  pieceRow: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  pieceLeft:   { flex: 1, gap: 2 },
  pieceRight:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pieceTitle:  { fontSize: FontSize.base, fontWeight: '600' },
  pieceSub:    { fontSize: FontSize.xs },
  pieceScore:  { fontSize: FontSize.lg, fontWeight: '700' },
  pieceChange: { fontSize: FontSize.sm, fontWeight: '600' },
  emptyCard:   { alignItems: 'center', paddingVertical: 32 },
  emptyText:   { fontSize: FontSize.base, textAlign: 'center' },
});
