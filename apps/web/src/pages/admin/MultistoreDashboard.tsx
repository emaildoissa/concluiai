import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../../lib/api';
import { DEMO_UNITS } from '../../lib/demoData';
import { useAuth } from '../../lib/auth';

interface UnitRow {
  unit_id: string;
  unit_name: string;
  address?: string;
  score_total: number | null;
  tasks_pending: number;
  tasks_late: number;
  tasks_completed: number;
  critical_missed: number;
  closed_today?: boolean;
}

interface EvidenceRow {
  id: string;
  photo_url: string;
  ai_reason: string;
  ai_confidence: number;
  review_status: string;
  captured_at: string;
  task_instance?: {
    score_q?: number;
    unit?: { name: string };
    checklist_item?: {
      title: string;
      description?: string;
      is_critical: boolean;
    };
  };
}

const DEMO_EVIDENCES: EvidenceRow[] = [
  {
    id: 'ev-demo-1',
    photo_url: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=600&auto=format&fit=crop&q=80',
    ai_reason: 'Cuba da panela de arroz perfeitamente limpa, seca e sem resíduos no fundo. Conformidade sanitária aprovada.',
    ai_confidence: 0.98,
    review_status: 'approved',
    captured_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    task_instance: {
      score_q: 98,
      unit: { name: 'Unidade Centro' },
      checklist_item: {
        title: 'Panela de Arroz · Higienização da Cuba',
        description: 'Lavar cuba com esponja e detergente neutro. Secar e checar se não há crosta de arroz no fundo.',
        is_critical: true,
      },
    },
  },
  {
    id: 'ev-demo-2',
    photo_url: 'https://images.unsplash.com/photo-1584992236310-6edddc08acff?w=600&auto=format&fit=crop&q=80',
    ai_reason: 'Display do Freezer 1 legível marcando -19.4°C. Dentro da faixa recomendada (-18°C a -22°C).',
    ai_confidence: 0.96,
    review_status: 'approved',
    captured_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    task_instance: {
      score_q: 96,
      unit: { name: 'Unidade Aeroporto' },
      checklist_item: {
        title: 'Controle de Temperatura · Freezer 1',
        description: 'Checar display digital do freezer 1. Faixa esperada: entre -18°C e -22°C.',
        is_critical: true,
      },
    },
  },
  {
    id: 'ev-demo-3',
    photo_url: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&auto=format&fit=crop&q=80',
    ai_reason: 'Detecção de resíduos de óleo e grelha desencaixada. Não atende ao padrão de fechamento exigido.',
    ai_confidence: 0.42,
    review_status: 'rejected',
    captured_at: new Date(Date.now() - 85 * 60 * 1000).toISOString(),
    task_instance: {
      score_q: 42,
      unit: { name: 'Unidade Shopping' },
      checklist_item: {
        title: 'Limpeza Pesada de Coifa e Fogão',
        description: 'Desengordurar filtros da coifa e higienizar queimadores do fogão.',
        is_critical: true,
      },
    },
  },
];

