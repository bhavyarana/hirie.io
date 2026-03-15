'use client';

import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/lib/api';
import { useUserContext } from '@/lib/context/UserContext';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

// ── Shared primitives ────────────────────────────────────────────────────────
const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem',
  padding: '1.25rem 1.5rem', ...extra,
});

function KpiCard({ label, value, sub, color = '#6366f1', icon }: { label: string; value: string | number; sub?: string; color?: string; icon: string }) {
  return (
    <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1.25rem 1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>{label}</p>
          <p style={{ color, fontSize: '1.875rem', fontWeight: 800, lineHeight: 1 }}>{value}</p>
          {sub && <p style={{ color: '#475569', fontSize: '0.72rem', marginTop: '0.3rem' }}>{sub}</p>}
        </div>
        <span style={{ fontSize: '1.5rem', opacity: 0.7 }}>{icon}</span>
      </div>
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h2 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '1.05rem' }}>{title}</h2>
      {sub && <p style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '0.15rem' }}>{sub}</p>}
    </div>
  );
}

function FunnelBar({ pass, review, fail, total }: { pass: number; review: number; fail: number; total: number }) {
  if (!total) return <p style={{ color: '#475569', fontSize: '0.8rem' }}>No scored candidates yet.</p>;
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  return (
    <div>
      <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', height: '14px', marginBottom: '0.75rem' }}>
        <div style={{ width: pct(pass), background: '#22c55e', transition: 'width 0.5s' }} />
        <div style={{ width: pct(review), background: '#f59e0b', transition: 'width 0.5s' }} />
        <div style={{ width: pct(fail), background: '#ef4444', transition: 'width 0.5s' }} />
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' as const }}>
        {[{ label: 'Pass', value: pass, color: '#22c55e' }, { label: 'Review', value: review, color: '#f59e0b' }, { label: 'Fail', value: fail, color: '#ef4444' }].map(s => (
          <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#94a3b8' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: s.color, flexShrink: 0 }} />
            {s.label} <strong style={{ color: s.color }}>{s.value}</strong>
            <span style={{ color: '#475569' }}>({pct(s.value)})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
        <thead>
          <tr style={{ background: 'rgba(30,45,74,0.4)' }}>
            {headers.map(h => (
              <th key={h} style={{ padding: '0.6rem 1rem', textAlign: 'left', color: '#64748b', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} style={{ padding: '2rem', textAlign: 'center', color: '#475569', fontSize: '0.8rem' }}>No data yet</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i} style={{ borderTop: '1px solid #1e2d4a' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontSize: '0.8rem' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PassBadge({ rate }: { rate: number }) {
  const color = rate >= 60 ? '#22c55e' : rate >= 35 ? '#f59e0b' : '#ef4444';
  return <span style={{ color, fontWeight: 700 }}>{rate}%</span>;
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ flex: 1, background: '#1e2d4a', borderRadius: '4px', height: '6px', maxWidth: '80px' }}>
        <div style={{ width: `${score}%`, background: color, height: '100%', borderRadius: '4px', transition: 'width 0.5s' }} />
      </div>
      <span style={{ color, fontWeight: 700, fontSize: '0.8rem' }}>{score}</span>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '4rem', textAlign: 'center', background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
      <p style={{ color: '#94a3b8', fontWeight: 500 }}>{msg}</p>
      <p style={{ color: '#475569', fontSize: '0.78rem', marginTop: '0.4rem' }}>Data will appear here once there are processed candidates.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  ADMIN VIEW
// ════════════════════════════════════════════════════════════════════════════
function AdminAnalytics({ data }: { data: Record<string, unknown> }) {
  const k = data.kpis as Record<string, number>;
  const managerStats = (data.manager_stats as Record<string, unknown>[]) || [];
  const teamStats = (data.team_stats as Record<string, unknown>[]) || [];
  const funnelData = (data.hiring_funnel as { name: string; value: number; color: string }[]) || [];

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <KpiCard icon="🏢" label="Teams" value={k.total_teams} color="#6366f1" />
        <KpiCard icon="👔" label="Managers" value={k.total_managers} color="#8b5cf6" />
        <KpiCard icon="👥" label="TLs" value={k.total_tls} color="#06b6d4" />
        <KpiCard icon="🧑‍💻" label="Recruiters" value={k.total_recruiters} color="#f59e0b" />
        <KpiCard icon="💼" label="Total Jobs" value={k.total_jobs} sub={`${k.active_jobs} active`} color="#22c55e" />
        <KpiCard icon="📄" label="Candidates" value={k.total_candidates} sub={`${k.processed_candidates} processed`} color="#a78bfa" />
        <KpiCard icon="✅" label="Pass Rate" value={`${k.overall_pass_rate}%`} color="#22c55e" />
        <KpiCard icon="⭐" label="Avg Score" value={k.overall_avg_score} color="#f59e0b" />
      </div>

      {/* Funnel + Pie side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem', marginBottom: '2rem', alignItems: 'start' }}>
        <div style={card()}>
          <SectionHeader title="Platform Hiring Funnel" sub="Across all jobs and teams" />
          <FunnelBar pass={k.pass} review={k.review} fail={k.fail} total={k.pass + k.review + k.fail} />
        </div>
        <div style={card()}>
          <SectionHeader title="Outcome Split" />
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={funnelData} dataKey="value" cx="50%" cy="50%" outerRadius={60} label={({ name, value }: { name: string; value: number }) => `${name} ${value}`} labelLine={false} fontSize={11}>
                {funnelData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Manager table */}
      <div style={{ ...card(), marginBottom: '1.5rem' }}>
        <SectionHeader title="👔 Manager Performance" sub="Jobs created, candidates processed, pass rate" />
        <Table
          headers={['Manager', 'Teams', 'Jobs', 'Candidates', 'Pass Rate', 'Avg Score']}
          rows={managerStats.map((m: Record<string, unknown>) => [
            <div key="n"><p style={{ color: '#e2e8f0', fontWeight: 500 }}>{String(m.name)}</p><p style={{ color: '#475569', fontSize: '0.7rem' }}>{String(m.email)}</p></div>,
            String(m.teams_count), String(m.jobs_count), String(m.candidates_total),
            <PassBadge key="pr" rate={m.pass_rate as number} />,
            <ScoreBar key="s" score={m.avg_score as number} />,
          ])}
        />
      </div>

      {/* Team table */}
      <div style={card()}>
        <SectionHeader title="🏢 Team Breakdown" sub="Candidates processed per team" />
        <Table
          headers={['Team', 'Manager', 'TL', 'Candidates', 'Pass Rate', 'Avg Score']}
          rows={teamStats.map((t: Record<string, unknown>) => [
            <strong key="n" style={{ color: '#e2e8f0' }}>{String(t.name)}</strong>,
            String(t.manager), String(t.tl), String(t.candidates_total),
            <PassBadge key="pr" rate={t.pass_rate as number} />,
            <ScoreBar key="s" score={t.avg_score as number} />,
          ])}
        />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  MANAGER VIEW
// ════════════════════════════════════════════════════════════════════════════
function ManagerAnalytics({ data }: { data: Record<string, unknown> }) {
  const k = data.kpis as Record<string, number>;
  const jobStats = (data.job_stats as Record<string, unknown>[]) || [];
  const recruiterStats = (data.recruiter_stats as Record<string, unknown>[]) || [];
  const funnelData = (data.hiring_funnel as { name: string; value: number; color: string }[]) || [];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <KpiCard icon="🏢" label="Teams" value={k.total_teams} color="#6366f1" />
        <KpiCard icon="💼" label="Jobs Created" value={k.total_jobs} sub={`${k.active_jobs} active`} color="#22c55e" />
        <KpiCard icon="📄" label="Candidates" value={k.total_candidates} sub={`${k.processed} scored`} color="#a78bfa" />
        <KpiCard icon="✅" label="Pass Rate" value={`${k.pass_rate}%`} color="#22c55e" />
        <KpiCard icon="⭐" label="Avg Score" value={k.avg_score} color="#f59e0b" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem', marginBottom: '2rem', alignItems: 'start' }}>
        <div style={card()}>
          <SectionHeader title="Hiring Funnel" sub="Across all your jobs" />
          <FunnelBar pass={k.pass} review={k.review} fail={k.fail} total={k.pass + k.review + k.fail} />
          <div style={{ marginTop: '1.5rem', height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: 8 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {funnelData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={card()}>
          <SectionHeader title="Recruiter Leaderboard" sub="By candidates processed" />
          {recruiterStats.slice(0, 5).map((r: Record<string, unknown>, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: i < 4 ? '1px solid #1e2d4a' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#6366f1', fontWeight: 700, fontSize: '0.75rem', width: '18px' }}>#{i + 1}</span>
                <p style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 500 }}>{String(r.name)}</p>
              </div>
              <div style={{ textAlign: 'right' as const }}>
                <p style={{ color: '#a78bfa', fontWeight: 700, fontSize: '0.8rem' }}>{String(r.total)}</p>
                <p style={{ color: '#475569', fontSize: '0.68rem' }}><PassBadge rate={r.pass_rate as number} /> pass</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={card()}>
        <SectionHeader title="📋 Job Performance" sub="Pass rate and avg score per job" />
        <Table
          headers={['Job', 'Status', 'Candidates', 'Pass', 'Review', 'Fail', 'Pass Rate', 'Avg Score']}
          rows={jobStats.map((j: Record<string, unknown>) => [
            <Link key="l" href={`/dashboard/jobs/${j.id}`} style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 500 }}>{String(j.title)}</Link>,
            <span key="s" style={{ fontSize: '0.72rem', color: j.status === 'active' ? '#22c55e' : '#64748b' }}>{String(j.status)}</span>,
            String(j.total), String(j.pass), String(j.review), String(j.fail),
            <PassBadge key="pr" rate={j.pass_rate as number} />,
            <ScoreBar key="sc" score={j.avg_score as number} />,
          ])}
        />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  TL VIEW
// ════════════════════════════════════════════════════════════════════════════
function TLAnalytics({ data }: { data: Record<string, unknown> }) {
  const k = data.kpis as Record<string, number>;
  const jobStats = (data.job_stats as Record<string, unknown>[]) || [];
  const recruiterStats = (data.recruiter_stats as Record<string, unknown>[]) || [];
  const topCandidates = (data.top_candidates as Record<string, unknown>[]) || [];
  const funnelData = (data.hiring_funnel as { name: string; value: number; color: string }[]) || [];

  if (!k.total_candidates) return <EmptyState msg="No candidate data yet for your teams." />;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <KpiCard icon="💼" label="Jobs Assigned" value={k.total_jobs} color="#6366f1" />
        <KpiCard icon="📄" label="Candidates" value={k.total_candidates} sub={`${k.processed} scored`} color="#a78bfa" />
        <KpiCard icon="✅" label="Pass Rate" value={`${k.pass_rate}%`} color="#22c55e" />
        <KpiCard icon="⭐" label="Avg Score" value={k.avg_score} color="#f59e0b" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={card()}>
          <SectionHeader title="Hiring Funnel" />
          <FunnelBar pass={k.pass} review={k.review} fail={k.fail} total={k.pass + k.review + k.fail} />
          <div style={{ marginTop: '1.5rem', height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: 8 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {funnelData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={card()}>
          <SectionHeader title="🏆 Top Candidates" sub="Highest scoring across your jobs" />
          {topCandidates.length === 0
            ? <p style={{ color: '#475569', fontSize: '0.8rem' }}>No scored candidates yet.</p>
            : topCandidates.map((c: Record<string, unknown>, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: i < topCandidates.length - 1 ? '1px solid #1e2d4a' : 'none' }}>
                <div>
                  <Link href={`/dashboard/candidates/${c.id}`} style={{ color: '#e2e8f0', textDecoration: 'none', fontWeight: 500, fontSize: '0.8rem' }}>{String(c.name)}</Link>
                  <p style={{ color: '#475569', fontSize: '0.7rem' }}>{String(c.job)}</p>
                </div>
                <ScoreBar score={c.score as number} />
              </div>
            ))}
        </div>
      </div>

      <div style={{ ...card(), marginBottom: '1.5rem' }}>
        <SectionHeader title="🧑‍💻 Recruiter Activity" sub="Uploads and outcomes per recruiter" />
        <Table
          headers={['Recruiter', 'Uploaded', 'Pass', 'Review', 'Fail', 'Pass Rate', 'Avg Score']}
          rows={recruiterStats.map((r: Record<string, unknown>) => [
            <strong key="n" style={{ color: '#e2e8f0' }}>{String(r.name)}</strong>,
            String(r.total), String(r.pass), String(r.review), String(r.fail),
            <PassBadge key="pr" rate={r.pass_rate as number} />,
            <ScoreBar key="sc" score={r.avg_score as number} />,
          ])}
        />
      </div>

      <div style={card()}>
        <SectionHeader title="📋 Job Breakdown" />
        <Table
          headers={['Job', 'Candidates', 'Pass Rate', 'Avg Score']}
          rows={jobStats.map((j: Record<string, unknown>) => [
            <Link key="l" href={`/dashboard/jobs/${j.id}`} style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 500 }}>{String(j.title)}</Link>,
            String(j.total),
            <PassBadge key="pr" rate={j.pass_rate as number} />,
            <ScoreBar key="sc" score={j.avg_score as number} />,
          ])}
        />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  RECRUITER VIEW
// ════════════════════════════════════════════════════════════════════════════
function RecruiterAnalytics({ data }: { data: Record<string, unknown> }) {
  const k = data.kpis as Record<string, number>;
  const jobStats = (data.job_stats as Record<string, unknown>[]) || [];
  const topSkills = (data.top_skills as { skill: string; count: number }[]) || [];
  const recentUploads = (data.recent_uploads as Record<string, unknown>[]) || [];
  const funnelData = (data.hiring_funnel as { name: string; value: number; color: string }[]) || [];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <KpiCard icon="📤" label="Total Uploaded" value={k.total_uploaded} color="#6366f1" />
        <KpiCard icon="✅" label="Pass Rate" value={`${k.pass_rate}%`} color="#22c55e" />
        <KpiCard icon="⭐" label="Avg Score" value={k.avg_score} color="#f59e0b" />
        <KpiCard icon="💼" label="Jobs Active" value={k.jobs_active} color="#8b5cf6" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={card()}>
          <SectionHeader title="My Hiring Funnel" sub="Candidates I uploaded" />
          <FunnelBar pass={k.pass} review={k.review} fail={k.fail} total={k.pass + k.review + k.fail} />
          <div style={{ marginTop: '1.5rem', height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: 8 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {funnelData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={card()}>
          <SectionHeader title="🎯 Top Matched Skills" sub="Skills your candidates have" />
          {topSkills.length === 0
            ? <p style={{ color: '#475569', fontSize: '0.8rem' }}>No skill data yet.</p>
            : topSkills.slice(0, 8).map((s, i) => (
              <div key={i} style={{ marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>{s.skill}</span>
                  <span style={{ color: '#6366f1', fontWeight: 600, fontSize: '0.78rem' }}>{s.count}</span>
                </div>
                <div style={{ background: '#1e2d4a', borderRadius: '4px', height: '5px' }}>
                  <div style={{ width: `${(s.count / (topSkills[0]?.count || 1)) * 100}%`, background: '#6366f1', height: '100%', borderRadius: '4px', transition: 'width 0.5s' }} />
                </div>
              </div>
            ))}
        </div>
      </div>

      <div style={{ ...card(), marginBottom: '1.5rem' }}>
        <SectionHeader title="📋 Jobs I'm Working On" />
        <Table
          headers={['Job', 'Company', 'Uploaded', 'Pass Rate', 'Avg Score']}
          rows={jobStats.map((j: Record<string, unknown>) => [
            <Link key="l" href={`/dashboard/jobs/${j.id}`} style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 500 }}>{String(j.title)}</Link>,
            String(j.company), String(j.total),
            <PassBadge key="pr" rate={j.pass_rate as number} />,
            <ScoreBar key="sc" score={j.avg_score as number} />,
          ])}
        />
      </div>

      <div style={card()}>
        <SectionHeader title="🕐 Recent Uploads" />
        <Table
          headers={['Candidate', 'Job', 'Score', 'Status', 'Date']}
          rows={recentUploads.map((c: Record<string, unknown>) => {
            const sc = c.score_status as string | null;
            const color = sc === 'pass' ? '#22c55e' : sc === 'fail' ? '#ef4444' : '#f59e0b';
            return [
              <Link key="l" href={`/dashboard/candidates/${c.id}`} style={{ color: '#e2e8f0', textDecoration: 'none', fontWeight: 500 }}>{String(c.name)}</Link>,
              String(c.job),
              c.score ? <span key="s" style={{ color, fontWeight: 700 }}>{String(c.score)}</span> : <span key="s" style={{ color: '#475569' }}>—</span>,
              <span key="st" style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '999px', background: `${color}18`, color, border: `1px solid ${color}40` }}>{String(c.processing_status)}</span>,
              new Date(String(c.date)).toLocaleDateString(),
            ];
          })}
        />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function AnalyticsPage() {
  const { role } = useUserContext();
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-dashboard', role],
    queryFn: () => analyticsApi.dashboard(),
    enabled: !!role,
    staleTime: 60_000,
  });

  const ROLE_SUBTITLES: Record<string, string> = {
    admin: 'Platform-wide overview — all managers, teams, and hiring outcomes',
    manager: 'Your jobs, recruiters, and team hiring performance',
    tl: 'Your team\'s jobs, recruiter activity, and top candidates',
    recruiter: 'Your personal performance, funnel, and upload history',
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#e2e8f0' }}>📊 Analytics</h1>
        <p style={{ color: '#64748b', marginTop: '0.25rem', fontSize: '0.875rem' }}>
          {ROLE_SUBTITLES[role || ''] || 'Loading…'}
        </p>
      </div>

      {isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: '1rem' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: '1rem', padding: '1.5rem', height: '100px', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      )}

      {error && (
        <div style={{ padding: '2rem', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '1rem', color: '#ef4444' }}>
          Failed to load analytics. Please try refreshing.
        </div>
      )}

      {data && !isLoading && (
        <>
          {role === 'admin' && <AdminAnalytics data={data} />}
          {role === 'manager' && <ManagerAnalytics data={data} />}
          {role === 'tl' && <TLAnalytics data={data} />}
          {role === 'recruiter' && <RecruiterAnalytics data={data} />}
        </>
      )}
    </div>
  );
}
