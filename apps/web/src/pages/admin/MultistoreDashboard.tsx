import { useEffect, useMemo, useState, useCallback } from 'react';
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

interface TaskAlert {
  alertedAt: string;
  status: string;
  recipientPhone?: string;
}

interface TaskEvidence {
  photoUrl: string;
  reviewStatus: string;
  aiReason?: string;
  aiConfidence?: number;
  capturedAt: string;
}

interface OperationalTask {
  id: string;
  status: string;
  dueDate: string;
  scheduledDate: string;
  completedAt?: string | null;
  notes?: string;
  isLate?: boolean;
  delayMinutes?: number;
  scoreP?: number;
  scoreE?: number;
  scoreQ?: number;
  unit: { id: string; name: string; address?: string } | null;
  item: { title: string; isCritical: boolean; description?: string } | null;
  operator: { id: string; fullName: string; phone?: string } | null;
  alert?: TaskAlert | null;
  evidence?: TaskEvidence | null;
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

const DEMO_OPERATIONAL_TASKS: OperationalTask[] = [
  {
    id: 'task-demo-1',
    status: 'late',
    dueDate: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    scheduledDate: new Date().toISOString().slice(0, 10),
    isLate: true,
    delayMinutes: 45,
    unit: { id: '22222222-2222-2222-2222-222222222221', name: 'Unidade Centro', address: 'Rua Principal, 100' },
    item: {
      title: 'Controle de Temperatura · Freezer 1',
      isCritical: true,
      description: 'Verificar display digital do freezer de peixes/insumos (-18°C a -22°C).',
    },
    operator: { id: 'op-1', fullName: 'João Silva (Líder Manhã)', phone: '5551999998888' },
    alert: { alertedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(), status: 'sent', recipientPhone: '5551999998888' },
  },
  {
    id: 'task-demo-2',
    status: 'rejected',
    dueDate: new Date(Date.now() - 80 * 60 * 1000).toISOString(),
    scheduledDate: new Date().toISOString().slice(0, 10),
    isLate: false,
    unit: { id: '22222222-2222-2222-2222-222222222222', name: 'Unidade Shopping', address: 'Av. Mall, 500' },
    item: {
      title: 'Limpeza Pesada de Coifa e Fogão',
      isCritical: true,
      description: 'Desengordurar filtros da coifa e higienizar queimadores do fogão industrial.',
    },
    operator: { id: 'op-2', fullName: 'Carlos Santos (Fechamento)', phone: '5551988887777' },
    evidence: {
      photoUrl: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&auto=format&fit=crop&q=80',
      reviewStatus: 'rejected',
      aiReason: 'Detecção de resíduos de óleo e grelha desencaixada. Não atende ao padrão sanitário exigido.',
      aiConfidence: 0.42,
      capturedAt: new Date(Date.now() - 85 * 60 * 1000).toISOString(),
    },
  },
  {
    id: 'task-demo-3',
    status: 'completed',
    dueDate: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    scheduledDate: new Date().toISOString().slice(0, 10),
    completedAt: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    isLate: false,
    scoreP: 100,
    scoreE: 100,
    scoreQ: 98,
    unit: { id: '22222222-2222-2222-2222-222222222221', name: 'Unidade Centro', address: 'Rua Principal, 100' },
    item: {
      title: 'Panela de Arroz · Higienização da Cuba',
      isCritical: true,
      description: 'Lavar cuba com esponja e detergente neutro. Secar e checar se não há crosta.',
    },
    operator: { id: 'op-1', fullName: 'João Silva (Líder Manhã)', phone: '5551999998888' },
    evidence: {
      photoUrl: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=600&auto=format&fit=crop&q=80',
      reviewStatus: 'approved',
      aiReason: 'Cuba perfeitamente higienizada, seca e sem resíduos no fundo.',
      aiConfidence: 0.98,
      capturedAt: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    },
  },
  {
    id: 'task-demo-4',
    status: 'pending',
    dueDate: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    scheduledDate: new Date().toISOString().slice(0, 10),
    isLate: false,
    unit: { id: 'u3', name: 'Unidade Aeroporto', address: 'Terminal 2' },
    item: {
      title: 'Conferência de Válvulas de Gás e Ralos',
      isCritical: true,
      description: 'Checar registros de gás e fechamento de ralos sifonados.',
    },
    operator: { id: 'op-3', fullName: 'Mariana Lima', phone: '5551977776666' },
  },
];

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em Andamento',
  late: 'Atrasada',
  completed: 'Concluída',
  rejected: 'Recusada pela IA',
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'badge-pending',
  in_progress: 'badge-info',
  late: 'badge-late',
  completed: 'badge-completed',
  rejected: 'badge-rejected',
};

