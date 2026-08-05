import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../lib/api';
import { DEMO_UNITS } from '../../lib/demoData';

interface UnitRow {
  unit_id: string;
  unit_name: string;
  address?: string;
  score_total: number | null;
  tasks_pending: number;
  tasks_late: number;
  tasks_completed: number;
  critical_missed: number;
}

function scoreClass(score: number | null) {
  if (score == null) return 'low';
  if (score >= 85) return '';
  if (score >= 70) return 'mid';
  return 'low';
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
    checklist_item?: { title: string; is_critical: boolean };
  };
}

export function MultistoreDashboard() {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [evidences, setEvidences] = useState<EvidenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await apiGet<{ units: UnitRow[]; demo?: boolean }>('/api/dashboard/multistore');
      setUnits(data.units);

      const evData = await apiGet<{ evidences: EvidenceRow[] }>('/api/evidences');
      setEvidences(evData.evidences || []);
    } catch {
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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const totals = units.reduce(
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
  const avgScore = totals.scoreN ? Math.round((totals.scoreSum / totals.scoreN) * 10) / 10 : null;

  async function generateTasks() {
    setMsg('');
    setBusy('generate');
    try {
      const r = await apiPost<{ created: number; message?: string }>('/api/tasks/generate-today', {});
      setMsg(r.message || `Tarefas geradas: ${r.created}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    } finally {
      setBusy(null);
    }
  }

  async function runAlerts() {
    setMsg('');
    setBusy('alerts');
    try {
      const r = await apiPost<{ alerted: number }>('/api/tasks/run-alerts', {});
      setMsg(`Alertas disparados: ${r.alerted}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    } finally {
      setBusy(null);
    }
  }

  async function recalcScore() {
    setMsg('');
    setBusy('score');
    try {
      const r = await apiPost<{ unitsProcessed: number; message?: string }>('/api/score/recalculate', {});
      setMsg(r.message || `Scores recalculados em ${r.unitsProcessed} unidades`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    } finally {
      setBusy(null);
    }
  }

  async function requestAdjustment(ev: EvidenceRow, unitName: string, taskTitle: string) {
    if (
      !confirm(
        `Solicitar ajuste para "${taskTitle}" (${unitName})?\n\n` +
          'A tarefa será reaberta como pendente e o operador será notificado para refazer a execução.'
      )
    ) {
      return;
    }
    setMsg('');
    try {
      const r = await apiPost<{ task_instance_id: string; status: string; notified?: string | null }>(
        `/api/evidences/${ev.id}/request-adjustment`,
        {}
      );
      setMsg(
        `Ajuste solicitado — tarefa reaberta como "${r.status}"` +
          (r.notified ? ` · WhatsApp: ${r.notified}` : ' · sem telefone do operador (mock)')
      );
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao solicitar ajuste');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Dashboard Multiloja</h2>
          <p>Visão consolidada de todas as unidades em tempo quase real.</p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-sm" onClick={() => void generateTasks()} disabled={busy !== null}>
            {busy === 'generate' ? 'Gerando…' : 'Gerar tarefas de hoje'}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => void runAlerts()} disabled={busy !== null}>
            {busy === 'alerts' ? 'Rodando…' : 'Rodar alertas'}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void recalcScore()} disabled={busy !== null}>
            {busy === 'score' ? 'Recalculando…' : 'Recalcular score'}
          </button>
        </div>
      </div>

      {msg && <div className="notice">{msg}</div>}

      <div className="grid grid-4" style={{ marginBottom: '1.25rem' }}>
        <div className="card">
          <h3>Score médio</h3>
          <div className="stat-value">{avgScore ?? '—'}</div>
          <div className="stat-sub">0–100 (P · E · Q)</div>
        </div>
        <div className="card">
          <h3>Concluídas hoje</h3>
          <div className="stat-value">{totals.completed}</div>
          <div className="stat-sub">em {units.length} unidades</div>
        </div>
        <div className="card">
          <h3>Pendentes</h3>
          <div className="stat-value">{totals.pending}</div>
          <div className="stat-sub">aguardando execução</div>
        </div>
        <div className="card">
          <h3>Atrasadas / críticas</h3>
          <div className="stat-value" style={{ color: totals.late || totals.critical ? 'var(--danger)' : undefined }}>
            {totals.late} / {totals.critical}
          </div>
          <div className="stat-sub">late · critical missed</div>
        </div>
      </div>

      <div className="card">
        <div className="page-header" style={{ marginBottom: '0.5rem' }}>
          <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '1.1rem' }}>Unidades</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
            Atualizar
          </button>
        </div>

        {loading ? (
          <div className="muted">Carregando…</div>
        ) : (
          units.map((u) => (
            <div className="unit-row" key={u.unit_id}>
              <div>
                <strong>{u.unit_name}</strong>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  {u.address || '—'}
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  <span className="badge badge-completed">{u.tasks_completed} ok</span>
                  <span className="badge badge-pending">{u.tasks_pending} pend.</span>
                  {u.tasks_late > 0 && <span className="badge badge-late">{u.tasks_late} atr.</span>}
                  {u.critical_missed > 0 && (
                    <span className="badge badge-critical">{u.critical_missed} crítica</span>
                  )}
                </div>
              </div>
              <div className={`score-ring ${scoreClass(u.score_total)}`}>
                {u.score_total != null ? Math.round(u.score_total) : '—'}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="page-header" style={{ marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '1.1rem' }}>
            📸 Feed de Evidências Recentes (Auditoria IA)
          </h3>
        </div>

        {evidences.length === 0 ? (
          <div className="muted">Nenhuma evidência enviada recentemente.</div>
        ) : (
          <div className="stack" style={{ gap: '1rem' }}>
            {evidences.map((ev) => {
              const scoreQ = Math.round((ev.ai_confidence ?? 0.5) * 100);
              const isLowQuality = scoreQ < 60;
              const unitName = ev.task_instance?.unit?.name || 'Unidade';
              const taskTitle = ev.task_instance?.checklist_item?.title || 'Tarefa';

              return (
                <div
                  key={ev.id}
                  style={{
                    display: 'flex',
                    gap: '1rem',
                    padding: '0.75rem',
                    background: 'var(--bg-elevated, #1f2937)',
                    borderRadius: 8,
                    border: isLowQuality ? '1px solid var(--danger, #ef4444)' : '1px solid #374151',
                  }}
                >
                  {ev.photo_url && (
                    <img
                      src={ev.photo_url}
                      alt="Evidência"
                      style={{
                        width: 90,
                        height: 90,
                        objectFit: 'cover',
                        borderRadius: 6,
                        border: '1px solid #4b5563',
                      }}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <strong>{taskTitle}</strong>
                        <div className="muted" style={{ fontSize: '0.8rem' }}>
                          {unitName} · {new Date(ev.captured_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <span
                        className={`badge ${
                          scoreQ >= 80 ? 'badge-completed' : scoreQ >= 60 ? 'badge-pending' : 'badge-critical'
                        }`}
                      >
                        Qualidade: {scoreQ}% {isLowQuality ? '⚠️ Baixa' : '✓ OK'}
                      </span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: '0.85rem', color: isLowQuality ? '#fca5a5' : '#d1d5db' }}>
                      🤖 <strong>IA Parecer:</strong> {ev.ai_reason || 'Evidência registrada.'}
                    </div>
                    {isLowQuality && (
                      <div style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                          onClick={() => void requestAdjustment(ev, unitName, taskTitle)}
                        >
                          ⚠️ Tomar providência / Solicitar ajuste
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
  );
}