export function MultistoreDashboard() {
  const { demoMode } = useAuth();
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [evidences, setEvidences] = useState<EvidenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; type: 'info' | 'success' | 'warn' } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date>(new Date());

  // Filtros
  const [unitFilter, setUnitFilter] = useState<'all' | 'risk' | 'healthy' | 'attention'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [evidenceFilter, setEvidenceFilter] = useState<'all' | 'attention'>('all');

  // Lightbox Modal
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceRow | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [data, evData] = await Promise.all([
        apiGet<{ units: UnitRow[]; demo?: boolean }>('/api/dashboard/multistore'),
        apiGet<{ evidences: EvidenceRow[] }>('/api/evidences'),
      ]);

      if (data?.units && data.units.length > 0) {
        setUnits(data.units);
      } else if (demoMode) {
        setUnits(
          DEMO_UNITS.map((u) => ({
            unit_id: u.id,
            unit_name: u.name,
            address: u.address,
            score_total: u.score_total,
            tasks_pending: u.tasks_pending,
            tasks_late: u.tasks_late,
            tasks_completed: u.tasks_completed,
            critical_missed: u.critical_missed,
          }))
        );
      } else {
        setUnits([]);
      }

      if (evData?.evidences && evData.evidences.length > 0) {
        setEvidences(evData.evidences);
      } else if (demoMode) {
        setEvidences(DEMO_EVIDENCES);
      } else {
        setEvidences([]);
      }
    } catch {
      if (demoMode) {
        setUnits(
          DEMO_UNITS.map((u) => ({
            unit_id: u.id,
            unit_name: u.name,
            address: u.address,
            score_total: u.score_total,
            tasks_pending: u.tasks_pending,
            tasks_late: u.tasks_late,
            tasks_completed: u.tasks_completed,
            critical_missed: u.critical_missed,
          }))
        );
        setEvidences(DEMO_EVIDENCES);
      } else {
        setUnits([]);
        setEvidences([]);
      }
    } finally {
      setLastSync(new Date());
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Totais e KPIs globais
  const totals = useMemo(() => {
    return units.reduce(
      (acc, u) => {
        acc.pending += u.tasks_pending;
        acc.late += u.tasks_late;
        acc.completed += u.tasks_completed;
        acc.critical += u.critical_missed;
        if (u.score_total != null) {
          acc.scoreSum += u.score_total;
          acc.scoreN += 1;
        }
        return acc;
      },
      { pending: 0, late: 0, completed: 0, critical: 0, scoreSum: 0, scoreN: 0 }
    );
  }, [units]);

  const totalTasks = totals.completed + totals.pending + totals.late;
  const completionRate = totalTasks > 0 ? Math.round((totals.completed / totalTasks) * 100) : 0;
  const avgScore = totals.scoreN ? Math.round((totals.scoreSum / totals.scoreN) * 10) / 10 : null;
  const unitsInRisk = units.filter(
    (u) => u.critical_missed > 0 || u.tasks_late > 0 || (u.score_total != null && u.score_total < 75)
  );

  // Unidades Ordenadas por Score e Filtradas
  const rankedAndFilteredUnits = useMemo(() => {
    const sorted = [...units].sort((a, b) => (b.score_total ?? 0) - (a.score_total ?? 0));
    return sorted.filter((u) => {
      const matchSearch =
        u.unit_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.address && u.address.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!matchSearch) return false;

      if (unitFilter === 'risk')
        return u.critical_missed > 0 || u.tasks_late > 0 || (u.score_total != null && u.score_total < 75);
      if (unitFilter === 'healthy')
        return u.score_total != null && u.score_total >= 85 && u.critical_missed === 0;
      if (unitFilter === 'attention') return u.score_total != null && u.score_total < 85;
      return true;
    });
  }, [units, unitFilter, searchQuery]);

  // Filtragem de Evidências
  const filteredEvidences = useMemo(() => {
    return evidences.filter((ev) => {
      if (evidenceFilter === 'attention') {
        const scoreQ = Math.round((ev.ai_confidence ?? 0.5) * 100);
        return scoreQ < 80 || ev.review_status === 'rejected';
      }
      return true;
    });
  }, [evidences, evidenceFilter]);

  async function runAlerts() {
    setMsg(null);
    setBusy('alerts');
    try {
      const r = await apiPost<{ alerted: number; skipped: number; invalid: number }>('/api/tasks/run-alerts', {});
      const parts = [`${r.alerted} alertas WhatsApp disparados`];
      if (r.skipped > 0) parts.push(`${r.skipped} já alertados`);
      if (r.invalid > 0) parts.push(`${r.invalid} sem telefone válido`);
      setMsg({
        text: r.alerted || r.skipped || r.invalid ? parts.join(' · ') : 'Nenhuma tarefa crítica pendente de alerta.',
        type: r.alerted > 0 ? 'success' : 'info',
      });
    } catch (e) {
      setMsg({
        text: e instanceof Error ? e.message : 'Erro ao processar alertas',
        type: 'warn',
      });
    } finally {
      setBusy(null);
    }
  }

  async function generateTodayTasks() {
    setMsg(null);
    setBusy('generate');
    try {
      const r = await apiPost<{ count: number; date: string }>('/api/tasks/generate-today', {});
      setMsg({
        text: `Rotinas geradas com sucesso para a data ${r.date}: ${r.count} tarefas criadas/atualizadas na rede.`,
        type: 'success',
      });
      await load();
    } catch (e) {
      setMsg({
        text: e instanceof Error ? e.message : 'Erro ao gerar tarefas do dia',
        type: 'warn',
      });
    } finally {
      setBusy(null);
    }
  }

  async function recalcScore() {
    setMsg(null);
    setBusy('score');
    try {
      const r = await apiPost<{ unitsProcessed: number; message?: string }>('/api/score/recalculate', {});
      setMsg({
        text: r.message || `Scores auditados e recalculados em ${r.unitsProcessed} unidades.`,
        type: 'success',
      });
      await load();
    } catch (e) {
      setMsg({
        text: e instanceof Error ? e.message : 'Erro ao recalcular scores',
        type: 'warn',
      });
    } finally {
      setBusy(null);
    }
  }

  async function requestAdjustment(ev: EvidenceRow, unitName: string, taskTitle: string) {
    if (
      !confirm(
        `Solicitar intervenção e reexecução para:\n"${taskTitle}" na unidade ${unitName}?\n\nA tarefa será reaberta para refação com notificação no WhatsApp do operador.`
      )
    ) {
      return;
    }
    setMsg(null);
    try {
      const r = await apiPost<{ task_instance_id: string; status: string; notified?: string | null }>(
        `/api/evidences/${ev.id}/request-adjustment`,
        {}
      );
      setMsg({
        text: `Reexecução solicitada! Tarefa reaberta (${r.status})${
          r.notified ? ` · Notificação enviada via WhatsApp para ${r.notified}` : ''
        }`,
        type: 'success',
      });
      await load();
    } catch (e) {
      setMsg({
        text: e instanceof Error ? e.message : 'Erro ao solicitar ajuste',
        type: 'warn',
      });
    }
  }

  function handleManualApproval(ev: EvidenceRow) {
    setEvidences((prev) =>
      prev.map((e) =>
        e.id === ev.id
          ? {
              ...e,
              review_status: 'approved',
              ai_confidence: 1.0,
              ai_reason: 'Aprovação manual validada pelo gestor de operações (Override).',
            }
          : e
      )
    );
    setMsg({
      text: 'Evidência homologada manualmente pelo gestor.',
      type: 'success',
    });
  }

  return (
    <div className="ops-dashboard-wrap">
      {/* Barra de Telemetria Superior (Live Ops Command) */}
      <div className="ops-telemetry-bar">
        <div className="ops-telemetry-left">
          <div className="ops-telemetry-title-row">
            <h2 className="ops-main-title">Central de Comando Multiloja</h2>
          </div>
          <p className="ops-telemetry-sub">
            <span><strong>{units.length} Unidades</strong> cadastradas na rede</span>
            <span>·</span>
            <span>
              Sincronizado às {lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </p>
        </div>

        <div className="ops-telemetry-actions">
          <button
            type="button"
            className="ops-btn-action"
            style={{
              borderColor: 'rgba(56, 189, 248, 0.4)',
              background: 'rgba(56, 189, 248, 0.1)',
              color: '#38bdf8',
            }}
            onClick={() => void generateTodayTasks()}
            disabled={busy !== null}
            title="Gerar tarefas operacionais do dia para todas as unidades ativas"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            {busy === 'generate' ? 'Gerando...' : 'Gerar Tarefas do Dia'}
          </button>

          <button
            type="button"
            className="ops-btn-action ops-btn-alerts"
            onClick={() => void runAlerts()}
            disabled={busy !== null}
            title="Disparar lembretes via WhatsApp para tarefas críticas atrasadas"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {busy === 'alerts' ? 'Disparando...' : 'Disparar Alertas WhatsApp'}
          </button>

          <button
            type="button"
            className="ops-btn-action ops-btn-score"
            onClick={() => void recalcScore()}
            disabled={busy !== null}
            title="Recalcular métricas de Pontualidade, Execução e Qualidade"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {busy === 'score' ? 'Auditando...' : 'Auditar Índices P·E·Q'}
          </button>

          <button
            type="button"
            className="ops-btn-action ops-btn-refresh"
            onClick={() => void load()}
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
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Atualizar
          </button>
        </div>
      </div>

      {/* Notificação / Feedback de Ação */}
      {msg && (
        <div className={`notice ${msg.type === 'warn' ? 'warn' : msg.type === 'success' ? 'success' : ''}`}>
          {msg.text}
        </div>
      )}

      {/* Grade de KPIs Executivos */}
      <div className="ops-kpi-grid">
        {/* Score de Conformidade Geral */}
        <div className="ops-kpi-card" style={{ ['--kpi-glow' as string]: '#6366f1' }}>
          <div className="ops-kpi-glow" />
          <div className="ops-kpi-header">
            <h3 className="ops-kpi-title">Índice Global da Rede</h3>
            <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Meta 85%</span>
          </div>
          <div className="ops-kpi-body">
            <div className="ops-kpi-value">{avgScore != null ? avgScore : '—'}</div>
            <span
              className={`ops-kpi-benchmark ${
                avgScore && avgScore >= 85
                  ? 'benchmark-good'
                  : avgScore && avgScore >= 70
                  ? 'benchmark-warn'
                  : 'benchmark-danger'
              }`}
            >
              {avgScore && avgScore >= 85 ? 'Conforme' : avgScore && avgScore >= 70 ? 'Regular' : 'Crítico'}
            </span>
          </div>
          <p className="ops-kpi-sub">Média consolidada de Pontualidade, Execução e IA</p>
        </div>

        {/* Execução Diária */}
        <div className="ops-kpi-card" style={{ ['--kpi-glow' as string]: '#10b981' }}>
          <div className="ops-kpi-glow" />
          <div className="ops-kpi-header">
            <h3 className="ops-kpi-title">Conformidade de Turno</h3>
            <span className="badge badge-completed" style={{ fontSize: '0.7rem' }}>Hoje</span>
          </div>
          <div className="ops-kpi-body">
            <div className="ops-kpi-value" style={{ color: '#34d399' }}>{completionRate}%</div>
            <span className="ops-kpi-benchmark benchmark-good">
              {totals.completed} de {totalTasks}
            </span>
          </div>
          <p className="ops-kpi-sub">Tarefas de abertura, rotina e fechamento concluídas</p>
        </div>

        {/* Tarefas Pendentes */}
        <div className="ops-kpi-card" style={{ ['--kpi-glow' as string]: '#f59e0b' }}>
          <div className="ops-kpi-glow" />
          <div className="ops-kpi-header">
            <h3 className="ops-kpi-title">Pendências em Andamento</h3>
            <span className="badge badge-pending" style={{ fontSize: '0.7rem' }}>Turno Atual</span>
          </div>
          <div className="ops-kpi-body">
            <div className="ops-kpi-value" style={{ color: '#fbbf24' }}>{totals.pending}</div>
            <span className="ops-kpi-benchmark benchmark-warn">Em execução</span>
          </div>
          <p className="ops-kpi-sub">Checklists aguardando envio de evidência fotográfica</p>
        </div>

        {/* Riscos Críticos / Atrasos */}
        <div className="ops-kpi-card" style={{ ['--kpi-glow' as string]: totals.late || totals.critical ? '#f43f5e' : '#10b981' }}>
          <div className="ops-kpi-glow" />
          <div className="ops-kpi-header">
            <h3 className="ops-kpi-title">Desvios & Atrasos</h3>
            <span className="badge badge-critical" style={{ fontSize: '0.7rem' }}>Urgente</span>
          </div>
          <div className="ops-kpi-body">
            <div
              className="ops-kpi-value"
              style={{ color: totals.late || totals.critical ? '#f43f5e' : '#34d399' }}
            >
              {totals.late + totals.critical}
            </div>
            <span
              className={`ops-kpi-benchmark ${
                totals.late || totals.critical ? 'benchmark-danger' : 'benchmark-good'
              }`}
            >
              {totals.critical} Críticas · {totals.late} Atrasadas
            </span>
          </div>
          <p className="ops-kpi-sub">
            {totals.critical > 0
              ? 'Exigem intervenção operacional imediata na unidade'
              : 'Nenhum desvio crítico registrado no turno'}
          </p>
        </div>
      </div>

      {/* Duas Colunas Principais: Unidades & Feed de Auditoria IA */}
      <div className="ops-main-columns">
        {/* Coluna 1: Matriz de Unidades & Desempenho */}
        <div className="ops-panel">
          <div className="ops-panel-header">
            <div className="ops-panel-title-wrap">
              <h3 className="ops-panel-title">Ranking Operacional por Unidade</h3>
              <span className="ops-panel-badge">{rankedAndFilteredUnits.length} unidades</span>
            </div>

            <div className="ops-filter-row">
              <div className="ops-tabs-pill">
                <button
                  type="button"
                  className={`ops-tab-btn ${unitFilter === 'all' ? 'is-active' : ''}`}
                  onClick={() => setUnitFilter('all')}
                >
                  Todas
                </button>
                <button
                  type="button"
                  className={`ops-tab-btn ${unitFilter === 'risk' ? 'is-active' : ''}`}
                  onClick={() => setUnitFilter('risk')}
                >
                  Risco ({unitsInRisk.length})
                </button>
                <button
                  type="button"
                  className={`ops-tab-btn ${unitFilter === 'healthy' ? 'is-active' : ''}`}
                  onClick={() => setUnitFilter('healthy')}
                >
                  Conforme (85%+)
                </button>
              </div>

              <input
                type="text"
                className="ops-search-input"
                placeholder="Filtrar unidade..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="muted" style={{ padding: '2.5rem 0', textAlign: 'center' }}>
              Carregando telemetria das unidades...
            </div>
          ) : rankedAndFilteredUnits.length === 0 ? (
            <div className="muted" style={{ padding: '2.5rem 0', textAlign: 'center' }}>
              Nenhuma unidade corresponde aos filtros selecionados.
            </div>
          ) : (
            <div className="ops-units-list">
              {rankedAndFilteredUnits.map((u, index) => {
                const totalUnitTasks = u.tasks_completed + u.tasks_pending + u.tasks_late;
                const pCompleted = totalUnitTasks > 0 ? (u.tasks_completed / totalUnitTasks) * 100 : 0;
                const pPending = totalUnitTasks > 0 ? (u.tasks_pending / totalUnitTasks) * 100 : 0;
                const pLate = totalUnitTasks > 0 ? (u.tasks_late / totalUnitTasks) * 100 : 0;

                const isCritical = u.critical_missed > 0 || u.tasks_late > 1 || (u.score_total != null && u.score_total < 70);
                const isWarning = !isCritical && (u.tasks_late > 0 || (u.score_total != null && u.score_total < 85));

                return (
                  <div
                    key={u.unit_id}
                    className={`ops-unit-card ${
                      isCritical ? 'risk-high' : isWarning ? 'risk-mid' : 'risk-low'
                    }`}
                  >
                    <div className="ops-unit-top">
                      <div className="ops-unit-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              background: 'rgba(255, 255, 255, 0.08)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              color: index === 0 ? '#34d399' : '#94a3b8',
                            }}
                          >
                            #{index + 1}
                          </span>
                          <h4>{u.unit_name}</h4>
                        </div>
                        <p className="ops-unit-address">{u.address || 'Localidade padrão da rede'}</p>
                      </div>

                      <div className="ops-unit-score-badge">
                        <div
                          className={`ops-score-num ${
                            u.score_total != null && u.score_total >= 85
                              ? 'score-high'
                              : u.score_total != null && u.score_total >= 70
                              ? 'score-mid'
                              : 'score-low'
                          }`}
                        >
                          {u.closed_today ? '—' : u.score_total != null ? `${Math.round(u.score_total)}%` : '—'}
                        </div>
                        <span className="ops-score-label">Score P·E·Q</span>
                      </div>
                    </div>

                    {/* Barra de Progresso Segmentada Multi-Status */}
                    <div
                      className="ops-stacked-track"
                      title={`Concluídas: ${u.tasks_completed} · Pendentes: ${u.tasks_pending} · Atrasadas: ${u.tasks_late}`}
                    >
                      <div className="ops-bar-seg ops-seg-completed" style={{ width: `${pCompleted}%` }} />
                      <div className="ops-bar-seg ops-seg-pending" style={{ width: `${pPending}%` }} />
                      <div className="ops-bar-seg ops-seg-late" style={{ width: `${pLate}%` }} />
                    </div>

                    {/* Linha de Estatísticas Rápidas */}
                    <div className="ops-unit-stats-strip">
                      {u.closed_today ? (
                        <span className="badge badge-info">Fora de Operação</span>
                      ) : (
                        <>
                          <span className="ops-stat-item" style={{ color: '#34d399' }}>
                            ✓ {u.tasks_completed} Concluídas
                          </span>
                          <span className="ops-stat-item" style={{ color: '#fbbf24' }}>
                            ● {u.tasks_pending} Pendentes
                          </span>
                          {u.tasks_late > 0 && (
                            <span className="ops-stat-item" style={{ color: '#fb923c' }}>
                              ▲ {u.tasks_late} Atrasadas
                            </span>
                          )}
                          {u.critical_missed > 0 && (
                            <span className="ops-stat-item" style={{ color: '#f43f5e' }}>
                              ■ {u.critical_missed} Crítica Vencida
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Coluna 2: Feed de Evidências Recentes & Auditoria IA */}
        <div className="ops-panel">
          <div className="ops-panel-header">
            <div className="ops-panel-title-wrap">
              <h3 className="ops-panel-title">Auditoria Visual Gemini Vision</h3>
              <span className="ops-panel-badge">{filteredEvidences.length} análises</span>
            </div>

            <div className="ops-tabs-pill">
              <button
                type="button"
                className={`ops-tab-btn ${evidenceFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setEvidenceFilter('all')}
              >
                Todas ({evidences.length})
              </button>
              <button
                type="button"
                className={`ops-tab-btn ${evidenceFilter === 'attention' ? 'is-active' : ''}`}
                onClick={() => setEvidenceFilter('attention')}
              >
                Atenção / Incerteza
              </button>
            </div>
          </div>

          {filteredEvidences.length === 0 ? (
            <div className="muted" style={{ padding: '2.5rem 0', textAlign: 'center' }}>
              Nenhuma evidência recente encontrada neste filtro.
            </div>
          ) : (
            <div className="ops-evidence-feed">
              {filteredEvidences.map((ev) => {
                const scoreQ = Math.round((ev.ai_confidence ?? 0.5) * 100);
                const isRejected = scoreQ < 60 || ev.review_status === 'rejected';
                const unitName = ev.task_instance?.unit?.name || 'Unidade';
                const taskTitle = ev.task_instance?.checklist_item?.title || 'Tarefa Operacional';
                const directive = ev.task_instance?.checklist_item?.description;

                return (
                  <div
                    key={ev.id}
                    className={`ops-evidence-card ${isRejected ? 'is-rejected-card' : ''}`}
                  >
                    {ev.photo_url && (
                      <div
                        className="ops-evidence-thumb-wrap"
                        onClick={() => setSelectedEvidence(ev)}
                        title="Clique para inspecionar foto em alta resolução"
                      >
                        <img
                          src={ev.photo_url}
                          alt={taskTitle}
                          className="ops-evidence-thumb"
                          loading="lazy"
                        />
                        <div className="ops-thumb-zoom-icon">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                        </div>
                      </div>
                    )}

                    <div className="ops-evidence-content">
                      <div>
                        <div className="ops-ev-header">
                          <h5 className="ops-ev-title">{taskTitle}</h5>
                          <span
                            className={`badge ${
                              scoreQ >= 80 ? 'badge-completed' : scoreQ >= 60 ? 'badge-pending' : 'badge-critical'
                            }`}
                          >
                            {scoreQ}% {isRejected ? 'Recusada' : 'Conforme'}
                          </span>
                        </div>

                        <div className="ops-ev-meta">
                          {unitName} · {new Date(ev.captured_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>

                        {directive && (
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                            <strong style={{ color: '#cbd5e1' }}>Diretriz:</strong> {directive}
                          </div>
                        )}

                        <div className={`ops-ev-reason-box ${isRejected ? 'reason-bad' : 'reason-good'}`}>
                          <strong>Parecer IA:</strong> {ev.ai_reason || 'Evidência registrada e auditada.'}
                        </div>
                      </div>

                      {isRejected && (
                        <div className="ops-ev-actions">
                          <button
                            type="button"
                            className="ops-btn-reopen"
                            onClick={() => void requestAdjustment(ev, unitName, taskTitle)}
                          >
                            Solicitar Refação (WhatsApp)
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            style={{ fontSize: '0.72rem', padding: '3px 8px', color: '#34d399' }}
                            onClick={() => handleManualApproval(ev)}
                            title="Aprovar manualmente se a foto estiver correta"
                          >
                            Aprovação Manual
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal para Inspeção de Evidências */}
      {selectedEvidence && (
        <div className="ops-lightbox-overlay" onClick={() => setSelectedEvidence(null)}>
          <div className="ops-lightbox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ops-lightbox-header">
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>
                  {selectedEvidence.task_instance?.checklist_item?.title || 'Evidência Operacional'}
                </h3>
                <span className="muted" style={{ fontSize: '0.82rem' }}>
                  {selectedEvidence.task_instance?.unit?.name || 'Unidade'} · Capturada em{' '}
                  {new Date(selectedEvidence.captured_at).toLocaleString('pt-BR')}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSelectedEvidence(null)}
                style={{ fontSize: '1.2rem', padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>

            <div className="ops-lightbox-body">
              <div className="ops-lightbox-img-wrap">
                <img
                  src={selectedEvidence.photo_url}
                  alt="Inspeção"
                  className="ops-lightbox-img"
                />
              </div>

              {selectedEvidence.task_instance?.checklist_item?.description && (
                <div className="task-exec-directive-card" style={{ margin: 0 }}>
                  <div className="directive-header">
                    <strong>Diretriz Operacional do Checklist (POP)</strong>
                  </div>
                  <p className="directive-text">
                    {selectedEvidence.task_instance.checklist_item.description}
                  </p>
                </div>
              )}

              <div
                className={`ops-ev-reason-box ${
                  (selectedEvidence.ai_confidence ?? 0.5) < 0.6 ? 'reason-bad' : 'reason-good'
                }`}
                style={{ padding: '0.85rem 1rem', fontSize: '0.9rem' }}
              >
                <strong>Parecer Técnico da IA:</strong>{' '}
                {selectedEvidence.ai_reason || 'Auditoria visual concluída.'}
                <div style={{ marginTop: 6, fontSize: '0.8rem', opacity: 0.85 }}>
                  Confiança do Algoritmo: {Math.round((selectedEvidence.ai_confidence ?? 0.5) * 100)}%
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
