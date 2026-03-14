'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobsApi, teamsApi, type CreateJobData } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';

const SKILLS_PLACEHOLDER = 'React, Node.js, TypeScript…';

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
  const [loaded, setLoaded] = useState(false);

  // Redirect if not admin or manager
  useEffect(() => {
    if (role && role !== 'admin' && role !== 'manager') {
      router.replace('/dashboard/jobs');
    }
  }, [role, router]);

  // Load existing job data
  const { data: jobData, isLoading: jobLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobsApi.get(jobId),
    enabled: !!jobId,
  });

  // Load teams for selector
  const { data: teamsData } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list(),
  });

  // Populate form once job data arrives
  useEffect(() => {
    if (jobData?.job && !loaded) {
      const j = jobData.job;
      setJobTitle(j.job_title);
      setCompanyName(j.company_name);
      setDescription(j.job_description_text ?? '');
      setSkillsInput((j.required_skills ?? []).join(', '));
      setStatus(j.status as 'active' | 'closed' | 'draft');
      // Pre-check teams from the many-to-many assignment
      const teamIds = (j.teams ?? []).map((t: { id: string }) => t.id);
      // Fallback to assigned_team_id if job_teams is empty
      if (teamIds.length > 0) {
        setSelectedTeamIds(new Set(teamIds));
      } else if (j.assigned_team_id) {
        setSelectedTeamIds(new Set([j.assigned_team_id]));
      }
      setLoaded(true);
    }
  }, [jobData, loaded]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<CreateJobData> & { status?: string }) => {
      await jobsApi.update(jobId, data as Partial<CreateJobData>);
      // Update many-to-many team assignments
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
    setSelectedTeamIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobTitle.trim() || !companyName.trim() || !description.trim()) {
      toast.error('Job title, company name, and description are required');
      return;
    }
    const skills = skillsInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const firstTeam = selectedTeamIds.size > 0 ? Array.from(selectedTeamIds)[0] : null;
    updateMutation.mutate({
      job_title: jobTitle.trim(),
      company_name: companyName.trim(),
      job_description_text: description.trim(),
      required_skills: skills,
      assigned_team_id: firstTeam,
      status,
    } as Partial<CreateJobData>);
  };

  const teams = teamsData?.teams ?? [];

  const labelStyle = { color: '#94a3b8', fontSize: '0.8rem', display: 'block', marginBottom: '0.4rem' } as const;
  const inputStyle = {
    width: '100%',
    background: '#111827',
    border: '1px solid #1e2d4a',
    borderRadius: '0.5rem',
    padding: '0.625rem 0.75rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    boxSizing: 'border-box' as const,
  };

  if (jobLoading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '720px', color: '#64748b' }}>Loading job…</div>
    );
  }

  if (!jobData?.job) {
    return (
      <div style={{ padding: '2rem', maxWidth: '720px', color: '#ef4444' }}>Job not found.</div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '720px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
        <Link
          href={`/dashboard/jobs/${jobId}`}
          style={{ color: '#64748b', textDecoration: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
        >
          ← Back
        </Link>
        <span style={{ color: '#334155' }}>|</span>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0' }}>Edit Job</h1>
          <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.15rem' }}>Update the job details below</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Job Title */}
          <div>
            <label style={labelStyle}>Job Title *</label>
            <input
              value={jobTitle}
              onChange={e => setJobTitle(e.target.value)}
              placeholder="e.g. Senior React Developer"
              style={inputStyle}
              required
            />
          </div>

          {/* Company Name */}
          <div>
            <label style={labelStyle}>Company Name *</label>
            <input
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="e.g. Acme Corp"
              style={inputStyle}
              required
            />
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

          {/* Assign to Teams — multi-select checkboxes */}
          {teams.length > 0 && (
            <div>
              <label style={labelStyle}>Assign to Teams</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '200px', overflowY: 'auto', background: '#0a0f1e', borderRadius: '0.5rem', padding: '0.625rem', border: '1px solid #1e2d4a' }}>
                {teams.map(t => (
                  <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', padding: '0.35rem 0.5rem', borderRadius: '0.375rem', background: selectedTeamIds.has(t.id) ? 'rgba(99,102,241,0.12)' : 'transparent' }}>
                    <input
                      type="checkbox"
                      checked={selectedTeamIds.has(t.id)}
                      onChange={() => toggleTeam(t.id)}
                      style={{ accentColor: '#6366f1', width: '15px', height: '15px' }}
                    />
                    <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>{t.name}</span>
                  </label>
                ))}
              </div>
              {/* Selected team tags */}
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
            <label style={labelStyle}>Required Skills <span style={{ color: '#475569' }}>(comma-separated)</span></label>
            <input
              value={skillsInput}
              onChange={e => setSkillsInput(e.target.value)}
              placeholder={SKILLS_PLACEHOLDER}
              style={inputStyle}
            />
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
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={10}
              placeholder="Describe the role, responsibilities, requirements…"
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              required
            />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <Link
            href={`/dashboard/jobs/${jobId}`}
            style={{ padding: '0.75rem 1.5rem', borderRadius: '0.625rem', border: '1px solid #1e2d4a', color: '#94a3b8', textDecoration: 'none', fontSize: '0.875rem', display: 'inline-block' }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={updateMutation.isPending}
            style={{
              padding: '0.75rem 2rem', borderRadius: '0.625rem',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', border: 'none', cursor: updateMutation.isPending ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem', fontWeight: 600,
              opacity: updateMutation.isPending ? 0.7 : 1,
            }}
          >
            {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
