/**
 * Core API client for Practice Tracker.
 * JWT auth stored in memory; persisted via authStore.
 */

import axios, { AxiosError } from 'axios';

// ─── Config ───────────────────────────────────────────────────────────────────
// Change to your Cloud Run URL in production.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
});

// Attach JWT bearer token on every request
apiClient.interceptors.request.use((config) => {
  const token = _token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Token store (in-memory, persisted to AsyncStorage by authStore) ─────────
let _token: string | null = null;

export function setToken(t: string | null) {
  _token = t;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
  role?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type:   string;
  user_id:      string;
}

export interface MeResponse {
  id:        string;
  email:     string;
  full_name: string;
  role:      string;
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/register', payload);
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  // Core API uses OAuth2 form-encoded login
  const params = new URLSearchParams();
  params.set('username', email);
  params.set('password', password);
  const { data } = await apiClient.post<AuthResponse>('/auth/login', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return data;
}

export async function getMe(): Promise<MeResponse> {
  const { data } = await apiClient.get<MeResponse>('/auth/me');
  return data;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────
export type TargetType = 'scale' | 'melody' | 'reference';
export type InstrumentMode = 'mono' | 'poly';

export interface CreateSessionPayload {
  title:        string;
  target_scale: string;
  filename:     string;
  mode:         InstrumentMode;
  instrument?:  string;
  target_type?: TargetType;
  bpm?:         number;
  tuning_hz?:   number;
}

export interface CreateSessionResponse {
  session_id:          string;
  mode:                string;
  gcs_path:            string;
  upload_url:          string;
  expires_in_minutes:  number;
}

export async function createSession(payload: CreateSessionPayload): Promise<CreateSessionResponse> {
  const { data } = await apiClient.post<CreateSessionResponse>('/sessions', payload);
  return data;
}

export interface NoteEvent {
  onset_s:     number;
  offset_s:    number;
  midi:        number;
  cents_error: number | null;
  confidence:  number;
  label?:      string;
  expected_midi?: number;
  onset_error_ms?: number;
  early_late?: 'early' | 'late' | 'onBeat';
}

export interface AnalysisResult {
  overall_score:    number;
  pitch_score:      number;
  timing_score:     number;
  in_tune_pct:      number;
  avg_cents_error:  number;
  avg_onset_ms:     number;
  steadiness:       number;
  notes_on_beat_pct:number;
  note_events:      NoteEvent[];
  pitch_contour_url?: string;
  practice_tip?:    string;
  is_polyphonic:    boolean;
}

export interface SessionDetail {
  session_id:     string;
  title:          string;
  target_scale:   string;
  status:         'pending' | 'processing' | 'completed' | 'failed';
  audio_gcs_path: string | null;
  created_at:     string;
  result:         AnalysisResult | null;
  instrument?:    string;
  target_type?:   TargetType;
  bpm?:           number;
  tuning_hz?:     number;
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  const { data } = await apiClient.get<SessionDetail>(`/sessions/${sessionId}`);
  return data;
}

export interface SessionSummary {
  session_id:   string;
  title:        string;
  target_scale: string;
  status:       string;
  created_at:   string;
  overall_score?: number;
  pitch_score?:   number;
  timing_score?:  number;
}

export async function listSessions(): Promise<SessionSummary[]> {
  const { data } = await apiClient.get<SessionSummary[]>('/sessions');
  return data;
}

export interface ProgressData {
  sessions:      SessionSummary[];
  streak_days:   number;
  practice_days: string[];   // ISO date strings e.g. "2026-10-01"
  pieces: {
    title:        string;
    latest_score: number;
    score_change: number;
    session_count: number;
  }[];
}

export async function getProgress(): Promise<ProgressData> {
  const { data } = await apiClient.get<ProgressData>('/progress');
  return data;
}

// ─── Upload helper ─────────────────────────────────────────────────────────────
/** Uploads a file blob directly to GCS via the signed PUT URL. */
export async function uploadToGCS(signedUrl: string, fileUri: string, mimeType: string) {
  const response = await fetch(fileUri);
  const blob = await response.blob();
  await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: blob,
  });
}

// ─── Error helper ─────────────────────────────────────────────────────────────
export function getErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((d: any) => d.msg).join(', ');
  }
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred.';
}
