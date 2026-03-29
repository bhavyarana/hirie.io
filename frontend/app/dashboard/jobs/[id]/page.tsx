'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { candidatesApi, analyticsApi, uploadResumes, exportCSV, type Candidate, usersApi } from '@/lib/api';
import { jobsApi, jobAssignmentsApi, teamsApi, type JobAssignment } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import Link from 'next/link';
import { toast } from 'sonner';
import { use } from 'react';

interface Props { params: Promise<{ id: string }> }

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  pass: { background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' },
  review: { background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' },
  fail: { background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' },
  pending: { background: 'rgba(100,116,139,0.1)', color: '#64748b', border: '1px solid rgba(100,116,139,0.3)' },
  processing: { background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.3)' },
  completed: { background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' },
  failed: { background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' },
};

const HIRING_STATUSES: Record<string, { label: string; color: string }> = {
  client_screening: { label: 'Client Screening', color: '#6366f1' },
  interview_l1: { label: 'Interview – L1', color: '#8b5cf6' },
  interview_l2: { label: 'Interview – L2', color: '#a855f7' },
  interview_l3: { label: 'Interview – L3', color: '#d946ef' },
  job_offered: { label: 'Job Offered', color: '#22c55e' },
  rejected: { label: 'Rejected', color: '#ef4444' },
  joined: { label: 'Joined', color: '#10b981' },
  backout: { label: 'Backout', color: '#f59e0b' },
  duplicate: { label: 'Duplicate', color: '#64748b' },
};

function HiringStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>;
  const hs = HIRING_STATUSES[status];
  if (!hs) return <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{status}</span>;
  return (
    <span style={{
      padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 600,
      background: `${hs.color}18`, color: hs.color, border: `1px solid ${hs.color}40`,
      whiteSpace: 'nowrap',
    }}>
      {hs.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      padding: '0.25rem 0.625rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
      ...(STATUS_STYLES[status] || STATUS_STYLES.pending),
    }}>{status}</span>
  );
}

export default function JobDetailPage({ params }: Props) {
  const { id: jobId } = use(params);
  const { role } = useUserContext();
  const [activeTab, setActiveTab] = useState<'candidates' | 'analytics'>('candidates');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [hiringStatusFilter, setHiringStatusFilter] = useState<string>('all');
  const [uploadedByFilter, setUploadedByFilter] = useState<string>('all');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const queryClient = useQueryClient();
  const alertedRejections = useRef<Set<string>>(new Set());

  const canUpdateHiring = role === 'admin' || role === 'manager' || role === 'tl' || role === 'recruiter';

  const { data: currentUserData } = useQuery({ queryKey: ['me'], queryFn: () => usersApi.me() });

  const { data: jobData } = useQuery({ queryKey: ['job', jobId], queryFn: () => jobsApi.get(jobId) });
  const { data: candidatesData, isLoading } = useQuery({
    queryKey: ['candidates', jobId],
    queryFn: () => candidatesApi.list(jobId),
    refetchInterval: (query) => {
      const candidates = (query.state.data as { candidates: Candidate[] } | undefined)?.candidates ?? [];
      const hasActive = candidates.some(c =>
        c.processing_status === 'pending' || c.processing_status === 'processing'
      );
      return hasActive ? 3000 : false;
    },
    refetchIntervalInBackground: true,
  });

  const { data: analyticsData } = useQuery({
    queryKey: ['analytics', jobId], queryFn: () => analyticsApi.get(jobId),
    enabled: activeTab === 'analytics',
  });

  const { data: assignmentsData } = useQuery({
    queryKey: ['job-assignments', jobId],
    queryFn: () => jobAssignmentsApi.list({ jobId }),
  });

  const jobAssignments: JobAssignment[] = assignmentsData?.assignments ?? [];

  const canManageAssignments = role === 'admin' || role === 'manager';
  const canManageRecruiters = role === 'admin' || role === 'manager' || role === 'tl';

  const job = jobData?.job;
  const currentUser = currentUserData?.user;

  // Fetch all teams — needed by admin/manager for team picker (TL's own team resolved below)
  const { data: allTeamsData } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list(),
    enabled: canManageAssignments,
  });
  const allTeams = allTeamsData?.teams ?? [];

  // Fetch members of all teams currently assigned to this job (for ALL roles)
  // This drives the "Assign recruiter" dropdown — only recruiters from assigned teams are shown.
  const assignedTeamIds = (job?.teams ?? []).map(t => t.id);
  const { data: assignedTeamMembers } = useQuery({
    queryKey: ['assigned-team-members', ...assignedTeamIds],
    queryFn: async () => {
      if (assignedTeamIds.length === 0) return [];
      const results = await Promise.all(assignedTeamIds.map(id => teamsApi.get(id)));
      return results.flatMap(r => (r as { team: { members: { role_in_team: string; user?: { id: string; name: string | null; email: string } }[] } }).team?.members ?? []);
    },
    enabled: canManageRecruiters && assignedTeamIds.length > 0,
  });

  // Unique recruiters from assigned teams only
  const recruiterOptions: { id: string; name: string | null; email: string }[] = [];
  const seen = new Set<string>();
  for (const m of (assignedTeamMembers ?? [])) {
    if (m.role_in_team === 'recruiter' && m.user && !seen.has(m.user.id)) {
      seen.add(m.user.id);
      recruiterOptions.push(m.user);
    }
  }

  const assignedRecruiterIds = new Set(jobAssignments.map(a => a.recruiter_id));

  // ── Assignment mutations ──────────────────────────────────────────────────
  const setTeamsMutation = useMutation({
    mutationFn: (teamIds: string[]) => jobsApi.setTeams(jobId, teamIds),
    onSuccess: () => {
      toast.success('Teams updated');
      // Invalidate job (teams list), assignments (may have been auto-removed), and member cache
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['job-assignments', jobId] });
      queryClient.invalidateQueries({ queryKey: ['assigned-team-members'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignRecruiterMutation = useMutation({
    mutationFn: (recruiterId: string) => jobAssignmentsApi.assign(jobId, recruiterId),
    onSuccess: () => {
      toast.success('Recruiter assigned');
      queryClient.invalidateQueries({ queryKey: ['job-assignments', jobId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRecruiterMutation = useMutation({
    mutationFn: (recruiterId: string) => jobAssignmentsApi.remove(jobId, recruiterId),
    onSuccess: () => {
      toast.success('Recruiter removed');
      queryClient.invalidateQueries({ queryKey: ['job-assignments', jobId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allCandidates: Candidate[] = candidatesData?.candidates ?? [];
  const analytics = analyticsData;

  useEffect(() => {
    allCandidates.forEach(async (c) => {
      if (c.processing_status === 'rejected' && !alertedRejections.current.has(c.id)) {
        alertedRejections.current.add(c.id);
        toast.error(
          `⚠️ "${c.resume_file_name}" — Please upload a valid resume file`,
          { duration: 8000, id: `rejected-${c.id}` }
        );
        try {
          await candidatesApi.delete(c.id);
        } catch {
          // Non-fatal
        }
        queryClient.invalidateQueries({ queryKey: ['candidates', jobId] });
      }
    });
  }, [allCandidates, jobId, queryClient]);

  const candidates = allCandidates.filter(c => c.processing_status !== 'rejected');

  const isRecruiter = currentUser?.role === 'recruiter';
  const isAssignedRecruiter = isRecruiter
    ? jobAssignments.some(a => a.recruiter_id === currentUser?.id)
    : true;
  const jobIsOpen = job?.status === 'active';
  const canUpload = jobIsOpen && (!isRecruiter || isAssignedRecruiter);

  const filtered = candidates.filter(c => {
    if (statusFilter !== 'all' && c.score_status !== statusFilter && c.processing_status !== statusFilter) return false;
    if (hiringStatusFilter !== 'all' && c.hiring_status !== hiringStatusFilter) return false;
    if (uploadedByFilter !== 'all' && (c.recruiter_name || '') !== uploadedByFilter) return false;
    return true;
  });

  const uploaderNames = [...new Set(candidates.map(c => c.recruiter_name).filter(Boolean))] as string[];
  const hasFilters = statusFilter !== 'all' || hiringStatusFilter !== 'all' || uploadedByFilter !== 'all';

  const SELECT_STYLE: React.CSSProperties = {
    background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '0.5rem',
    padding: '0.4rem 0.65rem', color: 'var(--text-secondary)', fontSize: '0.8rem',
    outline: 'none', cursor: 'pointer', appearance: 'auto',
  };

  const onDrop = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const result = await uploadResumes(jobId, files, setUploadProgress);
      if (result.queued.length > 0) {
        toast.success(`✅ ${result.queued.length} of ${files.length} resume(s) queued for AI processing`);
      }
      if (result.errors.length > 0) {
        result.errors.forEach(e => toast.error(`❌ ${e.fileName}: ${e.error}`, { duration: 6000 }));
      }
      queryClient.invalidateQueries({ queryKey: ['candidates', jobId] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      toast.error(`Upload failed: ${message}`, { duration: 8000 });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [jobId, queryClient]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
    maxFiles: 100,
    disabled: isUploading || !canUpload,
  });

  const hiringMutation = useMutation({
    mutationFn: ({ id, hiring_status }: { id: string; hiring_status: string }) =>
      candidatesApi.updateHiringStatus(id, hiring_status),
    onSuccess: () => {
      toast.success('Hiring status updated');
      queryClient.invalidateQueries({ queryKey: ['candidates', jobId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleExport() {
    exportCSV(jobId, job?.job_title || 'job').catch(err => toast.error(err.message));
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Link href="/dashboard/jobs" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.8rem' }}>← Jobs</Link>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {job?.job_title || '…'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            {job ? <>{job.company_name} &bull; {candidates.length} candidates</> : `${candidates.length} candidates`}
          </p>
        </div>
        <button onClick={handleExport} style={{
          padding: '0.625rem 1.25rem', borderRadius: '0.5rem',
          background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
          cursor: 'pointer', fontSize: '0.875rem',
        }}>📥 Export CSV</button>
      </div>

      {/* Team & Recruiter assignment panel */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>

        {/* Assigned Teams */}
        <div style={{ flex: 1, minWidth: '200px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.625rem' }}>Assigned Teams</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
            {(job?.teams ?? []).map(t => (
              <span key={t.id} style={{
                padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.78rem',
                background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.25)',
                display: 'flex', alignItems: 'center', gap: '0.35rem',
              }}>
                🏢 {t.name}
                {canManageAssignments && (
                  <button
                    onClick={() => {
                      const newIds = (job?.teams ?? []).filter(x => x.id !== t.id).map(x => x.id);
                      setTeamsMutation.mutate(newIds);
                    }}
                    style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', fontSize: '0.75rem', lineHeight: 1, padding: '0 0 0 2px' }}
                    title="Remove team"
                  >×</button>
                )}
              </span>
            ))}
            {canManageAssignments && (() => {
              const assignedTeamIds = new Set((job?.teams ?? []).map(t => t.id));
              const unassigned = allTeams.filter(t => !assignedTeamIds.has(t.id));
              if (unassigned.length === 0) return null;
              return (
                <select
                  defaultValue=""
                  onChange={e => {
                    if (!e.target.value) return;
                    const newIds = [...(job?.teams ?? []).map(t => t.id), e.target.value];
                    setTeamsMutation.mutate(newIds);
                    e.target.value = '';
                  }}
                  style={{
                    padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.72rem',
                    background: 'rgba(99,102,241,0.08)', border: '1px dashed rgba(99,102,241,0.4)',
                    color: '#6366f1', cursor: 'pointer', outline: 'none',
                  }}
                >
                  <option value="">+ Add team</option>
                  {unassigned.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              );
            })()}
          </div>
        </div>

        <div style={{ width: '1px', background: 'var(--border)', flexShrink: 0 }} />

        {/* Assigned Recruiters */}
        <div style={{ flex: 1, minWidth: '220px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.625rem' }}>Assigned Recruiters</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {jobAssignments.length === 0 && (
              <span style={{ color: 'var(--text-faint)', fontSize: '0.8rem' }}>No recruiter assigned yet</span>
            )}
            {jobAssignments.map(a => (
              <div key={a.recruiter_id} style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: 'var(--bg-input)', border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: '0.5rem', padding: '0.375rem 0.75rem',
              }}>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ color: 'var(--text-primary)', fontSize: '0.825rem', fontWeight: 500 }}>{a.recruiter?.name || a.recruiter?.email}</span>
                  {a.recruiter?.name && <span style={{ color: 'var(--text-faint)', fontSize: '0.72rem', display: 'block' }}>{a.recruiter.email}</span>}
                </div>
                {canManageRecruiters && (
                  <button
                    onClick={() => removeRecruiterMutation.mutate(a.recruiter_id)}
                    title="Remove recruiter"
                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1, paddingLeft: '4px' }}
                  >×</button>
                )}
              </div>
            ))}

            {/* Add recruiter dropdown */}
            {canManageRecruiters && recruiterOptions.length > 0 && (() => {
              const unassigned = recruiterOptions.filter(u => !assignedRecruiterIds.has(u.id));
              if (unassigned.length === 0) return null;
              return (
                <select
                  defaultValue=""
                  onChange={e => {
                    if (!e.target.value) return;
                    assignRecruiterMutation.mutate(e.target.value);
                    e.target.value = '';
                  }}
                  style={{
                    padding: '0.3rem 0.6rem', borderRadius: '0.5rem', fontSize: '0.72rem',
                    background: 'rgba(34,197,94,0.08)', border: '1px dashed rgba(34,197,94,0.35)',
                    color: '#22c55e', cursor: 'pointer', outline: 'none',
                  }}
                >
                  <option value="">+ Assign recruiter</option>
                  {unassigned.map(u => (
                    <option key={u.id} value={u.id}>{u.name || u.email}</option>
                  ))}
                </select>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Scoring Criteria card */}
      {(() => {
        const sc = job?.scoring_criteria;
        const pass = sc?.pass_threshold ?? 70;
        const review = sc?.review_threshold ?? 50;
        const w = sc?.weights ?? { technical_skills: 35, experience: 30, education: 20, soft_skills: 15 };
        const segments = [
          { label: '⚙️ Technical', value: w.technical_skills, color: '#6366f1' },
          { label: '💼 Experience', value: w.experience, color: '#8b5cf6' },
          { label: '🎓 Education', value: w.education, color: '#06b6d4' },
          { label: '🤝 Soft Skills', value: w.soft_skills, color: '#f59e0b' },
        ];
        return (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🎯 Scoring Criteria{!sc && <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>(system defaults)</span>}</p>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: '0.7rem', fontWeight: 700 }}>PASS ≥ {pass}</span>
                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontSize: '0.7rem', fontWeight: 700 }}>REVIEW ≥ {review}</span>
                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '0.7rem', fontWeight: 700 }}>FAIL &lt; {review}</span>
              </div>
            </div>
            <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', height: '10px', marginBottom: '0.5rem' }}>
              {segments.map(s => <div key={s.label} style={{ width: `${s.value}%`, background: s.color, transition: 'width 0.3s' }} />)}
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' as const }}>
              {segments.map(s => (
                <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: s.color, flexShrink: 0 }} />
                  {s.label} <strong style={{ color: s.color }}>{s.value}%</strong>
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Upload Dropzone */}
      {!job ? (
        // Job data still loading — show neutral placeholder, NOT a lock
        <div style={{
          border: '2px dashed var(--border)', borderRadius: '1rem', padding: '2rem',
          textAlign: 'center', background: 'var(--bg-card)', marginBottom: '1.5rem',
        }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading…</p>
        </div>
      ) : !canUpload ? (
        <div style={{
          border: '2px dashed var(--border)',
          borderRadius: '1rem', padding: '2rem', textAlign: 'center',
          background: 'var(--bg-card)', marginBottom: '1.5rem',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
        }}>
          <div style={{ fontSize: '2rem' }}>🔒</div>
          <p style={{ color: 'var(--text-secondary)', fontWeight: 600, margin: 0 }}>Uploads locked</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.825rem', margin: 0 }}>
            {!jobIsOpen
              ? `This job is ${job?.status || 'closed'} — resume uploads are disabled.`
              : 'You are not assigned to this job. Contact your Team Lead to get access.'}
          </p>
        </div>
      ) : (
        <div {...getRootProps()} style={{
          border: `2px dashed ${isDragActive ? '#6366f1' : 'var(--border)'}`,
          borderRadius: '1rem', padding: '2rem', textAlign: 'center',
          background: isDragActive ? 'rgba(99,102,241,0.05)' : 'var(--bg-card)',
          cursor: isUploading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s', marginBottom: '1.5rem',
        }}>
          <input {...getInputProps()} />
          {isUploading ? (
            <div>
              <p style={{ color: '#6366f1', marginBottom: '0.75rem' }}>Uploading… {uploadProgress}%</p>
              <div style={{ background: 'var(--border)', borderRadius: '999px', height: '6px', maxWidth: '400px', margin: '0 auto' }}>
                <div style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', height: '100%', borderRadius: '999px', width: `${uploadProgress}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📄</div>
              <p style={{ color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '0.25rem' }}>
                {isDragActive ? 'Drop resumes here!' : 'Drag & drop up to 100 resumes'}
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>PDF, DOCX supported • Max 20MB each</p>
            </>
          )}
        </div>
      )}

      {/* Tabs + action button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-input)', padding: '0.25rem', borderRadius: '0.625rem', width: 'fit-content' }}>
          {(['candidates', 'analytics'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '0.5rem 1.25rem', borderRadius: '0.5rem', cursor: 'pointer',
              fontSize: '0.875rem', fontWeight: 500, transition: 'all 0.2s',
              background: activeTab === tab ? '#6366f1' : 'transparent',
              color: activeTab === tab ? '#fff' : 'var(--text-muted)',
              border: 'none',
            }}>
              {tab === 'candidates' ? `👥 Candidates (${candidates.length})` : '📊 Analytics'}
            </button>
          ))}
        </div>

        {/* Coming-soon feature button */}
        <button
          title="Coming soon"
          onMouseEnter={e => {
            const b = e.currentTarget;
            b.style.background = 'var(--bg-input)';
            b.style.color = 'var(--text-muted)';
            b.style.opacity = '0.6';
            b.style.boxShadow = 'none';
          }}
          onMouseLeave={e => {
            const b = e.currentTarget;
            b.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
            b.style.color = '#fff';
            b.style.opacity = '1';
            b.style.boxShadow = '0 0 18px rgba(99,102,241,0.35)';
          }}
          onClick={e => e.preventDefault()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
            padding: '0.5rem 1.125rem', borderRadius: '0.625rem',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            border: 'none', color: '#fff', fontSize: '0.825rem', fontWeight: 600,
            cursor: 'not-allowed', boxShadow: '0 0 18px rgba(99,102,241,0.35)',
            transition: 'opacity 0.2s, background 0.2s',
          }}
        >
          📞 Start Screening Call
        </button>
      </div>

      {/* Candidates Tab */}
      {activeTab === 'candidates' && (
        <div>
          {/* Filter Bar */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0.875rem',
            padding: '0.875rem 1.25rem', marginBottom: '1rem',
            display: 'flex', flexWrap: 'wrap', gap: '0.875rem', alignItems: 'flex-end',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Score</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={SELECT_STYLE}>
                <option value="all">All Scores</option>
                <option value="pass">✅ Pass</option>
                <option value="review">⚡ Review</option>
                <option value="fail">❌ Fail</option>
                <option value="pending">⏳ Pending</option>
                <option value="processing">⟳ Processing</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Hiring Status</label>
              <select value={hiringStatusFilter} onChange={e => setHiringStatusFilter(e.target.value)} style={SELECT_STYLE}>
                <option value="all">All Statuses</option>
                {Object.entries(HIRING_STATUSES).map(([val, { label }]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            {uploaderNames.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Uploaded By</label>
                <select value={uploadedByFilter} onChange={e => setUploadedByFilter(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: '180px' }}>
                  <option value="all">All Recruiters</option>
                  {uploaderNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', paddingBottom: '0.35rem' }}>
                {filtered.length} of {candidates.length}
              </span>
              {hasFilters && (
                <button
                  onClick={() => { setStatusFilter('all'); setHiringStatusFilter('all'); setUploadedByFilter('all'); }}
                  style={{
                    padding: '0.4rem 0.875rem', borderRadius: '999px', cursor: 'pointer',
                    fontSize: '0.75rem', fontWeight: 500,
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)',
                    color: '#f87171',
                  }}
                >
                  ✕ Clear
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
            {isLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading candidates…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📭</div>
                <p style={{ color: 'var(--text-secondary)' }}>No candidates {statusFilter !== 'all' ? `with status "${statusFilter}"` : 'yet'}</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>Upload resumes above to start screening</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--table-header-bg)' }}>
                      {['Name / Contact', 'Score', 'Hiring Status', 'Recruiter', 'Processing', 'Action'].map(h => (
                        <th key={h} style={{ padding: '0.75rem 1.25rem', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(c => (
                      <tr key={c.id} style={{ borderTop: '1px solid var(--border)', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--table-row-hover)'}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                        <td style={{ padding: '1rem 1.25rem', minWidth: '180px' }}>
                          {c.name ? (
                            <>
                              <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.2rem' }}>{c.name}</p>
                              {c.email && <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>✉️ {c.email}</p>}
                              {c.phone && <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>📞 {c.phone}</p>}
                            </>
                          ) : c.processing_status === 'pending' || c.processing_status === 'processing' ? (
                            <span style={{ color: '#6366f1', fontSize: '0.75rem' }}>⟳ Extracting…</span>
                          ) : (
                            <span style={{ color: 'var(--text-faint)', fontSize: '0.75rem' }}>— (re-upload to extract)</span>
                          )}
                        </td>
                        <td style={{ padding: '1rem 1.25rem' }}>
                          {c.score !== null ? (
                            <div>
                              <span style={{
                                fontSize: '1.125rem', fontWeight: 700,
                                color: c.score >= 70 ? '#22c55e' : c.score >= 50 ? '#f59e0b' : '#ef4444',
                              }}>{Math.round(c.score)}</span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>/100</span>
                            </div>
                          ) : <span style={{ color: 'var(--text-faint)', fontSize: '0.8rem' }}>—</span>}
                        </td>
                        <td style={{ padding: '0.75rem 1.25rem' }}>
                          {canUpdateHiring && (role === 'admin' || role === 'manager' || c.recruiter_id === currentUser?.id) ? (
                            <select
                              value={c.hiring_status || ''}
                              onChange={e => hiringMutation.mutate({ id: c.id, hiring_status: e.target.value })}
                              style={{
                                background: 'var(--bg-input)', border: '1px solid var(--border)',
                                borderRadius: '0.5rem', padding: '0.3rem 0.5rem',
                                fontSize: '0.72rem', cursor: 'pointer', outline: 'none',
                                color: c.hiring_status ? (HIRING_STATUSES[c.hiring_status]?.color || 'var(--text-secondary)') : 'var(--text-muted)',
                                fontWeight: c.hiring_status ? 600 : 400,
                                minWidth: '140px',
                              }}
                            >
                              <option value="">— Set status —</option>
                              {Object.entries(HIRING_STATUSES).map(([val, { label }]) => (
                                <option key={val} value={val}>{label}</option>
                              ))}
                            </select>
                          ) : (
                            <HiringStatusBadge status={c.hiring_status} />
                          )}
                        </td>
                        <td style={{ padding: '1rem 1.25rem', minWidth: '120px' }}>
                          {c.recruiter_name ? (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>👤 {c.recruiter_name}</span>
                          ) : (
                            <span style={{ color: 'var(--text-faint)', fontSize: '0.75rem' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '1rem 1.25rem' }}>
                          <StatusBadge status={c.processing_status} />
                        </td>
                        <td style={{ padding: '1rem 1.25rem' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <Link href={`/dashboard/candidates/${c.id}`} style={{
                              color: '#6366f1', fontSize: '0.8rem', textDecoration: 'none',
                              padding: '0.375rem 0.75rem', border: '1px solid rgba(99,102,241,0.3)',
                              borderRadius: '0.375rem', background: 'rgba(99,102,241,0.05)',
                            }}>View →</Link>
                            {!c.name && c.processing_status === 'completed' && (
                              <button
                                onClick={async () => {
                                  try {
                                    await candidatesApi.reprocess(c.id);
                                    toast.success('Re-queued for extraction');
                                    queryClient.invalidateQueries({ queryKey: ['candidates', jobId] });
                                  } catch { toast.error('Failed to re-queue'); }
                                }}
                                style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem', borderRadius: '0.375rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', cursor: 'pointer' }}>
                                ↻ Re-extract
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && analytics && (
        <div>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Total', value: analytics.total_candidates, color: '#6366f1' },
              { label: 'Pass', value: analytics.pass_count, color: '#22c55e' },
              { label: 'Review', value: analytics.review_count, color: '#f59e0b' },
              { label: 'Fail', value: analytics.fail_count, color: '#ef4444' },
              { label: 'Avg Score', value: analytics.average_score, color: '#a78bfa' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1rem', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>{s.label}</p>
                <p style={{ fontSize: '1.75rem', fontWeight: 700, color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Score Distribution */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.5rem' }}>
              <h3 style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '1.25rem', fontSize: '0.9rem' }}>Score Distribution</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={analytics.score_distribution} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="range" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0.5rem', color: 'var(--text-primary)' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {analytics.score_distribution.map((entry, i) => {
                      const midpoint = parseInt(entry.range.split('-')[0]) + 5;
                      return <Cell key={i} fill={midpoint >= 70 ? '#22c55e' : midpoint >= 50 ? '#f59e0b' : '#ef4444'} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Top Missing Skills */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.5rem' }}>
              <h3 style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '1.25rem', fontSize: '0.9rem' }}>Top Missing Skills</h3>
              {analytics.top_missing_skills.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No data yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {analytics.top_missing_skills.slice(0, 7).map(s => (
                    <div key={s.skill} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ color: 'var(--text-primary)', fontSize: '0.8rem' }}>{s.skill}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{s.count}</span>
                        </div>
                        <div style={{ background: 'var(--border)', borderRadius: '999px', height: '4px' }}>
                          <div style={{
                            background: '#ef4444', height: '100%', borderRadius: '999px',
                            width: `${(s.count / (analytics.top_missing_skills[0]?.count || 1)) * 100}%`,
                          }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Common Strengths */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.5rem' }}>
            <h3 style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '1.25rem', fontSize: '0.9rem' }}>Common Strengths Across Candidates</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {analytics.top_strengths.slice(0, 12).map(s => (
                <span key={s.skill} style={{
                  padding: '0.375rem 0.875rem', borderRadius: '999px', fontSize: '0.8rem',
                  background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                  color: '#6366f1',
                }}>{s.skill} ({s.count})</span>
              ))}
              {analytics.top_strengths.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No data yet</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
