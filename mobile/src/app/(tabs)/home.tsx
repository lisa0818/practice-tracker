/**
 * Home screen — streak, daily goal, upload button, suggested exercise,
 * recent sessions with score changes.
 */

import { LinearGradient } from 'expo-linear-gradient';
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
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { FontSize, Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { getProgress, listSessions, type ProgressData, type SessionSummary } from '@/services/api';

const SUGGESTIONS = [
  { title: 'C Major Scale',          desc: 'Warm up with 3 octaves, slow bow', emoji: '🎻' },
  { title: 'G Major Arpeggio',       desc: 'Smooth transitions between positions', emoji: '🎹' },
  { title: 'Long-tone exercise',     desc: '4 counts per note, steady pitch',   emoji: '🎵' },
  { title: 'Chromatic Scale',        desc: 'Half-step precision training',       emoji: '🎸' },
];

function StreakBadge({ streak }: { streak: number }) {
  const theme = useTheme();
  return (
    <LinearGradient
      colors={['#F59E0B', '#F97316']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.streakBadge}
    >
      <Text style={styles.streakEmoji}>🔥</Text>
      <Text style={[styles.streakNum, { fontFamily: Fonts.mono }]}>{streak}</Text>
      <Text style={styles.streakLabel}>day streak</Text>
    </LinearGradient>
  );
}

function SessionRow({ session, index }: { session: SessionSummary; index: number }) {
  const theme = useTheme();
  const score = session.overall_score;
  const hasScore = score !== undefined && score !== null;

  return (
    <Animated.View entering={FadeInRight.delay(index * 60).springify()}>
      <Pressable
        onPress={() => {
          if (session.status === 'completed') {
            router.push(`/result/${session.session_id}` as any);
          }
        }}
        style={({ pressed }) => [
          styles.sessionRow,
          {
            backgroundColor: theme.backgroundCard,
            borderColor: theme.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <View style={styles.sessionLeft}>
          <Text style={[styles.sessionTitle, { color: theme.text, fontFamily: Fonts.body }]} numberOfLines={1}>
            {session.title}
          </Text>
          <Text style={[styles.sessionSub, { color: theme.textMuted, fontFamily: Fonts.body }]}>
            {session.target_scale} · {new Date(session.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.sessionRight}>
          {session.status === 'processing' ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : hasScore ? (
            <View style={[
              styles.scorePill,
              { backgroundColor: score >= 80 ? theme.inTuneLight : score >= 60 ? theme.accentLight : theme.offPitchLight }
            ]}>
              <Text style={[
                styles.scoreText,
                {
                  color: score >= 80 ? theme.inTune : score >= 60 ? theme.accent : theme.offPitch,
                  fontFamily: Fonts.mono,
                }
              ]}>
                {Math.round(score)}
              </Text>
            </View>
          ) : (
            <Text style={[styles.pendingText, { color: theme.textMuted }]}>pending</Text>
          )}
          {session.status === 'completed' && (
            <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const theme  = useTheme();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuthStore();

  const [sessions,   setSessions]   = useState<SessionSummary[]>([]);
  const [progress,   setProgress]   = useState<ProgressData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (!token) router.replace('/(auth)' as any);
  }, [token]);

  const suggestion = SUGGESTIONS[Math.floor(Date.now() / 86400000) % SUGGESTIONS.length];

  const load = useCallback(async () => {
    try {
      const [sess, prog] = await Promise.all([listSessions(), getProgress()]);
      setSessions(sess);
      setProgress(prog);
    } catch {
      // Show whatever we have
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => { setRefreshing(true); load(); };

  if (!token) return null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 80 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} />}
    >
      {/* Header */}
      <Animated.View entering={FadeInDown.delay(50).springify()} style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: theme.textMuted, fontFamily: Fonts.body }]}>
            Good {getTimeOfDay()},
          </Text>
          <Text style={[styles.name, { color: theme.text, fontFamily: Fonts.heading }]}>
            {user?.full_name?.split(' ')[0] ?? 'Musician'} 👋
          </Text>
        </View>
        <StreakBadge streak={progress?.streak_days ?? 0} />
      </Animated.View>

      {/* Daily goal card */}
      <Animated.View entering={FadeInDown.delay(100).springify()}>
        <Card style={styles.goalCard}>
          <LinearGradient
            colors={['#4F46E5', '#6366F1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.goalGradient}
          >
            <View style={styles.goalContent}>
              <View>
                <Text style={styles.goalTitle}>Daily practice goal</Text>
                <Text style={styles.goalSub}>
                  {sessions.filter(s => {
                    const d = new Date(s.created_at);
                    const today = new Date();
                    return d.toDateString() === today.toDateString();
                  }).length > 0
                    ? 'Great job! You practiced today ✓'
                    : 'Upload a recording to keep your streak!'
                  }
                </Text>
              </View>
              <Button
                label="+ Upload"
                onPress={() => router.push('/upload')}
                style={styles.goalBtn}
                textStyle={{ color: theme.accent }}
                variant="ghost"
              />
            </View>
          </LinearGradient>
        </Card>
      </Animated.View>

      {/* Suggested exercise */}
      <Animated.View entering={FadeInDown.delay(150).springify()}>
        <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: Fonts.heading }]}>
          Suggested next exercise
        </Text>
        <Pressable
          onPress={() => router.push('/upload')}
          style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
        >
          <Card style={styles.suggestionCard}>
            <Text style={styles.suggEmoji}>{suggestion.emoji}</Text>
            <View style={styles.suggText}>
              <Text style={[styles.suggTitle, { color: theme.text, fontFamily: Fonts.body }]}>
                {suggestion.title}
              </Text>
              <Text style={[styles.suggDesc, { color: theme.textMuted, fontFamily: Fonts.body }]}>
                {suggestion.desc}
              </Text>
            </View>
            <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
          </Card>
        </Pressable>
      </Animated.View>

      {/* Recent sessions */}
      <Animated.View entering={FadeInDown.delay(200).springify()}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: Fonts.heading }]}>
            Recent sessions
          </Text>
          <Pressable onPress={() => router.push('/(tabs)/progress')}>
            <Text style={[styles.seeAll, { color: theme.accent }]}>See all</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
        ) : sessions.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={[styles.emptyEmoji]}>🎵</Text>
            <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: Fonts.body }]}>
              No sessions yet. Upload your first recording!
            </Text>
          </Card>
        ) : (
          <View style={styles.sessionList}>
            {sessions.slice(0, 5).map((s, i) => (
              <SessionRow key={s.session_id} session={s} index={i} />
            ))}
          </View>
        )}
      </Animated.View>
    </ScrollView>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

