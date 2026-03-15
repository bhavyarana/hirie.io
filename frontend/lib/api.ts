'use client';

import { createClient } from '@/lib/supabase/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: { ...headers, ...options?.headers } });
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

// ─── Candidates ─────────────────────────────────────────────────────────────
export const candidatesApi = {
  list: (jobId: string, params?: { status?: string }) => {
    const q = params?.status ? `?status=${params.status}` : '';
    return apiFetch<{ candidates: Candidate[] }>(`/api/jobs/${jobId}/candidates${q}`);
  },
  get: (id: string) => apiFetch<{ candidate: CandidateDetail }>(`/api/candidates/${id}`),
  updateStatus: (id: string, status: string) =>
    apiFetch<{ candidate: Candidate }>(`/api/candidates/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
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
export const analyticsApi = {
  get: (jobId: string) => apiFetch<AnalyticsData>(`/api/jobs/${jobId}/analytics`),
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
  if (!res.ok) throw new Error('Export failed');
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
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
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
