/**
 * Upload screen — simplified to analyze any audio file directly.
 * Pitch, notes, onsets, and timing are auto-detected by the ML models.
 */

import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { Fonts, FontSize } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  analyzeDirectAudio,
  createSession,
  getProgress,
  uploadToGCS,
  type PieceProgress,
} from '@/services/api';

const INSTRUMENTS = ['Violin', 'Guitar', 'Piano'] as const;
type Instrument = typeof INSTRUMENTS[number];

function cleanAudioTitle(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]/g, ' ')
    .trim();
}

/** Same idea as the backend's title normalisation, to catch duplicate piece names early. */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.(mp3|wav|m4a|aac|flac|ogg|webm)$/, '')
    .replace(/[(\[]\s*\d+\s*[)\]]/g, ' ')
    .replace(/\b(copy|(take|attempt|try|v)\s*\d+)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

type PieceRef = Pick<PieceProgress, 'piece_key' | 'title' | 'instrument'>;

export default function UploadScreen() {
  const insets = useSafeAreaInsets();
  // Opened from a piece's "Add new take": the piece is fixed
  const params = useLocalSearchParams<{ pieceKey?: string; pieceTitle?: string; instrument?: string }>();
  const lockedPiece: PieceRef | null = params.pieceKey
    ? { piece_key: params.pieceKey, title: params.pieceTitle ?? 'this piece', instrument: params.instrument || null }
    : null;

  const [pieces,      setPieces]      = useState<PieceProgress[] | null>(null);
  const [choiceKey,   setChoiceKey]   = useState<string | null>(null);   // an existing piece
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName,     setNewName]     = useState('');
  const [newInstrument, setNewInstrument] = useState<Instrument>('Piano');

  useEffect(() => {
    if (lockedPiece) return;
    getProgress()
      .then((progressData) => {
        // The backend already groups every attempt by piece; use its list as is
        const list = (progressData.pieces ?? []).filter((p) => {
          const t = (p.title || '').toLowerCase().trim();
          return !!p.piece_key && !t.includes('a440') && !t.includes('test audio');
        });
        setPieces(list);
        // Nothing preselected: adding a take to the wrong piece would skew its history
        setChoiceKey(null);
        setCreatingNew(list.length === 0);
      })
      .catch(() => {
        setPieces([]);
        setChoiceKey(null);
        setCreatingNew(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosenPiece: PieceRef | null =
    lockedPiece ?? pieces?.find((p) => p.piece_key === choiceKey) ?? null;
  const instrument = ((chosenPiece?.instrument as Instrument | null) ?? newInstrument) as Instrument;

  const duplicate = creatingNew && newName.trim() !== ''
    ? pieces?.find(
        (p) => normalizeName(p.title) === normalizeName(newName)
          && (p.instrument ?? '').toLowerCase() === newInstrument.toLowerCase(),
      ) ?? null
    : null;
  const [file,       setFile]       = useState<{ name: string; size: string; duration: string; uri?: string; fileObj?: any } | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  async function handlePickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const sizeMb = asset.size ? (asset.size / (1024 * 1024)).toFixed(1) + ' MB' : '1.3 MB';
        setFile({
          name: asset.name,
          size: sizeMb,
          duration: '0:48',
          uri: asset.uri,
          fileObj: (asset as any).file,
        });
        // Suggest the file name as the piece name, which can still be edited
        if (creatingNew && newName.trim() === '') setNewName(cleanAudioTitle(asset.name));
        setError('');
      }
    } catch {
      // Keep existing file if picker cancelled
    }
  }

  async function handleAnalyze() {
    if (!file) {
      setError('Please select an audio file first.');
      return;
    }

    if (!chosenPiece && !(creatingNew && newName.trim())) {
      setError('Choose which piece this is, or name a new one.');
      return;
    }
    if (duplicate) {
      setError(`You already have "${duplicate.title}" — pick it from the list instead of creating it again.`);
      return;
    }

    setLoading(true);
    setError('');

    const cleanTitle = chosenPiece ? chosenPiece.title : newName.trim();
    const mode = (instrument === 'Guitar' || instrument === 'Piano') ? 'poly' : 'mono';

    try {
      const formData = new FormData();
      if (file.fileObj) {
        formData.append('file', file.fileObj);
      } else if (file.uri) {
        if (Platform.OS === 'web') {
          const res = await fetch(file.uri);
          const blob = await res.blob();
          formData.append('file', blob, file.name);
        } else {
          formData.append('file', {
            uri: file.uri,
            name: file.name,
            type: 'audio/mpeg',
          } as any);
        }
      }
      formData.append('title', cleanTitle);
      formData.append('instrument', instrument);
      formData.append('mode', mode);
      // Attach the take to its piece explicitly, so the backend never has to guess from the title
      if (chosenPiece) formData.append('piece_key', chosenPiece.piece_key);
      else formData.append('new_piece', 'true');

      const session = await analyzeDirectAudio(formData);

      router.replace({
        pathname: `/analyzing/${session.session_id}` as any,
        params: {
          title: cleanTitle,
          instrument,
          filename: file.name,
        },
      });
    } catch (directErr) {
      console.warn('Direct upload error, falling back to session creation:', directErr);
      try {
        const session = await createSession({
          title: cleanTitle,
          target_scale: 'Auto-detected',
          filename: file.name,
          instrument,
          mode,
        });

        if (file.uri && session.upload_url) {
          try {
            await uploadToGCS(session.upload_url, file.uri, 'audio/mpeg');
          } catch {
            // ignore
          }
        }

        router.replace({
          pathname: `/analyzing/${session.session_id}` as any,
          params: {
            title: cleanTitle,
            instrument,
            filename: file.name,
          },
        });
      } catch {
        const demoId = encodeURIComponent(cleanTitle.toLowerCase().replace(/\s+/g, '-'));
        router.replace({
          pathname: `/analyzing/${demoId}` as any,
          params: {
            title: cleanTitle,
            instrument,
            filename: file.name,
          },
        });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* Top Bar: Close icon + Title */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <Text style={styles.screenLabel}>New analysis</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
      >
        {/* Title */}
        <Text style={styles.title}>Upload a recording</Text>
        <Text style={styles.subtitle}>
          The models will detect your pitch, note starts, and timing accuracy directly from your audio.
        </Text>

        {/* Which piece is this a take of? */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Piece</Text>

          {lockedPiece ? (
            <View style={styles.lockedPiece}>
              <Text style={styles.pieceOptionTitle}>{lockedPiece.title}</Text>
              <Text style={styles.pieceOptionSub}>
                {lockedPiece.instrument ?? ''} · adding a new take to this piece
              </Text>
            </View>
          ) : pieces === null ? (
            <ActivityIndicator color="#4F46E5" />
          ) : (
            <>
              {/* Existing piece, or start a new one */}
              {pieces.length > 0 && (
                <View style={styles.modeToggle}>
                  <Pressable
                    onPress={() => { setCreatingNew(false); setError(''); }}
                    style={[styles.modeBtn, !creatingNew && styles.modeBtnActive]}
                  >
                    <Text style={[styles.modeText, !creatingNew && styles.modeTextActive]}>Existing piece</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { setCreatingNew(true); setChoiceKey(null); setError(''); }}
                    style={[styles.modeBtn, creatingNew && styles.modeBtnActive]}
                  >
                    <Text style={[styles.modeText, creatingNew && styles.modeTextActive]}>New piece</Text>
                  </Pressable>
                </View>
              )}

              {/* Existing: only the list of pieces you already have */}
              {!creatingNew && pieces.length > 0 && (
                <>
                  <Text style={styles.pieceHelp}>Pick the piece this recording belongs to:</Text>
                  <ScrollView style={styles.pieceList} nestedScrollEnabled showsVerticalScrollIndicator>
                    {pieces.map((p) => {
                      const active = choiceKey === p.piece_key;
                      return (
                        <Pressable
                          key={p.piece_key}
                          onPress={() => { setChoiceKey(p.piece_key); setError(''); }}
                          style={[styles.pieceOption, active && styles.pieceOptionActive]}
                        >
                          <View style={[styles.radio, active && styles.radioActive]}>
                            {active && <View style={styles.radioDot} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.pieceOptionTitle} numberOfLines={1}>{p.title}</Text>
                            <Text style={styles.pieceOptionSub}>
                              {p.instrument ?? ''} · {p.session_count} {p.session_count === 1 ? 'attempt' : 'attempts'}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              {/* New: just the name (plus the instrument, which the analysis needs) */}
              {creatingNew && (
                <>
                  <Text style={styles.pieceHelp}>Name of the new piece:</Text>
                  <TextInput
                    value={newName}
                    onChangeText={(t) => { setNewName(t); setError(''); }}
                    placeholder="e.g. Happy Birthday"
                    placeholderTextColor="#94A3B8"
                    style={styles.nameInput}
                    autoCapitalize="words"
                  />
                  {duplicate && (
                    <Pressable
                      onPress={() => { setCreatingNew(false); setChoiceKey(duplicate.piece_key); setError(''); }}
                    >
                      <Text style={styles.dupText}>
                        You already have "{duplicate.title}" for {duplicate.instrument}. Tap here to add this recording to it instead.
                      </Text>
                    </Pressable>
                  )}

                  <Text style={[styles.pieceHelp, { marginTop: 16 }]}>Instrument:</Text>
                  <View style={styles.instrumentTabs}>
                    {INSTRUMENTS.map((inst) => {
                      const active = newInstrument === inst;
                      return (
                        <Pressable
                          key={inst}
                          onPress={() => setNewInstrument(inst)}
                          style={[styles.instTab, active && styles.instTabActive]}
                        >
                          <Text style={[styles.instTabText, active && styles.instTabTextActive]}>{inst}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}
            </>
          )}
        </View>

        {/* Your Recording Card */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Your recording</Text>
          <View style={styles.fileCard}>
            <View style={styles.fileCardTop}>
              <Pressable
                onPress={handlePickFile}
                hitSlop={8}
                style={({ pressed }) => [styles.uploadHereBtn, pressed && styles.pressed]}
              >
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" style={{ marginRight: 6 }}>
                  <Path
                    d="M12 3v12m0-12l-4 4m4-4l4 4"
                    stroke="#FFFFFF"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <Path
                    d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                    stroke="#FFFFFF"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                  />
                </Svg>
                <Text style={styles.uploadHereText}>Upload here</Text>
              </Pressable>

              <View style={styles.fileMeta}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {file?.name ?? 'No audio file chosen'}
                </Text>
                {!file && (
                  <Text style={styles.fileSub}>Tap "Upload here" to choose audio</Text>
                )}
              </View>
            </View>

            {/* Audio Waveform */}
            <View style={styles.waveformContainer}>
              <Svg width="100%" height={32} viewBox="0 0 280 32">
                {[
                  8, 14, 22, 10, 16, 26, 30, 20, 14, 24, 18, 12, 28, 22, 16, 20,
                  30, 26, 18, 12, 22, 16, 28, 24, 18, 14, 22, 16, 20, 12, 18, 8,
                ].map((height, i) => (
                  <Rect
                    key={i}
                    x={i * 8.6 + 4}
                    y={(32 - height) / 2}
                    width={3.5}
                    height={height}
                    rx={1.75}
                    fill="#4F46E5"
                    opacity={file ? (i < 20 ? 0.9 : 0.4) : 0.18}
                  />
                ))}
              </Svg>
            </View>
          </View>
          <Text style={styles.hintText}>MP3, WAV or M4A · up to 5 minutes</Text>
        </View>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {/* CTA Button */}
        <Pressable
          onPress={handleAnalyze}
          disabled={loading}
          style={({ pressed }) => [styles.analyzeBtn, pressed && styles.pressed]}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.analyzeBtnText}>Analyze recording</Text>
          )}
        </Pressable>

        <Text style={styles.disclaimerText}>
          Takes about a minute. We detect your pitch, notes, and onset timing directly without requiring any pre-set tempo or tuning.
        </Text>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },
  screenLabel: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: '#64748B',
    fontWeight: '500',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  title: {
    fontSize: 26,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Fonts.body,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 14,
    fontFamily: Fonts.body,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 10,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  modeText: {
    fontSize: 13,
    fontFamily: Fonts.body,
    fontWeight: '600',
    color: '#64748B',
  },
  modeTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  pieceHelp: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: '#64748B',
    marginBottom: 8,
  },
  pieceList: {
    maxHeight: 320,
  },
  lockedPiece: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    padding: 14,
  },
  pieceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  pieceOptionActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  pieceOptionTitle: {
    fontSize: 14,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    color: '#0F172A',
  },
  pieceOptionSub: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: '#64748B',
    marginTop: 2,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: '#4F46E5',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4F46E5',
  },
  nameInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: Fonts.body,
    color: '#0F172A',
  },
  dupText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: '#EA580C',
    marginTop: 8,
    lineHeight: 17,
  },
  instrumentTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  instTab: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instTabActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  instTabText: {
    fontSize: 13,
    fontFamily: Fonts.body,
    fontWeight: '600',
    color: '#334155',
  },
  instTabTextActive: {
    color: '#FFFFFF',
  },
  fileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 6,
  },
  fileCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  uploadHereBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  uploadHereText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  fileMeta: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    color: '#0F172A',
  },
  fileSub: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: '#94A3B8',
    marginTop: 2,
  },
  waveformContainer: {
    height: 32,
    justifyContent: 'center',
  },
  hintText: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: '#94A3B8',
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginBottom: 12,
    textAlign: 'center',
  },
  analyzeBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 12,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  analyzeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: Fonts.body,
    fontWeight: '700',
  },
  disclaimerText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  pressed: {
    opacity: 0.85,
  },
});
