'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobsApi, type Job } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type SortOption = 'newest' | 'oldest' | 'title_az' | 'title_za' | 'candidates';

export default function JobsListPage() {
  const { role } = useUserContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canManage = role === 'admin' || role === 'manager';

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search,   setSearch]   = useState('');
  const [status,   setStatus]   = useState<'all' | 'active' | 'closed' | 'draft'>('all');
  const [sort,     setSort]     = useState<SortOption>('newest');

  const { data, isLoading } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list() });
  const allJobs: Job[] = data?.jobs ?? [];

  // ── Derived list ──────────────────────────────────────────────────────────
  const filteredJobs = useMemo(() => {
    let list = [...allJobs];

    // Text search: title, company, skills
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(j =>
        j.job_title.toLowerCase().includes(q) ||
        j.company_name.toLowerCase().includes(q) ||
        (j.required_skills ?? []).some(s => s.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (status !== 'all') list = list.filter(j => j.status === status);

    // Sort
    switch (sort) {
      case 'oldest':      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break;
      case 'title_az':    list.sort((a, b) => a.job_title.localeCompare(b.job_title)); break;
      case 'title_za':    list.sort((a, b) => b.job_title.localeCompare(a.job_title)); break;
      case 'candidates':  list.sort((a, b) => (b.candidate_count ?? 0) - (a.candidate_count ?? 0)); break;
      default:            list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
    }

    return list;
  }, [allJobs, search, status, sort]);

  const activeCount  = allJobs.filter(j => j.status === 'active').length;
  const closedCount  = allJobs.filter(j => j.status === 'closed').length;
  const draftCount   = allJobs.filter(j => j.status === 'draft').length;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => jobsApi.delete(id),
    onSuccess: () => { toast.success('Job deleted'); queryClient.invalidateQueries({ queryKey: ['jobs'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDelete = (e: React.MouseEvent, job: Job) => {
    e.preventDefault(); e.stopPropagation();
    if (confirm(`Delete job "${job.job_title}"? This will also delete all associated candidates.`)) {
      deleteMutation.mutate(job.id);
    }
  };

  const handleEdit = (e: React.MouseEvent, jobId: string) => {
    e.preventDefault(); e.stopPropagation();
    router.push(`/dashboard/jobs/${jobId}/edit`);
  };

  const clearFilters = () => { setSearch(''); setStatus('all'); setSort('newest'); };
  const hasActiveFilters = search || status !== 'all' || sort !== 'newest';

  // ── Tab style helper ──────────────────────────────────────────────────────
  const tabStyle = (active: boolean, color = '#6366f1') => ({
    padding: '0.375rem 0.875rem',
    borderRadius: '999px',
    fontSize: '0.78rem',
    fontWeight: 600,
    cursor: 'pointer',
    border: `1px solid ${active ? color + '50' : '#1e2d4a'}`,
    background: active ? `${color}18` : 'transparent',
    color: active ? color : '#64748b',
    transition: 'all 0.15s',
  } as React.CSSProperties);

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#e2e8f0' }}>Jobs</h1>
          <p style={{ color: '#64748b', marginTop: '0.25rem' }}>
            {allJobs.length} job{allJobs.length !== 1 ? 's' : ''} · Manage roles and screen candidates with AI
          </p>
        </div>
        {canManage && (
          <Link href="/dashboard/jobs/new" style={{
            padding: '0.75rem 1.5rem', borderRadius: '0.625rem',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem',
            boxShadow: '0 0 20px rgba(99,102,241,0.3)', whiteSpace: 'nowrap',
          }}>+ New Job</Link>
        )}
      </div>

      {/* ── Search + filters bar ──────────────────────────────────────────── */}
      <div style={{
        background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '0.875rem',
        padding: '1rem 1.25rem', marginBottom: '1.25rem',
        display: 'flex', flexDirection: 'column', gap: '0.875rem',
      }}>
        {/* Search input */}
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)',
            color: '#475569', fontSize: '0.9rem', pointerEvents: 'none',
          }}>🔍</span>
          <input
            type="text"
            placeholder="Search by title, company, or skill…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '0.625rem 0.875rem 0.625rem 2.25rem',
              background: '#0a0f1e', border: '1px solid #1e2d4a', borderRadius: '0.5rem',
              color: '#e2e8f0', fontSize: '0.875rem', outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.5)')}
            onBlur={e  => (e.target.style.borderColor = '#1e2d4a')}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{
              position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1rem', lineHeight: 1,
            }}>×</button>
          )}
        </div>

        {/* Status tabs + Sort select */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.625rem' }}>
          {/* Status filter tabs */}
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            <button style={tabStyle(status === 'all')} onClick={() => setStatus('all')}>
              All <span style={{ opacity: 0.7 }}>({allJobs.length})</span>
            </button>
            <button style={tabStyle(status === 'active', '#22c55e')} onClick={() => setStatus('active')}>
              🟢 Active <span style={{ opacity: 0.7 }}>({activeCount})</span>
            </button>
            <button style={tabStyle(status === 'closed', '#64748b')} onClick={() => setStatus('closed')}>
              ⚫ Closed <span style={{ opacity: 0.7 }}>({closedCount})</span>
            </button>
            {draftCount > 0 && (
              <button style={tabStyle(status === 'draft', '#f59e0b')} onClick={() => setStatus('draft')}>
                📝 Draft <span style={{ opacity: 0.7 }}>({draftCount})</span>
              </button>
            )}
          </div>

          {/* Sort + Clear */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortOption)}
              style={{
                background: '#0a0f1e', border: '1px solid #1e2d4a', borderRadius: '0.5rem',
                color: '#94a3b8', fontSize: '0.78rem', padding: '0.35rem 0.625rem', cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="newest">↓ Newest first</option>
              <option value="oldest">↑ Oldest first</option>
              <option value="title_az">A → Z</option>
              <option value="title_za">Z → A</option>
              <option value="candidates">Most candidates</option>
            </select>
            {hasActiveFilters && (
              <button onClick={clearFilters} style={{
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '0.5rem', color: '#fca5a5', fontSize: '0.75rem',
                padding: '0.35rem 0.625rem', cursor: 'pointer',
              }}>✕ Clear</button>
            )}
          </div>
        </div>
      </div>

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1.5rem', height: '160px' }} />
          ))}
        </div>
      ) : filteredJobs.length === 0 ? (
        <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '4rem', textAlign: 'center' }}>
          {allJobs.length === 0 ? (
            <>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💼</div>
              <h3 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '0.5rem' }}>No jobs created yet</h3>
              <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                Create your first job posting and start screening candidates with AI
              </p>
              {canManage && (
                <Link href="/dashboard/jobs/new" style={{
                  padding: '0.75rem 1.5rem', borderRadius: '0.625rem',
                  background: '#6366f1', color: '#fff', textDecoration: 'none', fontWeight: 600,
                }}>+ Create First Job</Link>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔍</div>
              <h3 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '0.5rem' }}>No matching jobs</h3>
              <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
                Try a different search term or clear the filters
              </p>
              <button onClick={clearFilters} style={{
                padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
                background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
                color: '#a5b4fc', cursor: 'pointer', fontSize: '0.875rem',
              }}>Clear filters</button>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Result count when filtering */}
          {hasActiveFilters && (
            <p style={{ color: '#64748b', fontSize: '0.78rem', marginBottom: '0.875rem' }}>
              Showing {filteredJobs.length} of {allJobs.length} job{allJobs.length !== 1 ? 's' : ''}
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
            {filteredJobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                canManage={canManage}
                searchQuery={search}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Highlight matching text ────────────────────────────────────────────────────
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(99,102,241,0.3)', color: '#e2e8f0', borderRadius: '2px', padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Job card ──────────────────────────────────────────────────────────────────
function JobCard({
  job, canManage, searchQuery = '', onEdit, onDelete,
}: {
  job: Job;
  canManage: boolean;
  searchQuery?: string;
  onEdit: (e: React.MouseEvent, id: string) => void;
  onDelete: (e: React.MouseEvent, job: Job) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    active : { bg: 'rgba(34,197,94,0.1)',   text: '#22c55e', border: 'rgba(34,197,94,0.3)'  },
    closed : { bg: 'rgba(100,116,139,0.1)', text: '#64748b', border: 'rgba(100,116,139,0.3)' },
    draft  : { bg: 'rgba(245,158,11,0.1)',  text: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  };
  const sc = statusColors[job.status] ?? statusColors.closed;

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link href={`/dashboard/jobs/${job.id}`} style={{ textDecoration: 'none', display: 'block' }}>
        <div style={{
          background: '#0d1526',
          border: `1px solid ${hovered ? 'rgba(99,102,241,0.4)' : '#1e2d4a'}`,
          borderRadius: '1rem', padding: '1.5rem',
          transition: 'all 0.2s ease', cursor: 'pointer',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
          boxShadow: hovered ? '0 8px 30px rgba(99,102,241,0.15)' : 'none',
        }}>
          {/* Top row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <Highlight text={job.job_title} query={searchQuery} />
              </h3>
              <p style={{ color: '#64748b', fontSize: '0.8rem' }}>
                <Highlight text={job.company_name} query={searchQuery} />
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.75rem', flexShrink: 0 }}>
              <span style={{
                padding: '0.25rem 0.625rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600,
                background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`,
              }}>{job.status}</span>
              {canManage && (
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button onClick={e => onEdit(e, job.id)} title="Edit job" style={{
                    background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
                    borderRadius: '0.375rem', padding: '0.3rem 0.45rem', cursor: 'pointer',
                    color: '#a5b4fc', fontSize: '0.75rem', lineHeight: 1, transition: 'all 0.15s',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.25)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.1)'; }}
                  >✏️</button>
                  <button onClick={e => onDelete(e, job)} title="Delete job" style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: '0.375rem', padding: '0.3rem 0.45rem', cursor: 'pointer',
                    color: '#fca5a5', fontSize: '0.75rem', lineHeight: 1, transition: 'all 0.15s',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.25)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; }}
                  >🗑️</button>
                </div>
              )}
            </div>
          </div>

          <p style={{
            color: '#475569', fontSize: '0.8rem', lineHeight: 1.6, marginBottom: '1rem',
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
          }}>
            {job.job_description_text}
          </p>

          {(job.required_skills ?? []).length > 0 && (
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {(job.required_skills ?? []).slice(0, 4).map(s => (
                <span key={s} style={{
                  padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem',
                  background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)',
                }}>
                  <Highlight text={s} query={searchQuery} />
                </span>
              ))}
              {(job.required_skills ?? []).length > 4 && (
                <span style={{ color: '#64748b', fontSize: '0.7rem' }}>+{(job.required_skills ?? []).length - 4}</span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid #1e2d4a' }}>
            <span style={{ color: '#64748b', fontSize: '0.75rem' }}>👥 {job.candidate_count || 0} candidates</span>
            <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{new Date(job.created_at).toLocaleDateString()}</span>
          </div>

          {((job.teams ?? []).length > 0 || job.creator) && (
            <div style={{ marginTop: '0.625rem', display: 'flex', flexWrap: 'wrap', gap: '0.375rem', alignItems: 'center' }}>
              {(job.teams ?? []).map(t => (
                <span key={t.id} style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.68rem', background: 'rgba(56,189,248,0.08)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.2)' }}>
                  🏢 {t.name}
                </span>
              ))}
              {job.creator && (
                <span style={{ fontSize: '0.68rem', color: '#475569', marginLeft: 'auto' }}>
                  by {job.creator.name || job.creator.email}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
