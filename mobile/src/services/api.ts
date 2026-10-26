/**
 * Core API client for Practice Tracker.
 * JWT auth stored in memory; persisted via authStore.
 */

import axios, { AxiosError } from 'axios';

// ─── Config ───────────────────────────────────────────────────────────────────
// Change to your Cloud Run URL in production.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://core-api-571568987946.asia-south1.run.app';

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
  title:         string;
  target_scale?: string;
  filename:      string;
  mode:          InstrumentMode;
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

export async function analyzeDirectAudio(formData: FormData): Promise<SessionDetail> {
  const { data } = await apiClient.post<SessionDetail>('/sessions/analyze-direct', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 120_000,
  });
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

/** One upload of a piece, with the scores it earned. */
export interface PieceAttempt {
  session_id:        string;
  has_audio:         boolean;
  created_at:        string | null;
  overall_score:     number | null;
  pitch_score:       number | null;
  timing_score:      number | null;
  in_tune_pct:       number | null;
  notes_on_beat_pct: number | null;
  avg_cents_error:   number | null;
  steadiness:        number | null;
  practice_tip:      string | null;
}

export interface PieceSummary {
  headline: string;
  tone:     'up' | 'down' | 'flat';
  bullets:  string[];
}

/** Every attempt at one piece (same title + instrument, or same melody), oldest first. */
export interface PieceProgress {
  piece_key:      string;
  title:          string;
  instrument:     string | null;
  session_count:  number;
  latest_score:   number | null;
  score_change:   number | null;
  first_score:    number | null;
  best_score:     number | null;
  last_practiced: string | null;
  attempts:       PieceAttempt[];
  summary:        PieceSummary;
}

export interface ProgressData {
  sessions:      SessionSummary[];
  streak_days:   number;
  practice_days: string[];   // ISO date strings e.g. "2026-10-01"
  pieces:        PieceProgress[];   // most recently practised first
}

export async function getProgress(): Promise<ProgressData> {
  const { data } = await apiClient.get<ProgressData>('/progress');
  return normalizeProgress(data);
}

/**
 * Older servers return `pieces` without the attempt history. If so, rebuild
 * the pieces from the session list so the app still shows every attempt.
 */
