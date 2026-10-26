/**
 * Piece detail — the full history of one piece: score chart across attempts,
 * first-vs-latest comparison, a written summary and every attempt with playback.
 * "Add new take" uploads another attempt that is attached to this piece.
 */

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fmtDate, roundScore, ScoreChart } from '@/components/ScoreChart';
import { Fonts } from '@/constants/theme';
import {
  audioSource,
  deletePiece,
  getErrorMessage,
  getProgress,
  type PieceAttempt,
  type PieceProgress,
} from '@/services/api';

const METRICS: { key: keyof PieceAttempt; label: string; unit: string }[] = [
  { key: 'overall_score',     label: 'Overall score', unit: '' },
  { key: 'pitch_score',       label: 'Pitch score',   unit: '' },
  { key: 'timing_score',      label: 'Timing score',  unit: '' },
  { key: 'in_tune_pct',       label: 'Notes in tune', unit: '%' },
  { key: 'notes_on_beat_pct', label: 'Notes on beat', unit: '%' },
];

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

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function PieceDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();

  // The piece key travels URL-encoded; decode defensively
  const pieceKey = useMemo(() => {
    const raw = Array.isArray(params.id) ? params.id[0] : params.id;
    if (!raw) return '';
    try { return decodeURIComponent(raw); } catch { return raw; }
  }, [params.id]);

  const [piece, setPiece] = useState<PieceProgress | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    try {
      const prog = await getProgress();
      setPiece(prog.pieces.find((p) => p.piece_key === pieceKey) ?? null);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoaded(true);
    }
  }, [pieceKey]);

  // Reload on return, so a take uploaded from here appears straight away
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Playback: one shared player, switched between attempts ────────────────
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  useEffect(() => {
    if (status.didJustFinish) setPlayingId(null);
  }, [status.didJustFinish]);

  function togglePlay(a: PieceAttempt) {
    if (playingId === a.session_id) {
      if (status.playing) player.pause();
      else player.play();
      return;
    }
    player.replace(audioSource(a.session_id));
    setPlayingId(a.session_id);
    player.play();
  }

  const attempts = useMemo(() => {
    return (piece?.attempts ?? []).filter((a) => a.overall_score != null);
  }, [piece?.attempts]);
  const first    = attempts[0];
  const latest   = attempts[attempts.length - 1];
  const sessionCount = attempts.length;
  const tone     = sessionCount <= 1 ? 'flat' : (piece?.summary.tone ?? 'flat');
  const toneColor = tone === 'up' ? '#0D9488' : tone === 'down' ? '#EA580C' : '#64748B';

  async function removePiece() {
    if (!piece) return;
    player.pause();
    setDeleting(true);
    setDeleteError('');
    try {
      await deletePiece(piece.piece_key);
      router.replace('/(tabs)/progress' as any);
    } catch (e) {
      setDeleteError(getErrorMessage(e));
      setDeleting(false);
    }
  }

  function addTake() {
    if (!piece) return;
    player.pause();
    router.push({
      pathname: '/upload' as any,
      params: { pieceKey: piece.piece_key, pieceTitle: piece.title, instrument: piece.instrument ?? '' },
    });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => { player.pause(); router.back(); }} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.screenLabel}>Piece</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {!loaded && <ActivityIndicator style={{ marginTop: 40 }} color="#4F46E5" />}

        {loaded && error !== '' && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Couldn't load this piece: {error}</Text>
            <Pressable onPress={load}><Text style={styles.retry}>Try again</Text></Pressable>
          </View>
        )}

        {loaded && error === '' && !piece && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Piece not found</Text>
            <Text style={styles.bodyText}>It may have been removed. Go back to Progress to pick another piece.</Text>
          </View>
        )}

        {piece && (
          <>
            {/* Hero */}
            <View style={styles.card}>
              <Text style={styles.pieceName}>{piece.title}</Text>
              <Text style={styles.pieceMeta}>
                {piece.instrument ?? ''} · {sessionCount} {sessionCount === 1 ? 'attempt' : 'attempts'}
                {latest?.created_at ? ` · last ${fmtDate(latest.created_at)}` : (piece.last_practiced ? ` · last ${fmtDate(piece.last_practiced)}` : '')}
              </Text>

              <View style={styles.heroRow}>
                <View>
                  <Text style={styles.heroLabel}>Latest score</Text>
                  <Text style={styles.heroScore}>{roundScore(latest?.overall_score ?? piece.latest_score)}</Text>
                </View>
                <View style={styles.heroStats}>
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatVal}>{roundScore(first?.overall_score ?? piece.first_score)}</Text>
                    <Text style={styles.heroStatLabel}>First</Text>
                  </View>
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatVal}>{roundScore(piece.best_score ?? latest?.overall_score)}</Text>
                    <Text style={styles.heroStatLabel}>Best</Text>
                  </View>
                  {sessionCount > 1 && (
                    <View style={styles.heroStat}>
                      <Delta value={piece.score_change} />
                      <Text style={styles.heroStatLabel}>vs last</Text>
                    </View>
                  )}
                </View>
              </View>

              <Text style={[styles.headline, { color: toneColor }]}>
                {sessionCount <= 1 ? 'First attempt recorded' : piece.summary.headline}
              </Text>
            </View>

            {/* Score history */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Score history</Text>
              <ScoreChart attempts={attempts} horizontalInset={72} />
              {sessionCount === 1 && (
                <Text style={[styles.bodyText, { marginTop: 8 }]}>
                  This is your first attempt. Add another take after practising to see the lines move.
                </Text>
              )}
            </View>

            {/* First vs latest */}
            {sessionCount > 1 && first && latest && (
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
                      <Text style={styles.td}>{roundScore(a)}{a != null ? m.unit : ''}</Text>
                      <Text style={[styles.td, styles.tdStrong]}>{roundScore(b)}{b != null ? m.unit : ''}</Text>
                      <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                        <Delta value={a != null && b != null ? b - a : null} unit={m.unit} />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Summary */}
            {sessionCount > 1 && piece.summary.bullets.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Summary</Text>
                {piece.summary.bullets.map((b, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <View style={[styles.bulletDot, { backgroundColor: toneColor }]} />
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* All attempts, newest first, with playback */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>All attempts</Text>
              {[...attempts].map((a, i) => ({ a, n: i + 1 })).reverse().map(({ a, n }, idx, arr) => {
                const active  = playingId === a.session_id;
                const playing = active && status.playing;
                const progress = active && status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;

                return (
                  <View key={a.session_id} style={[styles.attemptRow, idx < arr.length - 1 && styles.attemptDivider]}>
                    <Pressable
                      onPress={() => a.has_audio && togglePlay(a)}
                      disabled={!a.has_audio}
                      hitSlop={6}
                      accessibilityLabel={playing ? 'Pause take' : 'Play take'}
                      style={[styles.playBtn, !a.has_audio && { opacity: 0.35 }]}
                    >
                      <Text style={styles.playIcon}>{playing ? '❚❚' : '▶'}</Text>
                    </Pressable>

                    {/* Everything except the play button opens this attempt's full analysis */}
                    <Pressable
                      style={styles.attemptOpen}
                      accessibilityLabel={`Open analysis of attempt ${n}`}
                      onPress={() => { player.pause(); router.push({
                        pathname: `/result/${a.session_id}` as any,
                        params: { title: piece.title, instrument: piece.instrument ?? '' },
                      }); }}
                    >
                      <View style={{ flex: 1 }}>
                      <Text style={styles.attemptDate}>#{n} · {fmtDate(a.created_at)}</Text>
                      <Text style={styles.attemptSub}>
                        Pitch {roundScore(a.pitch_score)} · Timing {roundScore(a.timing_score)}
                        {!a.has_audio ? ' · no recording saved' : ''}
                      </Text>
                      {active && (
                        <View style={styles.progressWrap}>
                          <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                          </View>
                          <Text style={styles.progressTime}>
                            {mmss(status.currentTime)} / {mmss(status.duration)}
                          </Text>
                        </View>
                      )}
                      </View>
                      <Text style={styles.attemptScore}>{roundScore(a.overall_score)}</Text>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            {/* Delete this piece (asks first) */}
            <View style={styles.dangerZone}>
              {!confirmDelete ? (
                <Pressable onPress={() => setConfirmDelete(true)} style={styles.deleteLink}>
                  <Text style={styles.deleteLinkText}>Delete this piece</Text>
                </Pressable>
              ) : (
                <View style={styles.confirmBox}>
                  <Text style={styles.confirmTitle}>
                    Delete "{piece.title}" and its {sessionCount} {sessionCount === 1 ? 'attempt' : 'attempts'}?
                  </Text>
                  <Text style={styles.confirmBody}>
                    Scores, history and recordings for this piece are removed permanently. This can't be undone.
                  </Text>
                  {deleteError !== '' && <Text style={styles.confirmError}>{deleteError}</Text>}
                  <View style={styles.confirmRow}>
                    <Pressable
                      onPress={() => { setConfirmDelete(false); setDeleteError(''); }}
                      disabled={deleting}
                      style={styles.cancelBtn}
                    >
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </Pressable>
                    <Pressable onPress={removePiece} disabled={deleting} style={styles.confirmDeleteBtn}>
                      {deleting
                        ? <ActivityIndicator color="#FFFFFF" />
                        : <Text style={styles.confirmDeleteText}>Delete permanently</Text>}
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {piece && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable onPress={addTake} style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}>
            <Text style={styles.addBtnText}>＋ Add new take</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', paddingHorizontal: 20 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  backBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
    alignItems: 'center', justifyContent: 'center',
  },
  backBtnText: { fontSize: 20, color: '#0F172A', marginTop: -2 },
  screenLabel: { fontSize: 13, fontFamily: Fonts.body, color: '#64748B', fontWeight: '500' },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0',
    marginBottom: 14, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
  },
  cardTitle: { fontSize: 16, fontFamily: Fonts.heading, fontWeight: '800', color: '#0F172A', marginBottom: 10 },
  bodyText: { fontSize: 13, fontFamily: Fonts.body, color: '#64748B', lineHeight: 19 },

  pieceName: { fontSize: 22, fontFamily: Fonts.heading, fontWeight: '800', color: '#0F172A' },
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
  playBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  playIcon: { fontSize: 13, color: '#4F46E5', fontWeight: '800' },
  attemptDate: { fontSize: 14, fontFamily: Fonts.heading, fontWeight: '700', color: '#0F172A' },
  attemptSub: { fontSize: 12, fontFamily: Fonts.body, color: '#94A3B8', marginTop: 1 },
  attemptOpen: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  chevron: { fontSize: 22, color: '#CBD5E1' },
  attemptScore: { fontSize: 18, fontFamily: Fonts.heading, fontWeight: '800', color: '#0F172A' },
  progressWrap: { marginTop: 8, gap: 4 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: '#4F46E5' },
  progressTime: { fontSize: 10, fontFamily: Fonts.mono, color: '#94A3B8' },

  dangerZone: { marginTop: 4, marginBottom: 8 },
  deleteLink: { alignItems: 'center', paddingVertical: 12 },
  deleteLinkText: { fontSize: 13, fontFamily: Fonts.body, fontWeight: '600', color: '#B42318' },
  confirmBox: { backgroundColor: '#FEF3F2', borderRadius: 14, borderWidth: 1, borderColor: '#FECDCA', padding: 16 },
  confirmTitle: { fontSize: 15, fontFamily: Fonts.heading, fontWeight: '800', color: '#7A271A' },
  confirmBody: { fontSize: 13, fontFamily: Fonts.body, color: '#912018', lineHeight: 19, marginTop: 6 },
  confirmError: { fontSize: 12, fontFamily: Fonts.body, color: '#B42318', marginTop: 8 },
  confirmRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: {
    flex: 1, height: 44, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 14, fontFamily: Fonts.body, fontWeight: '700', color: '#0F172A' },
  confirmDeleteBtn: { flex: 1.4, height: 44, borderRadius: 12, backgroundColor: '#B42318', alignItems: 'center', justifyContent: 'center' },
  confirmDeleteText: { fontSize: 14, fontFamily: Fonts.body, fontWeight: '700', color: '#FFFFFF' },

  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: '#F8FAFC', borderTopWidth: 1, borderTopColor: '#E2E8F0',
  },
  addBtn: { backgroundColor: '#4F46E5', borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#FFFFFF', fontSize: 15, fontFamily: Fonts.body, fontWeight: '700' },

  errorBox: { backgroundColor: '#FFF7ED', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#FED7AA' },
  errorText: { fontSize: 13, fontFamily: Fonts.body, color: '#9A3412' },
  retry: { fontSize: 13, fontFamily: Fonts.heading, fontWeight: '700', color: '#4F46E5', marginTop: 6 },
});
