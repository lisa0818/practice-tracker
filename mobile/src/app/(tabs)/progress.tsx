/**
 * Progress screen — matching screenshot '7 · Progress' exactly.
 */

import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { Fonts, FontSize } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { getProgress, type ProgressData } from '@/services/api';

// 4 weeks of heatmap data (rows: Sep 28, Oct 5, Oct 12, Oct 19)
const HEATMAP_WEEKS = [
  {
    label: 'Sep 28',
    days: [1, 2, 0, 2, 3, 0, 1], // 0=none, 1=light, 2=medium, 3=high
  },
  {
    label: 'Oct 5',
    days: [2, 2, 1, 2, 2, 1, 1],
  },
  {
    label: 'Oct 12',
    days: [3, 3, 3, 2, 3, 3, 1],
  },
  {
    label: 'Oct 19',
    days: [3, 3, 2, 3, 3, 0, -1], // -1=dashed outline for future
  },
];

const PIECES_SUMMARY = [
  {
    title: 'Minuet in G',
    instrument: 'Violin',
    score: 86,
    delta: '+4',
    isUp: true,
  },
  {
    title: 'C major scale',
    instrument: 'Violin',
    score: 84,
    delta: '+5',
    isUp: true,
  },
  {
    title: 'Long tones',
    instrument: 'Violin',
    score: 74,
    delta: '-3',
    isUp: false,
  },
];

