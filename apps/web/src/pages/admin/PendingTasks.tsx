import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../lib/api';

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
  item: { title: string; isCritical: boolean } | null;
  operator: { id: string; fullName: string; phone?: string } | null;
  alert?: TaskAlert | null;
  evidence?: TaskEvidence | null;
}

interface AuditSummary {
  totalTasks: number;
  totalLate: number;
  totalCriticalLate: number;
  totalAlerted: number;
  totalResolvedLate: number;
  totalPending: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
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
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  // Filtros
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [unitsList, setUnitsList] = useState<{ id: string; name: string }[]>([]);

  // Carrega lista de unidades para o filtro
  useEffect(() => {
    async function loadUnits() {
      try {
        const res = await apiGet<{ units: { id: string; name: string }[] }>('/api/units');
        setUnitsList(res.units || []);
      } catch {
        // Silêncio se não carregar
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
        if (criticalOnly) q.set('critical', '1');
        if (selectedUnit) q.set('unitId', selectedUnit);
        q.set('date', new Date().toISOString().slice(0, 10));

        const data = await apiGet<{ tasks: AuditTask[] }>(`/api/tasks/pendings?${q.toString()}`);
        setTasks(data.tasks);
        setSummary(null);
      } else {
        const q = new URLSearchParams();
        q.set('startDate', selectedDate);
        q.set('endDate', selectedDate);
        if (criticalOnly) q.set('criticalOnly', '1');
        if (selectedUnit) q.set('unitId', selectedUnit);
        if (filterStatus && filterStatus !== 'all') q.set('status', filterStatus);

        const data = await apiGet<{ tasks: AuditTask[]; summary: AuditSummary }>(
          `/api/tasks/audit-report?${q.toString()}`
        );
        setTasks(data.tasks);
        setSummary(data.summary);
      }
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Falha ao carregar tarefas.' });
    } finally {
      setLoading(false);
    }
  }, [activeTab, criticalOnly, selectedDate, selectedUnit, filterStatus]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function notifyOperator(task: AuditTask) {
    const targetLabel = task.operator?.phone
      ? `${task.operator.fullName} (${task.operator.phone})`
      : `${task.operator?.fullName || 'o operador'} (sem telefone cadastrado)`;

    if (!confirm(`Enviar lembrete direto no WhatsApp para ${targetLabel}?`)) {
      return;
    }
    setNotifyingId(task.id);
    setMsg(null);
    try {
      await apiPost<{ ok: boolean }>(`/api/tasks/${task.id}/notify`, {});
      setMsg({
        type: 'ok',
        text: `✅ Lembrete enviado com sucesso para ${task.operator?.fullName || 'o operador'} via WhatsApp!`,
      });
      await loadData();
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Falha ao enviar lembrete.' });
    } finally {
      setNotifyingId(null);
    }
  }

  const lateCount = tasks.filter((t) => t.isLate || t.status === 'late').length;
  const criticalCount = tasks.filter((t) => t.item?.isCritical).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Pendências & Auditoria de Falhas</h2>
          <p>
            {activeTab === 'today'
              ? 'Acompanhamento em tempo real das rotinas e pendências de hoje.'
              : 'Relatório histórico de não-conformidades, comprovação de falhas e auditoria de alertas.'}
          </p>
        </div>
        <div className="row">
          <div className="shift-tabs" style={{ margin: 0 }}>
            <button
              type="button"
              className={activeTab === 'today' ? 'active' : ''}
              onClick={() => setActiveTab('today')}
            >
              📅 Hoje em Aberto
            </button>
            <button
              type="button"
              className={activeTab === 'audit' ? 'active' : ''}
              onClick={() => setActiveTab('audit')}
            >
              📋 Relatório de Auditoria
            </button>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loadData()}>
            Atualizar
          </button>
        </div>
      </div>

      {msg && <div className={`notice ${msg.type === 'err' ? 'warn' : ''}`}>{msg.text}</div>}

