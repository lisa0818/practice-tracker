import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Audio } from 'expo-av';
import { analyzePracticeAudio } from '../../services/api';

export default function App() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [mode, setMode] = useState<'mono' | 'poly'>('mono');
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  // Start Audio Recording
  async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission denied', 'Microphone access is required to record practice sessions.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  }

  // Stop Audio Recording
  async function stopRecording() {
    if (!recording) return;
    setRecording(null);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecordedUri(uri);
    Alert.alert('Recording Saved', 'Ready to submit for analysis!');
  }

  // Submit to Orchestrator Backend
  async function handleAnalyze() {
    if (!recordedUri) {
      Alert.alert('No Recording', 'Please record your practice session first.');
      return;
    }

    setLoading(true);
    try {
      const result = await analyzePracticeAudio(recordedUri, mode);
      setAnalysisResult(result);
    } catch (err) {
      console.error(err);
      Alert.alert('Analysis Failed', 'Could not connect to the orchestrator backend.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Music Practice Tracker</Text>

      {/* Mode Selector */}
      <View style={styles.modeContainer}>
        <TouchableOpacity 
          style={[styles.modeButton, mode === 'mono' && styles.activeMode]} 
          onPress={() => setMode('mono')}
        >
          <Text style={[styles.modeText, mode === 'mono' && styles.activeModeText]}>Monophonic</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.modeButton, mode === 'poly' && styles.activeMode]} 
          onPress={() => setMode('poly')}
        >
          <Text style={[styles.modeText, mode === 'poly' && styles.activeModeText]}>Polyphonic</Text>
        </TouchableOpacity>
      </View>

      {/* Recording Controls */}
      <View style={styles.controlContainer}>
        {!recording ? (
          <TouchableOpacity style={styles.recordButton} onPress={startRecording}>
            <Text style={styles.buttonText}>Start Recording</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.recordButton, styles.stopButton]} onPress={stopRecording}>
            <Text style={styles.buttonText}>Stop Recording</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Submit Button */}
      {recordedUri && !loading && (
        <TouchableOpacity style={styles.submitButton} onPress={handleAnalyze}>
          <Text style={styles.buttonText}>Analyze Practice ({mode.toUpperCase()})</Text>
        </TouchableOpacity>
      )}

      {loading && <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 20 }} />}

      {/* Results View */}
      {analysisResult && (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>Analysis Results:</Text>
          <Text>{JSON.stringify(analysisResult, null, 2)}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  modeContainer: { flexDirection: 'row', marginBottom: 20 },
  modeButton: { paddingVertical: 10, paddingHorizontal: 20, borderWidth: 1, borderColor: '#ccc', marginHorizontal: 5, borderRadius: 5 },
  activeMode: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  modeText: { color: '#333', fontWeight: 'bold' },
  activeModeText: { color: '#fff' },
  controlContainer: { marginVertical: 20 },
  recordButton: { backgroundColor: '#34C759', padding: 15, borderRadius: 10, minWidth: 160, alignItems: 'center' },
  stopButton: { backgroundColor: '#FF3B30' },
  submitButton: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, marginTop: 10, minWidth: 160, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', textAlign: 'center' },
  resultBox: { marginTop: 20, padding: 15, backgroundColor: '#f2f2f2', borderRadius: 5, width: '100%' },
  resultTitle: { fontWeight: 'bold', marginBottom: 5 }
});