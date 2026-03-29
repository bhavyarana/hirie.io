'use client';

import { createClient } from '@/lib/supabase/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ── Error classes ──────────────────────────────────────────────────────────────

/** Thrown when the backend returns 503 / a connectivity issue — NOT an auth failure */
export class NetworkError extends Error {
  retryable = true;
  constructor(message = 'Network unavailable. Please check your connection and try again.') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** Thrown only on genuine 401 responses (bad/expired token) */
export class AuthError extends Error {
  constructor(message = 'Session expired. Please sign in again.') {
    super(message);
    this.name = 'AuthError';
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new AuthError('Not authenticated');
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * apiFetch — fetch wrapper with:
 *   • 401 → throws AuthError (session genuinely invalid → redirect to login)
 *   • 503 / fetch TypeError → throws NetworkError (retried up to 3×, never logs out)
 *   • Other non-2xx → throws plain Error with backend message
 */
async function apiFetch<T>(path: string, options?: RequestInit, _attempt = 1): Promise<T> {
  const MAX_RETRIES = 3;

  let headers: HeadersInit;
  try {
    headers = await getAuthHeaders();
  } catch (err) {
    if (err instanceof AuthError) throw err;
    // getSession() failed due to a network issue — treat as network error
    if (_attempt < MAX_RETRIES) {
      await sleep(400 * _attempt);
      return apiFetch<T>(path, options, _attempt + 1);
    }
    throw new NetworkError();
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...headers, ...options?.headers },
    });
  } catch {
    // fetch() itself threw — pure network error (offline, DNS, timeout)
    if (_attempt < MAX_RETRIES) {
      await sleep(400 * _attempt);
      return apiFetch<T>(path, options, _attempt + 1);
    }
    throw new NetworkError();
  }

  // 401 → real auth failure (expired token, revoked session)
  if (res.status === 401) {
    throw new AuthError();
  }

