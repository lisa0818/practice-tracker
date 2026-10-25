/**
 * PitchContourGraph — SVG chart showing played pitch vs target notes.
 * In-tune segments drawn in teal (thin line), off-pitch in orange (thick + cents label).
 * Meaning never depends on color alone — off-pitch lines are visually thicker.
 */

import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { FontSize, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NoteEvent } from '@/services/api';

const IN_TUNE_CENTS = 25;

interface PitchContourGraphProps {
  notes:      NoteEvent[];
  totalSecs?: number;
  height?:    number;
}

function midiToHz(midi: number, tuning = 440): number {
  return tuning * Math.pow(2, (midi - 69) / 12);
}

function midiToName(midi: number): string {
  const names = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const octave = Math.floor(midi / 12) - 1;
  return `${names[midi % 12]}${octave}`;
}

export function PitchContourGraph({ notes, totalSecs, height = 220 }: PitchContourGraphProps) {
  const theme = useTheme();

  if (!notes || notes.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.backgroundElement }]}>
        <Text style={{ color: theme.textMuted, fontFamily: Fonts.body }}>No pitch data</Text>
      </View>
    );
  }

  const W      = 360; // logical width, will scroll
  const PAD_L  = 36;
  const PAD_T  = 12;
  const PAD_B  = 24;
  const drawH  = height - PAD_T - PAD_B;

  const endTime  = totalSecs ?? Math.max(...notes.map(n => n.offset_s));
  const midiVals = notes.map(n => n.midi);
  const minMidi  = Math.max(0,  Math.min(...midiVals) - 2);
  const maxMidi  = Math.min(127, Math.max(...midiVals) + 2);
  const midiRange = maxMidi - minMidi || 12;

  function xOf(t: number)    { return PAD_L + ((t / endTime) * (W - PAD_L - 8)); }
  function yOf(m: number)    { return PAD_T + drawH - ((m - minMidi) / midiRange) * drawH; }

  // Unique midi values for grid lines
  const gridMidi = Array.from(new Set(notes.map(n => n.expected_midi ?? n.midi)));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <Svg width={W} height={height}>
        {/* Grid lines for expected notes */}
        {gridMidi.map(m => (
          <React.Fragment key={m}>
            <Line
              x1={PAD_L} y1={yOf(m)}
              x2={W - 8}  y2={yOf(m)}
              stroke={theme.border}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <SvgText
              x={PAD_L - 4} y={yOf(m) + 4}
              textAnchor="end"
              fontSize={9}
              fill={theme.textMuted}
              fontFamily={Fonts.mono}
            >
              {midiToName(m)}
            </SvgText>
          </React.Fragment>
        ))}

        {/* Note segments */}
        {notes.map((note, i) => {
          const x1 = xOf(note.onset_s);
          const x2 = xOf(note.offset_s);
          const y  = yOf(note.midi);
          const hasError = note.cents_error !== null && Math.abs(note.cents_error ?? 0) > IN_TUNE_CENTS;
          const color   = hasError ? theme.offPitch : theme.inTune;
          const sw      = hasError ? 4 : 2;

          return (
            <React.Fragment key={i}>
              <Line
                x1={x1} y1={y} x2={x2} y2={y}
                stroke={color}
                strokeWidth={sw}
                strokeLinecap="round"
              />
              {/* Cents label on off-pitch segments */}
              {hasError && note.cents_error !== null && (x2 - x1) > 20 && (
                <SvgText
                  x={(x1 + x2) / 2} y={y - 6}
                  textAnchor="middle"
                  fontSize={8.5}
                  fill={theme.offPitch}
                  fontFamily={Fonts.mono}
                >
                  {note.cents_error > 0 ? `+${Math.round(note.cents_error)}¢` : `${Math.round(note.cents_error)}¢`}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}

        {/* Time axis */}
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const t = endTime * frac;
          const x = xOf(t);
          return (
            <SvgText
              key={frac} x={x} y={height - 4}
              textAnchor="middle"
              fontSize={9}
              fill={theme.textMuted}
              fontFamily={Fonts.mono}
            >
              {t.toFixed(1)}s
            </SvgText>
          );
        })}
      </Svg>
    </ScrollView>
  );
}

// Legend
export function PitchLegend() {
  const theme = useTheme();
  return (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <View style={[styles.legendLine, { backgroundColor: theme.inTune, height: 2 }]} />
        <Text style={[styles.legendText, { color: theme.textSecondary, fontFamily: Fonts.body }]}>In tune</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendLine, { backgroundColor: theme.offPitch, height: 4 }]} />
        <Text style={[styles.legendText, { color: theme.textSecondary, fontFamily: Fonts.body }]}>Off pitch (¢ shown)</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    height:         120,
    borderRadius:   12,
    alignItems:     'center',
    justifyContent: 'center',
  },
  legend: {
    flexDirection: 'row',
    gap:           16,
    marginTop:     8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  legendLine: {
    width:        24,
    borderRadius: 2,
  },
  legendText: {
    fontSize: FontSize.xs,
  },
});
