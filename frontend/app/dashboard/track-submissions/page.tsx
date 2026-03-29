'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  submissionsApi,
  SubmissionRecruiter,
  SubmissionTeam,
  SubmissionJob,
  SubmissionSummary,
} from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

// ── Shared style helpers ─────────────────────────────────────────────────────
const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '1rem',
  padding: '1.25rem 1.5rem',
  ...extra,
});

const CHART_TOOLTIP: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
};

type Tab = 'recruiter' | 'team' | 'job';

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = '#6366f1', icon }: {
  label: string; value: string | number; sub?: string; color?: string; icon: string;
}) {
  return (
    <div style={card()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>{label}</p>
          <p style={{ color, fontSize: '1.875rem', fontWeight: 800, lineHeight: 1 }}>{value}</p>
          {sub && <p style={{ color: 'var(--text-faint)', fontSize: '0.7rem', marginTop: '0.3rem' }}>{sub}</p>}
        </div>
        <span style={{ fontSize: '1.5rem', opacity: 0.7 }}>{icon}</span>
      </div>
    </div>
  );
}

// ── Score badge ───────────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <span style={{
      padding: '0.15rem 0.55rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700,
      background: `${color}18`, color, border: `1px solid ${color}40`,
    }}>{score.toFixed(1)}</span>
  );
}

// ── Date filter bar ────────────────────────────────────────────────────────────
function DateFilterBar({ dateFrom, dateTo, onChange }: {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
}) {
  const presets = [
    { label: 'Today', days: 0 },
    { label: '7 Days', days: 7 },
    { label: '30 Days', days: 30 },
    { label: '90 Days', days: 90 },
  ];

  function applyPreset(days: number) {
    const to = new Date();
    const from = new Date();
    if (days > 0) from.setDate(from.getDate() - days);
    onChange(from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
  }

  return (
    <div style={{
      ...card(),
      display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem',
      padding: '0.875rem 1.25rem',
    }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>📅 Date Range</span>

      {/* Preset buttons */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {presets.map(p => (
          <button
            key={p.label}
            onClick={() => applyPreset(p.days)}
            style={{
              padding: '0.3rem 0.75rem', borderRadius: '999px', border: '1px solid var(--border)',
              fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
              background: 'transparent', color: 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = '#6366f1';
              (e.currentTarget as HTMLButtonElement).style.color = '#fff';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366f1';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
            }}
          >{p.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="date"
          value={dateFrom}
          onChange={e => onChange(e.target.value, dateTo)}
          style={{
            background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '0.5rem',
            padding: '0.3rem 0.6rem', color: 'var(--text-primary)', fontSize: '0.78rem',
          }}
        />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>→</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => onChange(dateFrom, e.target.value)}
          style={{
            background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '0.5rem',
            padding: '0.3rem 0.6rem', color: 'var(--text-primary)', fontSize: '0.78rem',
          }}
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => onChange('', '')}
            style={{
              padding: '0.3rem 0.6rem', borderRadius: '0.4rem', border: '1px solid rgba(239,68,68,0.3)',
              fontSize: '0.72rem', cursor: 'pointer', background: 'rgba(239,68,68,0.07)', color: '#ef4444',
            }}
          >Clear</button>
        )}
      </div>
    </div>
  );
}

// ── Timeline mini chart ───────────────────────────────────────────────────────
function TimelineChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data.length) return (
    <p style={{ color: 'var(--text-faint)', fontSize: '0.8rem', textAlign: 'center', padding: '2rem 0' }}>No submission data in this range.</p>
  );
  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
          tickFormatter={v => v.slice(5)} />
        <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} allowDecimals={false} />
        <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v) => [v, 'Submissions']} labelFormatter={l => `Date: ${l}`} />
        <Bar dataKey="count" radius={[3, 3, 0, 0]} fill="#6366f1" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Shimmer skeleton ───────────────────────────────────────────────────────────
