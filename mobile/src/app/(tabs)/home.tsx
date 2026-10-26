/**
 * Home screen — matching screenshot '2 · Home' exactly.
 */

import { router, useFocusEffect } from 'expo-router';
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
import Svg, { Path, Rect } from 'react-native-svg';

import { Fonts, FontSize } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { getProgress, type ProgressData } from '@/services/api';

export default function HomeScreen() {
  const theme  = useTheme();
  const insets = useSafeAreaInsets();
  const { user, token, logout } = useAuthStore();

  const [progress,   setProgress]   = useState<ProgressData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!token) router.replace('/(auth)' as any);
  }, [token]);

  const loadData = useCallback(async () => {
    try {
      const backendProgress = await getProgress().catch(() => null);
      if (backendProgress) {
        setProgress(backendProgress);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Reload whenever the tab is shown, so a just-uploaded take appears
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // One row per piece (all its attempts live on the piece screen)
  const pieces = (progress?.pieces ?? []).filter((p) => {
    const t = (p.title || '').toLowerCase();
    return p.latest_score != null && !t.includes('a440') && !t.includes('test audio');
  });

  const userName = user?.full_name?.split(' ')[0] ?? 'Maya';
  const initial = userName.charAt(0).toUpperCase();
  const hour = currentTime.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // Current date formatting: "Saturday, 24 October"
  const todayStr = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(currentTime);

  const streakDays = progress?.streak_days ?? 12;

  function handleLogout() {
    setProfileMenuOpen(false);
    logout();
    router.replace('/(auth)' as any);
  }

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
          <View>
            <Text style={styles.dateText}>{todayStr}</Text>
            <Text style={styles.greetingText}>{greeting}, {userName}</Text>
          </View>
          <Pressable
            onPress={() => setProfileMenuOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel="Open profile menu"
            accessibilityState={{ expanded: profileMenuOpen }}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{initial}</Text>
          </Pressable>
        </View>

        {/* Upload a Recording Button */}
        <Pressable
          onPress={() => router.push('/upload' as any)}
          style={({ pressed }) => [styles.uploadBtn, pressed && styles.pressed]}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" style={{ marginRight: 8 }}>
            <Path
              d="M12 3v12m0-12l-4 4m4-4l4 4"
              stroke="#FFFFFF"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
              stroke="#FFFFFF"
              strokeWidth={2.2}
              strokeLinecap="round"
            />
          </Svg>
          <Text style={styles.uploadBtnText}>Upload a recording</Text>
        </Pressable>

        {/* Pieces: one row per piece, tap for every attempt */}
        <View style={styles.recentSection}>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>Your pieces</Text>
            <Pressable onPress={() => router.push('/(tabs)/progress' as any)}>
              <Text style={styles.seeAllText}>See all</Text>
            </Pressable>
          </View>

          {pieces.length === 0 ? (
            <View style={styles.emptySessionsCard}>
              <Text style={styles.emptySessionsTitle}>No pieces yet</Text>
              <Text style={styles.emptySessionsSub}>
                Upload a recording above to analyze your performance and see your scores.
              </Text>
            </View>
          ) : (
            <View style={styles.sessionsList}>
              {pieces.slice(0, 10).map((piece) => {
                const change =
                  piece.first_score != null && piece.latest_score != null && piece.session_count > 1
                    ? Math.round(piece.latest_score - piece.first_score)
                    : null;
                const isUp = (change ?? 0) >= 0;
                const last = piece.last_practiced ? new Date(piece.last_practiced).toLocaleDateString() : '';

                return (
                  <Pressable
                    key={piece.piece_key}
                    onPress={() => router.push(`/piece/${encodeURIComponent(piece.piece_key)}` as any)}
                    style={({ pressed }) => [styles.sessionRow, pressed && styles.pressed]}
                  >
                    <View style={styles.sessionLeft}>
                      <Text style={styles.sessionPieceName}>{piece.title}</Text>
                      <Text style={styles.sessionMeta}>
                        {piece.instrument ?? ''} · {piece.session_count} {piece.session_count === 1 ? 'attempt' : 'attempts'}
                        {last ? ` · ${last}` : ''}
                      </Text>
                    </View>

                    <View style={styles.sessionRight}>
                      {change !== null && change !== 0 ? (
                        <View style={styles.deltaBox}>
                          <Text style={[styles.deltaText, { color: isUp ? '#0D9488' : '#EA580C' }]}>
                            {isUp ? '↑' : '↓'} {Math.abs(change)}
                          </Text>
                        </View>
                      ) : null}
                      <Text style={styles.sessionScore}>
                        {piece.latest_score != null ? Math.round(piece.latest_score) : '–'}
                      </Text>
                      <Text style={styles.rowChevron}>›</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {profileMenuOpen && (
        <>
          <Pressable
            onPress={() => setProfileMenuOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close profile menu"
            style={styles.profileMenuDismissArea}
          />
          <View style={[styles.profileMenu, { top: insets.top + 58 }]}>
            <Text style={styles.profileName} numberOfLines={1}>
              {user?.full_name ?? userName}
            </Text>
            {user?.email ? (
              <Text style={styles.profileEmail} numberOfLines={1}>{user.email}</Text>
            ) : null}
            <View style={styles.profileMenuDivider} />
            <Pressable
              onPress={handleLogout}
              accessibilityRole="button"
              style={({ pressed }) => [styles.profileMenuAction, pressed && styles.profileMenuActionPressed]}
            >
              <Text style={styles.profileMenuActionText}>Log out</Text>
            </Pressable>
          </View>
        </>
      )}
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
  dateText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: '#64748B',
    marginBottom: 2,
  },
  greetingText: {
    fontSize: 22,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    color: '#0F172A',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  avatarText: {
    fontSize: 15,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    color: '#4F46E5',
  },
  profileMenuDismissArea: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
  },
  profileMenu: {
    position: 'absolute',
    right: 20,
    zIndex: 11,
    elevation: 8,
    width: 260,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  profileName: {
    fontSize: 14,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    color: '#0F172A',
  },
  profileEmail: {
    marginTop: 3,
    fontSize: 12,
    fontFamily: Fonts.body,
    color: '#64748B',
  },
  profileMenuDivider: {
    height: 1,
    marginVertical: 10,
    backgroundColor: '#E2E8F0',
  },
  profileMenuAction: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  profileMenuActionPressed: {
    backgroundColor: '#F1F5F9',
  },
  profileMenuActionText: {
    fontSize: 14,
    fontFamily: Fonts.body,
    fontWeight: '600',
    color: '#B42318',
  },
  streakCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  streakHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  streakTitle: {
    fontSize: 18,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    color: '#0F172A',
  },
  streakBest: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: '#64748B',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dayCol: {
    alignItems: 'center',
    gap: 6,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleDone: {
    backgroundColor: '#4F46E5',
  },
  dayCircleToday: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#4F46E5',
  },
  dayCircleFuture: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
  },
  checkMark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  dayLabel: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: '#64748B',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 16,
  },
  goalSection: {
    gap: 8,
  },
  goalTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalLabel: {
    fontSize: 13,
    fontFamily: Fonts.body,
    fontWeight: '600',
    color: '#0F172A',
  },
  goalValue: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: '#64748B',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4F46E5',
    borderRadius: 4,
  },
  uploadBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 24,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  uploadBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: Fonts.body,
    fontWeight: '700',
  },
  suggestedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  suggestedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  suggestedTextCol: {
    flex: 1,
  },
  suggestedLabel: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: '#94A3B8',
    marginBottom: 2,
  },
  suggestedTitle: {
    fontSize: 14,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    color: '#0F172A',
  },
  chevron: {
    fontSize: 20,
    color: '#94A3B8',
    marginLeft: 8,
  },
  recentSection: {
    marginBottom: 20,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recentTitle: {
    fontSize: 17,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    color: '#0F172A',
  },
  seeAllText: {
    fontSize: 13,
    fontFamily: Fonts.body,
    fontWeight: '600',
    color: '#4F46E5',
  },
  emptySessionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySessionsTitle: {
    fontSize: 15,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  emptySessionsSub: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },
  sessionsList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sessionLeft: {
    flex: 1,
  },
  sessionPieceName: {
    fontSize: 15,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  sessionMeta: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: '#94A3B8',
  },
  sessionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deltaBox: {
    minWidth: 32,
    alignItems: 'flex-end',
  },
  deltaText: {
    fontSize: 13,
    fontFamily: Fonts.body,
    fontWeight: '600',
  },
  rowChevron: {
    fontSize: 22,
    color: '#CBD5E1',
    marginLeft: 6,
  },
  sessionScore: {
    fontSize: 18,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    color: '#0F172A',
    minWidth: 26,
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.85,
  },
});