function normalizeProgress(raw: ProgressData): ProgressData {
  if (!raw) return { sessions: [], streak_days: 0, practice_days: [], pieces: [] };

  const validSessions = (raw.sessions ?? []).filter(
    (s: any) => s.overall_score != null || s.result?.overall_score != null
  );

  const rawPieces = Array.isArray(raw.pieces) ? raw.pieces : [];

  if (rawPieces.length > 0 && rawPieces.every((p) => p.piece_key && Array.isArray(p.attempts))) {
    const sanitizedPieces = rawPieces
      .map((p): PieceProgress | null => {
        const validAttempts = (p.attempts ?? []).filter((a) => a.overall_score != null);
        if (validAttempts.length === 0) return null;

        const first = validAttempts[0];
        const latest = validAttempts[validAttempts.length - 1];
        const prev = validAttempts.length > 1 ? validAttempts[validAttempts.length - 2] : null;
        const scored = validAttempts.map((a) => a.overall_score).filter((s): s is number => s != null);
        const bestScore = scored.length > 0 ? Math.max(...scored) : null;
        const scoreChange: number | null =
          prev && latest && latest.overall_score != null && prev.overall_score != null
            ? Math.round((latest.overall_score - prev.overall_score) * 10) / 10
            : 0;

        const totalChange =
          first && latest && latest.overall_score != null && first.overall_score != null
            ? Math.round((latest.overall_score - first.overall_score) * 10) / 10
            : 0;

        let summary: PieceSummary = p.summary;
        if (validAttempts.length <= 1) {
          summary = {
            headline: 'First attempt recorded',
            tone: 'flat',
            bullets: ['Practice this piece and upload it again to see your improvement here.'],
          };
        } else if (p.attempts.length !== validAttempts.length) {
          // Adjust headline if it was previously calculated with empty attempts
          summary = {
            ...p.summary,
            headline:
              totalChange >= 1
                ? `Up ${Math.round(totalChange)} points since your first attempt`
                : totalChange <= -1
                ? `Down ${Math.round(Math.abs(totalChange))} points since your first attempt`
                : 'Holding steady since your first attempt',
            tone: totalChange >= 1 ? 'up' : totalChange <= -1 ? 'down' : 'flat',
          };
        }

        return {
          ...p,
          session_count: validAttempts.length,
          latest_score: latest.overall_score,
          first_score: first.overall_score,
          best_score: bestScore,
          score_change: scoreChange,
          last_practiced: latest.created_at ?? p.last_practiced,
          attempts: validAttempts,
          summary,
        };
      })
      .filter((p): p is PieceProgress => p !== null);

    return {
      ...raw,
      sessions: validSessions,
      pieces: sanitizedPieces,
    };
  }

  const groups = new Map<string, any[]>();
  for (const s of validSessions as any[]) {
    const key = `${String(s.title ?? '').trim().toLowerCase()}|${String(s.instrument ?? '').toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  const built: PieceProgress[] = [...groups.entries()].map(([key, list]): PieceProgress => {
    list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const attempts: PieceAttempt[] = list.map((s) => ({
      session_id: s.session_id,
      has_audio: !!s.has_audio,
      created_at: s.created_at ?? null,
      overall_score: s.overall_score ?? null,
      pitch_score: s.pitch_score ?? null,
      timing_score: s.timing_score ?? null,
      in_tune_pct: s.result?.in_tune_pct ?? null,
      notes_on_beat_pct: s.result?.notes_on_beat_pct ?? null,
      avg_cents_error: s.result?.avg_cents_error ?? null,
      steadiness: s.result?.steadiness ?? null,
      practice_tip: s.result?.practice_tip ?? null,
    })).filter((a) => a.overall_score != null);

    const first = attempts[0]?.overall_score ?? null;
    const latest = attempts[attempts.length - 1]?.overall_score ?? null;
    const prev = attempts.length > 1 ? attempts[attempts.length - 2]?.overall_score ?? null : null;
    const total = first != null && latest != null ? latest - first : 0;
    const tone: 'up' | 'down' | 'flat' = total >= 1 ? 'up' : total <= -1 ? 'down' : 'flat';
    return {
      piece_key: key,
      title: list[list.length - 1].title,
      instrument: list[list.length - 1].instrument ?? null,
      session_count: attempts.length,
      latest_score: latest,
      score_change: latest != null && prev != null ? latest - prev : 0,
      first_score: first,
      best_score: attempts.length > 0 ? Math.max(...attempts.map((a) => a.overall_score ?? 0)) : null,
      last_practiced: attempts[attempts.length - 1]?.created_at ?? null,
      attempts,
      summary: {
        headline: attempts.length <= 1
          ? 'First attempt recorded'
          : total >= 1 ? `Up ${Math.round(total)} points since your first attempt`
          : total <= -1 ? `Down ${Math.round(Math.abs(total))} points since your first attempt`
          : 'Holding steady since your first attempt',
        tone,
        bullets: attempts.length <= 1 ? ['Practice this piece and upload it again to see your improvement here.'] : [],
      },
    };
  }).filter((p) => p.attempts.length > 0);
  built.sort((a, b) => String(b.last_practiced).localeCompare(String(a.last_practiced)));
  return { ...raw, sessions: validSessions, pieces: built };
}

/** Permanently deletes a piece with all its attempts and recordings. */
export async function deletePiece(pieceKey: string): Promise<{ deleted_attempts: number }> {
  const { data } = await apiClient.delete<{ deleted_attempts: number }>('/pieces', {
    params: { piece_key: pieceKey },
  });
  return data;
}

/** Player source for a stored take; the audio endpoint needs the login token. */
export function audioSource(sessionId: string) {
  return {
    uri:     `${BASE_URL}/sessions/${sessionId}/audio`,
    headers: _token ? { Authorization: `Bearer ${_token}` } : undefined,
  };
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
