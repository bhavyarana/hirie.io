'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { talentPoolApi, type TalentPoolCandidate } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import Link from 'next/link';

// ─── Constants ───────────────────────────────────────────────────────────────

const DATE_RANGE_OPTIONS = [
  { value: '', label: 'All Time' },
  { value: 'last_24h', label: 'Last 24 Hours' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'custom', label: 'Custom Month / Year' },
] as const;

const MONTHS = [
  { v: 1, l: 'January' }, { v: 2, l: 'February' }, { v: 3, l: 'March' },
  { v: 4, l: 'April' }, { v: 5, l: 'May' }, { v: 6, l: 'June' },
  { v: 7, l: 'July' }, { v: 8, l: 'August' }, { v: 9, l: 'September' },
  { v: 10, l: 'October' }, { v: 11, l: 'November' }, { v: 12, l: 'December' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

// ─── Sub-components ───────────────────────────────────────────────────────────

// ─── Highlight helper (matches jobs page style) ──────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{
        background: 'rgba(99,102,241,0.3)', color: 'var(--text-primary)',
        borderRadius: '2px', padding: '0 1px',
      }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function SkillChip({ label, query }: { label: string; query?: string }) {
  return (
    <span style={{
      padding: '0.18rem 0.55rem', borderRadius: '4px', fontSize: '0.69rem', fontWeight: 500,
      background: 'rgba(99,102,241,0.12)', color: '#a5b4fc',
      border: '1px solid rgba(99,102,241,0.22)', whiteSpace: 'nowrap',
    }}>
      {query ? <Highlight text={label} query={query} /> : label}
    </span>
  );
}

function Avatar({ name, email }: { name: string | null; email: string | null }) {
  const initials = ((name || email || '?').slice(0, 2)).toUpperCase();
  return (
    <div style={{
      width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: '0.875rem', fontWeight: 700,
    }}>
      {initials}
    </div>
  );
}

function CandidateCard({ c, query, locationQuery }: { c: TalentPoolCandidate; query?: string; locationQuery?: string }) {
  const topSkills = (c.extracted_skills || []).slice(0, 5);
  const topTitles = (c.extracted_titles || []).slice(0, 2);
  const since = new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div
      style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem',
        padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.45)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 24px rgba(99,102,241,0.08)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start' }}>
        <Avatar name={c.name} email={c.email} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.925rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {query ? <Highlight text={c.name || '(Name Pending)'} query={query} /> : (c.name || '(Name Pending)')}
          </p>
          {topTitles.length > 0 && (
            <p style={{ color: '#6366f1', fontSize: '0.77rem', fontWeight: 500, marginTop: '0.1rem' }}>
              {topTitles.map((t, i) => (
                <span key={t}>
                  {i > 0 && ' · '}
                  {query ? <Highlight text={t} query={query} /> : t}
                </span>
              ))}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
            {c.experience_years != null && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>⏱ {c.experience_years}yr exp</span>
            )}
            {c.current_location && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                📍 {locationQuery ? <Highlight text={c.current_location} query={locationQuery} /> : c.current_location}
              </span>
            )}
            {c.first_seen_job_title && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                💼 {query ? <Highlight text={c.first_seen_job_title} query={query} /> : c.first_seen_job_title}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Skills */}
      {topSkills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
          {topSkills.map(s => <SkillChip key={s} label={s} query={query} />)}
          {c.extracted_skills.length > 5 && (
            <span style={{ color: '#475569', fontSize: '0.7rem', alignSelf: 'center' }}>+{c.extracted_skills.length - 5} more</span>
          )}
        </div>
      )}

      {/* Footer: uploader + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
          {c.uploaded_by_name ? `👤 ${c.uploaded_by_name}` : '👤 Unknown'}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>🗓 {since}</span>
      </div>

      {/* View button */}
      <Link
        href={`/dashboard/talent-pool/${c.id}`}
        style={{
          display: 'block', textAlign: 'center', padding: '0.45rem',
          borderRadius: '0.5rem', background: 'rgba(99,102,241,0.1)',
          border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc',
          fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', transition: 'background 0.15s',
        }}
      >
        View Profile →
      </Link>
    </div>
  );
}

