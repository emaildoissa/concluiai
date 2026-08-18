import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../lib/api';
import { useAuth } from '../../lib/auth';

interface RankRow {
  id: string;
  name: string;
  score: number;
}

const DEMO_UNIT_RANKINGS: RankRow[] = [
  { id: 'u1', name: 'Unidade Centro', score: 94.8 },
  { id: 'u2', name: 'Unidade Jardins', score: 91.2 },
  { id: 'u3', name: 'Unidade Barra Shopping', score: 86.5 },
  { id: 'u4', name: 'Unidade Aeroporto', score: 79.4 },
  { id: 'u5', name: 'Unidade Zona Sul', score: 72.1 },
];

const DEMO_USER_RANKINGS: RankRow[] = [
  { id: 'op1', name: 'Pedro Henrique (Cozinha)', score: 96.5 },
  { id: 'op2', name: 'Julia Medeiros (Salão)', score: 93.0 },
  { id: 'op3', name: 'Rafael Costa (Estoque)', score: 88.4 },
  { id: 'op4', name: 'Lucas Alencar (Bar)', score: 81.2 },
  { id: 'op5', name: 'Beatriz Lima (Abertura)', score: 74.0 },
];

export function RankingsPage() {
  const { demoMode } = useAuth();
  const [scope, setScope] = useState<'units' | 'users'>('units');
  const [periodDays, setPeriodDays] = useState<number>(7);
  const [rankings, setRankings] = useState<RankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - periodDays);
      const fromIso = fromDate.toISOString().slice(0, 10);
      const toIso = new Date().toISOString().slice(0, 10);

      const data = await apiGet<{ rankings: RankRow[] }>(
        `/api/score/rankings?scope=${scope}&from=${fromIso}&to=${toIso}`
      );

      if (data.rankings && data.rankings.length > 0) {
        setRankings(data.rankings);
      } else if (demoMode) {
        setRankings(scope === 'units' ? DEMO_UNIT_RANKINGS : DEMO_USER_RANKINGS);
      } else {
        setRankings([]);
      }
    } catch {
      if (demoMode) {
        setRankings(scope === 'units' ? DEMO_UNIT_RANKINGS : DEMO_USER_RANKINGS);
      } else {
        setRankings([]);
      }
    } finally {
      setLoading(false);
    }
  }, [scope, periodDays, demoMode]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Filtragem
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return rankings;
    return rankings.filter((r) => r.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [rankings, searchQuery]);

  // Top 3 Podium
  const first = filtered[0] || null;
  const second = filtered[1] || null;
  const third = filtered[2] || null;

  // KPIs Resumo
  const stats = useMemo(() => {
    if (rankings.length === 0) {
      return { avgScore: 0, leaderName: '—', totalCount: 0 };
    }
    const sum = rankings.reduce((acc, r) => acc + r.score, 0);
    const avgScore = Math.round((sum / rankings.length) * 10) / 10;
    const leaderName = rankings[0]?.name || '—';
    return { avgScore, leaderName, totalCount: rankings.length };
  }, [rankings]);

  return (
    <div className="rankings-page-wrap">
      {/* Header com Descrição Executiva */}
      <div className="page-header">
        <div>
          <h2>Performance & Rankings Operacionais</h2>
          <p>Classificação comparativa de conformidade e pontualidade por unidade e operador.</p>
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void loadData()}
          disabled={loading}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          Atualizar Dados
        </button>
      </div>

      {/* Barra de Controles Táticos: Escopo, Período e Busca */}
      <div className="rankings-controls-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="rankings-switcher">
            <button
              type="button"
              className={`rankings-switcher-btn ${scope === 'units' ? 'is-active' : ''}`}
              onClick={() => setScope('units')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Unidades & Lojas
            </button>
            <button
              type="button"
              className={`rankings-switcher-btn ${scope === 'users' ? 'is-active' : ''}`}
              onClick={() => setScope('users')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Equipe & Operadores
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Período:</span>
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                className={`btn btn-sm ${periodDays === d ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                onClick={() => setPeriodDays(d)}
              >
                {d} dias
              </button>
            ))}
          </div>
        </div>

        <div style={{ minWidth: 220 }}>
          <input
            type="text"
            placeholder={`Buscar ${scope === 'units' ? 'unidade' : 'operador'}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.45rem 0.75rem',
              fontSize: '0.85rem',
              background: 'var(--bg-soft)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 8,
              color: '#ffffff',
            }}
          />
        </div>
      </div>

      {/* Grid de KPIs Táticos */}
      <div className="rankings-kpi-grid">
        <div className="rankings-kpi-card">
          <div className="rankings-kpi-label">Líder Atual ({scope === 'units' ? 'Unidade' : 'Colaborador'})</div>
          <div className="rankings-kpi-val" style={{ color: '#fbbf24', fontSize: '1.4rem' }}>
            {stats.leaderName}
          </div>
          <div className="rankings-kpi-sub">Maior pontuação consolidada no período</div>
        </div>

        <div className="rankings-kpi-card">
          <div className="rankings-kpi-label">Score Médio da Rede</div>
          <div className="rankings-kpi-val" style={{ color: stats.avgScore >= 85 ? '#34d399' : '#38bdf8' }}>
            {stats.avgScore.toFixed(1)}
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>/100</span>
          </div>
          <div className="rankings-kpi-sub">Média de conformidade dos últimos {periodDays} dias</div>
        </div>

        <div className="rankings-kpi-card">
          <div className="rankings-kpi-label">Avaliados no Período</div>
          <div className="rankings-kpi-val">{stats.totalCount}</div>
          <div className="rankings-kpi-sub">{scope === 'units' ? 'unidades ativas' : 'operadores monitorados'}</div>
        </div>
      </div>

      {/* Pódio dos 3 Primeiros Colocados */}
      {!loading && filtered.length >= 3 && (
        <div className="podium-section">
          <div style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
            Destaques do Período
          </div>

          <div className="podium-grid">
            {/* 2º Lugar */}
            {second && (
              <div className="podium-card second">
                <span className="podium-badge-top">2º Lugar · Prata</span>
                <div className="podium-avatar">🥈</div>
                <div className="podium-name">{second.name}</div>
                <div className="podium-score" style={{ color: '#cbd5e1' }}>
                  {second.score.toFixed(1)}
                </div>
                <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>
                  Excelente Desempenho
                </span>
              </div>
            )}

            {/* 1º Lugar */}
            {first && (
              <div className="podium-card first">
                <span className="podium-badge-top">1º Lugar · Ouro</span>
                <div className="podium-avatar">🥇</div>
                <div className="podium-name">{first.name}</div>
                <div className="podium-score" style={{ color: '#fbbf24' }}>
                  {first.score.toFixed(1)}
                </div>
                <span className="badge badge-completed" style={{ fontSize: '0.75rem', fontWeight: 800 }}>
                  Líder de Conformidade
                </span>
              </div>
            )}

            {/* 3º Lugar */}
            {third && (
              <div className="podium-card third">
                <span className="podium-badge-top">3º Lugar · Bronze</span>
                <div className="podium-avatar">🥉</div>
                <div className="podium-name">{third.name}</div>
                <div className="podium-score" style={{ color: '#f59e0b' }}>
                  {third.score.toFixed(1)}
                </div>
                <span className="badge badge-pending" style={{ fontSize: '0.72rem' }}>
                  Alto Padrão
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Leaderboard Geral */}
      <div className="leaderboard-wrap">
        <div className="leaderboard-header">
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ffffff' }}>
            Classificação Geral ({filtered.length})
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Base de cálculo: Rotinas concluídas nos últimos {periodDays} dias
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Carregando ranking operacional…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>Nenhum registro de pontuação encontrado para o período.</p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem' }}>
              Execute tarefas ou gere rotinas do dia para calcular as métricas de conformidade.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 60, textAlign: 'center' }}>Posição</th>
                  <th>{scope === 'units' ? 'Unidade' : 'Operador'}</th>
                  <th style={{ width: 140, textAlign: 'center' }}>Score Geral</th>
                  <th>Distribuição Visual de Conformidade</th>
                  <th style={{ width: 120, textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const isGold = i === 0;
                  const isSilver = i === 1;
                  const isBronze = i === 2;
                  const scoreClass = r.score >= 85 ? 'high' : r.score >= 70 ? 'mid' : 'low';

                  return (
                    <tr key={r.id}>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className={`rank-medal-chip ${
                            isGold ? 'gold' : isSilver ? 'silver' : isBronze ? 'bronze' : 'default'
                          }`}
                        >
                          {i + 1}
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              background: 'var(--bg-soft)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              display: 'grid',
                              placeItems: 'center',
                              fontWeight: 800,
                              fontSize: '0.8rem',
                              color: 'var(--primary)',
                            }}
                          >
                            {r.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <strong style={{ color: '#ffffff', fontSize: '0.9rem' }}>{r.name}</strong>
                          </div>
                        </div>
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        <span className={`rank-score-pill ${scoreClass}`}>{r.score.toFixed(1)}</span>
                      </td>

                      <td style={{ minWidth: 200 }}>
                        <div
                          style={{
                            height: 10,
                            borderRadius: 99,
                            background: 'rgba(255, 255, 255, 0.06)',
                            overflow: 'hidden',
                            position: 'relative',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(0, r.score))}%`,
                              height: '100%',
                              borderRadius: 99,
                              background:
                                r.score >= 85
                                  ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)'
                                  : r.score >= 70
                                    ? 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)'
                                    : 'linear-gradient(90deg, #e11d48 0%, #f43f5e 100%)',
                              boxShadow:
                                r.score >= 85 ? '0 0 10px rgba(16, 185, 129, 0.4)' : undefined,
                              transition: 'width 0.5s ease',
                            }}
                          />
                        </div>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <span
                          className={`badge ${
                            r.score >= 85
                              ? 'badge-completed'
                              : r.score >= 70
                                ? 'badge-info'
                                : 'badge-critical'
                          }`}
                        >
                          {r.score >= 85 ? 'Conforme' : r.score >= 70 ? 'Atenção' : 'Crítico'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