function Skeleton({ h = 80 }: { h?: number }) {
  return (
    <div style={{
      height: h, borderRadius: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border)',
      opacity: 0.6, animation: 'pulse 1.5s ease-in-out infinite',
    }} />
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ msg = 'No submissions found in the selected date range.' }: { msg?: string }) {
  return (
    <div style={{
      padding: '4rem', textAlign: 'center', background: 'var(--bg-card)',
      border: '1px solid var(--border)', borderRadius: '1rem',
    }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📭</div>
      <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{msg}</p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.3rem' }}>
        Only "Pass" resumes count as submissions. Try widening the date range.
      </p>
    </div>
  );
}

// ── By Recruiter list ─────────────────────────────────────────────────────────
function RecruiterList({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const params = dateFrom || dateTo ? { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined } : undefined;
  const { data, isLoading } = useQuery({
    queryKey: ['submissions-by-recruiter', dateFrom, dateTo],
    queryFn: () => submissionsApi.byRecruiter(params),
    staleTime: 30_000,
  });
  const recruiters = data?.recruiters ?? [];

  if (isLoading) return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {[1, 2, 3].map(i => <Skeleton key={i} h={90} />)}
    </div>
  );

  if (!recruiters.length) return <EmptyState />;

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {recruiters.map((r: SubmissionRecruiter, idx: number) => (
        <div key={r.id} style={{
          ...card({ padding: '1rem 1.25rem' }),
          display: 'flex', alignItems: 'center', gap: '1rem',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.4)';
            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(99,102,241,0.07)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
            (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
          }}>
          {/* Rank badge */}
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
            background: idx === 0 ? 'linear-gradient(135deg,#f59e0b,#fbbf24)' : idx === 1 ? 'linear-gradient(135deg,#94a3b8,#cbd5e1)' : idx === 2 ? 'linear-gradient(135deg,#d97706,#f59e0b)' : 'rgba(99,102,241,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: idx < 3 ? '#fff' : '#6366f1', fontWeight: 700, fontSize: '0.8rem',
          }}>
            {idx < 3 ? ['🥇', '🥈', '🥉'][idx] : `#${idx + 1}`}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem' }}>{r.name}</p>
            {r.email && <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{r.email}</p>}
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#22c55e', fontWeight: 800, fontSize: '1.2rem', lineHeight: 1 }}>{r.submission_count}</p>
              <p style={{ color: 'var(--text-faint)', fontSize: '0.65rem', marginTop: '0.15rem' }}>Passes</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#6366f1', fontWeight: 700, fontSize: '0.9rem' }}>{r.job_count}</p>
              <p style={{ color: 'var(--text-faint)', fontSize: '0.65rem' }}>Jobs</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <ScoreBadge score={r.avg_score} />
              <p style={{ color: 'var(--text-faint)', fontSize: '0.65rem', marginTop: '0.15rem' }}>Avg Score</p>
            </div>
            <Link
              href={`/dashboard/track-submissions/recruiter/${r.id}${dateFrom || dateTo ? `?date_from=${dateFrom}&date_to=${dateTo}` : ''}`}
              style={{
                padding: '0.4rem 1rem', borderRadius: '0.5rem', fontSize: '0.78rem', fontWeight: 600,
                background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
                color: '#6366f1', textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >View Details →</Link>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── By Team list ──────────────────────────────────────────────────────────────
function TeamList({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const params = dateFrom || dateTo ? { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined } : undefined;
  const { data, isLoading } = useQuery({
    queryKey: ['submissions-by-team', dateFrom, dateTo],
    queryFn: () => submissionsApi.byTeam(params),
    staleTime: 30_000,
  });
  const teams = data?.teams ?? [];

  if (isLoading) return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {[1, 2, 3].map(i => <Skeleton key={i} h={90} />)}
    </div>
  );

  if (!teams.length) return <EmptyState />;

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {teams.map((t: SubmissionTeam) => (
        <div key={t.id} style={{
          ...card({ padding: '1rem 1.25rem' }),
          display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(6,182,212,0.4)';
            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(6,182,212,0.07)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
            (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
          }}>
          <div style={{
            width: '40px', height: '40px', flexShrink: 0, borderRadius: '0.75rem',
            background: 'linear-gradient(135deg,#06b6d4,#0891b2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem',
          }}>🏢</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem' }}>{t.name}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
              Manager: {t.manager} · TL: {t.tl} · {t.member_count} members
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#22c55e', fontWeight: 800, fontSize: '1.2rem', lineHeight: 1 }}>{t.submission_count}</p>
              <p style={{ color: 'var(--text-faint)', fontSize: '0.65rem', marginTop: '0.15rem' }}>Passes</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#06b6d4', fontWeight: 700, fontSize: '0.9rem' }}>{t.job_count}</p>
              <p style={{ color: 'var(--text-faint)', fontSize: '0.65rem' }}>Jobs</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <ScoreBadge score={t.avg_score} />
              <p style={{ color: 'var(--text-faint)', fontSize: '0.65rem', marginTop: '0.15rem' }}>Avg Score</p>
            </div>
            <Link
              href={`/dashboard/track-submissions/team/${t.id}${dateFrom || dateTo ? `?date_from=${dateFrom}&date_to=${dateTo}` : ''}`}
              style={{
                padding: '0.4rem 1rem', borderRadius: '0.5rem', fontSize: '0.78rem', fontWeight: 600,
                background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.25)',
                color: '#06b6d4', textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >View Details →</Link>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── By Job list ───────────────────────────────────────────────────────────────
function JobList({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const params = dateFrom || dateTo ? { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined } : undefined;
  const { data, isLoading } = useQuery({
    queryKey: ['submissions-by-job', dateFrom, dateTo],
    queryFn: () => submissionsApi.byJob(params),
    staleTime: 30_000,
  });
  const jobs = data?.jobs ?? [];

  if (isLoading) return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {[1, 2, 3].map(i => <Skeleton key={i} h={90} />)}
    </div>
  );

  if (!jobs.length) return <EmptyState />;

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {jobs.map((j: SubmissionJob) => (
        <div key={j.id} style={{
          ...card({ padding: '1rem 1.25rem' }),
          display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(34,197,94,0.4)';
            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(34,197,94,0.07)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
            (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
          }}>
          <div style={{
            width: '40px', height: '40px', flexShrink: 0, borderRadius: '0.75rem',
            background: 'linear-gradient(135deg,#22c55e,#16a34a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem',
          }}>💼</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem' }}>{j.title}</p>
              <span style={{
                fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', fontWeight: 600,
                background: j.status === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)',
                color: j.status === 'active' ? '#22c55e' : '#64748b',
                border: `1px solid ${j.status === 'active' ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
              }}>{j.status}</span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{j.company} · {j.recruiter_count} recruiter{j.recruiter_count !== 1 ? 's' : ''}</p>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#22c55e', fontWeight: 800, fontSize: '1.2rem', lineHeight: 1 }}>{j.submission_count}</p>
              <p style={{ color: 'var(--text-faint)', fontSize: '0.65rem', marginTop: '0.15rem' }}>Passes</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <ScoreBadge score={j.avg_score} />
              <p style={{ color: 'var(--text-faint)', fontSize: '0.65rem', marginTop: '0.15rem' }}>Avg Score</p>
            </div>
            <Link
              href={`/dashboard/track-submissions/job/${j.id}${dateFrom || dateTo ? `?date_from=${dateFrom}&date_to=${dateTo}` : ''}`}
              style={{
                padding: '0.4rem 1rem', borderRadius: '0.5rem', fontSize: '0.78rem', fontWeight: 600,
                background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
                color: '#22c55e', textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >View Details →</Link>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Summary KPIs ──────────────────────────────────────────────────────────────
function SummarySection({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const params = dateFrom || dateTo ? { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined } : undefined;
  const { data, isLoading } = useQuery<SubmissionSummary>({
    queryKey: ['submissions-summary', dateFrom, dateTo],
    queryFn: () => submissionsApi.summary(params),
    staleTime: 30_000,
  });

  if (isLoading) return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
      {[1, 2, 3, 4].map(i => <Skeleton key={i} h={100} />)}
    </div>
  );

  if (!data) return null;

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <KpiCard icon="✅" label="Total Submissions" value={data.total_submissions} color="#22c55e" sub="Pass-only" />
        <KpiCard icon="💼" label="Active Jobs" value={data.total_jobs} color="#6366f1" />
        <KpiCard icon="🧑‍💻" label="Active Recruiters" value={data.total_recruiters} color="#06b6d4" />
        <KpiCard icon="⭐" label="Avg Score" value={data.avg_score} color="#f59e0b"
          sub={data.top_recruiter ? `Top: ${data.top_recruiter.name}` : undefined} />
      </div>

      {data.timeline.length > 0 && (
        <div style={card({ padding: '1rem 1.25rem' })}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>📈 Submission Timeline</p>
          <TimelineChart data={data.timeline} />
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TrackSubmissionsPage() {
  const { role } = useUserContext();
  const [tab, setTab] = useState<Tab>('recruiter');

  // Default: today
  const todayStr = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);

  const handleDateChange = useCallback((from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'recruiter', label: 'By Recruiter', icon: '🧑‍💻' },
    { id: 'team', label: 'By Team', icon: '🏢' },
    { id: 'job', label: 'By Job', icon: '💼' },
  ];

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          📬 Track Submissions
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.3rem' }}>
          Monitor passed candidate submissions across your {role === 'admin' ? 'platform' : role === 'manager' ? 'teams' : 'team'}.
          <strong style={{ color: '#22c55e', marginLeft: '0.4rem' }}>✅ Pass resumes only</strong>
        </p>
      </div>

      {/* Date filter */}
      <DateFilterBar dateFrom={dateFrom} dateTo={dateTo} onChange={handleDateChange} />

      {/* Summary KPIs + timeline */}
      <SummarySection dateFrom={dateFrom} dateTo={dateTo} />

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: '0.25rem', marginBottom: '1.5rem',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '0.75rem', padding: '0.3rem',
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '0.6rem 1rem', borderRadius: '0.5rem',
              border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              background: tab === t.id ? '#6366f1' : 'transparent',
              color: tab === t.id ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            }}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'recruiter' && <RecruiterList dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === 'team' && <TeamList dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === 'job' && <JobList dateFrom={dateFrom} dateTo={dateTo} />}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
