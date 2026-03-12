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


// Jobs
export const jobsApi = {
  list: () => apiFetch<{ jobs: Job[] }>('/api/jobs'),
  get: (id: string) => apiFetch<{ job: Job }>(`/api/jobs/${id}`),
  create: (data: CreateJobData) => apiFetch<{ job: Job }>('/api/jobs', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CreateJobData>) => apiFetch<{ job: Job }>(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch(`/api/jobs/${id}`, { method: 'DELETE' }),
};

// Candidates
export const candidatesApi = {
  list: (jobId: string, params?: { status?: string }) => {
    const q = params?.status ? `?status=${params.status}` : '';
    return apiFetch<{ candidates: Candidate[] }>(`/api/jobs/${jobId}/candidates${q}`);
  },
  get: (id: string) => apiFetch<{ candidate: CandidateDetail }>(`/api/candidates/${id}`),
};

// Resume upload
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

// Analytics
export const analyticsApi = {
  get: (jobId: string) => apiFetch<AnalyticsData>(`/api/jobs/${jobId}/analytics`),
};

// Parse JD from PDF/DOCX file using AI
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


// Export CSV
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

// Types
export interface Job {
  id: string;
  job_title: string;
  company_name: string;
  job_description_text: string;
  required_skills: string[];
  status: 'active' | 'closed' | 'draft';
  candidate_count?: number;
  created_at: string;
}

export interface CreateJobData {
  job_title: string;
  company_name: string;
  job_description_text: string;
  required_skills?: string[];
}

export interface Candidate {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  resume_file_name: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
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

