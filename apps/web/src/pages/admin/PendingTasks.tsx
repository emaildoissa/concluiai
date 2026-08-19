import { useCallback, useEffect, useState, useMemo } from 'react';
import { apiGet, apiPost, resolvePhotoUrl } from '../../lib/api';

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

interface AuditTask {
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

export function PendingTasks() {
  const [activeTab, setActiveTab] = useState<'today' | 'audit'>('today');
  const [tasks, setTasks] = useState<AuditTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [bulkAlerting, setBulkAlerting] = useState(false);

  // Filtros rápidos
  const [quickFilter, setQuickFilter] = useState<'all' | 'critical' | 'late' | 'rejected'>('all');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [unitsList, setUnitsList] = useState<{ id: string; name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal de Inspeção de Evidência
  const [inspectEvidence, setInspectEvidence] = useState<{ task: AuditTask; evidence: TaskEvidence } | null>(null);

  // Carrega lista de unidades para o filtro
  useEffect(() => {
    async function loadUnits() {
      try {
        const res = await apiGet<{ units: { id: string; name: string }[] }>('/api/units');
        setUnitsList(res.units || []);
      } catch {
        // Fallback silencioso
      }
    }
    void loadUnits();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      if (activeTab === 'today') {
        const q = new URLSearchParams();
        if (selectedUnit) q.set('unitId', selectedUnit);
        q.set('date', new Date().toISOString().slice(0, 10));

        const data = await apiGet<{ tasks: AuditTask[] }>(`/api/tasks/pendings?${q.toString()}`);
        setTasks(data.tasks || []);
      } else {
        const q = new URLSearchParams();
        q.set('startDate', selectedDate);
        q.set('endDate', selectedDate);
        if (selectedUnit) q.set('unitId', selectedUnit);

        const data = await apiGet<{ tasks: AuditTask[] }>(
          `/api/tasks/audit-report?${q.toString()}`
        );
        setTasks(data.tasks || []);
      }
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Falha ao carregar tarefas.' });
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedDate, selectedUnit]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Filtragem local por chips e busca
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchSearch =
        (t.item?.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.unit?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.operator?.fullName || '').toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchSearch) return false;

      if (quickFilter === 'critical') return t.item?.isCritical;
      if (quickFilter === 'late') return t.isLate || t.status === 'late';
      if (quickFilter === 'rejected') return t.status === 'rejected' || t.evidence?.reviewStatus === 'rejected';
      return true;
    });
  }, [tasks, searchQuery, quickFilter]);

  // Contadores para KPIs
  const metrics = useMemo(() => {
    const total = tasks.length;
    const late = tasks.filter((t) => t.isLate || t.status === 'late').length;
    const criticalLate = tasks.filter((t) => t.item?.isCritical && (t.isLate || t.status === 'late')).length;
    const alerted = tasks.filter((t) => t.alert).length;
    const pending = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress').length;
    const rejected = tasks.filter((t) => t.status === 'rejected' || t.evidence?.reviewStatus === 'rejected').length;

    return { total, late, criticalLate, alerted, pending, rejected };
  }, [tasks]);

  // Cobrança individual
  async function notifyOperator(task: AuditTask) {
    const targetLabel = task.operator?.phone
      ? `${task.operator.fullName} (${task.operator.phone})`
      : `${task.operator?.fullName || 'o operador'}`;

    if (!confirm(`Disparar lembrete via WhatsApp para ${targetLabel}?`)) {
      return;
    }
    setNotifyingId(task.id);
    setMsg(null);
    try {
      await apiPost<{ ok: boolean }>(`/api/tasks/${task.id}/notify`, {});
      setMsg({
        type: 'ok',
        text: `Lembrete enviado com sucesso para ${task.operator?.fullName || 'o operador'} via WhatsApp.`,
      });
      await loadData();
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Falha ao enviar lembrete.' });
    } finally {
      setNotifyingId(null);
    }
  }

  // Disparo em lote para todas as tarefas críticas atrasadas
  async function handleBulkAlerts() {
    setBulkAlerting(true);
    setMsg(null);
    try {
      const r = await apiPost<{ alerted: number; skipped: number; invalid: number }>('/api/tasks/run-alerts', {});
      const parts = [`${r.alerted} alertas WhatsApp disparados com sucesso`];
      if (r.skipped > 0) parts.push(`${r.skipped} já alertados`);
      if (r.invalid > 0) parts.push(`${r.invalid} sem telefone`);
      setMsg({
        type: r.alerted > 0 ? 'ok' : 'err',
        text: parts.join(' · '),
      });
      await loadData();
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Falha ao processar disparo em lote.' });
    } finally {
      setBulkAlerting(false);
    }
  }

  return (
    <div className="incident-wrap">
      {/* Header Principal */}
      <div className="page-header">
        <div>
          <h2>Auditoria de Falhas & Incidentes</h2>
          <p>
            {activeTab === 'today'
              ? 'Central de intervenção e cobrança em tempo real das rotinas do turno.'
              : 'Relatório histórico de não-conformidades, comprovação de falhas e auditoria de disparos.'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {metrics.criticalLate > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ background: '#f43f5e', borderColor: '#f43f5e' }}
              onClick={() => void handleBulkAlerts()}
              disabled={bulkAlerting}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {bulkAlerting ? 'Disparando Lote...' : `Cobrar Todas Críticas (${metrics.criticalLate})`}
            </button>
          )}

          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loadData()} disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`notice ${msg.type === 'err' ? 'warn' : ''}`}
          style={msg.type === 'ok' ? { color: '#34d399', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)' } : undefined}
        >
          {msg.text}
        </div>
      )}

      {/* Grid de KPIs Táticos */}
      <div className="evolution-kpi-grid">
        <div className="evolution-kpi-card" onClick={() => setQuickFilter('all')} style={{ cursor: 'pointer' }}>
          <div className="evolution-kpi-header">
            <span>Total de Registros</span>
            <span className="badge badge-info">{metrics.total} Tarefas</span>
          </div>
          <div className="evolution-kpi-val">{metrics.total}</div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>
            {activeTab === 'today' ? 'programadas para hoje' : 'no período filtrado'}
          </div>
        </div>

        <div className="evolution-kpi-card" onClick={() => setQuickFilter('late')} style={{ cursor: 'pointer' }}>
          <div className="evolution-kpi-header">
            <span>Atrasos Registrados</span>
            <span className="badge badge-pending">Tempo Limite</span>
          </div>
          <div className="evolution-kpi-val" style={{ color: metrics.late > 0 ? '#fbbf24' : '#34d399' }}>
            {metrics.late}
          </div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>
            excederam a janela horária do POP
          </div>
        </div>

        <div className="evolution-kpi-card" onClick={() => setQuickFilter('critical')} style={{ cursor: 'pointer' }}>
          <div className="evolution-kpi-header">
            <span>Críticas em Atraso</span>
            <span className="badge badge-critical">Alto Risco</span>
          </div>
          <div className="evolution-kpi-val" style={{ color: metrics.criticalLate > 0 ? '#f43f5e' : '#34d399' }}>
            {metrics.criticalLate}
          </div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>
            impacto sanitário ou operacional direto
          </div>
        </div>

        <div className="evolution-kpi-card" onClick={() => setQuickFilter('rejected')} style={{ cursor: 'pointer' }}>
          <div className="evolution-kpi-header">
            <span>Reprovações Gemini IA</span>
            <span className="badge badge-critical">Auditoria</span>
          </div>
          <div className="evolution-kpi-val" style={{ color: metrics.rejected > 0 ? '#f43f5e' : '#34d399' }}>
            {metrics.rejected}
          </div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>
            evidências fora dos padrões técnicos
          </div>
        </div>
      </div>

      {/* Toolbar Tática (Abas + Filtros + Busca) */}
      <div className="incident-toolbar">
        <div className="incident-tabs">
          <button
            type="button"
            className={`incident-tab-btn ${activeTab === 'today' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('today')}
          >
            Rotinas de Hoje ({metrics.pending} pendentes)
          </button>
          <button
            type="button"
            className={`incident-tab-btn ${activeTab === 'audit' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            Relatório de Auditoria
          </button>
        </div>

        <div className="incident-filters">
          {/* Chips Rápidos de Status */}
          <div className="incident-chips">
            <button
              type="button"
              className={`incident-chip ${quickFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setQuickFilter('all')}
            >
              Todas ({tasks.length})
            </button>
            <button
              type="button"
              className={`incident-chip ${quickFilter === 'critical' ? 'is-active' : ''}`}
              onClick={() => setQuickFilter('critical')}
            >
              Críticas ({tasks.filter((t) => t.item?.isCritical).length})
            </button>
            <button
              type="button"
              className={`incident-chip ${quickFilter === 'late' ? 'is-active' : ''}`}
              onClick={() => setQuickFilter('late')}
            >
              Atrasadas ({metrics.late})
            </button>
            <button
              type="button"
              className={`incident-chip ${quickFilter === 'rejected' ? 'is-active' : ''}`}
              onClick={() => setQuickFilter('rejected')}
            >
              Recusadas IA ({metrics.rejected})
            </button>
          </div>

          {activeTab === 'audit' && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.35rem 0.6rem',
                fontSize: '0.82rem',
                color: '#fff',
              }}
            />
          )}

          {unitsList.length > 1 && (
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.35rem 0.6rem',
                fontSize: '0.82rem',
              }}
            >
              <option value="">Todas as unidades</option>
              {unitsList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}

          <input
            type="text"
            placeholder="Buscar tarefa, loja ou operador..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.35rem 0.75rem',
              fontSize: '0.82rem',
              color: '#fff',
              width: 220,
            }}
          />
        </div>
      </div>

      {/* Lista de Incidentes e Tarefas */}
      {loading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          Carregando dados de incidentes e auditoria...
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#34d399', marginBottom: '0.5rem' }}>
            Conformidade Operacional Plena
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            Nenhum incidente, atraso ou não-conformidade pendente para os filtros selecionados.
          </p>
        </div>
      ) : (
        <div className="incident-list">
          {filteredTasks.map((t) => {
            const delayText = formatDelay(t.delayMinutes);
            const isResolvedLate = t.status === 'completed' && t.isLate;
            const isRejected = t.status === 'rejected' || t.evidence?.reviewStatus === 'rejected';

            let cardCls = 'incident-card';
            if (t.item?.isCritical && (t.isLate || t.status === 'late')) cardCls += ' is-critical';
            else if (isRejected) cardCls += ' is-rejected';
            else if (t.isLate) cardCls += ' is-late';
            else if (t.status === 'completed') cardCls += ' is-completed';

            return (
              <div key={t.id} className={cardCls}>
                <div className="incident-header-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: 4 }}>
                      <strong style={{ fontSize: '1.05rem', color: '#ffffff' }}>{t.item?.title || 'Tarefa Operacional'}</strong>
                      <span className={`badge ${STATUS_CLASS[t.status] || 'badge-pending'}`}>
                        {STATUS_LABEL[t.status] || t.status}
                      </span>
                      {t.item?.isCritical && <span className="badge badge-critical">CRÍTICO</span>}
                      {isResolvedLate && <span className="badge badge-info">Resolvida c/ atraso</span>}
                    </div>

                    <div className="muted" style={{ fontSize: '0.82rem' }}>
                      {t.unit?.name || 'Unidade'} {t.unit?.address ? `· ${t.unit.address}` : ''}
                    </div>
                  </div>

                  {/* Ações Rápidas do Card */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    {t.evidence?.photoUrl && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        style={{ padding: '3px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}
                        onClick={() => setInspectEvidence({ task: t, evidence: t.evidence! })}
                        title="Inspecionar evidência fotográfica"
                      >
                        <img
                          src={resolvePhotoUrl(t.evidence.photoUrl)}
                          alt="Evidência"
                          style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }}
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      </button>
                    )}

                    {t.status !== 'completed' && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => void notifyOperator(t)}
                        disabled={notifyingId === t.id || !t.operator?.phone}
                        title={
                          t.operator?.phone
                            ? 'Enviar cobrança no WhatsApp do operador'
                            : 'Operador sem telefone cadastrado'
                        }
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                        {notifyingId === t.id ? 'Enviando...' : 'Cobrar Operador'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Grade de Metadados Estruturados */}
                <div className="incident-meta-grid">
                  <div className="incident-meta-item">
                    <span className="incident-meta-label">Horário Limite</span>
                    <span className="incident-meta-val">
                      {new Date(t.dueDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ({new Date(t.dueDate).toLocaleDateString('pt-BR')})
                    </span>
                  </div>

                  <div className="incident-meta-item">
                    <span className="incident-meta-label">Status de Tempo</span>
                    <span
                      className="incident-meta-val"
                      style={{ color: t.isLate ? '#f43f5e' : t.completedAt ? '#34d399' : '#fbbf24' }}
                    >
                      {t.completedAt
                        ? `Concluído às ${new Date(t.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                        : t.isLate && delayText
                        ? `Atrasado há ${delayText}`
                        : 'Dentro da janela'}
                    </span>
                  </div>

                  <div className="incident-meta-item">
                    <span className="incident-meta-label">Operador Responsável</span>
                    <span className="incident-meta-val">
                      {t.operator?.fullName || 'Não atribuído'} {t.operator?.phone ? `(${t.operator.phone})` : ''}
                    </span>
                  </div>

                  <div className="incident-meta-item">
                    <span className="incident-meta-label">Telemetria de Alerta</span>
                    <span className="incident-meta-val" style={{ color: t.alert ? '#34d399' : '#94a3b8' }}>
                      {t.alert
                        ? `Notificado às ${new Date(t.alert.alertedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                        : 'Nenhum alerta disparado'}
                    </span>
                  </div>
                </div>

                {/* Parecer Gemini IA */}
                {t.evidence?.aiReason && (
                  <div className={`ops-ev-reason-box ${isRejected ? 'reason-bad' : 'reason-good'}`} style={{ margin: 0 }}>
                    <strong>Parecer Técnico IA:</strong> {t.evidence.aiReason}
                    {t.evidence.aiConfidence && (
                      <span style={{ marginLeft: 8, opacity: 0.8, fontSize: '0.75rem' }}>
                        (Confiança: {Math.round(t.evidence.aiConfidence * 100)}%)
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Modal para Inspeção de Evidência */}
      {inspectEvidence && (
        <div className="ops-lightbox-overlay" onClick={() => setInspectEvidence(null)}>
          <div className="ops-lightbox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ops-lightbox-header">
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>
                  {inspectEvidence.task.item?.title || 'Evidência Operacional'}
                </h3>
                <span className="muted" style={{ fontSize: '0.82rem' }}>
                  {inspectEvidence.task.unit?.name || 'Unidade'} · Capturada em{' '}
                  {new Date(inspectEvidence.evidence.capturedAt).toLocaleString('pt-BR')}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setInspectEvidence(null)}
                style={{ fontSize: '1.2rem', padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>

            <div className="ops-lightbox-body">
              <div className="ops-lightbox-img-wrap">
                <img
                  src={resolvePhotoUrl(inspectEvidence.evidence.photoUrl)}
                  alt="Inspeção"
                  className="ops-lightbox-img"
                />
              </div>

              {inspectEvidence.task.item?.description && (
                <div className="task-exec-directive-card" style={{ margin: 0 }}>
                  <div className="directive-header">
                    <strong>Diretriz Operacional Exigida (POP)</strong>
                  </div>
                  <p className="directive-text">{inspectEvidence.task.item.description}</p>
                </div>
              )}

              <div
                className={`ops-ev-reason-box ${
                  inspectEvidence.evidence.reviewStatus === 'rejected' ? 'reason-bad' : 'reason-good'
                }`}
                style={{ padding: '0.85rem 1rem', fontSize: '0.9rem' }}
              >
                <strong>Parecer da IA:</strong> {inspectEvidence.evidence.aiReason || 'Auditoria concluída.'}
                {inspectEvidence.evidence.aiConfidence && (
                  <div style={{ marginTop: 6, fontSize: '0.8rem', opacity: 0.85 }}>
                    Confiança do Algoritmo: {Math.round(inspectEvidence.evidence.aiConfidence * 100)}%
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}