function formatDelay(minutes?: number) {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${remainingMinutes > 0 ? `${remainingMinutes}min` : ''}`;
  }
  return `${minutes}min`;
}

export function MultistoreDashboard() {
  const { demoMode } = useAuth();
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [evidences, setEvidences] = useState<EvidenceRow[]>([]);
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; type: 'info' | 'success' | 'warn' } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notifyingTaskId, setNotifyingTaskId] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date>(new Date());

  // Aba Tática Ativa
  const [activeTab, setActiveTab] = useState<'tasks' | 'evidences' | 'units'>('tasks');

  // Filtros de Tarefas
  const [taskFilter, setTaskFilter] = useState<'all' | 'critical' | 'late' | 'rejected' | 'completed'>('all');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Filtros de Unidades & Evidências
  const [unitFilter, setUnitFilter] = useState<'all' | 'risk' | 'healthy' | 'attention'>('all');
  const [evidenceFilter, setEvidenceFilter] = useState<'all' | 'attention'>('all');

  // Modal Lightbox de Evidência
  const [selectedEvidence, setSelectedEvidence] = useState<{
    photoUrl: string;
    aiReason?: string;
    aiConfidence?: number;
    reviewStatus?: string;
    unitName?: string;
    itemTitle?: string;
    operatorName?: string;
    capturedAt?: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashData, evData, tasksData] = await Promise.all([
        apiGet<{ units: UnitRow[]; demo?: boolean }>('/api/dashboard/multistore').catch(() => null),
        apiGet<{ evidences: EvidenceRow[] }>('/api/evidences').catch(() => null),
        apiGet<{ tasks: OperationalTask[] }>('/api/tasks/pendings').catch(() => null),
      ]);

      if (dashData?.units && dashData.units.length > 0) {
        setUnits(dashData.units);
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

      if (tasksData?.tasks && tasksData.tasks.length > 0) {
        setTasks(tasksData.tasks);
      } else if (demoMode) {
        setTasks(DEMO_OPERATIONAL_TASKS);
      } else {
        setTasks([]);
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
        setTasks(DEMO_OPERATIONAL_TASKS);
      } else {
        setUnits([]);
        setEvidences([]);
        setTasks([]);
      }
    } finally {
      setLastSync(new Date());
      setLoading(false);
    }
  }, [demoMode]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  // Filtragem de Tarefas
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (selectedUnitFilter && t.unit?.id !== selectedUnitFilter && t.unit?.name !== selectedUnitFilter) {
        return false;
      }

      const matchSearch =
        (t.item?.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.unit?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.operator?.fullName || '').toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchSearch) return false;

      if (taskFilter === 'critical') return t.item?.isCritical;
      if (taskFilter === 'late') return t.isLate || t.status === 'late';
      if (taskFilter === 'rejected') return t.status === 'rejected';
      if (taskFilter === 'completed') return t.status === 'completed';
      return true;
    });
  }, [tasks, taskFilter, selectedUnitFilter, searchQuery]);

  // Contadores de Tarefas
  const taskCounts = useMemo(() => {
    const late = tasks.filter((t) => t.isLate || t.status === 'late').length;
    const critical = tasks.filter((t) => t.item?.isCritical).length;
    const rejected = tasks.filter((t) => t.status === 'rejected').length;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const pending = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress').length;
    return { late, critical, rejected, completed, pending, total: tasks.length };
  }, [tasks]);

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

  // Ações de Automação
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
      await loadData();
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
      await loadData();
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
      await loadData();
    } catch (e) {
      setMsg({
        text: e instanceof Error ? e.message : 'Erro ao recalcular scores',
        type: 'warn',
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleNotifyOperator(taskId: string) {
    setNotifyingTaskId(taskId);
    setMsg(null);
    try {
      await apiPost<{ ok: boolean; notified?: string }>(`/api/tasks/${taskId}/notify`, {});
      setMsg({
        type: 'success',
        text: 'Lembrete de pendência enviado via WhatsApp para o operador responsável.',
      });
      await loadData();
    } catch (e) {
      setMsg({
        type: 'warn',
        text: e instanceof Error ? e.message : 'Falha ao enviar lembrete via WhatsApp.',
      });
    } finally {
      setNotifyingTaskId(null);
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
      await loadData();
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
            <h2 className="ops-main-title">Central de Comando Operacional</h2>
          </div>
          <p className="ops-telemetry-sub">
            <span><strong>{units.length} Unidades</strong> ativas na rede</span>
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
            {busy === 'generate' ? 'Gerando...' : 'Gerar Rotinas do Dia'}
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
            {busy === 'alerts' ? 'Disparando...' : 'Cobrar Atrasos no WhatsApp'}
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

      {/* Grade de 4 KPIs Executivos Estratégicos */}
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
          <p className="ops-kpi-sub">Média de Pontualidade, Execução e IA</p>
        </div>

        {/* Lojas em Risco */}
        <div
          className="ops-kpi-card"
          style={{ ['--kpi-glow' as string]: unitsInRisk.length > 0 ? '#f43f5e' : '#10b981', cursor: 'pointer' }}
          onClick={() => {
            setActiveTab('units');
            setUnitFilter(unitsInRisk.length > 0 ? 'risk' : 'all');
          }}
        >
          <div className="ops-kpi-glow" />
          <div className="ops-kpi-header">
            <h3 className="ops-kpi-title">Lojas em Atenção / Risco</h3>
            <span className={`badge ${unitsInRisk.length > 0 ? 'badge-critical' : 'badge-completed'}`} style={{ fontSize: '0.7rem' }}>
              {unitsInRisk.length > 0 ? 'Exige Ação' : '100% OK'}
            </span>
          </div>
          <div className="ops-kpi-body">
            <div className="ops-kpi-value" style={{ color: unitsInRisk.length > 0 ? '#f43f5e' : '#34d399' }}>
              {unitsInRisk.length}
            </div>
            <span className={`ops-kpi-benchmark ${unitsInRisk.length > 0 ? 'benchmark-danger' : 'benchmark-good'}`}>
              de {units.length} lojas
            </span>
          </div>
          <p className="ops-kpi-sub">Com pendências críticas ou score &lt; 75%</p>
        </div>

        {/* Fila de Atrasos */}
        <div
          className="ops-kpi-card"
          style={{ ['--kpi-glow' as string]: taskCounts.late > 0 ? '#f59e0b' : '#10b981', cursor: 'pointer' }}
          onClick={() => {
            setActiveTab('tasks');
            setTaskFilter('late');
          }}
        >
          <div className="ops-kpi-glow" />
          <div className="ops-kpi-header">
            <h3 className="ops-kpi-title">Tarefas em Atraso</h3>
            <span className="badge badge-late" style={{ fontSize: '0.7rem' }}>Janela Excedida</span>
          </div>
          <div className="ops-kpi-body">
            <div className="ops-kpi-value" style={{ color: taskCounts.late > 0 ? '#fbbf24' : '#34d399' }}>
              {taskCounts.late}
            </div>
            <span className={`ops-kpi-benchmark ${taskCounts.late > 0 ? 'benchmark-warn' : 'benchmark-good'}`}>
              {taskCounts.pending} pendentes
            </span>
          </div>
          <p className="ops-kpi-sub">Atrasaram o horário estipulado no POP</p>
        </div>

        {/* Auditorias Gemini IA */}
        <div
          className="ops-kpi-card"
          style={{ ['--kpi-glow' as string]: taskCounts.rejected > 0 ? '#f43f5e' : '#10b981', cursor: 'pointer' }}
          onClick={() => {
            setActiveTab('evidences');
            setEvidenceFilter('all');
          }}
        >
          <div className="ops-kpi-glow" />
          <div className="ops-kpi-header">
            <h3 className="ops-kpi-title">Auditorias Gemini IA</h3>
            <span className={`badge ${taskCounts.rejected > 0 ? 'badge-critical' : 'badge-completed'}`} style={{ fontSize: '0.7rem' }}>
              {taskCounts.rejected > 0 ? `${taskCounts.rejected} Recusadas` : '100% Aprovadas'}
            </span>
          </div>
          <div className="ops-kpi-body">
            <div className="ops-kpi-value" style={{ color: '#38bdf8' }}>
              {evidences.length}
            </div>
            <span className="ops-kpi-benchmark benchmark-good">
              {completionRate}% concluído
            </span>
          </div>
          <p className="ops-kpi-sub">Evidências fotográficas validadas</p>
        </div>
      </div>

      {/* Segmented Workspace Central (3 Abas Táticas) */}
      <div className="card" style={{ padding: '1.25rem' }}>
        {/* Navegação por Abas Principais */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.25rem',
            paddingBottom: '1rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div className="incident-tabs">
            <button
              type="button"
              className={`incident-tab-btn ${activeTab === 'tasks' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('tasks')}
            >
              Fila de Tarefas & Cobrança ({taskCounts.total})
            </button>
            <button
              type="button"
              className={`incident-tab-btn ${activeTab === 'evidences' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('evidences')}
            >
              Auditoria Visual Gemini IA ({evidences.length})
            </button>
            <button
              type="button"
              className={`incident-tab-btn ${activeTab === 'units' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('units')}
            >
              Desempenho por Loja ({units.length})
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <input
              type="text"
              className="ops-search-input"
              placeholder="Buscar tarefa, operador ou loja..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: 260 }}
            />
          </div>
        </div>

        {/* =========================================================================
            ABA 1: FILA DE TAREFAS & COBRANÇA DO DIA (TASKS)
           ========================================================================= */}
        {activeTab === 'tasks' && (
          <div className="incident-wrap">
            {/* Toolbar Secundária de Filtros de Tarefas */}
            <div className="incident-toolbar" style={{ margin: 0, padding: '0.65rem 0.85rem' }}>
              <div className="incident-chips">
                <button
                  type="button"
                  className={`incident-chip ${taskFilter === 'all' ? 'is-active' : ''}`}
                  onClick={() => setTaskFilter('all')}
                >
                  Todas ({taskCounts.total})
                </button>
                <button
                  type="button"
                  className={`incident-chip ${taskFilter === 'critical' ? 'is-active' : ''}`}
                  onClick={() => setTaskFilter('critical')}
                >
                  Críticas ({taskCounts.critical})
                </button>
                <button
                  type="button"
                  className={`incident-chip ${taskFilter === 'late' ? 'is-active' : ''}`}
                  onClick={() => setTaskFilter('late')}
                >
                  Atrasadas ({taskCounts.late})
                </button>
                <button
                  type="button"
                  className={`incident-chip ${taskFilter === 'rejected' ? 'is-active' : ''}`}
                  onClick={() => setTaskFilter('rejected')}
                >
                  Recusadas IA ({taskCounts.rejected})
                </button>
                <button
                  type="button"
                  className={`incident-chip ${taskFilter === 'completed' ? 'is-active' : ''}`}
                  onClick={() => setTaskFilter('completed')}
                >
                  Concluídas ({taskCounts.completed})
                </button>
              </div>

              {units.length > 1 && (
                <select
                  value={selectedUnitFilter}
                  onChange={(e) => setSelectedUnitFilter(e.target.value)}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '0.35rem 0.6rem',
                    fontSize: '0.82rem',
                    color: '#fff',
                  }}
                >
                  <option value="">Todas as Unidades</option>
                  {units.map((u) => (
                    <option key={u.unit_id} value={u.unit_id}>
                      {u.unit_name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Lista de Incidentes e Tarefas */}
            {filteredTasks.length === 0 ? (
              <div className="muted" style={{ padding: '3rem 0', textAlign: 'center' }}>
                Nenhuma rotina ou tarefa encontrada para os filtros selecionados.
              </div>
            ) : (
              <div className="incident-list">
                {filteredTasks.map((t) => {
                  const isCriticalItem = t.item?.isCritical;
                  const isLateTask = t.isLate || t.status === 'late';
                  const isRejectedTask = t.status === 'rejected';
                  const isCompletedTask = t.status === 'completed';

                  let cardCls = '';
                  if (isCriticalItem && isLateTask) cardCls = 'is-critical';
                  else if (isRejectedTask) cardCls = 'is-rejected';
                  else if (isLateTask) cardCls = 'is-late';
                  else if (isCompletedTask) cardCls = 'is-completed';

                  return (
                    <div key={t.id} className={`incident-card ${cardCls}`}>
                      <div className="incident-header-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                          <span
                            className={`badge ${
                              STATUS_CLASS[t.status] || (t.isLate ? 'badge-late' : 'badge-pending')
                            }`}
                          >
                            {STATUS_LABEL[t.status] || t.status}
                          </span>

                          {isCriticalItem && (
                            <span className="badge badge-critical" style={{ fontSize: '0.68rem' }}>
                              CRÍTICO · ALTO RISCO
                            </span>
                          )}

                          <strong style={{ fontSize: '0.98rem', color: '#ffffff' }}>
                            {t.item?.title || 'Rotina Sem Título'}
                          </strong>
                        </div>

                        {/* Botões de Ação Imediata */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {t.evidence && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              onClick={() =>
                                setSelectedEvidence({
                                  photoUrl: t.evidence!.photoUrl,
                                  aiReason: t.evidence!.aiReason,
                                  aiConfidence: t.evidence!.aiConfidence,
                                  reviewStatus: t.evidence!.reviewStatus,
                                  unitName: t.unit?.name,
                                  itemTitle: t.item?.title,
                                  operatorName: t.operator?.fullName,
                                  capturedAt: t.evidence!.capturedAt,
                                })
                              }
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                <circle cx="12" cy="13" r="4" />
                              </svg>
                              Ver Foto / IA
                            </button>
                          )}

                          {!isCompletedTask && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{
                                padding: '4px 10px',
                                fontSize: '0.75rem',
                                background: 'rgba(34, 197, 94, 0.15)',
                                borderColor: 'rgba(34, 197, 94, 0.35)',
                                color: '#4ade80',
                              }}
                              onClick={() => void handleNotifyOperator(t.id)}
                              disabled={notifyingTaskId === t.id}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                              </svg>
                              {notifyingTaskId === t.id ? 'Enviando...' : 'Cobrar WhatsApp'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Meta Grid da Tarefa */}
                      <div className="incident-meta-grid">
                        <div className="incident-meta-item">
                          <span className="incident-meta-label">Unidade / Loja</span>
                          <span className="incident-meta-val">{t.unit?.name || 'Não informada'}</span>
                        </div>

                        <div className="incident-meta-item">
                          <span className="incident-meta-label">Operador Responsável</span>
                          <span className="incident-meta-val">
                            {t.operator?.fullName || 'Não atribuído'}
                            {t.operator?.phone && (
                              <span style={{ fontSize: '0.74rem', color: '#4ade80', marginLeft: '6px' }}>
                                ({t.operator.phone})
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="incident-meta-item">
                          <span className="incident-meta-label">Horário Limite</span>
                          <span className="incident-meta-val">
                            {new Date(t.dueDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            {isLateTask && (
                              <span style={{ color: '#f43f5e', fontWeight: 800, marginLeft: '6px' }}>
                                (Atrasado {formatDelay(t.delayMinutes)})
                              </span>
                            )}
                          </span>
                        </div>

                        {t.alert && (
                          <div className="incident-meta-item">
                            <span className="incident-meta-label">Cobrança Automática</span>
                            <span className="incident-meta-val" style={{ color: '#38bdf8' }}>
                              Enviada às {new Date(t.alert.alertedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Parecer da IA se houver reprovação */}
                      {t.evidence?.aiReason && (
                        <div
                          style={{
                            background: isRejectedTask ? 'rgba(244, 63, 94, 0.1)' : 'rgba(56, 189, 248, 0.08)',
                            border: `1px solid ${isRejectedTask ? 'rgba(244, 63, 94, 0.25)' : 'rgba(56, 189, 248, 0.2)'}`,
                            padding: '0.65rem 0.85rem',
                            borderRadius: 8,
                            fontSize: '0.82rem',
                            color: isRejectedTask ? '#fda4af' : '#bae6fd',
                          }}
                        >
                          <strong>Parecer Gemini IA ({Math.round((t.evidence.aiConfidence || 0.5) * 100)}% conformidade):</strong>{' '}
                          {t.evidence.aiReason}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            ABA 2: FEED DE AUDITORIA VISUAL GEMINI IA (EVIDENCES)
           ========================================================================= */}
        {activeTab === 'evidences' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <div className="ops-tabs-pill">
                <button
                  type="button"
                  className={`ops-tab-btn ${evidenceFilter === 'all' ? 'is-active' : ''}`}
                  onClick={() => setEvidenceFilter('all')}
                >
                  Todas as Fotos ({evidences.length})
                </button>
                <button
                  type="button"
                  className={`ops-tab-btn ${evidenceFilter === 'attention' ? 'is-active' : ''}`}
                  onClick={() => setEvidenceFilter('attention')}
                >
                  Exigem Atenção / Recusadas
                </button>
              </div>

              <span className="muted" style={{ fontSize: '0.78rem' }}>
                Clique na foto para ampliar e auditar os detalhes
              </span>
            </div>

            {filteredEvidences.length === 0 ? (
              <div className="muted" style={{ padding: '3rem 0', textAlign: 'center' }}>
                Nenhuma evidência fotográfica registrada.
              </div>
            ) : (
              <div className="ops-evidences-grid">
                {filteredEvidences.map((ev) => {
                  const scoreQ = Math.round((ev.ai_confidence ?? 0.5) * 100);
                  const isApproved = ev.review_status === 'approved';
                  const isRejected = ev.review_status === 'rejected';

                  const unitName = ev.task_instance?.unit?.name || 'Unidade';
                  const taskTitle = ev.task_instance?.checklist_item?.title || 'Tarefa';

                  return (
                    <div
                      key={ev.id}
                      className={`ops-evidence-card ${
                        isRejected ? 'card-rejected' : isApproved ? 'card-approved' : ''
                      }`}
                    >
                      <div
                        className="ops-evidence-media"
                        onClick={() =>
                          setSelectedEvidence({
                            photoUrl: ev.photo_url,
                            aiReason: ev.ai_reason,
                            aiConfidence: ev.ai_confidence,
                            reviewStatus: ev.review_status,
                            unitName,
                            itemTitle: taskTitle,
                            capturedAt: ev.captured_at,
                          })
                        }
                      >
                        <img src={ev.photo_url} alt={taskTitle} loading="lazy" />
                        <div className="ops-evidence-overlay">
                          <span className="ops-evidence-zoom-hint">Clique para ampliar</span>
                        </div>
                        <div className="ops-evidence-badges">
                          <span
                            className={`badge ${
                              isApproved ? 'badge-completed' : isRejected ? 'badge-critical' : 'badge-pending'
                            }`}
                          >
                            {isApproved ? 'APROVADO' : isRejected ? 'RECUSADO' : 'EM ANÁLISE'}
                          </span>
                          <span className="badge badge-info">{scoreQ}% IA</span>
                        </div>
                      </div>

                      <div className="ops-evidence-content">
                        <div className="ops-evidence-meta-row">
                          <strong style={{ color: '#ffffff', fontSize: '0.88rem' }}>{unitName}</strong>
                          <span className="muted" style={{ fontSize: '0.74rem' }}>
                            {new Date(ev.captured_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div className="ops-evidence-title">{taskTitle}</div>

                        <div className="ops-evidence-reason">
                          <strong>Parecer IA:</strong> {ev.ai_reason || 'Análise em processamento.'}
                        </div>

                        {/* Botões de Ação da Evidência */}
                        <div className="ops-evidence-actions">
                          {isRejected && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{
                                flex: 1,
                                padding: '4px 6px',
                                fontSize: '0.72rem',
                                background: 'rgba(244, 63, 94, 0.15)',
                                borderColor: 'rgba(244, 63, 94, 0.3)',
                                color: '#f43f5e',
                              }}
                              onClick={() => void requestAdjustment(ev, unitName, taskTitle)}
                            >
                              Pedir Refação
                            </button>
                          )}

                          {!isApproved && (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              style={{ flex: 1, padding: '4px 6px', fontSize: '0.72rem' }}
                              onClick={() => handleManualApproval(ev)}
                            >
                              Aprovar Manual
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            ABA 3: DESEMPENHO POR UNIDADE / LOJA (UNITS)
           ========================================================================= */}
        {activeTab === 'units' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <div className="ops-tabs-pill">
                <button
                  type="button"
                  className={`ops-tab-btn ${unitFilter === 'all' ? 'is-active' : ''}`}
                  onClick={() => setUnitFilter('all')}
                >
                  Todas ({units.length})
                </button>
                <button
                  type="button"
                  className={`ops-tab-btn ${unitFilter === 'risk' ? 'is-active' : ''}`}
                  onClick={() => setUnitFilter('risk')}
                >
                  Em Risco ({unitsInRisk.length})
                </button>
                <button
                  type="button"
                  className={`ops-tab-btn ${unitFilter === 'healthy' ? 'is-active' : ''}`}
                  onClick={() => setUnitFilter('healthy')}
                >
                  Conforme (85%+)
                </button>
              </div>

              <span className="muted" style={{ fontSize: '0.78rem' }}>
                Clique em uma unidade para filtrar suas tarefas
              </span>
            </div>

            {rankedAndFilteredUnits.length === 0 ? (
              <div className="muted" style={{ padding: '3rem 0', textAlign: 'center' }}>
                Nenhuma unidade cadastrada ou correspondente aos filtros.
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
                            <h4 className="ops-unit-name">{u.unit_name}</h4>
                          </div>
                          {u.address && <p className="ops-unit-addr">{u.address}</p>}
                        </div>

                        <div className="ops-unit-score-badge">
                          <div
                            className="ops-unit-score-val"
                            style={{
                              color:
                                u.score_total != null && u.score_total >= 85
                                  ? '#34d399'
                                  : u.score_total != null && u.score_total >= 70
                                  ? '#fbbf24'
                                  : '#f43f5e',
                            }}
                          >
                            {u.score_total != null ? `${u.score_total}%` : '—'}
                          </div>
                          <span
                            className={`badge ${
                              isCritical ? 'badge-critical' : isWarning ? 'badge-pending' : 'badge-completed'
                            }`}
                            style={{ fontSize: '0.68rem' }}
                          >
                            {isCritical ? 'RISCO' : isWarning ? 'ATENÇÃO' : 'OK'}
                          </span>
                        </div>
                      </div>

                      {/* Barra de Progresso da Loja */}
                      <div className="ops-progress-bar-wrap">
                        <div className="ops-progress-bar-track">
                          <div
                            className="ops-progress-bar-seg seg-completed"
                            style={{ width: `${pCompleted}%` }}
                            title={`Concluídas: ${u.tasks_completed}`}
                          />
                          <div
                            className="ops-progress-bar-seg seg-pending"
                            style={{ width: `${pPending}%` }}
                            title={`Pendentes: ${u.tasks_pending}`}
                          />
                          <div
                            className="ops-progress-bar-seg seg-late"
                            style={{ width: `${pLate}%` }}
                            title={`Atrasadas: ${u.tasks_late}`}
                          />
                        </div>
                      </div>

                      {/* Métricas e Botão de Ação Rápida */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: '0.5rem',
                        }}
                      >
                        <div className="ops-unit-metrics-row">
                          <span className="ops-unit-metric-pill metric-completed">
                            <strong>{u.tasks_completed}</strong> Concluídas
                          </span>
                          <span className="ops-unit-metric-pill metric-pending">
                            <strong>{u.tasks_pending}</strong> Pendentes
                          </span>
                          {u.tasks_late > 0 && (
                            <span className="ops-unit-metric-pill metric-late">
                              <strong>{u.tasks_late}</strong> Atrasadas
                            </span>
                          )}
                          {u.critical_missed > 0 && (
                            <span className="ops-unit-metric-pill metric-critical">
                              <strong>{u.critical_missed}</strong> Críticas
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '0.74rem', padding: '3px 8px' }}
                          onClick={() => {
                            setSelectedUnitFilter(u.unit_id);
                            setActiveTab('tasks');
                          }}
                        >
                          Ver Tarefas desta Loja &rarr;
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox Modal de Evidência */}
      {selectedEvidence && (
        <div className="ops-lightbox-backdrop" onClick={() => setSelectedEvidence(null)}>
          <div className="ops-lightbox-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="ops-lightbox-close"
              onClick={() => setSelectedEvidence(null)}
              aria-label="Fechar modal"
            >
              ✕
            </button>

            <div className="ops-lightbox-grid">
              <div className="ops-lightbox-image-wrap">
                <img src={selectedEvidence.photoUrl} alt="Evidência fotográfica ampliada" />
              </div>

              <div className="ops-lightbox-details">
                <div className="ops-lightbox-header">
                  <span className="badge badge-info">{selectedEvidence.unitName || 'Unidade'}</span>
                  <span
                    className={`badge ${
                      selectedEvidence.reviewStatus === 'approved'
                        ? 'badge-completed'
                        : selectedEvidence.reviewStatus === 'rejected'
                        ? 'badge-critical'
                        : 'badge-pending'
                    }`}
                  >
                    {selectedEvidence.reviewStatus === 'approved'
                      ? 'HOMOLOGADO'
                      : selectedEvidence.reviewStatus === 'rejected'
                      ? 'RECUSADO PELA IA'
                      : 'EM ANÁLISE'}
                  </span>
                </div>

                <h3 className="ops-lightbox-title">{selectedEvidence.itemTitle || 'Inspeção Operacional'}</h3>

                {selectedEvidence.operatorName && (
                  <p className="muted" style={{ fontSize: '0.82rem', margin: '0.2rem 0 0.8rem' }}>
                    Registrado por: <strong>{selectedEvidence.operatorName}</strong>
                  </p>
                )}

                <div className="ops-lightbox-score-card">
                  <div className="ops-lightbox-score-val">
                    {Math.round((selectedEvidence.aiConfidence ?? 0.5) * 100)}%
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}>
                      Índice de Qualidade Visual (Score Q)
                    </div>
                    <div className="muted" style={{ fontSize: '0.78rem' }}>
                      Auditoria técnica automatizada via Gemini Multimodal
                    </div>
                  </div>
                </div>

                <div className="ops-lightbox-reason-block">
                  <h4 style={{ margin: '0 0 0.4rem', fontSize: '0.82rem', textTransform: 'uppercase', color: '#94a3b8' }}>
                    Parecer Técnico da IA
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.5, color: '#e2e8f0' }}>
                    {selectedEvidence.aiReason || 'Nenhum detalhe adicional informado para esta evidência.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