const styles = StyleSheet.create({
  container:   { paddingHorizontal: 20, gap: 20 },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting:    { fontSize: FontSize.sm },
  name:        { fontSize: FontSize.xl, fontWeight: '700' },
  streakBadge: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    paddingVertical:   6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  streakEmoji: { fontSize: 18 },
  streakNum:   { fontSize: FontSize.lg, color: '#FFF', fontWeight: '700' },
  streakLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.85)' },
  goalCard:    { padding: 0, overflow: 'hidden' },
  goalGradient:{ borderRadius: 16 },
  goalContent: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    padding:         20,
  },
  goalTitle:   { color: '#FFF', fontFamily: Fonts.body, fontSize: FontSize.md, fontWeight: '600', marginBottom: 4 },
  goalSub:     { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm, fontFamily: Fonts.body },
  goalBtn:     { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16 },
  sectionTitle:{ fontSize: FontSize.lg, fontWeight: '700', marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  seeAll:      { fontSize: FontSize.sm, fontWeight: '600' },
  suggestionCard: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
  },
  suggEmoji:   { fontSize: 32 },
  suggText:    { flex: 1, gap: 2 },
  suggTitle:   { fontSize: FontSize.base, fontWeight: '600' },
  suggDesc:    { fontSize: FontSize.sm },
  sessionList: { gap: 8 },
  sessionRow: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    padding:         14,
    borderRadius:    12,
    borderWidth:     1,
  },
  sessionLeft: { flex: 1, gap: 2, marginRight: 8 },
  sessionRight:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  sessionTitle:{ fontSize: FontSize.base, fontWeight: '600' },
  sessionSub:  { fontSize: FontSize.xs },
  scorePill: {
    paddingHorizontal: 10,
    paddingVertical:    4,
    borderRadius:       20,
  },
  scoreText:   { fontSize: FontSize.sm, fontWeight: '700' },
  pendingText: { fontSize: FontSize.xs },
  chevron:     { fontSize: FontSize.xl, fontWeight: '300' },
  emptyCard:   { alignItems: 'center', gap: 10, paddingVertical: 32 },
  emptyEmoji:  { fontSize: 40 },
  emptyText:   { fontSize: FontSize.base, textAlign: 'center' },
});