  // 503 → backend couldn't reach Supabase auth server (network blip)
  if (res.status === 503) {
    const body = await res.json().catch(() => ({}));
    if (body?.retryable && _attempt < MAX_RETRIES) {
      await sleep(500 * _attempt);
      return apiFetch<T>(path, options, _attempt + 1);
    }
    throw new NetworkError(body?.error || 'Service temporarily unavailable. Please try again.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = err.hint ? `${err.error} — ${err.hint}` : (err.error || 'API error');
    throw new Error(msg);
  }

  return res.json();
}


// ─── Users ─────────────────────────────────────────────────────────────────
export const usersApi = {
  me: () => apiFetch<{ user: UserRecord }>('/api/users/me'),
  list: () => apiFetch<{ users: UserRecord[] }>('/api/users'),
  create: (data: { email: string; name?: string; role: string; password: string }) =>
    apiFetch<{ message: string; userId: string }>('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{ name: string; role: string }>) =>
    apiFetch<{ user: UserRecord }>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch(`/api/users/${id}`, { method: 'DELETE' }),
  resetPassword: (id: string, password: string) =>
    apiFetch<{ message: string }>(`/api/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }),
};

// ─── Teams ─────────────────────────────────────────────────────────────────
export const teamsApi = {
  list: () => apiFetch<{ teams: Team[] }>('/api/teams'),
  get: (id: string) => apiFetch<{ team: TeamDetail }>(`/api/teams/${id}`),
  create: (data: CreateTeamData) =>
    apiFetch<{ team: Team }>('/api/teams', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CreateTeamData>) =>
    apiFetch<{ team: Team }>(`/api/teams/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch(`/api/teams/${id}`, { method: 'DELETE' }),
  addMember: (teamId: string, data: { user_id: string; role_in_team?: string }) =>
    apiFetch<{ member: TeamMember }>(`/api/teams/${teamId}/members`, { method: 'POST', body: JSON.stringify(data) }),
  removeMember: (teamId: string, userId: string) =>
    apiFetch(`/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' }),
  getJobs: (teamId: string) => apiFetch<{ jobs: Job[] }>(`/api/teams/${teamId}/jobs`),
  getAnalytics: (teamId: string) => apiFetch<TeamAnalytics>(`/api/teams/${teamId}/analytics`),
  assignJobs: (teamId: string, jobIds: string[]) =>
    apiFetch<{ message: string }>(`/api/teams/${teamId}/assign-jobs`, { method: 'POST', body: JSON.stringify({ job_ids: jobIds }) }),
  removeJob: (teamId: string, jobId: string) =>
    apiFetch(`/api/teams/${teamId}/assign-jobs/${jobId}`, { method: 'DELETE' }),
};

// ─── Notifications ──────────────────────────────────────────────────────────
export const notificationsApi = {
  list: () => apiFetch<{ notifications: Notification[]; unread_count: number }>('/api/notifications'),
  markRead: (id: string) => apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => apiFetch('/api/notifications/read-all', { method: 'POST' }),
};

// ─── Jobs ───────────────────────────────────────────────────────────────────
export const jobsApi = {
  list: () => apiFetch<{ jobs: Job[] }>('/api/jobs'),
  get: (id: string) => apiFetch<{ job: JobDetail }>(`/api/jobs/${id}`),
  create: (data: CreateJobData) => apiFetch<{ job: Job }>('/api/jobs', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CreateJobData>) => apiFetch<{ job: Job }>(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch(`/api/jobs/${id}`, { method: 'DELETE' }),
  overview: () => apiFetch<JobsOverview>('/api/jobs/analytics/overview'),
  setTeams: (jobId: string, teamIds: string[]) =>
    apiFetch<{ teams: { id: string; name: string }[] }>(`/api/jobs/${jobId}/teams`, { method: 'POST', body: JSON.stringify({ team_ids: teamIds }) }),
  getTeams: (jobId: string) =>
    apiFetch<{ teams: { id: string; name: string }[] }>(`/api/jobs/${jobId}/teams`),
};

// ─── Job Assignments (TL assigns jobs to recruiters) ────────────────────────
export const jobAssignmentsApi = {
  list: (params?: { recruiterId?: string; jobId?: string }) => {
    const q = new URLSearchParams();
    if (params?.recruiterId) q.set('recruiter_id', params.recruiterId);
    if (params?.jobId) q.set('job_id', params.jobId);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiFetch<{ assignments: JobAssignment[] }>(`/api/job-assignments${qs}`);
  },
  assign: (jobId: string, recruiterId: string) =>
    apiFetch<{ assignment: JobAssignment }>('/api/job-assignments', { method: 'POST', body: JSON.stringify({ job_id: jobId, recruiter_id: recruiterId }) }),
  remove: (jobId: string, recruiterId: string) =>
    apiFetch('/api/job-assignments', { method: 'DELETE', body: JSON.stringify({ job_id: jobId, recruiter_id: recruiterId }) }),
  bulkAssign: (recruiterId: string, jobIds: string[]) =>
    apiFetch<{ assignments: JobAssignment[] }>('/api/job-assignments/bulk', { method: 'POST', body: JSON.stringify({ recruiter_id: recruiterId, job_ids: jobIds }) }),
};

// ─── Talent Pool ────────────────────────────────────────────────────────────
export const talentPoolApi = {
  list: (params?: {
    q?: string;
    location?: string;
    uploaded_by?: string;
    date_range?: 'last_24h' | 'last_week' | 'last_month' | 'custom';
    year?: number;
    month?: number;
    min_exp?: number;
    max_exp?: number;
    page?: number;
    limit?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.q) q.set('q', params.q);
    if (params?.location) q.set('location', params.location);
    if (params?.uploaded_by) q.set('uploaded_by', params.uploaded_by);
    if (params?.date_range) q.set('date_range', params.date_range);
    if (params?.year != null) q.set('year', String(params.year));
    if (params?.month != null) q.set('month', String(params.month));
    if (params?.min_exp != null) q.set('min_exp', String(params.min_exp));
    if (params?.max_exp != null) q.set('max_exp', String(params.max_exp));
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    return apiFetch<{ candidates: TalentPoolCandidate[]; total: number; page: number; limit: number }>(
      `/api/talent-pool${q.toString() ? `?${q.toString()}` : ''}`
    );
  },
  get: (id: string) => apiFetch<{ candidate: TalentPoolCandidate & { resume_download_url: string | null } }>(`/api/talent-pool/${id}`),
  getUploaders: () => apiFetch<{ uploaders: { id: string; name: string }[] }>('/api/talent-pool/uploaders'),
};

// ─── Candidates ───────────────────────────────────────────────────────────────
export const candidatesApi = {
  list: (jobId: string, params?: { status?: string; mine?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.mine) q.set('mine', 'true');
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiFetch<{ candidates: Candidate[] }>(`/api/jobs/${jobId}/candidates${qs}`);
  },
  get: (id: string) => apiFetch<{ candidate: CandidateDetail }>(`/api/candidates/${id}`),
  updateStatus: (id: string, status: string) =>
    apiFetch<{ candidate: Candidate }>(`/api/candidates/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateHiringStatus: (id: string, hiring_status: string, rejection_reason?: string, hiring_feedback?: string) =>
    apiFetch<{ candidate: Candidate }>(`/api/candidates/${id}/hiring-status`, {
      method: 'PATCH',
      body: JSON.stringify({ hiring_status, rejection_reason, hiring_feedback }),
    }),
  search: (params: { q?: string; minExp?: number; maxExp?: number; scoreStatus?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params.q) q.set('q', params.q);
    if (params.minExp != null) q.set('min_exp', String(params.minExp));
    if (params.maxExp != null) q.set('max_exp', String(params.maxExp));
    if (params.scoreStatus) q.set('score_status', params.scoreStatus);
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));
    return apiFetch<{ candidates: CandidateSearchResult[]; total: number; page: number; limit: number }>(
      `/api/candidates/search${q.toString() ? `?${q.toString()}` : ''}`
    );
  },
  reprocess: (id: string) =>
    apiFetch<{ message: string; candidateId: string }>(`/api/candidates/${id}/reprocess`, { method: 'POST' }),
  delete: (id: string) =>
    apiFetch<{ message: string }>(`/api/candidates/${id}`, { method: 'DELETE' }),
};

// ─── Resume upload ─────────────────────────────────────────────────────────
export async function uploadResumes(jobId: string, files: File[], onProgress?: (pct: number) => void) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const formData = new FormData();
  files.forEach(f => formData.append('resumes', f));

  const xhr = new XMLHttpRequest();
  return new Promise<UploadResult>((resolve, reject) => {
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(JSON.parse(xhr.responseText)?.error || 'Upload failed'));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.open('POST', `${API_URL}/api/jobs/${jobId}/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.send(formData);
  });
}

// ─── Analytics ──────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const analyticsApi = {
  get: (jobId: string) => apiFetch<AnalyticsData>(`/api/jobs/${jobId}/analytics`),
  dashboard: () => apiFetch<Record<string, any>>('/api/analytics/dashboard'),
};

// ─── Parse JD ───────────────────────────────────────────────────────────────
export async function parseJdFile(file: File): Promise<ParsedJD> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const formData = new FormData();
  formData.append('jd', file);

  const res = await fetch(`${API_URL}/api/parse-jd`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'JD parsing failed');
  }
  return res.json();
}

// ─── Export CSV ─────────────────────────────────────────────────────────────
export async function exportCSV(jobId: string, jobTitle: string) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const res = await fetch(`${API_URL}/api/jobs/${jobId}/export`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Export failed' }));
    throw new Error(err.error || 'Export failed');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${jobTitle}-candidates.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'manager' | 'tl' | 'recruiter';
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  manager_id: string | null;
  tl_id: string | null;
  member_count?: number;
  manager?: { id: string; name: string | null; email: string };
  tl?: { id: string; name: string | null; email: string };
  created_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role_in_team: 'tl' | 'recruiter';
  user?: UserRecord;
  created_at: string;
}

export interface TeamDetail extends Team {
  members: TeamMember[];
  job_count: number;
  jobs?: { id: string; job_title: string; company_name: string; status: string; created_at: string }[];
}

export interface CreateTeamData {
  name: string;
  manager_id?: string;
  tl_id?: string;
}

export interface TeamAnalytics {
  total_jobs: number;
  total_candidates: number;
  average_score: number;
  pass_count: number;
  review_count: number;
  fail_count: number;
  recruiter_performance: { recruiter_id: string; count: number }[];
}

export interface ScoringCriteria {
  pass_threshold: number;   // default 70
  review_threshold: number; // default 50
  weights: {
    technical_skills: number;  // default 35
    experience: number;        // default 30
    education: number;         // default 20
    soft_skills: number;       // default 15
  };
}

export interface Job {
  id: string;
  job_title: string;
  company_name: string;
  job_description_text: string;
  required_skills: string[];
  status: 'active' | 'closed' | 'draft';
  created_by?: string;
  assigned_team_id?: string | null;
  candidate_count?: number;
  teams?: { id: string; name: string }[];
  team?: { id: string; name: string } | null;
  creator?: { id: string; name: string | null; email: string } | null;
  scoring_criteria?: ScoringCriteria | null;
  created_at: string;
}

export interface JobAssignment {
  job_id: string;
  recruiter_id: string;
  assigned_by?: string;
  assigned_at: string;
  job?: { id: string; job_title: string; company_name: string; status: string };
  recruiter?: { id: string; name: string | null; email: string };
}

export interface JobDetail extends Job {
  team: {
    id: string; name: string; manager_id: string | null; tl_id: string | null;
    manager?: { id: string; name: string | null; email: string } | null;
    tl?: { id: string; name: string | null; email: string } | null;
  } | null;
  recruiter_performance: { recruiter_id: string; name: string; count: number }[];
}

export interface CreateJobData {
  job_title: string;
  company_name: string;
  job_description_text: string;
  required_skills?: string[];
  assigned_team_id?: string | null;
  status?: 'active' | 'closed' | 'draft';
  scoring_criteria?: ScoringCriteria | null;
}

export interface JobsOverview {
  total_jobs: number;
  active_jobs: number;
  total_candidates: number;
  total_users: number;
  total_teams: number;
}

export interface Candidate {
  id: string;
  job_id: string;
  recruiter_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  resume_file_name: string;
  resume_hash?: string | null;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed' | 'rejected';
  status: 'uploaded' | 'scored' | 'shortlisted' | 'interview' | 'rejected';
  error_message: string | null;
  score: number | null;
  score_status: 'pass' | 'review' | 'fail' | null;
  matched_skills: string[];
  missing_skills: string[];
  strengths: string[];
  weaknesses: string[];
  experience_match: number | null;
  education_match: number | null;
  summary: string | null;
  recruiter_name?: string | null;
  hiring_status: string | null;
  rejection_reason: string | null;
  hiring_feedback: string | null;
  current_location: string | null;
  created_at: string;
}

export interface CandidateDetail extends Candidate {
  job: { id: string; job_title: string; company_name: string };
  score_data: {
    score: number;
    status: string;
    strengths: string[];
    weaknesses: string[];
    matched_skills: string[];
    missing_skills: string[];
    experience_match: number;
    education_match: number;
    summary: string;
  } | null;
  resume_download_url: string | null;
}

export interface CandidateSearchResult {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  resume_file_path: string;
  resume_file_name: string;
  extracted_skills: string[];
  extracted_titles: string[];
  experience_years: number | null;
  current_location: string | null;
  processing_status: string;
  created_at: string;
  job: { id: string; job_title: string; company_name: string } | null;
  score: number | null;
  score_status: 'pass' | 'review' | 'fail' | null;
  matched_skills: string[];
  summary: string | null;
}

export interface TalentPoolCandidate {
  id: string;
  candidate_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  resume_file_path: string;
  resume_file_name: string;
  extracted_skills: string[];
  extracted_titles: string[];
  experience_years: number | null;
  current_location: string | null;
  first_seen_job_title: string | null;
  first_seen_job_id?: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
  // Fields present in the single-record endpoint (GET /api/talent-pool/:id)
  resume_hash?: string | null;
  strengths?: string[];
  weaknesses?: string[];
  summary?: string | null;
  score?: number | null;
  score_status?: string | null;
  resume_download_url?: string | null;
}

export interface AnalyticsData {
  job: { id: string; job_title: string; company_name: string };
  total_candidates: number;
  pass_count: number;
  review_count: number;
  fail_count: number;
  average_score: number;
  score_distribution: { range: string; count: number }[];
  top_matched_skills: { skill: string; count: number }[];
  top_missing_skills: { skill: string; count: number }[];
  top_strengths: { skill: string; count: number }[];
}

export interface UploadResult {
  message: string;
  queued: { candidateId: string; fileName: string; status: string }[];
  errors: { fileName: string; error: string }[];
}

export interface ParsedJD {
  job_title: string;
  company_name: string;
  job_description_text: string;
  required_skills: string[];
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}
