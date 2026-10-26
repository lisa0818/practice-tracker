/**
 * Progress screen — one card per piece.
 * All attempts at the same piece (same title + instrument, or the same melody)
 * are grouped into a single card; tap a card to see that piece's history.
 */

import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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
import Svg, { Circle, Path } from 'react-native-svg';

import { roundScore } from '@/components/ScoreChart';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { getErrorMessage, getProgress, type PieceProgress } from '@/services/api';

const GAP = 12;

function Sparkline({ scores, color }: { scores: number[]; color: string }) {
  const W = 100, H = 30, PAD = 4;
  if (scores.length < 2) {
    return (
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Circle cx={W / 2} cy={H / 2} r={3.5} fill={color} />
      </Svg>
    );
  }
  const lo = Math.min(...scores), hi = Math.max(...scores);
  const span = Math.max(hi - lo, 10);
  const pts = scores.map((v, i) => ({
    x: PAD + (i * (W - PAD * 2)) / (scores.length - 1),
    y: H - PAD - ((v - lo) / span) * (H - PAD * 2),
  }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={last.x} cy={last.y} r={3.5} fill={color} />
    </Svg>
  );
}

function PieceCard({ piece, width }: { piece: PieceProgress; width: number }) {
  const scores = piece.attempts.map((a) => a.overall_score).filter((v): v is number => v != null);
  const improvement =
    piece.first_score != null && piece.latest_score != null ? piece.latest_score - piece.first_score : null;
  const single = piece.session_count === 1;

  const tone = single || improvement == null || Math.round(improvement) === 0 ? 'flat' : improvement > 0 ? 'up' : 'down';
  const color = tone === 'up' ? '#0D9488' : tone === 'down' ? '#EA580C' : '#64748B';
  const deltaText = single
    ? 'First attempt'
    : tone === 'flat'
      ? 'No change'
      : `${tone === 'up' ? '↑' : '↓'} ${Math.abs(Math.round(improvement as number))} since first`;

  return (
    <Pressable
      onPress={() => router.push(`/piece/${encodeURIComponent(piece.piece_key)}` as any)}
      style={({ pressed }) => [styles.card, { width }, pressed && { opacity: 0.85 }]}
    >
      <Text style={styles.cardTitle} numberOfLines={2}>{piece.title}</Text>
      <Text style={styles.cardInstrument}>{piece.instrument ?? ''}</Text>

      <View style={styles.cardScoreRow}>
        <Text style={styles.cardScore}>{roundScore(piece.latest_score)}</Text>
        <Text style={styles.cardScoreLabel}>latest</Text>
      </View>

      <View style={styles.spark}>
        <Sparkline scores={scores} color={color === '#64748B' ? '#4F46E5' : color} />
      </View>

      <View style={styles.cardFooter}>
        <Text style={[styles.delta, { color }]} numberOfLines={1}>{deltaText}</Text>
        <Text style={styles.attempts}>
          {piece.session_count} {piece.session_count === 1 ? 'attempt' : 'attempts'}
        </Text>
      </View>
    </Pressable>
  );
}

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { token } = useAuthStore();

  const [pieces,     setPieces]     = useState<PieceProgress[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    if (!token) router.replace('/(auth)' as any);
  }, [token]);

  const loadData = useCallback(async () => {
    try {
      const prog = await getProgress();
      setPieces((prog.pieces ?? []).filter((p) => p.latest_score != null));
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
      setPieces((prev) => prev ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Reload whenever the tab is opened, so a just-uploaded take shows up
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const cardW = (width - 40 - GAP) / 2;

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
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Progress</Text>
            <Text style={styles.subtitle}>One card per piece. Tap one to see every attempt.</Text>
          </View>
          <Pressable style={styles.addBtn} onPress={() => router.push('/upload' as any)}>
            <Text style={styles.addBtnText}>＋ Upload</Text>
          </Pressable>
        </View>

        {pieces === null && <ActivityIndicator style={{ marginTop: 40 }} color="#4F46E5" />}

        {error !== '' && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Couldn't load your progress: {error}</Text>
            <Pressable onPress={loadData}><Text style={styles.retry}>Try again</Text></Pressable>
          </View>
        )}

        {pieces !== null && pieces.length === 0 && error === '' && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No pieces yet</Text>
            <Text style={styles.emptyBody}>
              Upload a recording to start a piece. Add more takes later and you'll see exactly how you improve.
            </Text>
            <Pressable style={styles.cta} onPress={() => router.push('/upload' as any)}>
              <Text style={styles.ctaText}>Upload a recording</Text>
            </Pressable>
          </View>
        )}

        {pieces !== null && pieces.length > 0 && (
          <View style={styles.grid}>
            {pieces.map((p) => <PieceCard key={p.piece_key} piece={p} width={cardW} />)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', paddingHorizontal: 20 },
  scrollContent: { paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
  title: { fontSize: 26, fontFamily: Fonts.heading, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 13, fontFamily: Fonts.body, color: '#64748B', marginTop: 4 },
  addBtn: { backgroundColor: '#4F46E5', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginTop: 4 },
  addBtnText: { color: '#FFFFFF', fontSize: 13, fontFamily: Fonts.heading, fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
  },
  cardTitle: { fontSize: 15, fontFamily: Fonts.heading, fontWeight: '800', color: '#0F172A', minHeight: 38 },
  cardInstrument: { fontSize: 11, fontFamily: Fonts.body, color: '#94A3B8', marginTop: 2 },
  cardScoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 10 },
  cardScore: { fontSize: 34, fontFamily: Fonts.heading, fontWeight: '800', color: '#0F172A' },
  cardScoreLabel: { fontSize: 11, fontFamily: Fonts.body, color: '#94A3B8' },
  spark: { marginTop: 6, marginBottom: 8 },
  cardFooter: { gap: 2 },
  delta: { fontSize: 12, fontFamily: Fonts.body, fontWeight: '700' },
  attempts: { fontSize: 11, fontFamily: Fonts.body, color: '#94A3B8' },

  empty: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#E2E8F0',
  },
  emptyTitle: { fontSize: 16, fontFamily: Fonts.heading, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  emptyBody: { fontSize: 13, fontFamily: Fonts.body, color: '#64748B', lineHeight: 19 },
  cta: { backgroundColor: '#4F46E5', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  ctaText: { color: '#FFFFFF', fontSize: 14, fontFamily: Fonts.heading, fontWeight: '700' },
  errorBox: { backgroundColor: '#FFF7ED', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#FED7AA' },
  errorText: { fontSize: 13, fontFamily: Fonts.body, color: '#9A3412' },
  retry: { fontSize: 13, fontFamily: Fonts.heading, fontWeight: '700', color: '#4F46E5', marginTop: 6 },
});
