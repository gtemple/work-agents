import { useState, useEffect } from 'react';
import { getStats } from '../api';
import { formatTokens, estimateCost, formatCost } from '../utils';

function StatCard({ label, value, sub }) {
  return (
    <div style={{
      background: '#1e293b', borderRadius: 8, padding: '14px 18px', flex: 1,
    }}>
      <div style={{ fontSize: 11, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#334155', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function DailyChart({ daily }) {
  if (!daily.length) return (
    <div style={{ color: '#334155', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>No data yet</div>
  );

  const last30 = daily.slice(-30);
  const maxTokens = Math.max(...last30.map(d => d.input_tokens + d.output_tokens), 1);
  const chartH = 80;
  const barW = Math.max(4, Math.floor(520 / last30.length) - 2);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={Math.max(520, last30.length * (barW + 2))} height={chartH + 24} style={{ display: 'block' }}>
        {last30.map((d, i) => {
          const total = d.input_tokens + d.output_tokens;
          const h = Math.max(2, Math.round((total / maxTokens) * chartH));
          const x = i * (barW + 2);
          const label = d.date.slice(5); // MM-DD
          return (
            <g key={d.date}>
              <title>{d.date}: {formatTokens(total)} tokens ({d.turns} turn{d.turns !== 1 ? 's' : ''})</title>
              <rect
                x={x} y={chartH - h} width={barW} height={h}
                fill="#1d4ed8" rx={2}
                style={{ cursor: 'default' }}
              />
              {(i === 0 || i === last30.length - 1 || last30.length <= 10) && (
                <text x={x + barW / 2} y={chartH + 14} textAnchor="middle"
                  fill="#334155" fontSize={9} fontFamily="system-ui">
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function StatsPanel({ onClose }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    getStats().then(setStats);
  }, []);

  const totalTokens  = stats ? stats.summary.total_input_tokens + stats.summary.total_output_tokens : 0;
  const totalCost    = stats ? stats.summary.total_cost : 0;
  const systemTokens = stats ? stats.summary.system_input_tokens + stats.summary.system_output_tokens : 0;
  const systemCost   = stats ? stats.summary.system_cost : 0;

  const scopeWork     = stats?.by_scope?.work     ?? { input: 0, output: 0, cost: 0 };
  const scopePersonal = stats?.by_scope?.personal ?? { input: 0, output: 0, cost: 0 };
  const scopeTotal    = (scopeWork.input + scopeWork.output) + (scopePersonal.input + scopePersonal.output);
  const workPct       = scopeTotal > 0 ? Math.round(((scopeWork.input + scopeWork.output) / scopeTotal) * 100) : 50;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#00000099', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12,
        width: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px #000',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #1e293b',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: '#f1f5f9' }}>Stats</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#475569',
            cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
          }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {!stats ? (
            <div style={{ color: '#475569', textAlign: 'center', padding: '40px 0' }}>Loading…</div>
          ) : (
            <>
              {/* Summary cards */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                <StatCard
                  label="Total tokens"
                  value={formatTokens(totalTokens)}
                  sub={`${formatTokens(stats.summary.total_input_tokens)} in · ${formatTokens(stats.summary.total_output_tokens)} out`}
                />
                <StatCard
                  label="Total cost"
                  value={formatCost(totalCost)}
                  sub={systemTokens > 0 ? `incl. ${formatCost(systemCost)} system (suggestions, digest)` : 'per-model pricing'}
                />
                <StatCard
                  label="Sessions"
                  value={stats.summary.total_sessions}
                  sub={`${stats.summary.total_turns} agent turn${stats.summary.total_turns !== 1 ? 's' : ''}`}
                />
              </div>

              {/* Daily chart */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: '#475569', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Daily token usage (last 30 days)
                </div>
                <DailyChart daily={stats.daily} />
              </div>

              {/* Scope split */}
              {scopeTotal > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, color: '#475569', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Scope split
                  </div>
                  <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ width: `${workPct}%`, background: '#3b82f6' }} />
                    <div style={{ flex: 1, background: '#8b5cf6' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: '#3b82f6' }}>
                      work {workPct}% · {formatTokens(scopeWork.input + scopeWork.output)} tok · {formatCost(scopeWork.cost)}
                    </span>
                    <span style={{ fontSize: 12, color: '#8b5cf6' }}>
                      personal {100 - workPct}% · {formatTokens(scopePersonal.input + scopePersonal.output)} tok · {formatCost(scopePersonal.cost)}
                    </span>
                  </div>
                </div>
              )}

              {/* By model */}
              {stats?.by_model?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, color: '#475569', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    By model
                  </div>
                  <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #1e293b' }}>
                    {stats.by_model.map((m, i) => (
                      <div key={m.model} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '9px 14px', borderBottom: i < stats.by_model.length - 1 ? '1px solid #0d1829' : 'none',
                        background: i % 2 === 0 ? '#0a1628' : 'transparent',
                      }}>
                        <span style={{ fontSize: 12, color: '#94a3b8', flex: 1, fontFamily: 'monospace' }}>{m.model}</span>
                        <span style={{ fontSize: 12, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{formatTokens(m.input_tokens + m.output_tokens)} tok</span>
                        <span style={{ fontSize: 11, color: '#475569', fontVariantNumeric: 'tabular-nums', width: 64, textAlign: 'right' }}>{formatCost(m.cost)}</span>
                        <span style={{ fontSize: 10, color: '#334155', width: 50, textAlign: 'right' }}>{m.turns} turns</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top sessions */}
              <div>
                <div style={{ fontSize: 11, color: '#475569', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Top sessions by token usage
                </div>
                {stats.top_sessions.length === 0 ? (
                  <div style={{ color: '#334155', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
                    No sessions with token data yet
                  </div>
                ) : (
                  <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #1e293b' }}>
                    {stats.top_sessions.map((s, i) => {
                      const total = s.input_tokens + s.output_tokens;
                      const cost = estimateCost(s.input_tokens, s.output_tokens, s.model);
                      return (
                        <div key={s.id} style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '10px 14px', borderBottom: i < stats.top_sessions.length - 1 ? '1px solid #0d1829' : 'none',
                          background: i % 2 === 0 ? '#0a1628' : 'transparent',
                        }}>
                          <span style={{ fontSize: 11, color: '#334155', width: 16, flexShrink: 0 }}>#{i + 1}</span>
                          <span style={{ fontSize: 13, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.title}
                          </span>
                          <span style={{ fontSize: 12, color: '#7dd3fc', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                            {formatTokens(total)} tok
                          </span>
                          <span style={{ fontSize: 11, color: '#475569', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                            {formatCost(cost)}
                          </span>
                          <span style={{ fontSize: 10, color: '#1e293b', flexShrink: 0 }}>
                            {s.created_at.slice(0, 10)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
