import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../lib/api';

interface PendingTask {
  id: string;
  status: string;
  dueDate: string;
  notes?: string;
  unit: { id: string; name: string; address?: string } | null;
  item: { title: string; isCritical: boolean } | null;
  operator: { id: string; fullName: string; phone?: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  late: 'Atrasada',
  rejected: 'Recusada pela IA',
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'badge-pending',
  in_progress: 'badge-info',
  late: 'badge-late',
  rejected: 'badge-rejected',
};

export function PendingTasks() {
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [criticalOnly, setCriticalOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const q = criticalOnly ? '?critical=1' : '';
      const data = await apiGet<{ tasks: PendingTask[] }>(`/api/tasks/pendings${q}`);
      setTasks(data.tasks);
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Falha ao carregar pendências.' });
    } finally {
      setLoading(false);
    }
  }, [criticalOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function notify(task: PendingTask) {
    const targetLabel = task.operator?.phone
      ? `${task.operator.fullName} (${task.operator.phone})`
      : `${task.operator?.fullName || 'o operador'} (sem telefone cadastrado)`;

    if (!confirm(`Enviar lembrete WhatsApp para ${targetLabel}?`)) {
      return;
    }
    setNotifyingId(task.id);
    setMsg(null);
    try {
      await apiPost<{ ok: boolean }>(`/api/tasks/${task.id}/notify`, {});
      setMsg({ type: 'ok', text: `✅ Lembrete enviado com sucesso para ${task.operator?.fullName || 'o operador'} via WhatsApp!` });
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Falha ao enviar lembrete.' });
    } finally {
      setNotifyingId(null);
    }
  }

  const lateCount = tasks.filter((t) => t.status === 'late').length;
  const criticalCount = tasks.filter((t) => t.item?.isCritical).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Pendências</h2>
          <p>Tarefas não concluídas de hoje, por unidade, para acompanhar e agir.</p>
        </div>
        <div className="row">
          <label className="row" style={{ gap: '0.5rem', fontSize: '0.85rem' }} htmlFor="crit">
            <input
              id="crit"
              type="checkbox"
              checked={criticalOnly}
              onChange={(e) => setCriticalOnly(e.target.checked)}
            />
            Só críticas
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
            Atualizar
          </button>
        </div>
      </div>

      {msg && <div className={`notice ${msg.type === 'err' ? 'warn' : ''}`}>{msg.text}</div>}

      <div className="grid grid-3" style={{ marginBottom: '1rem' }}>
        <div className="card">
          <h3>Pendentes</h3>
          <div className="stat-value">{tasks.length}</div>
          <div className="stat-sub">em toda a rede</div>
        </div>
        <div className="card">
          <h3>Atrasadas</h3>
          <div className="stat-value" style={{ color: lateCount ? 'var(--danger)' : undefined }}>
            {lateCount}
          </div>
          <div className="stat-sub">vencidas</div>
        </div>
        <div className="card">
          <h3>Críticas</h3>
          <div className="stat-value" style={{ color: criticalCount ? 'var(--danger)' : undefined }}>
            {criticalCount}
          </div>
          <div className="stat-sub">destaque</div>
        </div>
      </div>

      {loading ? (
        <div className="muted">Carregando…</div>
      ) : tasks.length === 0 ? (
        <div className="card">
          <div className="muted">Nenhuma pendência hoje. 🎉</div>
        </div>
      ) : (
        <div className="stack" style={{ gap: '0.75rem' }}>
          {tasks.map((t) => (
            <div
              key={t.id}
              className="card"
              style={{
                borderLeft: t.item?.isCritical ? '3px solid var(--danger)' : undefined,
                padding: '0.85rem 1rem',
              }}
            >
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
                    <strong>{t.item?.title || 'Tarefa'}</strong>
                    <span className={`badge ${STATUS_CLASS[t.status] || 'badge-pending'}`}>
                      {STATUS_LABEL[t.status] || t.status}
                    </span>
                    {t.item?.isCritical && <span className="badge badge-critical">CRÍTICO</span>}
                  </div>
                  <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                    {t.unit?.name || '—'} {t.unit?.address ? `· ${t.unit.address}` : ''}
                  </div>
                  <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
                    {t.operator ? `Operador: ${t.operator.fullName}` : 'Sem operador'} · Prazo:{' '}
                    {new Date(t.dueDate).toLocaleString('pt-BR')}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void notify(t)}
                  disabled={notifyingId === t.id || !t.operator?.phone}
                  title={t.operator?.phone ? 'Enviar lembrete WhatsApp' : 'Operador sem telefone'}
                >
                  {notifyingId === t.id ? 'Enviando…' : 'Notificar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}