import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../lib/api';
import { buildWhatsAppReminderMessage, openDirectWhatsApp } from '../../lib/whatsapp';

export interface NotifyRecipient {
  id: string;
  fullName: string;
  phone: string | null;
  role: string;
  inSector?: boolean;
}

export interface NotifyTaskTarget {
  id: string;
  dueDate: string;
  unit: { id: string; name: string } | null;
  sector?: { id: string; name: string } | null;
  item: { title: string } | null;
  operator?: { id: string; fullName: string; phone?: string } | null;
}

interface RecipientsResponse {
  sector: { id: string; name: string } | null;
  managers: NotifyRecipient[];
  sectorOperators: NotifyRecipient[];
  otherOperators: NotifyRecipient[];
}

interface NotifyRecipientModalProps {
  task: NotifyTaskTarget;
  demoMode?: boolean;
  onClose: () => void;
  onNotified: (info: { taskId: string; mode: 'sent' | 'opened'; message: string }) => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function NotifyRecipientModal({
  task,
  demoMode = false,
  onClose,
  onNotified,
}: NotifyRecipientModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RecipientsResponse | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [showOtherOperators, setShowOtherOperators] = useState(false);

  const effectiveSectorName = data?.sector?.name || task.sector?.name || null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      if (demoMode) {
        setData({
          sector: task.sector || { id: 'demo-sec', name: 'Salão' },
          managers: [
            { id: 'mgr-demo-1', fullName: 'Rogério Santos', phone: '5551999887766', role: 'manager', inSector: true },
          ],
          sectorOperators: [
            { id: 'op-demo-1', fullName: 'Yasmin Rodrigues', phone: '5551998881111', role: 'operator', inSector: true },
            { id: 'op-demo-2', fullName: 'Luana Biermann', phone: '5551998882222', role: 'operator', inSector: true },
            { id: 'op-demo-3', fullName: 'Bruna Cardoso', phone: '5551998883333', role: 'operator', inSector: true },
          ],
          otherOperators: [
            { id: 'op-demo-4', fullName: 'Carlos Eduardo', phone: '5551998884444', role: 'operator', inSector: false },
          ],
        });
        setLoading(false);
        return;
      }

      try {
        const res = await apiGet<RecipientsResponse>(`/api/tasks/${task.id}/notify-recipients`);
        if (!cancelled) {
          setData(res);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Falha ao carregar colaboradores da unidade.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [task.id, task.sector, demoMode]);

  async function notifyPerson(recipient: NotifyRecipient) {
    if (!recipient.phone) {
      setError(`${recipient.fullName} não possui telefone cadastrado.`);
      return;
    }

    setSendingId(recipient.id);
    setError(null);

    const reminderMsg = buildWhatsAppReminderMessage({
      unitName: task.unit?.name,
      sectorName: effectiveSectorName || undefined,
      taskTitle: task.item?.title,
      dueAt: task.dueDate,
      operatorName: recipient.fullName,
    });

    if (demoMode) {
      openDirectWhatsApp(recipient.phone, reminderMsg);
      onNotified({
        taskId: task.id,
        mode: 'opened',
        message: `WhatsApp aberto para cobrar ${recipient.fullName}.`,
      });
      onClose();
      return;
    }

    try {
      const res = await apiPost<{ ok: boolean; notified?: string }>(`/api/tasks/${task.id}/notify`, {
        recipientProfileId: recipient.id,
      });

      if (res.ok && res.notified === 'sent') {
        onNotified({
          taskId: task.id,
          mode: 'sent',
          message: `Lembrete disparado via robô para ${recipient.fullName}.`,
        });
        onClose();
        return;
      }

      openDirectWhatsApp(recipient.phone, reminderMsg);
      onNotified({
        taskId: task.id,
        mode: 'opened',
        message: `WhatsApp aberto diretamente para cobrar ${recipient.fullName}.`,
      });
      onClose();
    } catch {
      openDirectWhatsApp(recipient.phone, reminderMsg);
      onNotified({
        taskId: task.id,
        mode: 'opened',
        message: `WhatsApp aberto com cobrança pré-formatada para ${recipient.fullName}.`,
      });
      onClose();
    } finally {
      setSendingId(null);
    }
  }

  async function notifyWholeSector() {
    setSendingId('ALL_SECTOR');
    setError(null);

    if (demoMode) {
      onNotified({
        taskId: task.id,
        mode: 'sent',
        message: `Cobrança disparada para a equipe do setor ${effectiveSectorName || 'da unidade'}.`,
      });
      onClose();
      return;
    }

    try {
      const res = await apiPost<{
        ok: boolean;
        notified?: string;
        sentCount?: number;
        mockCount?: number;
        recipients?: string[];
      }>(`/api/tasks/${task.id}/notify`, { notifyAllSector: true });

      const count = (res.sentCount || 0) + (res.mockCount || 0);
      if (res.ok && res.notified === 'sent') {
        onNotified({
          taskId: task.id,
          mode: 'sent',
          message: `Lembrete disparado via robô para ${count} colaborador(es) ${
            effectiveSectorName ? `do setor ${effectiveSectorName}` : 'da unidade'
          }.`,
        });
        onClose();
        return;
      }

      // Gateway em modo mock/offline: avisa que precisa escolher individualmente para abrir wa.me
      setError(
        'O gateway WhatsApp (robô) não está conectado para envio em lote. Clique em "Cobrar" ao lado de um colaborador para abrir o WhatsApp direto.'
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Não foi possível disparar em lote. Selecione um colaborador para abrir o WhatsApp direto.'
      );
    } finally {
      setSendingId(null);
    }
  }

  const managers = data?.managers || [];
  const sectorOperators = data?.sectorOperators || [];
  const otherOperators = data?.otherOperators || [];
  const sectorOperatorsWithPhone = sectorOperators.filter((op) => Boolean(op.phone));
  const hasAnyRecipient =
    managers.length > 0 || sectorOperators.length > 0 || otherOperators.length > 0;

  const renderRow = (person: NotifyRecipient) => {
    const isBusy = sendingId === person.id;
    const isManager = person.role === 'manager';
    const hasPhone = Boolean(person.phone);

    return (
      <div
        key={person.id}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          padding: '0.6rem 0.75rem',
          borderRadius: 10,
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 800,
              background: isManager ? 'rgba(56, 189, 248, 0.16)' : 'rgba(34, 197, 94, 0.14)',
              color: isManager ? '#38bdf8' : '#4ade80',
              border: `1px solid ${isManager ? 'rgba(56, 189, 248, 0.35)' : 'rgba(34, 197, 94, 0.3)'}`,
            }}
          >
            {getInitials(person.fullName)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  color: '#f8fafc',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {person.fullName}
              </span>
              {isManager && (
                <span
                  className="badge badge-info"
                  style={{ fontSize: '0.65rem', padding: '1px 6px' }}
                >
                  Gerente
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.76rem', color: hasPhone ? '#94a3b8' : '#f87171' }}>
              {person.phone || 'Sem WhatsApp cadastrado'}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-sm"
          disabled={!hasPhone || sendingId !== null}
          onClick={() => void notifyPerson(person)}
          style={{
            flexShrink: 0,
            minHeight: 34,
            padding: '0 0.85rem',
            background: hasPhone ? 'rgba(34, 197, 94, 0.18)' : 'rgba(148, 163, 184, 0.1)',
            borderColor: hasPhone ? 'rgba(34, 197, 94, 0.45)' : 'rgba(148, 163, 184, 0.2)',
            color: hasPhone ? '#4ade80' : '#64748b',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          {isBusy ? 'Enviando...' : 'Cobrar'}
        </button>
      </div>
    );
  };

  return (
    <div
      className="ops-lightbox-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Selecionar destinatário para cobrança via WhatsApp"
    >
      <div
        className="ops-lightbox-modal"
        style={{ maxWidth: 520, width: '94%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ops-lightbox-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                flexShrink: 0,
                background: 'rgba(34, 197, 94, 0.16)',
                border: '1px solid rgba(34, 197, 94, 0.35)',
                color: '#4ade80',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>
                Cobrar via WhatsApp
              </h3>
              <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
                {task.item?.title || 'Tarefa Operacional'} · {task.unit?.name || 'Unidade'}
              </div>
              <div style={{ marginTop: 6, display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span
                  className="badge"
                  style={{
                    background: 'rgba(56, 189, 248, 0.14)',
                    color: '#38bdf8',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    fontSize: '0.7rem',
                  }}
                >
                  Setor: {effectiveSectorName || 'Geral da Loja'}
                </span>
                <span className="badge badge-pending" style={{ fontSize: '0.7rem' }}>
                  Prazo:{' '}
                  {new Date(task.dueDate).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            style={{ fontSize: '1.1rem', padding: '4px 8px' }}
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div
          className="ops-lightbox-body"
          style={{
            maxHeight: '65vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
            Escolha quem está na escala hoje para receber o lembrete desta tarefa:
          </p>

          {error && (
            <div className="notice warn" style={{ margin: 0 }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ padding: '2rem 0', textAlign: 'center', color: '#94a3b8' }}>
              Carregando equipe da unidade...
            </div>
          ) : !hasAnyRecipient ? (
            <div
              style={{
                padding: '1.5rem',
                textAlign: 'center',
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#94a3b8',
                fontSize: '0.85rem',
              }}
            >
              Nenhum gerente ou operador ativo encontrado para esta unidade. Cadastre colaboradores em{' '}
              <strong>Operadores de Campo</strong>.
            </div>
          ) : (
            <>
              {managers.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <div
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#38bdf8',
                    }}
                  >
                    Gerentes da Unidade ({managers.length})
                  </div>
                  {managers.map(renderRow)}
                </div>
              )}

              {sectorOperators.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: '#4ade80',
                      }}
                    >
                      {effectiveSectorName
                        ? `Equipe do Setor ${effectiveSectorName} (${sectorOperators.length})`
                        : `Operadores da Unidade (${sectorOperators.length})`}
                    </div>

                    {sectorOperatorsWithPhone.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={sendingId !== null}
                        onClick={() => void notifyWholeSector()}
                        style={{
                          fontSize: '0.74rem',
                          padding: '3px 9px',
                          borderColor: 'rgba(34, 197, 94, 0.35)',
                          color: '#4ade80',
                        }}
                      >
                        {sendingId === 'ALL_SECTOR'
                          ? 'Disparando...'
                          : `Cobrar todos do setor (${sectorOperatorsWithPhone.length})`}
                      </button>
                    )}
                  </div>
                  {sectorOperators.map(renderRow)}
                </div>
              )}

              {otherOperators.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setShowOtherOperators((v) => !v)}
                    style={{
                      alignSelf: 'flex-start',
                      fontSize: '0.76rem',
                      padding: '4px 8px',
                      color: '#94a3b8',
                    }}
                  >
                    {showOtherOperators
                      ? `▾ Ocultar outros setores (${otherOperators.length})`
                      : `▸ Ver colaboradores de outros setores (${otherOperators.length})`}
                  </button>
                  {showOtherOperators && otherOperators.map(renderRow)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
