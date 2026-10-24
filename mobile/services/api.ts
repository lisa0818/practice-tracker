import axios from 'axios';

// Use http://10.0.2.2:8000 for Android Emulator, or localhost:8000 for iOS simulator
const API_BASE_URL = 'http://10.0.2.2:8000'; 

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'multipart/form-data',
  },
});

export const analyzePracticeAudio = async (audioUri: string, mode: 'mono' | 'poly') => {
  const formData = new FormData();
  formData.append('file', {
    uri: audioUri,
    type: 'audio/wav',
    name: 'practice.wav',
  } as any);
  formData.append('mode', mode);

  const endpoint = mode === 'mono' ? '/analyze/mono' : '/analyze/poly';
  const response = await apiClient.post(endpoint, formData);
  return response.data;
};