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
      return { avgScore: 0, leaderName: '—', totalCount: 0, highRate: 0 };
    }
    const sum = rankings.reduce((acc, r) => acc + r.score, 0);
    const avgScore = Math.round((sum / rankings.length) * 10) / 10;
    const leaderName = rankings[0]?.name || '—';
    const highCount = rankings.filter((r) => r.score >= 85).length;
    const highRate = Math.round((highCount / rankings.length) * 100);
    return { avgScore, leaderName, totalCount: rankings.length, highRate };
  }, [rankings]);

  return (
    <div className="rankings-page-wrap">
      {/* Header Semântico com Contadores e Descrição Executiva */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', margin: 0, fontSize: '1.45rem', fontWeight: 800 }}>
            Rankings & Índices Operacionais
            <span
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'rgba(20, 184, 166, 0.15)',
                color: '#2dd4bf',
                border: '1px solid rgba(20, 184, 166, 0.3)',
              }}
            >
              {filtered.length} {scope === 'units' ? 'unidades' : 'operadores'}
            </span>
          </h1>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Classificação comparativa de conformidade, pontualidade e auditoria de qualidade visual IA (P·E·Q).
          </p>
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ minHeight: 36, display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
          onClick={() => void loadData()}
          disabled={loading}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          {loading ? 'Atualizando...' : 'Atualizar Dados'}
        </button>
      </div>

      {/* Barra de Controles Táticos: Escopo, Período e Busca */}
      <div className="rankings-controls-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Switch de Escopo */}
          <div className="rankings-switcher">
            <button
              type="button"
              className={`rankings-switcher-btn ${scope === 'units' ? 'is-active' : ''}`}
              onClick={() => setScope('units')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Equipe & Operadores
            </button>
          </div>

          {/* Filtro de Janela Temporal */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Janela:</span>
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                className={`btn btn-sm ${periodDays === d ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', minHeight: 34, borderRadius: 8 }}
                onClick={() => setPeriodDays(d)}
              >
                {d} dias
              </button>
            ))}
          </div>
        </div>

        {/* Busca com Clear Button */}
        <div className="ops-search-wrap" style={{ minWidth: 240, flex: '1 1 240px', maxWidth: 360 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="ops-search-icon">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="ops-search-input"
            placeholder={`Buscar ${scope === 'units' ? 'unidade' : 'operador'}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="ops-search-clear"
              onClick={() => setSearchQuery('')}
              title="Limpar busca"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Grid de KPIs Táticos */}
      <div className="rankings-kpi-grid">
        <div className="rankings-kpi-card" style={{ borderLeft: '3px solid #fbbf24' }}>
          <div className="rankings-kpi-label">Líder Atual ({scope === 'units' ? 'Unidade' : 'Colaborador'})</div>
          <div className="rankings-kpi-val" style={{ color: '#fbbf24', fontSize: '1.45rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {stats.leaderName}
          </div>
          <div className="rankings-kpi-sub">Maior pontuação consolidada no período ({periodDays}d)</div>
        </div>

        <div className="rankings-kpi-card" style={{ borderLeft: `3px solid ${stats.avgScore >= 85 ? '#10b981' : stats.avgScore >= 70 ? '#f59e0b' : '#ef4444'}` }}>
          <div className="rankings-kpi-label">Média da Rede (P·E·Q)</div>
          <div className="rankings-kpi-val" style={{ color: stats.avgScore >= 85 ? '#34d399' : stats.avgScore >= 70 ? '#fbbf24' : '#f87171' }}>
            {stats.avgScore.toFixed(1)}
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500, marginLeft: 4 }}>/100</span>
          </div>
          <div className="rankings-kpi-sub">Média geral ponderada nos últimos {periodDays} dias</div>
        </div>

        <div className="rankings-kpi-card" style={{ borderLeft: '3px solid #38bdf8' }}>
          <div className="rankings-kpi-label">Avaliados no Período</div>
          <div className="rankings-kpi-val" style={{ color: '#38bdf8' }}>
            {stats.totalCount}
          </div>
          <div className="rankings-kpi-sub">{scope === 'units' ? 'unidades ativas monitoradas' : 'operadores com tarefas registradas'}</div>
        </div>

        <div className="rankings-kpi-card" style={{ borderLeft: '3px solid #a855f7' }}>
          <div className="rankings-kpi-label">Taxa de Alta Conformidade</div>
          <div className="rankings-kpi-val" style={{ color: '#c084fc' }}>
            {stats.highRate}%
          </div>
          <div className="rankings-kpi-sub">Participantes com score geral &ge; 85 pontos</div>
        </div>
      </div>

      {/* Pódio dos 3 Primeiros Colocados (Sem Emojis, Ícones Vetoriais Nobres) */}
      {!loading && filtered.length >= 3 && (
        <div className="podium-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
              Pódio de Destaque Operacional
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Top 3 melhores desempenhos consolidados
            </span>
          </div>

          <div className="podium-grid">
            {/* 2º Lugar - Prata */}
            {second && (
              <div className="podium-card second">
                <span className="podium-badge-top">2º Lugar · Prata</span>
                <div className="podium-avatar">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="6" />
                    <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
                  </svg>
                </div>
                <div className="podium-name">{second.name}</div>
                <div className="podium-score" style={{ color: '#cbd5e1' }}>
                  {second.score.toFixed(1)}
                </div>
                <span className="badge badge-info" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                  Excelente Desempenho
                </span>
              </div>
            )}

            {/* 1º Lugar - Ouro */}
            {first && (
              <div className="podium-card first">
                <span className="podium-badge-top">1º Lugar · Ouro</span>
                <div className="podium-avatar">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                    <path d="M4 22h16" />
                    <path d="M10 14.66V17c0 .55-.45 1-1 1H7" />
                    <path d="M14 14.66V17c0 .55.45 1 1 1h2" />
                    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                  </svg>
                </div>
                <div className="podium-name">{first.name}</div>
                <div className="podium-score" style={{ color: '#fbbf24' }}>
                  {first.score.toFixed(1)}
                </div>
                <span className="badge badge-completed" style={{ fontSize: '0.75rem', fontWeight: 800 }}>
                  Líder de Conformidade
                </span>
              </div>
            )}

            {/* 3º Lugar - Bronze */}
            {third && (
              <div className="podium-card third">
                <span className="podium-badge-top">3º Lugar · Bronze</span>
                <div className="podium-avatar">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </div>
                <div className="podium-name">{third.name}</div>
                <div className="podium-score" style={{ color: '#f59e0b' }}>
                  {third.score.toFixed(1)}
                </div>
                <span className="badge badge-pending" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
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
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Classificação Geral
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>({filtered.length} listados)</span>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Base de cálculo: Rotinas concluídas nos últimos {periodDays} dias
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ display: 'inline-block', width: 24, height: 24, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '0.5rem' }} />
            <div>Carregando ranking operacional...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.05)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '0.75rem',
                color: 'var(--text-muted)',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <p style={{ margin: 0, fontWeight: 700, color: '#ffffff' }}>Nenhum registro encontrado</p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem' }}>
              {searchQuery
                ? `Nenhum resultado corresponde à busca "${searchQuery}". Tente outro termo.`
                : 'Execute tarefas operacionais ou gere rotinas do dia para calcular as pontuações.'}
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 70, textAlign: 'center' }}>Posição</th>
                  <th>{scope === 'units' ? 'Unidade' : 'Operador'}</th>
                  <th style={{ width: 130, textAlign: 'center' }}>Score Geral</th>
                  <th>Distribuição de Conformidade</th>
                  <th style={{ width: 130, textAlign: 'right' }}>Status</th>
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
                              background: isGold
                                ? 'rgba(251, 191, 36, 0.15)'
                                : isSilver
                                  ? 'rgba(148, 163, 184, 0.15)'
                                  : isBronze
                                    ? 'rgba(249, 115, 22, 0.15)'
                                    : 'var(--bg-soft)',
                              border: `1px solid ${
                                isGold
                                  ? 'rgba(251, 191, 36, 0.3)'
                                  : isSilver
                                    ? 'rgba(148, 163, 184, 0.3)'
                                    : isBronze
                                      ? 'rgba(249, 115, 22, 0.3)'
                                      : 'rgba(255, 255, 255, 0.08)'
                              }`,
                              display: 'grid',
                              placeItems: 'center',
                              fontWeight: 800,
                              fontSize: '0.8rem',
                              color: isGold ? '#fbbf24' : isSilver ? '#cbd5e1' : isBronze ? '#f97316' : 'var(--primary)',
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <div
                            style={{
                              flex: 1,
                              height: 8,
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
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', minWidth: 38, textAlign: 'right' }}>
                            {Math.round(r.score)}%
                          </span>
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
