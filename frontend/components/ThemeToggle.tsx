'use client';

import { useTheme } from '@/lib/theme';

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: compact ? '0.4rem 0.6rem' : '0.5rem 0.875rem',
        borderRadius: '2rem',
        border: '1px solid var(--border)',
        background: 'var(--bg-input)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        fontSize: '0.8rem',
        fontWeight: 500,
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366f1';
        (e.currentTarget as HTMLButtonElement).style.color = '#6366f1';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
      }}
    >
      {/* Toggle track */}
      <div style={{
        width: '32px', height: '18px', borderRadius: '999px',
        background: isDark ? '#6366f1' : '#e2e8f0',
        position: 'relative', transition: 'background 0.3s',
        flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', top: '3px',
          left: isDark ? '16px' : '3px',
          width: '12px', height: '12px', borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.3s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
      {!compact && (
        <span>{isDark ? '☀️ Light' : '🌙 Dark'}</span>
      )}
    </button>
  );
}