function MiniSparkline({ isUp }: { isUp: boolean }) {
  return (
    <Svg width={42} height={16} viewBox="0 0 42 16" fill="none">
      <Path
        d={isUp ? "M 2 12 Q 12 14 20 8 T 40 4" : "M 2 4 Q 12 2 22 9 T 40 13"}
        stroke="#4F46E5"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const { token, logout } = useAuthStore();

  const [timeFilter, setTimeFilter] = useState<'week' | 'month' | 'year'>('month');
  const [data,       setData]       = useState<ProgressData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!token) router.replace('/(auth)' as any);
  }, [token]);

  const loadData = useCallback(async () => {
    try {
      const prog = await getProgress();
      setData(prog);
    } catch {
      // Keep rich demo progression data
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
        {/* Top Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Progress</Text>

          {/* Segmented Filter */}
          <View style={styles.segmentedToggle}>
            {(['week', 'month', 'year'] as const).map((filter) => {
              const active = timeFilter === filter;
              return (
                <Pressable
                  key={filter}
                  onPress={() => setTimeFilter(filter)}
                  style={[styles.segBtn, active && styles.segBtnActive]}
                >
                  <Text style={[styles.segText, active && styles.segTextActive]}>
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Average Pitch Score Card */}
        <View style={styles.card}>
          <View style={styles.scoreRow}>
            <View>
              <Text style={styles.scoreCardLabel}>Average pitch score</Text>
              <Text style={styles.bigScore}>81</Text>
            </View>
            <View style={styles.deltaPill}>
              <Text style={styles.deltaPillText}>↑ 11 pts vs last month</Text>
            </View>
          </View>

          {/* Trend Line Chart */}
          <View style={styles.chartWrapper}>
            <View style={styles.yAxisLabels}>
              {['90', '80', '70', '60'].map((label) => (
                <Text key={label} style={styles.axisTickText}>{label}</Text>
              ))}
            </View>

            <View style={styles.chartArea}>
              <Svg width="100%" height={90} viewBox="0 0 240 90">
                {/* Horizontal grid lines */}
                {[10, 34, 58, 82].map((y, idx) => (
                  <Line
                    key={idx}
                    x1={0}
                    y1={y}
                    x2={240}
                    y2={y}
                    stroke="#F1F5F9"
                    strokeWidth={1}
                  />
                ))}

                {/* Trend line */}
                <Path
                  d="M 5 68 C 45 68, 65 52, 95 56 C 125 60, 145 42, 175 36 C 200 32, 215 20, 232 16"
                  stroke="#4F46E5"
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinecap="round"
                />

                {/* Final Dot */}
                <Circle cx={232} cy={16} r={5} fill="#FFFFFF" stroke="#4F46E5" strokeWidth={2.5} />
              </Svg>
            </View>
          </View>

          <View style={styles.xAxisRow}>
            <Text style={styles.xDateLabel}>Oct 1</Text>
            <Text style={styles.xDateLabel}>Oct 24</Text>
          </View>
        </View>

        {/* Practice Days Card (Heatmap) */}
        <View style={styles.card}>
          <View style={styles.heatmapHeader}>
            <Text style={styles.cardTitle}>Practice days</Text>
            <View style={styles.heatmapLegend}>
              <Text style={styles.legendLabel}>Less</Text>
              <View style={[styles.legendBox, { backgroundColor: '#EEF2FF' }]} />
              <View style={[styles.legendBox, { backgroundColor: '#818CF8' }]} />
              <View style={[styles.legendBox, { backgroundColor: '#4F46E5' }]} />
              <Text style={styles.legendLabel}>More</Text>
            </View>
          </View>

          {/* Day of Week Headers */}
          <View style={styles.dowRow}>
            <View style={{ width: 44 }} />
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <Text key={i} style={styles.dowText}>{d}</Text>
            ))}
          </View>

          {/* Heatmap Grid */}
          <View style={styles.heatmapGrid}>
            {HEATMAP_WEEKS.map((w) => (
              <View key={w.label} style={styles.gridRow}>
                <Text style={styles.weekRowLabel}>{w.label}</Text>
                <View style={styles.tilesRow}>
                  {w.days.map((val, idx) => {
                    const isFuture = val === -1;
                    const bg =
                      val === 3 ? '#4F46E5' :
                      val === 2 ? '#6366F1' :
                      val === 1 ? '#A5B4FC' : '#EEF2FF';

                    return (
                      <View
                        key={idx}
                        style={[
                          styles.heatmapTile,
                          !isFuture && { backgroundColor: bg },
                          isFuture && styles.futureTile,
                        ]}
                      />
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* By Piece Section */}
        <View style={styles.byPieceSection}>
          <View style={styles.byPieceHeader}>
            <Text style={styles.cardTitle}>By piece</Text>
            <Text style={styles.byPieceSub}>Latest score · change</Text>
          </View>

          <View style={styles.piecesList}>
            {PIECES_SUMMARY.map((piece, idx) => (
              <Pressable
                key={piece.title}
                onPress={() => router.push(`/result/${idx === 0 ? 'minuet-g' : 'c-major-scale'}` as any)}
                style={({ pressed }) => [styles.pieceRow, pressed && styles.pressed]}
              >
                <View style={styles.pieceLeft}>
                  <Text style={styles.pieceTitle}>{piece.title}</Text>
                  <Text style={styles.pieceInstrument}>{piece.instrument}</Text>
                </View>

                {/* Sparkline Graphic */}
                <View style={styles.sparklineWrap}>
                  <MiniSparkline isUp={piece.isUp} />
                </View>

                <View style={styles.pieceRight}>
                  <Text style={styles.pieceScoreVal}>{piece.score}</Text>
                  <Text style={[styles.pieceDeltaVal, { color: piece.isUp ? '#0D9488' : '#EA580C' }]}>
                    {piece.isUp ? `↑ ${piece.delta.replace('+', '')}` : `↓ ${piece.delta.replace('-', '')}`}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    color: '#0F172A',
  },
  segmentedToggle: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    padding: 3,
  },
  segBtn: {
    paddingVertical: 5,
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  scoreCardLabel: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: '#64748B',
    marginBottom: 2,
  },
  bigScore: {
    fontSize: 32,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    color: '#0F172A',
  },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
  },
  deltaPillText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontWeight: '600',
    color: '#0D9488',
  },
  chartWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  yAxisLabels: {
    width: 24,
    height: 90,
    justifyContent: 'space-between',
  },
  axisTickText: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    color: '#94A3B8',
  },
  chartArea: {
    flex: 1,
    height: 90,
  },
  xAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 24,
    marginTop: 6,
  },
  xDateLabel: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: '#94A3B8',
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    color: '#0F172A',
  },
  heatmapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  heatmapLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendLabel: {
    fontSize: 10,
    fontFamily: Fonts.body,
    color: '#94A3B8',
  },
  legendBox: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  dowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dowText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontFamily: Fonts.body,
    color: '#94A3B8',
  },
  heatmapGrid: {
    gap: 8,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weekRowLabel: {
    width: 44,
    fontSize: 10,
    fontFamily: Fonts.body,
    color: '#94A3B8',
  },
  tilesRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  heatmapTile: {
    flex: 1,
    height: 22,
    borderRadius: 4,
  },
  futureTile: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    backgroundColor: '#FFFFFF',
  },
  byPieceSection: {
    marginBottom: 20,
  },
  byPieceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  byPieceSub: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: '#94A3B8',
  },
  piecesList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  pieceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  pieceLeft: {
    flex: 1.2,
  },
  pieceTitle: {
    fontSize: 14,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  pieceInstrument: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: '#94A3B8',
  },
  sparklineWrap: {
    flex: 1,
    alignItems: 'center',
  },
  pieceRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pieceScoreVal: {
    fontSize: 16,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    color: '#0F172A',
    minWidth: 24,
    textAlign: 'right',
  },
  pieceDeltaVal: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontWeight: '700',
    minWidth: 24,
  },
  pressed: {
    opacity: 0.85,
  },
});