      {/* Barra de Filtros */}
      <div
        className="card"
        style={{
          marginBottom: '1rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div className="row" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
          {activeTab === 'audit' && (
            <div className="row" style={{ gap: '0.4rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Data:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '0.35rem 0.6rem',
                  fontSize: '0.85rem',
                }}
              />
            </div>
          )}

          {unitsList.length > 1 && (
            <div className="row" style={{ gap: '0.4rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Unidade:</label>
              <select
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '0.35rem 0.6rem',
                  fontSize: '0.85rem',
                }}
              >
                <option value="">Todas as unidades</option>
                {unitsList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="row" style={{ gap: '0.4rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Status:</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '0.35rem 0.6rem',
                  fontSize: '0.85rem',
                }}
              >
                <option value="all">Todos os status</option>
                <option value="late">Apenas Atrasadas</option>
                <option value="pending">Apenas Pendentes</option>
                <option value="completed">Apenas Concluídas</option>
              </select>
            </div>
          )}

          <label className="row" style={{ gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={criticalOnly}
              onChange={(e) => setCriticalOnly(e.target.checked)}
            />
            Só críticas
          </label>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-4" style={{ marginBottom: '1.25rem' }}>
        <div className="card">
          <h3>Total de Registros</h3>
          <div className="stat-value">{summary?.totalTasks ?? tasks.length}</div>
          <div className="stat-sub">{activeTab === 'today' ? 'em aberto hoje' : 'no período filtrado'}</div>
        </div>
        <div className="card">
          <h3>Falhas / Atrasos</h3>
          <div className="stat-value" style={{ color: (summary?.totalLate ?? lateCount) > 0 ? 'var(--danger)' : undefined }}>
            {summary?.totalLate ?? lateCount}
          </div>
          <div className="stat-sub">venceram fora do prazo</div>
        </div>
        <div className="card">
          <h3>Avisos ao Gestor (WhatsApp)</h3>
          <div className="stat-value" style={{ color: 'var(--primary)' }}>
            {summary?.totalAlerted ?? tasks.filter((t) => t.alert).length}
          </div>
          <div className="stat-sub">disparos únicos efetuados</div>
        </div>
        <div className="card">
          <h3>Críticas Vencidas</h3>
          <div
            className="stat-value"
            style={{ color: (summary?.totalCriticalLate ?? criticalCount) > 0 ? 'var(--danger)' : undefined }}
          >
            {summary?.totalCriticalLate ?? criticalCount}
          </div>
          <div className="stat-sub">alto impacto na operação</div>
        </div>
      </div>

      {/* Lista / Tabela de Auditoria */}
      {loading ? (
        <div className="muted" style={{ padding: '2rem', textAlign: 'center' }}>
          Carregando dados de auditoria…
        </div>
      ) : tasks.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎉</div>
          <strong>Nenhuma pendência ou falha encontrada.</strong>
          <p className="muted" style={{ fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
            Tudo em dia para o filtro selecionado.
          </p>
        </div>
      ) : (
        <div className="stack" style={{ gap: '0.75rem' }}>
          {tasks.map((t) => {
            const delayText = formatDelay(t.delayMinutes);
            const isResolvedLate = t.status === 'completed' && t.isLate;

            return (
              <div
                key={t.id}
                className="card"
                style={{
                  borderLeft: t.item?.isCritical
                    ? '4px solid var(--danger)'
                    : t.isLate
                    ? '4px solid var(--warning)'
                    : '4px solid var(--border)',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div
                  className="row"
                  style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}
                >
                  <div style={{ flex: 1 }}>
                    <div className="row" style={{ gap: '0.5rem', alignItems: 'center', marginBottom: 4 }}>
                      <strong style={{ fontSize: '1.05rem' }}>{t.item?.title || 'Tarefa'}</strong>
                      <span className={`badge ${STATUS_CLASS[t.status] || 'badge-pending'}`}>
                        {STATUS_LABEL[t.status] || t.status}
                      </span>
                      {t.item?.isCritical && <span className="badge badge-critical">🚨 CRÍTICO</span>}
                      {isResolvedLate && (
                        <span className="badge badge-info" title="Concluída após o prazo estipulado">
                          Resolvida c/ atraso
                        </span>
                      )}
                    </div>

                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      🏢 <strong>{t.unit?.name || 'Unidade'}</strong> {t.unit?.address ? `· ${t.unit.address}` : ''}
                    </div>

                    <div className="row" style={{ gap: '1rem', marginTop: 6, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      <span>
                        ⏰ <strong>Prazo:</strong>{' '}
                        {new Date(t.dueDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ({new Date(t.dueDate).toLocaleDateString('pt-BR')})
                      </span>

                      {t.completedAt && (
                        <span>
                          ✅ <strong>Concluído em:</strong>{' '}
                          {new Date(t.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}

                      {t.isLate && delayText && (
                        <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                          ⏱️ {t.completedAt ? `Atraso total: ${delayText}` : `Atrasado há: ${delayText}`}
                        </span>
                      )}
                    </div>

                    <div className="row" style={{ gap: '1rem', marginTop: 6, fontSize: '0.82rem' }}>
                      <span>
                        👤 <strong>Operador:</strong>{' '}
                        {t.operator ? (
                          <span>
                            {t.operator.fullName} {t.operator.phone ? `(${t.operator.phone})` : '· sem fone'}
                          </span>
                        ) : (
                          <span className="muted">Não atribuído</span>
                        )}
                      </span>

                      {/* Notificação ao Gestor */}
                      {t.alert ? (
                        <span style={{ color: '#86efac' }}>
                          📱 <strong>Gestor notificado:</strong>{' '}
                          {new Date(t.alert.alertedAt).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          (1x disparo único)
                        </span>
                      ) : t.item?.isCritical && t.isLate ? (
                        <span className="muted">📱 Alerta ao gestor: pendente de envio</span>
                      ) : null}
                    </div>
                  </div>

                  {/* Ações e Evidências */}
                  <div className="row" style={{ gap: '0.6rem', alignItems: 'center' }}>
                    {t.evidence?.photoUrl && (
                      <a
                        href={t.evidence.photoUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Ver foto de evidência"
                        style={{ display: 'block' }}
                      >
                        <img
                          src={t.evidence.photoUrl}
                          alt="Evidência"
                          style={{
                            width: 50,
                            height: 50,
                            objectFit: 'cover',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                          }}
                        />
                      </a>
                    )}

                    {t.status !== 'completed' && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => void notifyOperator(t)}
                        disabled={notifyingId === t.id || !t.operator?.phone}
                        title={
                          t.operator?.phone
                            ? 'Enviar cobrança no WhatsApp do operador'
                            : 'Operador sem telefone cadastrado'
                        }
                      >
                        {notifyingId === t.id ? 'Enviando…' : 'Cobrar Operador'}
                      </button>
                    )}
                  </div>
                </div>

                {t.evidence?.aiReason && (
                  <div
                    style={{
                      fontSize: '0.8rem',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '0.4rem 0.6rem',
                      color: '#d1d5db',
                    }}
                  >
                    🤖 <strong>Parecer IA da Foto:</strong> {t.evidence.aiReason}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}