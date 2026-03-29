'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { submissionsApi, SubmissionJobDetail } from '@/lib/api';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid,
} from 'recharts';

const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem',
  padding: '1.25rem 1.5rem', ...extra,
});

const CHART_TOOLTIP: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: '8px', color: 'var(--text-primary)',
};

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

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span style={{ color: 'var(--text-faint)', fontSize: '0.75rem' }}>—</span>;
  const color = score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <span style={{
      padding: '0.15rem 0.55rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700,
      background: `${color}18`, color, border: `1px solid ${color}40`,
    }}>{Number(score).toFixed(1)}</span>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '420px' }}>
        <thead>
          <tr style={{ background: 'var(--table-header-bg, rgba(0,0,0,0.04))' }}>
            {headers.map(h => (
              <th key={h} style={{ padding: '0.6rem 1rem', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.8rem' }}>No data</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '0.7rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const dateFrom = searchParams.get('date_from') || '';
  const dateTo = searchParams.get('date_to') || '';
  const params = dateFrom || dateTo ? { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined } : undefined;

  const { data, isLoading, error } = useQuery<SubmissionJobDetail>({
    queryKey: ['submission-job-detail', id, dateFrom, dateTo],
    queryFn: () => submissionsApi.jobDetail(id, params),
    enabled: !!id,
    staleTime: 30_000,
  });

  const backUrl = `/dashboard/track-submissions${dateFrom || dateTo ? `?date_from=${dateFrom}&date_to=${dateTo}` : ''}`;

  if (isLoading) return (
    <div style={{ padding: '2rem', color: 'var(--text-muted)', textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>Loading job detail…
    </div>
  );

  if (error || !data) return (
    <div style={{ padding: '2rem', color: '#ef4444', textAlign: 'center' }}>
      Failed to load job data.{' '}
      <Link href={backUrl} style={{ color: '#6366f1', textDecoration: 'none' }}>Go back</Link>
    </div>
  );

  const { job, kpis, recruiters, candidates, timeline } = data;

  // Recruiter bar chart
  const recruiterChartData = recruiters.slice(0, 8).map(r => ({
    name: (r.name || '?').split(' ')[0],
    submissions: r.submission_count,
  }));

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px' }}>
      {/* Back */}
      <Link href={backUrl} style={{ color: '#6366f1', fontSize: '0.82rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginBottom: '1.5rem' }}>
        ← Back to Track Submissions
      </Link>

      {/* Header */}
      <div style={{ marginBottom: '1.75rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{
          width: '56px', height: '56px', borderRadius: '0.875rem',
          background: 'linear-gradient(135deg,#22c55e,#16a34a)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.5rem', flexShrink: 0,
        }}>💼</div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{job.title}</h1>
            <span style={{
              fontSize: '0.68rem', padding: '0.1rem 0.5rem', borderRadius: '999px', fontWeight: 700,
              background: job.status === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)',
              color: job.status === 'active' ? '#22c55e' : '#64748b',
              border: `1px solid ${job.status === 'active' ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
            }}>{job.status}</span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            {job.company}
            <span style={{ marginLeft: '0.75rem', color: 'var(--text-faint)', fontSize: '0.72rem' }}>
              Created {new Date(job.created_at).toLocaleDateString()}
            </span>
          </p>
          {(dateFrom || dateTo) && (
            <p style={{ color: 'var(--text-faint)', fontSize: '0.72rem', marginTop: '0.15rem' }}>
              Period: {dateFrom || '—'} → {dateTo || '—'}
            </p>
          )}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Link
            href={`/dashboard/jobs/${job.id}`}
            style={{
              padding: '0.45rem 1rem', borderRadius: '0.5rem', fontSize: '0.78rem', fontWeight: 600,
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
              color: '#6366f1', textDecoration: 'none',
            }}
          >View Job →</Link>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
        <KpiCard icon="✅" label="Total Submissions" value={kpis.total_submissions} color="#22c55e" sub="Pass resumes only" />
        <KpiCard icon="🧑‍💻" label="Recruiters Active" value={kpis.recruiter_count} color="#6366f1" />
        <KpiCard icon="⭐" label="Avg Score" value={kpis.avg_score || '—'} color="#f59e0b" />
      </div>

      {/* Timeline + Recruiter chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.75rem' }}>
        <div style={card()}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>📈 Submission Timeline</p>
          {timeline.length === 0 ? (
            <p style={{ color: 'var(--text-faint)', fontSize: '0.8rem' }}>No data in range.</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={timeline} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="green-grad-job" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v) => [v, 'Passes']} />
                <Area type="monotone" dataKey="count" stroke="#22c55e" fill="url(#green-grad-job)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={card()}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>🧑‍💻 Passes by Recruiter</p>
          {recruiterChartData.length === 0 ? (
            <p style={{ color: 'var(--text-faint)', fontSize: '0.8rem' }}>No submissions yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={recruiterChartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={CHART_TOOLTIP} />
                <Bar dataKey="submissions" fill="#22c55e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recruiters table */}
      <div style={{ ...card(), marginBottom: '1.5rem' }}>
        <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '1rem' }}>🧑‍💻 Assigned Recruiters</p>
        <DataTable
          headers={['Recruiter', 'Email', 'Submissions', 'Avg Score']}
          rows={recruiters.map(r => [
            <Link key={r.id} href={`/dashboard/track-submissions/recruiter/${r.id}${dateFrom || dateTo ? `?date_from=${dateFrom}&date_to=${dateTo}` : ''}`}
              style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>{r.name}</Link>,
            <span key="e" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{r.email || '—'}</span>,
            <span key="c" style={{ color: '#22c55e', fontWeight: 700 }}>{r.submission_count}</span>,
            <ScoreBadge key="s" score={r.avg_score} />,
          ])}
        />
      </div>

      {/* Candidates table */}
      <div style={card()}>
        <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '1rem' }}>✅ Passed Candidates</p>
        <DataTable
          headers={['Candidate', 'Email', 'Recruiter', 'Score', 'Submitted At']}
          rows={candidates.map(c => [
            <Link key={c.id} href={`/dashboard/candidates/${c.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>{c.name}</Link>,
            <span key="e" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{c.email || '—'}</span>,
            <span key="r" style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{c.recruiter_name}</span>,
            <ScoreBadge key="s" score={c.score} />,
            new Date(c.submitted_at).toLocaleDateString(),
          ])}
        />
      </div>
    </div>
  );
}
