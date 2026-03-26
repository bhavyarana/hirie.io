'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobsApi, teamsApi, type CreateJobData, type ScoringCriteria } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';

const SKILLS_PLACEHOLDER = 'React, Node.js, TypeScript…';

const DEFAULT_SCORING: ScoringCriteria = {
  pass_threshold: 70,
  review_threshold: 50,
  weights: { technical_skills: 35, experience: 30, education: 20, soft_skills: 15 },
};

export default function EditJobPage() {
  const params = useParams();
  const jobId = params.id as string;
  const router = useRouter();
  const { role } = useUserContext();
  const queryClient = useQueryClient();

  const [jobTitle, setJobTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [description, setDescription] = useState('');
  const [skillsInput, setSkillsInput] = useState('');
  const [status, setStatus] = useState<'active' | 'closed' | 'draft'>('active');
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [scoring, setScoring] = useState<ScoringCriteria>(DEFAULT_SCORING);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (role && role !== 'admin' && role !== 'manager') router.replace('/dashboard/jobs');
  }, [role, router]);

  const { data: jobData, isLoading: jobLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobsApi.get(jobId),
    enabled: !!jobId,
  });

  const { data: teamsData } = useQuery({ queryKey: ['teams'], queryFn: () => teamsApi.list() });

  useEffect(() => {
    if (jobData?.job && !loaded) {
      const j = jobData.job;
      setJobTitle(j.job_title);
      setCompanyName(j.company_name);
      setDescription(j.job_description_text ?? '');
      setSkillsInput((j.required_skills ?? []).join(', '));
      setStatus(j.status as 'active' | 'closed' | 'draft');
      const teamIds = (j.teams ?? []).map((t: { id: string }) => t.id);
      if (teamIds.length > 0) setSelectedTeamIds(new Set(teamIds));
      else if (j.assigned_team_id) setSelectedTeamIds(new Set([j.assigned_team_id]));
      if (j.scoring_criteria) {
        setScoring({
          pass_threshold: j.scoring_criteria.pass_threshold ?? 70,
          review_threshold: j.scoring_criteria.review_threshold ?? 50,
          weights: {
            technical_skills: j.scoring_criteria.weights?.technical_skills ?? 35,
            experience: j.scoring_criteria.weights?.experience ?? 30,
            education: j.scoring_criteria.weights?.education ?? 20,
            soft_skills: j.scoring_criteria.weights?.soft_skills ?? 15,
          },
        });
      }
      setLoaded(true);
    }
  }, [jobData, loaded]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<CreateJobData> & { status?: string }) => {
      await jobsApi.update(jobId, data as Partial<CreateJobData>);
      await jobsApi.setTeams(jobId, Array.from(selectedTeamIds));
    },
    onSuccess: () => {
      toast.success('Job updated successfully');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      router.push(`/dashboard/jobs/${jobId}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleTeam(id: string) {
    setSelectedTeamIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  const weightsTotal = Object.values(scoring.weights).reduce((a, b) => a + b, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobTitle.trim() || !companyName.trim() || !description.trim()) { toast.error('Job title, company name, and description are required'); return; }
    if (weightsTotal !== 100) { toast.error(`Dimension weights must total 100% (currently ${weightsTotal}%)`); return; }
    const skills = skillsInput.split(',').map(s => s.trim()).filter(Boolean);
    const firstTeam = selectedTeamIds.size > 0 ? Array.from(selectedTeamIds)[0] : null;
    updateMutation.mutate({ job_title: jobTitle.trim(), company_name: companyName.trim(), job_description_text: description.trim(), required_skills: skills, assigned_team_id: firstTeam, status, scoring_criteria: scoring } as Partial<CreateJobData>);
  };

  const teams = teamsData?.teams ?? [];

  const labelStyle = { color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'block', marginBottom: '0.4rem' } as const;
  const inputStyle = {
    width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
    borderRadius: '0.5rem', padding: '0.625rem 0.75rem',
    color: 'var(--text-primary)', fontSize: '0.875rem', boxSizing: 'border-box' as const,
  };

  if (jobLoading) return <div style={{ padding: '2rem', maxWidth: '720px', color: 'var(--text-muted)' }}>Loading job…</div>;
  if (!jobData?.job) return <div style={{ padding: '2rem', maxWidth: '720px', color: '#ef4444' }}>Job not found.</div>;

  return (
    <div style={{ padding: '2rem', maxWidth: '720px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
        <Link href={`/dashboard/jobs/${jobId}`} style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          ← Back
        </Link>
        <span style={{ color: 'var(--border)' }}>|</span>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>Edit Job</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.15rem' }}>Update the job details below</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>

          {/* Job Title */}
          <div>
            <label style={labelStyle}>Job Title *</label>
            <input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Senior React Developer" style={inputStyle} required />
          </div>

          {/* Company Name */}
          <div>
            <label style={labelStyle}>Company Name *</label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Acme Corp" style={inputStyle} required />
          </div>

          {/* Status */}
          <div>
            <label style={labelStyle}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as 'active' | 'closed' | 'draft')} style={inputStyle}>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Assign to Teams */}
          {teams.length > 0 && (
            <div>
              <label style={labelStyle}>Assign to Teams</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-input)', borderRadius: '0.5rem', padding: '0.625rem', border: '1px solid var(--border)' }}>
                {teams.map(t => (
                  <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', padding: '0.35rem 0.5rem', borderRadius: '0.375rem', background: selectedTeamIds.has(t.id) ? 'rgba(99,102,241,0.12)' : 'transparent' }}>
                    <input type="checkbox" checked={selectedTeamIds.has(t.id)} onChange={() => toggleTeam(t.id)} style={{ accentColor: '#6366f1', width: '15px', height: '15px' }} />
                    <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{t.name}</span>
                  </label>
                ))}
              </div>
              {selectedTeamIds.size > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.5rem' }}>
                  {teams.filter(t => selectedTeamIds.has(t.id)).map(t => (
                    <span key={t.id} style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', fontSize: '0.75rem', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      {t.name}
                      <button type="button" onClick={() => toggleTeam(t.id)} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Required Skills */}
          <div>
            <label style={labelStyle}>Required Skills <span style={{ color: 'var(--text-faint)' }}>(comma-separated)</span></label>
            <input value={skillsInput} onChange={e => setSkillsInput(e.target.value)} placeholder={SKILLS_PLACEHOLDER} style={inputStyle} />
            {skillsInput && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
                {skillsInput.split(',').map(s => s.trim()).filter(Boolean).map(s => (
                  <span key={s} style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}>{s}</span>
                ))}
              </div>
            )}
          </div>

          {/* Job Description */}
          <div>
            <label style={labelStyle}>Job Description *</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={10} placeholder="Describe the role, responsibilities, requirements…" style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} required />
          </div>
        </div>

        {/* Scoring Criteria */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '1rem', padding: '1.75rem', marginBottom: '1.5rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
          <h2 style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.25rem', fontSize: '1rem' }}>🎯 Scoring Criteria</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
            These settings control how AI scores future resume uploads for this job.
          </p>

          {/* Thresholds */}
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Pass / Review / Fail Thresholds
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', display: 'block', marginBottom: '0.4rem' }}>Pass Threshold (score ≥)</label>
                <input type="number" min={1} max={100} value={scoring.pass_threshold}
                  onChange={e => setScoring(s => ({ ...s, pass_threshold: Math.max(1, Math.min(100, +e.target.value)) }))}
                  style={{ width: '100%', padding: '0.6rem 0.875rem', borderRadius: '0.5rem', background: 'var(--bg-input)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: '0.9rem', fontWeight: 700, boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', display: 'block', marginBottom: '0.4rem' }}>Review Threshold (score ≥)</label>
                <input type="number" min={1} max={99} value={scoring.review_threshold}
                  onChange={e => setScoring(s => ({ ...s, review_threshold: Math.max(1, Math.min(99, +e.target.value)) }))}
                  style={{ width: '100%', padding: '0.6rem 0.875rem', borderRadius: '0.5rem', background: 'var(--bg-input)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontSize: '0.9rem', fontWeight: 700, boxSizing: 'border-box' as const }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const }}>
              <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: '0.72rem', fontWeight: 700 }}>✅ PASS ≥ {scoring.pass_threshold}</span>
              <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontSize: '0.72rem', fontWeight: 700 }}>🔶 REVIEW ≥ {scoring.review_threshold}</span>
              <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '0.72rem', fontWeight: 700 }}>❌ FAIL &lt; {scoring.review_threshold}</span>
            </div>
          </div>

          {/* Weightages */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dimension Weightages</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: weightsTotal === 100 ? '#22c55e' : '#ef4444' }}>
                  Total: {weightsTotal}% {weightsTotal === 100 ? '✓' : '(must = 100%)'}
                </span>
                <button type="button" onClick={() => setScoring(s => ({ ...s, weights: { technical_skills: 35, experience: 30, education: 20, soft_skills: 15 } }))}
                  style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: '0.3rem', background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.25)', color: 'var(--text-muted)', cursor: 'pointer' }}>↺ Reset</button>
              </div>
            </div>
            {([
              { key: 'technical_skills', label: '⚙️ Technical & Domain Skills', color: '#6366f1' },
              { key: 'experience', label: '💼 Professional Experience', color: '#8b5cf6' },
              { key: 'education', label: '🎓 Education & Certifications', color: '#06b6d4' },
              { key: 'soft_skills', label: '🤝 Communication & Soft Skills', color: '#f59e0b' },
            ] as const).map(({ key, label, color }) => (
              <div key={key} style={{ marginBottom: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                  <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{label}</label>
                  <span style={{ color, fontWeight: 700, fontSize: '0.85rem', minWidth: '3rem', textAlign: 'right' as const }}>{scoring.weights[key]}%</span>
                </div>
                <input type="range" min={0} max={100} value={scoring.weights[key]}
                  onChange={e => setScoring(s => ({ ...s, weights: { ...s.weights, [key]: +e.target.value } }))}
                  style={{ width: '100%', accentColor: color }} />
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <Link href={`/dashboard/jobs/${jobId}`}
            style={{ padding: '0.75rem 1.5rem', borderRadius: '0.625rem', border: '1px solid var(--border)', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.875rem', display: 'inline-block' }}>
            Cancel
          </Link>
          <button type="submit" disabled={updateMutation.isPending || weightsTotal !== 100}
            style={{
              padding: '0.75rem 2rem', borderRadius: '0.625rem',
              background: weightsTotal !== 100 ? 'var(--border)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: weightsTotal !== 100 ? 'var(--text-muted)' : '#fff',
              border: 'none', cursor: (updateMutation.isPending || weightsTotal !== 100) ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem', fontWeight: 600, opacity: updateMutation.isPending ? 0.7 : 1,
            }}>
            {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
