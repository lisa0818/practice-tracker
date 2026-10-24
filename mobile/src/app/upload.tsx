/**
 * Upload screen — simplified to analyze any audio file directly.
 * Pitch, notes, onsets, and timing are auto-detected by the ML models.
 */

import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';

import { Fonts, FontSize } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { analyzeDirectAudio, createSession, uploadToGCS } from '@/services/api';

const INSTRUMENTS = ['Voice', 'Violin', 'Guitar', 'Piano'] as const;
type Instrument = typeof INSTRUMENTS[number];

function cleanAudioTitle(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]/g, ' ')
    .trim();
}

export default function UploadScreen() {
  const insets = useSafeAreaInsets();

  const [instrument, setInstrument] = useState<Instrument>('Piano');
  const [file,       setFile]       = useState<{ name: string; size: string; duration: string; uri?: string; fileObj?: any } | null>({
    name: 'Eight_White_Keys.mp3',
    size: '1.3 MB',
    duration: '0:48',
  });
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

    setLoading(true);
    setError('');

    const cleanTitle = cleanAudioTitle(file.name);
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

        {/* Instrument Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Instrument</Text>
          <View style={styles.instrumentTabs}>
            {INSTRUMENTS.map((inst) => {
              const active = instrument === inst;
              return (
                <Pressable
                  key={inst}
                  onPress={() => setInstrument(inst)}
                  style={[
                    styles.instTab,
                    active && styles.instTabActive,
                  ]}
                >
                  <Text style={[styles.instTabText, active && styles.instTabTextActive]}>
                    {inst}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Your Recording Card */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Your recording</Text>
          <View style={styles.fileCard}>
            <View style={styles.fileCardTop}>
              <View style={styles.fileIconWrap}>
                <Text style={{ fontSize: 16 }}>🎵</Text>
              </View>
              <View style={styles.fileMeta}>
                <Text style={styles.fileName} numberOfLines={1}>{file?.name ?? 'Eight_White_Keys.mp3'}</Text>
                <Text style={styles.fileSub}>{file?.duration ?? '0:48'} · {file?.size ?? '1.3 MB'}</Text>
              </View>
              <Pressable onPress={handlePickFile} hitSlop={8}>
                <Text style={styles.replaceText}>Replace</Text>
              </Pressable>
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
                    opacity={i < 20 ? 0.9 : 0.4}
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
  fileIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
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
  replaceText: {
    fontSize: 13,
    fontFamily: Fonts.body,
    fontWeight: '600',
    color: '#4F46E5',
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
