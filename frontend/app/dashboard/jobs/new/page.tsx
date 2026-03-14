'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { jobsApi, teamsApi, parseJdFile, type CreateJobData, type ParsedJD } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import { toast } from 'sonner';
import Link from 'next/link';

export default function NewJobPage() {
  const [form, setForm] = useState<CreateJobData>({
    job_title: '', company_name: '', job_description_text: '', required_skills: [], assigned_team_id: null,
  });
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [skillInput, setSkillInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [showPdfUpload, setShowPdfUpload] = useState(false);
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { role } = useUserContext();

  // Only Admin and Manager can create jobs
  useEffect(() => {
    if (role && role !== 'admin' && role !== 'manager') {
      router.replace('/dashboard/jobs');
    }
  }, [role, router]);

  const canAssignTeam = role === 'admin' || role === 'manager';

  const { data: teamsData } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list(),
    enabled: canAssignTeam,
  });
  const teams = teamsData?.teams ?? [];

  const createMutation = useMutation({
    mutationFn: async (data: CreateJobData) => {
      const res = await jobsApi.create(data);
      // Set multi-team assignments after job created
      if (selectedTeamIds.size > 0) {
        await jobsApi.setTeams(res.job.id, Array.from(selectedTeamIds));
      }
      return res;
    },
    onSuccess: (data) => {
      toast.success('Job created successfully!');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      router.push(`/dashboard/jobs/${data.job.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // PDF → AI parse → auto-fill form
  const onDrop = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const file = files[0];
    setIsParsing(true);
    setAiWarning(null);
    try {
      toast.loading('🤖 Parsing JD with AI…', { id: 'parse-jd' });
      const parsed: ParsedJD & { ai_available?: boolean; ai_error?: string } = await parseJdFile(file);
      
      // Auto-fill the form
      setForm({
        job_title: parsed.job_title || '',
        company_name: parsed.company_name || '',
        job_description_text: parsed.job_description_text || '',
        required_skills: Array.isArray(parsed.required_skills) ? parsed.required_skills : [],
      });

      // Collapse the PDF uploader to reveal the filled form
      setShowPdfUpload(false);

      if (parsed.ai_available === false && parsed.ai_error) {
        setAiWarning(parsed.ai_error);
        toast.warning('⚠️ Description pre-filled from PDF. AI parsing unavailable — see warning below.', { id: 'parse-jd', duration: 5000 });
      } else {
        toast.success(`✨ Auto-filled! Extracted ${parsed.required_skills?.length ?? 0} skills. Review and click Create Job.`, { id: 'parse-jd', duration: 4000 });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse JD';
      toast.error(msg, { id: 'parse-jd' });
    } finally {
      setIsParsing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxFiles: 1,
    disabled: isParsing,
  });

  function toggleTeam(id: string) {
    setSelectedTeamIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function addSkill() {
    const skill = skillInput.trim();
    if (!skill) return;
    if (!(form.required_skills ?? []).includes(skill)) {
      setForm(f => ({ ...f, required_skills: [...(f.required_skills ?? []), skill] }));
    }
    setSkillInput('');
  }
  function removeSkill(s: string) {
    setForm(f => ({ ...f, required_skills: (f.required_skills ?? []).filter(x => x !== s) }));
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.job_title.trim() || !form.company_name.trim() || !form.job_description_text.trim()) {
      toast.error('Please fill all required fields (Job Title, Company Name, Job Description)');
      return;
    }
    // Pass first selected team as assigned_team_id for legacy compat
    const firstTeam = selectedTeamIds.size > 0 ? Array.from(selectedTeamIds)[0] : null;
    createMutation.mutate({ ...form, assigned_team_id: firstTeam });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.75rem 1rem',
    background: 'var(--bg-input)', border: '1px solid var(--border)',
    borderRadius: '0.5rem', color: 'var(--text-primary)', fontSize: '0.875rem',
    outline: 'none', transition: 'border-color 0.2s',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', color: 'var(--text-secondary)', fontSize: '0.875rem',
    marginBottom: '0.375rem', fontWeight: 500,
  };

  const hasParsedData = form.job_title || form.company_name || form.job_description_text;

  return (
    <div style={{ padding: '2rem', maxWidth: '800px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <Link href="/dashboard/jobs" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.875rem' }}>← Back</Link>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>Create New Job</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Post a role and start screening candidates</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* JD Upload Banner */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '1rem', padding: '1.25rem 1.5rem', marginBottom: '1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.125rem' }}>
              📄 Upload JD PDF — AI Auto-fill
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              Upload your JD file and AI will extract all fields automatically
            </p>
          </div>
          <button type="button" onClick={() => setShowPdfUpload(v => !v)} style={{
            padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer',
            fontSize: '0.8rem', fontWeight: 600, border: 'none',
            background: showPdfUpload ? 'rgba(99,102,241,0.15)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            color: showPdfUpload ? '#a5b4fc' : '#fff',
            transition: 'all 0.2s',
          }}>
            {showPdfUpload ? '▲ Close' : '📤 Upload PDF/DOCX'}
          </button>
        </div>

        {/* PDF Dropzone (collapsible) */}
        {showPdfUpload && (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '1rem', padding: '1.5rem', marginBottom: '1rem',
          }}>
            <div {...getRootProps()} style={{
              border: `2px dashed ${isDragActive ? '#6366f1' : 'var(--border-strong)'}`,
              borderRadius: '0.875rem', padding: '2rem', textAlign: 'center',
              background: isDragActive ? 'rgba(99,102,241,0.06)' : 'var(--bg-base)',
              cursor: isParsing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}>
              <input {...getInputProps()} />
              {isParsing ? (
                <>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🤖</div>
                  <p style={{ color: '#a5b4fc', fontWeight: 600, marginBottom: '0.25rem' }}>Parsing with AI…</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Extracting job details and skills from your document</p>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📄</div>
                  <p style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {isDragActive ? 'Drop it here!' : 'Drag & drop your JD, or click to browse'}
                  </p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                    PDF or DOCX • Up to 20MB
                  </p>
                  <span style={{
                    padding: '0.5rem 1.5rem', borderRadius: '0.5rem',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: '#fff', fontSize: '0.875rem', fontWeight: 600,
                    pointerEvents: 'none',
                  }}>Choose File</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* AI Warning banner (quota exceeded etc.) */}
        {aiWarning && (
          <div style={{
            padding: '0.875rem 1.25rem', borderRadius: '0.75rem',
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)',
            marginBottom: '1rem',
            display: 'flex', gap: '0.625rem', alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>⚠️</span>
            <div>
              <p style={{ color: '#f59e0b', fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                AI Parsing Unavailable
              </p>
              <p style={{ color: '#94a3b8', fontSize: '0.78rem', lineHeight: 1.5 }}>{aiWarning}</p>
              <a href="https://platform.openai.com/billing" target="_blank" rel="noopener noreferrer"
                style={{ color: '#f59e0b', fontSize: '0.78rem', textDecoration: 'underline' }}>
                Add OpenAI billing →
              </a>
            </div>
          </div>
        )}

        {/* AI-filled badge */}
        {hasParsedData && !showPdfUpload && !aiWarning && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.5rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem',
            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
            width: 'fit-content',
          }}>
            <span style={{ fontSize: '0.85rem' }}>✨</span>
            <span style={{ color: '#a5b4fc', fontSize: '0.8rem', fontWeight: 500 }}>
              Fields auto-filled by AI — review and edit below
            </span>
          </div>
        )}

        {/* Main form */}
        <div style={{
          background: 'var(--bg-card)', border: hasParsedData ? '1px solid rgba(99,102,241,0.25)' : '1px solid var(--border)',
          borderRadius: '1rem', padding: '1.75rem', marginBottom: '1.5rem',
        }}>
          <h2 style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '1.25rem', fontSize: '1rem' }}>
            Job Details
          </h2>

          {/* Team multi-select */}
          {canAssignTeam && teams.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ ...labelStyle, marginBottom: '0.5rem' }}>Assign to Teams</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-base)', borderRadius: '0.5rem', padding: '0.625rem', border: '1px solid var(--border)' }}>
                {teams.map(team => (
                  <label key={team.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', padding: '0.35rem 0.5rem', borderRadius: '0.375rem', background: selectedTeamIds.has(team.id) ? 'rgba(99,102,241,0.12)' : 'transparent' }}>
                    <input type="checkbox" checked={selectedTeamIds.has(team.id)} onChange={() => toggleTeam(team.id)}
                      style={{ accentColor: '#6366f1', width: '15px', height: '15px' }} />
                    <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{team.name}</span>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={labelStyle}>
                Job Title *
                {form.job_title && <span style={{ color: '#22c55e', fontSize: '0.7rem', marginLeft: '0.375rem' }}>✓ filled</span>}
              </label>
              <input style={{
                ...inputStyle,
                borderColor: form.job_title ? 'rgba(34,197,94,0.3)' : 'var(--border)',
              }}
                placeholder="e.g. Senior Frontend Engineer"
                value={form.job_title}
                onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} required
                onFocus={e => (e.target.style.borderColor = '#6366f1')}
                onBlur={e => (e.target.style.borderColor = form.job_title ? 'rgba(34,197,94,0.3)' : 'var(--border)')} />
            </div>
            <div>
              <label style={labelStyle}>
                Company Name *
                {form.company_name && <span style={{ color: '#22c55e', fontSize: '0.7rem', marginLeft: '0.375rem' }}>✓ filled</span>}
              </label>
              <input style={{
                ...inputStyle,
                borderColor: form.company_name ? 'rgba(34,197,94,0.3)' : 'var(--border)',
              }}
                placeholder="e.g. Acme Inc."
                value={form.company_name}
                onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} required
                onFocus={e => (e.target.style.borderColor = '#6366f1')}
                onBlur={e => (e.target.style.borderColor = form.company_name ? 'rgba(34,197,94,0.3)' : 'var(--border)')} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>
              Job Description *
              {form.job_description_text && <span style={{ color: '#22c55e', fontSize: '0.7rem', marginLeft: '0.375rem' }}>✓ filled</span>}
            </label>
            <textarea style={{
              ...inputStyle, minHeight: '200px', resize: 'vertical' as const,
              borderColor: form.job_description_text ? 'rgba(34,197,94,0.3)' : 'var(--border)',
            }}
              placeholder="Paste the full job description here, or upload a PDF above to auto-fill…"
              value={form.job_description_text}
              onChange={e => setForm(f => ({ ...f, job_description_text: e.target.value }))} required
              onFocus={e => (e.target.style.borderColor = '#6366f1')}
              onBlur={e => (e.target.style.borderColor = form.job_description_text ? 'rgba(34,197,94,0.3)' : 'var(--border)')} />
          </div>
        </div>

        {/* Required Skills */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '1rem', padding: '1.75rem', marginBottom: '1.5rem',
        }}>
          <h2 style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.375rem', fontSize: '1rem' }}>Required Skills</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
            Optional — helps AI score skill matches more precisely
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.875rem' }}>
            <input style={{ ...inputStyle, flex: 1 }} placeholder="Add skill (e.g. React, Python, AWS)…"
              value={skillInput} onChange={e => setSkillInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
              onFocus={e => (e.target.style.borderColor = '#6366f1')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            <button type="button" onClick={addSkill} style={{
              padding: '0.75rem 1.25rem', borderRadius: '0.5rem',
              background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.875rem',
            }}>Add</button>
          </div>

          {(form.required_skills ?? []).length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {(form.required_skills ?? []).map(skill => (
                <span key={skill} style={{
                  display: 'flex', alignItems: 'center', gap: '0.375rem',
                  padding: '0.25rem 0.75rem', borderRadius: '999px',
                  background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
                  color: '#a5b4fc', fontSize: '0.8rem',
                }}>
                  {skill}
                  <button type="button" onClick={() => removeSkill(skill)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', lineHeight: 1, padding: 0, fontSize: '1rem',
                  }}>×</button>
                </span>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-faint)', fontSize: '0.8rem' }}>No skills added yet</p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button type="submit" disabled={createMutation.isPending || isParsing} style={{
            padding: '0.875rem 2rem', borderRadius: '0.625rem',
            background: (createMutation.isPending || isParsing)
              ? '#4f46e5'
              : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', border: 'none',
            cursor: (createMutation.isPending || isParsing) ? 'not-allowed' : 'pointer',
            fontSize: '0.9375rem', fontWeight: 600, boxShadow: '0 0 20px rgba(99,102,241,0.3)',
          }}>
            {createMutation.isPending ? '⟳ Creating…' : isParsing ? '🤖 Parsing…' : '✓ Create Job'}
          </button>
          <Link href="/dashboard/jobs" style={{
            padding: '0.875rem 1.5rem', borderRadius: '0.625rem',
            border: '1px solid var(--border)', color: 'var(--text-secondary)',
            textDecoration: 'none', fontSize: '0.875rem', background: 'var(--bg-card)',
            display: 'flex', alignItems: 'center',
          }}>Cancel</Link>
        </div>
      </form>
    </div>
  );
}
