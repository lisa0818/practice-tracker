/**
 * Upload screen (modal) — instrument picker, file picker, target type,
 * tuning + BPM, and "Analyze recording" CTA.
 */

import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Card }   from '@/components/Card';
import { Input }  from '@/components/Input';
import { FontSize, Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { createSession, uploadToGCS, type InstrumentMode, type TargetType } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Instrument {
  id:    string;
  label: string;
  emoji: string;
  mode:  InstrumentMode;
}

const INSTRUMENTS: Instrument[] = [
  { id: 'voice',  label: 'Voice',  emoji: '🎤', mode: 'mono' },
  { id: 'violin', label: 'Violin', emoji: '🎻', mode: 'mono' },
  { id: 'guitar', label: 'Guitar', emoji: '🎸', mode: 'poly' },
  { id: 'piano',  label: 'Piano',  emoji: '🎹', mode: 'poly' },
];

const TARGET_TYPES: { id: TargetType; label: string; desc: string }[] = [
  { id: 'scale',     label: 'Scale',     desc: 'Chromatic or major/minor scale' },
  { id: 'melody',    label: 'Melody',    desc: 'A known melody or exercise' },
  { id: 'reference', label: 'Reference', desc: 'Compare to a reference recording' },
];

// ── Chip selector ──────────────────────────────────────────────────────────────

function ChipGroup<T extends string>({
  options, value, onSelect,
}: {
  options: { id: T; label: string; emoji?: string }[];
  value:   T;
  onSelect:(id: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.chipRow}>
      {options.map(o => {
        const active = value === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => onSelect(o.id)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? theme.accentLight : theme.backgroundElement,
                borderColor:     active ? theme.accent : theme.border,
              },
            ]}
          >
            {o.emoji && <Text style={styles.chipEmoji}>{o.emoji}</Text>}
            <Text style={[
              styles.chipLabel,
              { color: active ? theme.accent : theme.textSecondary, fontFamily: Fonts.body }
            ]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Stepper ────────────────────────────────────────────────────────────────────

function Stepper({
  label, value, onChange, min, max, step = 1, unit,
}: {
  label:    string;
  value:    number;
  onChange: (v: number) => void;
  min:      number;
  max:      number;
  step?:    number;
  unit?:    string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.stepperRow}>
      <Text style={[styles.stepperLabel, { color: theme.textSecondary, fontFamily: Fonts.body }]}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          onPress={() => onChange(Math.max(min, value - step))}
          style={[styles.stepperBtn, { backgroundColor: theme.backgroundElement }]}
        >
          <Text style={[styles.stepperBtnText, { color: theme.text }]}>−</Text>
        </Pressable>
        <Text style={[styles.stepperValue, { color: theme.text, fontFamily: Fonts.mono }]}>
          {value}{unit}
        </Text>
        <Pressable
          onPress={() => onChange(Math.min(max, value + step))}
          style={[styles.stepperBtn, { backgroundColor: theme.backgroundElement }]}
        >
          <Text style={[styles.stepperBtnText, { color: theme.text }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function UploadScreen() {
  const theme  = useTheme();
  const insets = useSafeAreaInsets();
  const { token } = useAuthStore();

  const [instrument, setInstrument] = useState<string>('violin');
  const [targetType, setTargetType] = useState<TargetType>('scale');
  const [scaleName,  setScaleName]  = useState('C Major');
  const [tuning,     setTuning]     = useState(440);
  const [bpm,        setBpm]        = useState(60);
  const [file,       setFile]       = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const instr   = INSTRUMENTS.find(i => i.id === instrument)!;
  const mode    = instr.mode;

  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? 'audio/mpeg' });
        setError('');
      }
    } catch {
      setError('Could not open the file picker.');
    }
  }

  async function handleAnalyze() {
    if (!token) { router.replace('/(auth)/login'); return; }
    if (!file)  { setError('Please select an audio file first.'); return; }

    setLoading(true);
    setError('');
    try {
      // 1. Create session → get signed URL
      const session = await createSession({
        title:        scaleName || file.name,
        target_scale: scaleName,
        filename:     file.name,
        mode,
        instrument,
        target_type:  targetType,
        bpm,
        tuning_hz:    tuning,
      });

      // 2. Upload to GCS
      await uploadToGCS(session.upload_url, file.uri, file.mimeType);

      // 3. Navigate to analyzing screen
      router.replace(`/analyzing/${session.session_id}` as any);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Upload failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: theme.border, backgroundColor: theme.backgroundCard }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.cancel, { color: theme.accent }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text, fontFamily: Fonts.heading }]}>New Recording</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Recording quality tip */}
        <Animated.View entering={FadeInDown.delay(50).springify()}>
          <View style={[styles.tip, { backgroundColor: theme.accentLight, borderColor: theme.accent }]}>
            <Text style={styles.tipEmoji}>💡</Text>
            <Text style={[styles.tipText, { color: theme.accent, fontFamily: Fonts.body }]}>
              Record in a quiet room with no reverb or noise filters for best results.
            </Text>
          </View>
        </Animated.View>

        {/* Instrument */}
        <Animated.View entering={FadeInDown.delay(80).springify()}>
          <Card>
            <Text style={[styles.sectionLabel, { color: theme.text, fontFamily: Fonts.heading }]}>Instrument</Text>
            <ChipGroup
              options={INSTRUMENTS.map(i => ({ id: i.id, label: i.label, emoji: i.emoji }))}
              value={instrument}
              onSelect={setInstrument}
            />
            <Text style={[styles.modeNote, { color: theme.textMuted, fontFamily: Fonts.body }]}>
              {mode === 'mono' ? '🔬 Pitch cents accuracy available' : '🎵 Chord detection; no cents accuracy'}
            </Text>
          </Card>
        </Animated.View>

        {/* File picker */}
        <Animated.View entering={FadeInDown.delay(110).springify()}>
          <Card>
            <Text style={[styles.sectionLabel, { color: theme.text, fontFamily: Fonts.heading }]}>Audio file</Text>
            <Pressable
              onPress={pickFile}
              style={[
                styles.filePicker,
                { borderColor: file ? theme.inTune : theme.border, backgroundColor: theme.backgroundElement },
              ]}
            >
              <Text style={{ fontSize: 24 }}>{file ? '✅' : '📂'}</Text>
              <View style={styles.filePickerText}>
                <Text style={[styles.filePickerTitle, { color: theme.text, fontFamily: Fonts.body }]}>
                  {file ? file.name : 'Choose audio file'}
                </Text>
                <Text style={[styles.filePickerSub, { color: theme.textMuted }]}>
                  {file ? 'Tap to change' : 'MP3, WAV, or M4A · up to 5 min'}
                </Text>
              </View>
            </Pressable>
          </Card>
        </Animated.View>

        {/* Target type */}
        <Animated.View entering={FadeInDown.delay(140).springify()}>
          <Card>
            <Text style={[styles.sectionLabel, { color: theme.text, fontFamily: Fonts.heading }]}>Compare against</Text>
            <ChipGroup
              options={TARGET_TYPES}
              value={targetType}
              onSelect={setTargetType}
            />
            {(targetType === 'scale' || targetType === 'melody') && (
              <Input
                label="Scale / piece name"
                value={scaleName}
                onChangeText={setScaleName}
                placeholder="e.g. C Major Scale"
                style={{ marginTop: 12 }}
              />
            )}
            {targetType === 'reference' && (
              <Text style={[styles.refNote, { color: theme.textMuted, fontFamily: Fonts.body }]}>
                Reference recording comparison is coming soon. For now, analysis will use auto-detection.
              </Text>
            )}
          </Card>
        </Animated.View>

        {/* Tuning & BPM */}
        <Animated.View entering={FadeInDown.delay(170).springify()}>
          <Card>
            <Text style={[styles.sectionLabel, { color: theme.text, fontFamily: Fonts.heading }]}>Settings</Text>
            <Stepper
              label="Tuning"
              value={tuning}
              onChange={setTuning}
              min={430}
              max={450}
              step={1}
              unit=" Hz"
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <Stepper
              label="Tempo"
              value={bpm}
              onChange={setBpm}
              min={30}
              max={240}
              step={5}
              unit=" BPM"
            />
          </Card>
        </Animated.View>

        {/* Error */}
        {error ? (
          <Text style={[styles.error, { color: theme.error }]}>{error}</Text>
        ) : null}

        {/* CTA */}
        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <Button
            label="Analyze recording"
            onPress={handleAnalyze}
            loading={loading}
            fullWidth
            size="lg"
            disabled={!file}
          />
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: 20,
    paddingBottom:   14,
    borderBottomWidth: 1,
  },
  cancel:      { fontSize: FontSize.base, fontWeight: '500' },
  headerTitle: { fontSize: FontSize.md,   fontWeight: '700' },
  content:     { paddingHorizontal: 16, paddingTop: 16, gap: 14 },
  tip: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    gap:             10,
    padding:         14,
    borderRadius:    12,
    borderWidth:     1,
  },
  tipEmoji: { fontSize: 18 },
  tipText:  { flex: 1, fontSize: FontSize.sm, lineHeight: FontSize.sm + 6 },
  sectionLabel: { fontSize: FontSize.base, fontWeight: '700', marginBottom: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             5,
    paddingVertical:   8,
    paddingHorizontal: 14,
    borderRadius:    20,
    borderWidth:     1.5,
  },
  chipEmoji: { fontSize: 16 },
  chipLabel: { fontSize: FontSize.sm, fontWeight: '600' },
  modeNote:  { fontSize: FontSize.xs, marginTop: 10 },
  filePicker: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             12,
    padding:         16,
    borderRadius:    12,
    borderWidth:     1.5,
    borderStyle:     'dashed',
  },
  filePickerText:  { flex: 1 },
  filePickerTitle: { fontSize: FontSize.base, fontWeight: '500' },
  filePickerSub:   { fontSize: FontSize.xs, marginTop: 2 },
  refNote: { fontSize: FontSize.sm, marginTop: 12, lineHeight: FontSize.sm + 6 },
  stepperRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  stepperLabel:    { fontSize: FontSize.base },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperBtn: {
    width:          36,
    height:         36,
    borderRadius:   18,
    alignItems:     'center',
    justifyContent: 'center',
  },
  stepperBtnText:  { fontSize: FontSize.lg, fontWeight: '300' },
  stepperValue:    { fontSize: FontSize.base, fontWeight: '600', minWidth: 68, textAlign: 'center' },
  divider:         { height: 1, marginVertical: 4 },
  error:           { fontSize: FontSize.sm, textAlign: 'center' },
});
