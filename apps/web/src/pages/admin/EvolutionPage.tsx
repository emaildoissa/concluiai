import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiGet } from '../../lib/api';
import { DEMO_UNITS } from '../../lib/demoData';

interface Point {
  score_date: string;
  score_p: number;
  score_e: number;
  score_q: number;
  score_total: number;
}

interface UnitOption {
  id: string;
  name: string;
}

export function EvolutionPage() {
  const [series, setSeries] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<number>(14);
  const [unitFilter, setUnitFilter] = useState<string>('');
  const [units, setUnits] = useState<UnitOption[]>([]);

  // Toggles de visibilidade de métricas
  const [showTotal, setShowTotal] = useState(true);
  const [showP, setShowP] = useState(true);
  const [showE, setShowE] = useState(true);
  const [showQ, setShowQ] = useState(true);

  // Carregar unidades e dados de evolução
  useEffect(() => {
    void (async () => {
      try {
        const unitRes = await apiGet<{ units: UnitOption[] }>('/api/units');
        setUnits(unitRes.units || []);
      } catch {
        setUnits(DEMO_UNITS.map((u) => ({ id: u.id, name: u.name })));
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await apiGet<{ series: Point[] }>(
          `/api/score/evolution?days=${days}${unitFilter ? `&unit_id=${unitFilter}` : ''}`
        );
        setSeries(data.series || []);
      } catch {
        // Geração determinística de histórico para o período selecionado
        const fallback: Point[] = [];
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);

          const baseP = 78 + Math.sin(i * 0.8) * 10;
          const baseE = 84 + Math.cos(i * 0.5) * 8;
          const baseQ = 75 + Math.sin(i * 1.2) * 12;
          const total = Math.round(0.35 * baseP + 0.3 * baseE + 0.35 * baseQ);

          fallback.push({
            score_date: d.toISOString().slice(0, 10),
            score_p: Math.min(100, Math.max(50, Math.round(baseP))),
            score_e: Math.min(100, Math.max(50, Math.round(baseE))),
            score_q: Math.min(100, Math.max(50, Math.round(baseQ))),
            score_total: Math.min(100, Math.max(50, total)),
          });
        }
        setSeries(fallback);
      } finally {
        setLoading(false);
      }
    })();
  }, [days, unitFilter]);

  // Cálculos de KPIs do período
  const stats = useMemo(() => {
    if (series.length === 0) {
      return { avgTotal: 0, avgP: 0, avgE: 0, avgQ: 0, delta: 0, bestDay: '—', worstDay: '—' };
    }

    const avgTotal = Math.round(series.reduce((acc, p) => acc + p.score_total, 0) / series.length);
    const avgP = Math.round(series.reduce((acc, p) => acc + p.score_p, 0) / series.length);
    const avgE = Math.round(series.reduce((acc, p) => acc + p.score_e, 0) / series.length);
    const avgQ = Math.round(series.reduce((acc, p) => acc + p.score_q, 0) / series.length);

    // Comparação primeira metade vs segunda metade do período
    const mid = Math.floor(series.length / 2);
    const firstHalf = series.slice(0, mid);
    const secondHalf = series.slice(mid);
    const avgFirst = firstHalf.length ? firstHalf.reduce((a, b) => a + b.score_total, 0) / firstHalf.length : avgTotal;
    const avgSecond = secondHalf.length ? secondHalf.reduce((a, b) => a + b.score_total, 0) / secondHalf.length : avgTotal;
    const delta = Math.round((avgSecond - avgFirst) * 10) / 10;

    let best = series[0];
    let worst = series[0];
    for (const p of series) {
      if (p.score_total > best.score_total) best = p;
      if (p.score_total < worst.score_total) worst = p;
    }

    return {
      avgTotal,
      avgP,
      avgE,
      avgQ,
      delta,
      bestDay: `${best.score_date.slice(8, 10)}/${best.score_date.slice(5, 7)} (${best.score_total}%)`,
      worstDay: `${worst.score_date.slice(8, 10)}/${worst.score_date.slice(5, 7)} (${worst.score_total}%)`,
    };
  }, [series]);

  const chartData = useMemo(() => {
    return series.map((p) => ({
      ...p,
      label: `${p.score_date.slice(8, 10)}/${p.score_date.slice(5, 7)}`,
    }));
  }, [series]);

  return (
    <div className="evolution-wrap">
      {/* Header Principal */}
      <div className="page-header">
        <div>
          <h2>Evolução de Indicadores & Conformidade</h2>
          <p>
            Análise histórica das 3 dimensões operacionais: <strong>Pontualidade (P)</strong>, <strong>Execução (E)</strong> e <strong>Qualidade IA (Q)</strong>.
          </p>
        </div>
      </div>

      {/* Grid de KPIs Superiores com Deltas */}
      <div className="evolution-kpi-grid">
        <div className="evolution-kpi-card">
          <div className="evolution-kpi-header">
            <span>Score Médio Consolidado</span>
            <span className={`evolution-kpi-delta ${stats.delta >= 0 ? 'is-positive' : 'is-negative'}`}>
              {stats.delta >= 0 ? `+${stats.delta}%` : `${stats.delta}%`}
            </span>
          </div>
          <div className="evolution-kpi-val" style={{ color: stats.avgTotal >= 85 ? '#34d399' : '#fbbf24' }}>
            {stats.avgTotal}%
          </div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>
            Meta da rede: 85% · {stats.avgTotal >= 85 ? 'Em conformidade' : 'Abaixo da meta'}
          </div>
        </div>

        <div className="evolution-kpi-card">
          <div className="evolution-kpi-header">
            <span>Pontualidade Média (P)</span>
            <span className="badge badge-info" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>Peso 35%</span>
          </div>
          <div className="evolution-kpi-val" style={{ color: '#38bdf8' }}>
            {stats.avgP}%
          </div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>
            Checklists iniciados e finalizados no horário
          </div>
        </div>

        <div className="evolution-kpi-card">
          <div className="evolution-kpi-header">
            <span>Execução de POPs (E)</span>
            <span className="badge badge-ghost" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>Peso 30%</span>
          </div>
          <div className="evolution-kpi-val" style={{ color: '#c4b5fd' }}>
            {stats.avgE}%
          </div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>
            Taxa de conclusão de tarefas obrigatórias
          </div>
        </div>

        <div className="evolution-kpi-card">
          <div className="evolution-kpi-header">
            <span>Auditoria Visual Gemini (Q)</span>
            <span className="badge badge-pending" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>Peso 35%</span>
          </div>
          <div className="evolution-kpi-val" style={{ color: '#fcd34d' }}>
            {stats.avgQ}%
          </div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>
            Assertividade fotográfica validada por IA
          </div>
        </div>
      </div>

      {/* Barra de Controles Táticos (Intervalo + Loja + Filtro de Métricas) */}
      <div className="evolution-toolbar">
        <div className="evolution-left-controls">
          {/* Seletor de Período */}
          <div className="evolution-time-group">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                className={`evolution-time-btn ${days === d ? 'is-active' : ''}`}
                onClick={() => setDays(d)}
              >
                {d}D
              </button>
            ))}
          </div>

          {/* Seletor de Loja */}
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            style={{ fontSize: '0.82rem', padding: '5px 10px', borderRadius: 8 }}
          >
            <option value="">Rede Consolidada (Todas)</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        {/* Chips Interativos para Ligar/Desligar Métricas */}
        <div className="evolution-metric-chips">
          <button
            type="button"
            className={`evolution-chip ${showTotal ? 'is-active-total' : ''}`}
            onClick={() => setShowTotal(!showTotal)}
          >
            <span className="evolution-chip-dot" style={{ background: '#2dd4bf' }} />
            Score Global
          </button>

          <button
            type="button"
            className={`evolution-chip ${showP ? 'is-active-p' : ''}`}
            onClick={() => setShowP(!showP)}
          >
            <span className="evolution-chip-dot" style={{ background: '#38bdf8' }} />
            Pontualidade (P)
          </button>

          <button
            type="button"
            className={`evolution-chip ${showE ? 'is-active-e' : ''}`}
            onClick={() => setShowE(!showE)}
          >
            <span className="evolution-chip-dot" style={{ background: '#a78bfa' }} />
            Execução (E)
          </button>

          <button
            type="button"
            className={`evolution-chip ${showQ ? 'is-active-q' : ''}`}
            onClick={() => setShowQ(!showQ)}
          >
            <span className="evolution-chip-dot" style={{ background: '#f59e0b' }} />
            Qualidade IA (Q)
          </button>
        </div>
      </div>

      {/* Card Principal do Gráfico Recharts com Meta */}
      <div className="evolution-chart-card">
        <div className="evolution-chart-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>
              Curva Histórica de Conformidade
            </h3>
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              Melhor dia: <strong style={{ color: '#34d399' }}>{stats.bestDay}</strong> · Pior dia: <strong style={{ color: '#fda4af' }}>{stats.worstDay}</strong>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 12, height: 2, background: '#34d399', display: 'inline-block' }} />
            <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 700 }}>Meta: 85%</span>
          </div>
        </div>

        <div style={{ height: 380, width: '100%', position: 'relative' }}>
          {loading ? (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#94a3b8' }}>
              Carregando telemetria operacional...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis domain={[40, 100]} stroke="#64748b" tick={{ fontSize: 11 }} />

                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const pData = payload[0]?.payload as Point;
                    return (
                      <div
                        style={{
                          background: 'rgba(9, 13, 22, 0.95)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: 12,
                          padding: '10px 14px',
                          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
                          backdropFilter: 'blur(10px)',
                          minWidth: 160,
                        }}
                      >
                        <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.85rem', marginBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 4 }}>
                          Data: {label}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2dd4bf', fontWeight: 800 }}>
                            <span>Score Global:</span>
                            <span>{pData.score_total}%</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8' }}>
                            <span>Pontualidade (P):</span>
                            <span>{pData.score_p}%</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c4b5fd' }}>
                            <span>Execução (E):</span>
                            <span>{pData.score_e}%</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fcd34d' }}>
                            <span>Qualidade IA (Q):</span>
                            <span>{pData.score_q}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />

                {/* Linha de Meta Operacional da Franquia */}
                <ReferenceLine y={85} stroke="#34d399" strokeDasharray="4 4" />

                {showTotal && (
                  <Line
                    type="monotone"
                    dataKey="score_total"
                    name="Score Global"
                    stroke="#2dd4bf"
                    strokeWidth={3}
                    dot={{ r: 3, fill: '#2dd4bf' }}
                    activeDot={{ r: 6 }}
                  />
                )}
                {showP && (
                  <Line
                    type="monotone"
                    dataKey="score_p"
                    name="Pontualidade (P)"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    dot={false}
                  />
                )}
                {showE && (
                  <Line
                    type="monotone"
                    dataKey="score_e"
                    name="Execução (E)"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    dot={false}
                  />
                )}
                {showQ && (
                  <Line
                    type="monotone"
                    dataKey="score_q"
                    name="Qualidade IA (Q)"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Grid de Diagnósticos de Correlação Operacional */}
      <div className="evolution-insights-grid">
        <div className="evolution-insight-card">
          <div className="evolution-insight-title">
            <span style={{ color: '#38bdf8' }}>●</span>
            Decaimento Linear de Pontualidade
          </div>
          <p className="evolution-insight-text">
            O algoritmo pontua 100% nas tarefas concluídas no horário exato e decai linearmente até 0% após 120 minutos de atraso, incentivando a disciplina diária de abertura e fechamento.
          </p>
        </div>

        <div className="evolution-insight-card">
          <div className="evolution-insight-title">
            <span style={{ color: '#fcd34d' }}>●</span>
            Auditoria Visual Multimodal (Gemini Vision)
          </div>
          <p className="evolution-insight-text">
            Fotos de evidência (temperatura de freezers, etiquetas de validade e organização) são analisadas em tempo real com confiança mínima de 80% para validação do Score Q.
          </p>
        </div>

        <div className="evolution-insight-card">
          <div className="evolution-insight-title">
            <span style={{ color: '#34d399' }}>●</span>
            Ponderação Crítica Multiplicada (1.5x)
          </div>
          <p className="evolution-insight-text">
            Procedimentos higiênico-sanitários e controle térmico de perecíveis possuem peso ampliado na fórmula, evitando que tarefas cosméticas mascarem riscos sanitários.
          </p>
        </div>
      </div>
    </div>
  );
}
