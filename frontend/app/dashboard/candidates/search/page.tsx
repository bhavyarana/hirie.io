'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { candidatesApi, type CandidateSearchResult } from '@/lib/api';
import Link from 'next/link';

const SCORE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  pass:   { bg: 'rgba(34,197,94,0.1)',  text: '#22c55e', border: 'rgba(34,197,94,0.3)' },
  review: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  fail:   { bg: 'rgba(239,68,68,0.1)',  text: '#ef4444', border: 'rgba(239,68,68,0.3)' },
};

function ScoreBadge({ status, score }: { status: string | null; score: number | null }) {
  if (!status) return <span style={{ color: '#64748b', fontSize: '0.75rem' }}>—</span>;
  const s = SCORE_COLORS[status] || SCORE_COLORS.review;
  return (
    <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      {score != null ? `${Math.round(score)} · ` : ''}{status}
    </span>
  );
}

function SkillChip({ label }: { label: string }) {
  return (
    <span style={{ padding: '0.18rem 0.6rem', borderRadius: '4px', fontSize: '0.7rem', background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.22)', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function CandidateCard({ c }: { c: CandidateSearchResult }) {
  const initials = (c.name || c.email || '?').slice(0, 2).toUpperCase();
  const topSkills = c.extracted_skills.slice(0, 6);
  const topTitles = c.extracted_titles.slice(0, 2);

  return (
    <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem', transition: 'border-color 0.2s' }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.4)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#1e2d4a'}>

      {/* Header */}
      <div style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.875rem', fontWeight: 700, flexShrink: 0 }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
            <p style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.925rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.name || '(No Name)'}
            </p>
            <ScoreBadge status={c.score_status} score={c.score} />
          </div>
          {topTitles.length > 0 && (
            <p style={{ color: '#6366f1', fontSize: '0.775rem', fontWeight: 500, marginTop: '0.1rem' }}>
              {topTitles.join(' · ')}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.875rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
            {c.experience_years != null && (
              <span style={{ color: '#64748b', fontSize: '0.72rem' }}>⏱ {c.experience_years}yr exp</span>
            )}
            {c.current_location && (
              <span style={{ color: '#64748b', fontSize: '0.72rem' }}>📍 {c.current_location}</span>
            )}
            {c.job && (
              <span style={{ color: '#475569', fontSize: '0.72rem' }}>💼 {c.job.job_title} @ {c.job.company_name}</span>
            )}
          </div>
        </div>
      </div>

      {/* Skills */}
      {topSkills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
          {topSkills.map(s => <SkillChip key={s} label={s} />)}
          {c.extracted_skills.length > 6 && (
            <span style={{ color: '#475569', fontSize: '0.7rem', alignSelf: 'center' }}>+{c.extracted_skills.length - 6} more</span>
          )}
        </div>
      )}

      {/* Summary */}
      {c.summary && (
        <p style={{ color: '#64748b', fontSize: '0.78rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {c.summary}
        </p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
        <Link href={`/dashboard/candidates/${c.id}`}
          style={{ flex: 1, padding: '0.4rem 0', borderRadius: '0.5rem', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc', fontSize: '0.78rem', fontWeight: 600, textAlign: 'center', textDecoration: 'none' }}>
          View Profile
        </Link>
      </div>
    </div>
  );
}

export default function TalentPoolPage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [minExp, setMinExp] = useState('');
  const [maxExp, setMaxExp] = useState('');
  const [scoreStatus, setScoreStatus] = useState('');
  const [page, setPage] = useState(1);

  // Debounce search query by 400ms
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQuery(query); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [query]);

  const resetFilters = useCallback(() => {
    setMinExp(''); setMaxExp(''); setScoreStatus(''); setPage(1);
  }, []);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['candidate-search', debouncedQuery, minExp, maxExp, scoreStatus, page],
    queryFn: () => candidatesApi.search({
      q: debouncedQuery || undefined,
      minExp: minExp ? parseFloat(minExp) : undefined,
      maxExp: maxExp ? parseFloat(maxExp) : undefined,
      scoreStatus: scoreStatus || undefined,
      page,
      limit: 24,
    }),
    staleTime: 30_000,
  });

  const candidates = data?.candidates ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 24);
  const hasFilters = !!(debouncedQuery || minExp || maxExp || scoreStatus);

  return (
    <div style={{ padding: '2rem', maxWidth: '1300px' }}>
      {/* Page header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.25rem' }}>🔍 Talent Pool</h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Search and discover candidates from your database</p>
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
        <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: '1rem', pointerEvents: 'none' }}>🔍</span>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, skill (e.g. React, Python, Product Manager)…"
          style={{ width: '100%', padding: '0.875rem 1rem 0.875rem 2.75rem', background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '0.75rem', color: '#e2e8f0', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.2s' }}
          onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(99,102,241,0.5)'}
          onBlur={e => (e.target as HTMLInputElement).style.borderColor = '#1e2d4a'}
        />
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'center' }}>
        {/* Score status filter */}
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          {[{ v: '', l: 'All' }, { v: 'pass', l: '✅ Pass' }, { v: 'review', l: '🟡 Review' }, { v: 'fail', l: '❌ Fail' }].map(({ v, l }) => (
            <button key={v} onClick={() => { setScoreStatus(v); setPage(1); }} style={{
              padding: '0.375rem 0.875rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', border: 'none',
              background: scoreStatus === v ? '#6366f1' : '#0d1526',
              color: scoreStatus === v ? '#fff' : '#64748b',
              outline: `1px solid ${scoreStatus === v ? '#6366f1' : '#1e2d4a'}`,
            }}>
              {l}
            </button>
          ))}
        </div>

        {/* Experience range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Exp:</span>
          <input type="number" min={0} max={50} placeholder="Min yr" value={minExp} onChange={e => { setMinExp(e.target.value); setPage(1); }}
            style={{ width: '75px', padding: '0.35rem 0.5rem', background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '0.375rem', color: '#e2e8f0', fontSize: '0.78rem', textAlign: 'center' }} />
          <span style={{ color: '#475569', fontSize: '0.75rem' }}>–</span>
          <input type="number" min={0} max={50} placeholder="Max yr" value={maxExp} onChange={e => { setMaxExp(e.target.value); setPage(1); }}
            style={{ width: '75px', padding: '0.35rem 0.5rem', background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '0.375rem', color: '#e2e8f0', fontSize: '0.78rem', textAlign: 'center' }} />
        </div>

        {hasFilters && (
          <button onClick={resetFilters} style={{ padding: '0.35rem 0.875rem', borderRadius: '999px', fontSize: '0.75rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', cursor: 'pointer' }}>
            ✕ Clear filters
          </button>
        )}

        {/* Result count */}
        <span style={{ marginLeft: 'auto', color: '#475569', fontSize: '0.775rem' }}>
          {isFetching ? 'Searching…' : `${total} candidate${total !== 1 ? 's' : ''} found`}
        </span>
      </div>

      {/* Results grid */}
      {isLoading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⏳</div>
          <p>Searching talent pool…</p>
        </div>
      ) : candidates.length === 0 ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#475569', background: '#0d1526', borderRadius: '1rem', border: '1px solid #1e2d4a' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🔍</div>
          <p style={{ fontWeight: 600, color: '#64748b', marginBottom: '0.5rem' }}>No candidates found</p>
          <p style={{ fontSize: '0.85rem' }}>
            {hasFilters ? 'Try adjusting your search or clearing filters' : 'Upload resumes to jobs to populate the talent pool'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {candidates.map(c => <CandidateCard key={c.id} c={c} />)}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.375rem', marginTop: '0.5rem' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '0.4rem 0.875rem', borderRadius: '0.5rem', background: '#0d1526', border: '1px solid #1e2d4a', color: page === 1 ? '#475569' : '#94a3b8', cursor: page === 1 ? 'default' : 'pointer', fontSize: '0.8rem' }}>
            ← Prev
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = page <= 4 ? i + 1
              : page >= totalPages - 3 ? totalPages - 6 + i
              : page - 3 + i;
            return p >= 1 && p <= totalPages ? (
              <button key={p} onClick={() => setPage(p)}
                style={{ padding: '0.4rem 0.75rem', borderRadius: '0.5rem', background: p === page ? '#6366f1' : '#0d1526', border: `1px solid ${p === page ? '#6366f1' : '#1e2d4a'}`, color: p === page ? '#fff' : '#64748b', cursor: 'pointer', fontSize: '0.8rem', minWidth: '36px' }}>
                {p}
              </button>
            ) : null;
          })}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: '0.4rem 0.875rem', borderRadius: '0.5rem', background: '#0d1526', border: '1px solid #1e2d4a', color: page === totalPages ? '#475569' : '#94a3b8', cursor: page === totalPages ? 'default' : 'pointer', fontSize: '0.8rem' }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