// ─── Select styles (reused) ────────────────────────────────────────────────

const SELECT_STYLE: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0.5rem',
  padding: '0.4rem 0.65rem', color: 'var(--text-primary)', fontSize: '0.8rem',
  outline: 'none', cursor: 'pointer',
};

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0.5rem',
  padding: '0.4rem 0.65rem', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none',
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TalentPoolPage() {
  const { role } = useUserContext();

  // ── Filter state ──
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [location, setLocation] = useState('');
  const [debouncedLocation, setDebouncedLocation] = useState('');
  const [uploadedBy, setUploadedBy] = useState('');
  const [dateRange, setDateRange] = useState<'last_24h' | 'last_week' | 'last_month' | 'custom' | ''>('');
  const [customYear, setCustomYear] = useState<number>(CURRENT_YEAR);
  const [customMonth, setCustomMonth] = useState<number | ''>('');
  const [minExp, setMinExp] = useState('');
  const [maxExp, setMaxExp] = useState('');
  const [page, setPage] = useState(1);

  // ── Debounce text inputs ──
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQuery(query); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedLocation(location); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [location]);

  const resetFilters = useCallback(() => {
    setQuery(''); setDebouncedQuery('');
    setLocation(''); setDebouncedLocation('');
    setUploadedBy(''); setDateRange('');
    setCustomYear(CURRENT_YEAR); setCustomMonth('');
    setMinExp(''); setMaxExp(''); setPage(1);
  }, []);

  const hasFilters = !!(debouncedQuery || debouncedLocation || uploadedBy || dateRange || minExp || maxExp);

  // Fetch distinct uploaders from talent pool (works for all roles)
  const { data: uploadersData } = useQuery({
    queryKey: ['talent-pool-uploaders'],
    queryFn: () => talentPoolApi.getUploaders(),
    staleTime: 300_000,
  });
  const uploaders = uploadersData?.uploaders ?? [];

  // ── Talent pool data ──
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['talent-pool', debouncedQuery, debouncedLocation, uploadedBy, dateRange, customYear, customMonth, minExp, maxExp, page],
    queryFn: () => talentPoolApi.list({
      q: debouncedQuery || undefined,
      location: debouncedLocation || undefined,
      uploaded_by: uploadedBy || undefined,
      date_range: (dateRange as 'last_24h' | 'last_week' | 'last_month' | 'custom') || undefined,
      year: dateRange === 'custom' ? customYear : undefined,
      month: dateRange === 'custom' && customMonth !== '' ? customMonth : undefined,
      min_exp: minExp ? parseFloat(minExp) : undefined,
      max_exp: maxExp ? parseFloat(maxExp) : undefined,
      page,
      limit: 24,
    }),
    staleTime: 30_000,
  });

  const candidates = data?.candidates ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 24);

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px' }}>

      {/* ── Page Header ── */}
      <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            🔍 Talent Pool
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Browse all candidates across every job — independent of job status
          </p>
        </div>
        <div style={{
          padding: '0.4rem 1rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600,
          background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)',
        }}>
          {isFetching ? 'Searching…' : `${total.toLocaleString()} candidate${total !== 1 ? 's' : ''}`}
        </div>
      </div>

      {/* ── Search Bar ── */}
      <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
        <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '1rem', pointerEvents: 'none' }}>
          🔍
        </span>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, skill (e.g. React, Python) or title…"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '0.875rem 1rem 0.875rem 2.75rem',
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0.75rem',
            color: 'var(--text-primary)', fontSize: '0.925rem', outline: 'none', transition: 'border-color 0.2s',
          }}
          onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(99,102,241,0.5)'}
          onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
        />
      </div>

      {/* ── Filters Row ── */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0.875rem',
        padding: '1rem 1.25rem', marginBottom: '1.5rem',
        display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end',
      }}>

        {/* Location */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Location</label>
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="e.g. Bangalore, Remote"
            style={{ ...INPUT_STYLE, width: '160px' }}
          />
        </div>

        {/* Date Range */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Uploaded When</label>
          <select value={dateRange} onChange={e => { setDateRange(e.target.value as typeof dateRange); setPage(1); }} style={SELECT_STYLE}>
            {DATE_RANGE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Custom month + year (only when dateRange === 'custom') */}
        {dateRange === 'custom' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Month</label>
              <select value={customMonth} onChange={e => { setCustomMonth(e.target.value === '' ? '' : parseInt(e.target.value)); setPage(1); }} style={SELECT_STYLE}>
                <option value="">Any Month</option>
                {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Year</label>
              <select value={customYear} onChange={e => { setCustomYear(parseInt(e.target.value)); setPage(1); }} style={SELECT_STYLE}>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </>
        )}

        {/* Uploaded By */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Uploaded By</label>
          <select value={uploadedBy} onChange={e => { setUploadedBy(e.target.value); setPage(1); }} style={{ ...SELECT_STYLE, maxWidth: '180px' }}>
            <option value="">All Users</option>
            {uploaders.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        {/* Experience range */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Exp (Years)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <input type="number" min={0} max={50} placeholder="Min" value={minExp}
              onChange={e => { setMinExp(e.target.value); setPage(1); }}
              style={{ ...INPUT_STYLE, width: '62px', textAlign: 'center' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>–</span>
            <input type="number" min={0} max={50} placeholder="Max" value={maxExp}
              onChange={e => { setMaxExp(e.target.value); setPage(1); }}
              style={{ ...INPUT_STYLE, width: '62px', textAlign: 'center' }} />
          </div>
        </div>

        {/* Clear button */}
        {hasFilters && (
          <button onClick={resetFilters} style={{
            padding: '0.42rem 1rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 500,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)',
            color: '#f87171', cursor: 'pointer', alignSelf: 'flex-end',
          }}>
            ✕ Clear filters
          </button>
        )}
      </div>

      {/* ── Results Grid ── */}
      {isLoading ? (
        <div style={{ padding: '5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⏳</div>
          <p style={{ fontSize: '0.9rem' }}>Loading talent pool…</p>
        </div>
      ) : candidates.length === 0 ? (
        <div style={{
          padding: '5rem', textAlign: 'center', color: 'var(--text-muted)',
          background: 'var(--bg-card)', borderRadius: '1rem', border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🔍</div>
          <p style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>No candidates found</p>
          <p style={{ fontSize: '0.85rem' }}>
            {hasFilters ? 'Try adjusting your filters or search term' : 'Upload resumes to jobs to populate the talent pool'}
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}>
          {candidates.map(c => <CandidateCard key={c.id} c={c} query={debouncedQuery || undefined} locationQuery={debouncedLocation || undefined} />)}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.375rem', marginTop: '1rem' }}>
          <PaginationBtn label="← Prev" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} />
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
            return p >= 1 && p <= totalPages ? (
              <PaginationBtn key={p} label={String(p)} onClick={() => setPage(p)} active={p === page} />
            ) : null;
          })}
          <PaginationBtn label="Next →" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} />
        </div>
      )}
    </div>
  );
}

// ── Small pagination button component ──
function PaginationBtn({ label, onClick, disabled, active }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '0.4rem 0.8rem', borderRadius: '0.5rem', minWidth: '36px',
        background: active ? '#6366f1' : 'var(--bg-card)',
        border: `1px solid ${active ? '#6366f1' : 'var(--border)'}`,
        color: disabled ? 'var(--text-muted)' : active ? '#fff' : 'var(--text-secondary)',
        cursor: disabled ? 'default' : 'pointer', fontSize: '0.8rem', fontWeight: active ? 700 : 400,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}
