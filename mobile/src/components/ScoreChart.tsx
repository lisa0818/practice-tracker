/**
 * Score history of one piece: overall, pitch and timing score for each attempt
 * (#1, #2, …). Each attempt gets a fixed-width column, so the chart scrolls
 * sideways instead of squeezing when there are many attempts.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { Fonts } from '@/constants/theme';
import type { PieceAttempt } from '@/services/api';

export const SCORE_COLORS = {
  overall: '#4F46E5',
  pitch:   '#0D9488',
  timing:  '#EA580C',
};

const CHART_H     = 210;
const Y_AXIS_W    = 30;
const PLOT_TOP    = 18;
const PLOT_BOTTOM = 44;   // room for "#n" and date labels
const COL_W       = 64;
const SIDE_PAD    = 28;

export function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function roundScore(v: number | null | undefined): string {
  return v == null ? '–' : String(Math.round(v));
}

type ScoreKey = 'overall_score' | 'pitch_score' | 'timing_score';

export function ScoreChart({ attempts, horizontalInset = 72 }: { attempts: PieceAttempt[]; horizontalInset?: number }) {
  const { width } = useWindowDimensions();
  const n = attempts.length;

  // Y range: always up to 100, down to a round number just under the lowest score
  const all = attempts.flatMap((a) => [a.overall_score, a.pitch_score, a.timing_score])
    .filter((v): v is number => v != null);
  const lo = Math.max(0, Math.floor((Math.min(...all, 100) - 10) / 10) * 10);
  const hi = 100;
  const ticks = [lo, lo + (hi - lo) / 2, hi].map(Math.round);

  const plotW = Math.max(width - horizontalInset - Y_AXIS_W, n * COL_W);
  const y = (v: number) => PLOT_TOP + ((hi - v) / (hi - lo)) * (CHART_H - PLOT_TOP - PLOT_BOTTOM);
  const x = (i: number) => (n === 1 ? plotW / 2 : SIDE_PAD + (i * (plotW - SIDE_PAD * 2)) / (n - 1));

  function line(key: ScoreKey, color: string, w: number) {
    const pts = attempts
      .map((a, i) => (a[key] == null ? null : { px: x(i), py: y(a[key] as number) }))
      .filter((p): p is { px: number; py: number } => p != null);
    if (pts.length === 0) return null;
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.px} ${p.py}`).join(' ');
    const main = key === 'overall_score';
    return (
      <React.Fragment key={key}>
        {pts.length > 1 && (
          <Path d={d} stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {pts.map((p, i) => (
          <Circle key={i} cx={p.px} cy={p.py} r={main ? 5 : 3.5}
                  fill={main ? '#FFFFFF' : color} stroke={color} strokeWidth={2} />
        ))}
      </React.Fragment>
    );
  }

  return (
    <View>
      <View style={styles.chartRow}>
        <Svg width={Y_AXIS_W} height={CHART_H} style={{ flexShrink: 0 }}>
          {ticks.map((t) => (
            <SvgText fontFamily={Fonts.mono} key={t} x={Y_AXIS_W - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#94A3B8">
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
            {line('pitch_score',   SCORE_COLORS.pitch,   2)}
            {line('timing_score',  SCORE_COLORS.timing,  2)}
            {line('overall_score', SCORE_COLORS.overall, 3)}

            {attempts.map((a, i) => (
              <React.Fragment key={a.session_id}>
                {a.overall_score != null && (
                  <SvgText fontFamily={Fonts.mono} x={x(i)} y={y(a.overall_score) - 11} textAnchor="middle" fontSize={11} fontWeight="700" fill={SCORE_COLORS.overall}>
                    {Math.round(a.overall_score)}
                  </SvgText>
                )}
                <SvgText fontFamily={Fonts.mono} x={x(i)} y={CHART_H - 24} textAnchor="middle" fontSize={11} fontWeight="700" fill="#0F172A">
                  #{i + 1}
                </SvgText>
                <SvgText fontFamily={Fonts.mono} x={x(i)} y={CHART_H - 10} textAnchor="middle" fontSize={10} fill="#94A3B8">
                  {fmtDate(a.created_at)}
                </SvgText>
              </React.Fragment>
            ))}
          </Svg>
        </ScrollView>
      </View>

      <View style={styles.legendRow}>
        {([['Overall', SCORE_COLORS.overall], ['Pitch', SCORE_COLORS.pitch], ['Timing', SCORE_COLORS.timing]] as const).map(([label, c]) => (
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

const styles = StyleSheet.create({
  chartRow: { flexDirection: 'row' },
  legendRow: { flexDirection: 'row', gap: 16, marginTop: 8, paddingLeft: Y_AXIS_W, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, fontFamily: Fonts.body, color: '#64748B' },
  scrollHint: { fontSize: 11, fontFamily: Fonts.body, color: '#94A3B8', marginTop: 6, paddingLeft: Y_AXIS_W },
});
