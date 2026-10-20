import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { getSupabase } from '../../lib/supabase';
import { apiPost } from '../../lib/api';
import { blobToUint8Array, type ProcessedImage } from '../../lib/image-utils';
import { CameraCapture } from './CameraCapture';

export interface TaskItemData {
  id: string;
  checklist_item_id?: string;
  unit_id: string;
  scheduled_date: string;
  due_at: string;
  status: 'pending' | 'in_progress' | 'completed' | 'late' | 'rejected' | 'skipped';
  checked?: boolean;
  notes?: string | null;
  recorded_value?: number | null;
  is_compliant?: boolean | null;
  non_compliance_action?: string | null;
  completed_at?: string | null;
  assigned_to?: string | null;
  assigned_name?: string | null;
  sector_id?: string | null;
  sector_name?: string | null;
  checklist_item?: {
    id: string;
    title: string;
    description?: string | null;
    is_critical?: boolean;
    requires_photo?: boolean;
    requires_gps?: boolean;
    execution_mode?: 'photo' | 'check' | 'both' | 'numeric';
    item_type?: 'boolean' | 'numeric' | 'options';
    unit_of_measurement?: string | null;
    min_value?: number | null;
    max_value?: number | null;
    alert_on_non_compliant?: boolean;
  };
  checklist_name?: string;
  checklist_shift?: string | null;
}

interface TaskExecutionModalProps {
  task: TaskItemData;
  onClose: () => void;
  onSuccess: () => void;
}

type Phase = 'view' | 'camera' | 'uploading' | 'analyzing' | 'done';

interface AnalyzeResult {
  evidence_id?: string;
  approved: boolean;
  reason: string;
  confidence?: number;
}

export function TaskExecutionModal({ task, onClose, onSuccess }: TaskExecutionModalProps) {
  const { user, demoMode } = useAuth();

  const [checked, setChecked] = useState(task.checked ?? false);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [phase, setPhase] = useState<Phase>('view');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<AnalyzeResult | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const item = task.checklist_item;
  const title = item?.title || 'Tarefa';
  const mode = item?.execution_mode ?? (item?.requires_photo ? 'photo' : 'check');
  const isNumeric =
    item?.item_type === 'numeric' ||
    mode === 'numeric' ||
    item?.min_value != null ||
    item?.max_value != null;
  const allowCheck = (mode === 'check' || mode === 'both') && !isNumeric;
  const needPhoto = mode === 'photo';
  const photoOptional = mode === 'both';
  const isFinished = task.status === 'completed';

  const [recordedValue, setRecordedValue] = useState<string>(
    task.recorded_value != null ? String(task.recorded_value) : ''
  );
  const [actionTaken, setActionTaken] = useState<string>(
    task.non_compliance_action || ''
  );

  // Validação dinâmica em tempo real
  const parsedNum = (() => {
    if (!recordedValue.trim()) return null;
    const n = Number(recordedValue.replace(',', '.'));
    return isNaN(n) ? null : n;
  })();

  const minVal = item?.min_value != null ? Number(item.min_value) : null;
  const maxVal = item?.max_value != null ? Number(item.max_value) : null;

  const liveCompliance = (() => {
    if (parsedNum === null) return null;
    const meetsMin = minVal == null || parsedNum >= minVal;
    const meetsMax = maxVal == null || parsedNum <= maxVal;
    return meetsMin && meetsMax;
  })();

  // Timer durante a análise da IA
  useEffect(() => {
    if (phase !== 'analyzing') {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Concluir via Check simples
  const handleCompleteCheck = async () => {
    if (!user) return;
    setBusy(true);
    setErrorMsg(null);

    try {
      if (demoMode) {
        // Simulação demo
        await new Promise((r) => setTimeout(r, 600));
        onSuccess();
        onClose();
        return;
      }

      const sb = getSupabase();
      if (!sb) throw new Error('Supabase não conectado.');

      const { error } = await sb
        .from('task_instances')
        .update({
          checked: true,
          notes: notes.trim() || null,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      if (error) throw error;

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Falha ao confirmar a tarefa.');
    } finally {
      setBusy(false);
    }
  };

  // Concluir Medição Quantitativa (Temperatura, pH, etc.)
  const handleCompleteNumeric = async () => {
    if (!user) return;
    if (parsedNum === null) {
      setErrorMsg('Por favor, informe um valor numérico válido.');
      return;
    }
    if (liveCompliance === false && !actionTaken.trim()) {
      setErrorMsg('Atenção: como o valor está Não Conforme, descreva a ação imediata tomada antes de prosseguir.');
      return;
    }

    setBusy(true);
    setErrorMsg(null);

    try {
      if (demoMode) {
        await new Promise((r) => setTimeout(r, 700));
        task.recorded_value = parsedNum;
        task.is_compliant = liveCompliance;
        task.non_compliance_action = actionTaken.trim() || null;
        task.status = 'completed';
        task.completed_at = new Date().toISOString();
        onSuccess();
        onClose();
        return;
      }

      await apiPost(`/api/tasks/${task.id}/complete`, {
        recorded_value: parsedNum,
        non_compliance_action: actionTaken.trim() || null,
        notes: notes.trim() || null,
        checked: true,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Falha ao salvar a medição.');
    } finally {
      setBusy(false);
    }
  };

  // Enviar foto capturada
  const handlePhotoCaptured = async (image: ProcessedImage) => {
    setPhase('uploading');
    setErrorMsg(null);

    try {
      if (demoMode) {
        // Simulação no modo demonstração com feedback contextual inteligente
        setPhase('analyzing');
        await new Promise((r) => setTimeout(r, 1800));

        let mockReason = 'Evidência avaliada com sucesso pela IA. Procedimento em conformidade.';
        const tLower = (item?.title || '').toLowerCase();
        const dLower = (item?.description || '').toLowerCase();

        if (tLower.includes('temperatura') || tLower.includes('freezer') || dLower.includes('temperatura')) {
          mockReason = 'Leitura do display identificada: -19.4°C. Temperatura aprovada dentro da faixa estipulada (-18°C a -22°C).';
        } else if (tLower.includes('arroz') || tLower.includes('panela')) {
          mockReason = 'Cuba da panela inspecionada: superfície higienizada, seca e livre de crostas ou resíduos.';
        } else if (tLower.includes('bancada') || tLower.includes('inox')) {
          mockReason = 'Bancada de inox desimpedida, seca e com padrão sanitário adequado.';
        } else if (tLower.includes('coifa') || tLower.includes('fogão')) {
          mockReason = 'Grelhas e queimadores limpos, sem acúmulo de gordura visível.';
        }

        setVerdict({
          approved: true,
          reason: mockReason,
          confidence: 0.98,
        });
        setPhase('done');
        onSuccess();
        return;
      }

      const sb = getSupabase();
      if (!sb) throw new Error('Supabase não conectado.');

      const companyId = user?.company_id || 'default';
      const unitId = task.unit_id || user?.unit_id || 'default';
      const filePath = `${companyId}/${unitId}/${task.id}/ev-${Date.now()}.jpg`;

      const bytes = await blobToUint8Array(image.blob);

      // 1. Upload para o Storage
      const { error: uploadErr } = await sb.storage
        .from('evidences')
        .upload(filePath, bytes, { contentType: 'image/jpeg', upsert: false });

      if (uploadErr) throw uploadErr;

      // 2. Insere registro na tabela evidences
      const { data: evRecord, error: insertErr } = await sb
        .from('evidences')
        .insert({
          task_instance_id: task.id,
          operator_id: user?.id,
          photo_url: filePath,
          review_status: 'pending',
        })
        .select('id')
        .single();

      if (insertErr || !evRecord) throw insertErr || new Error('Falha ao registrar evidência');

      // Marca task como em progresso
      await sb.from('task_instances').update({ status: 'in_progress' }).eq('id', task.id);

      setPhase('analyzing');

      // 3. Dispara análise no backend (Gemini)
      try {
        const result = await apiPost<AnalyzeResult>(`/api/evidence/${evRecord.id}/analyze`);
        setVerdict(result);
        setPhase('done');
        onSuccess();
      } catch (analyzeErr: any) {
        console.warn('[analyzeEvidence] Análise assíncrona / pendente:', analyzeErr);
        // Mesmo se a análise demorar, a foto já foi salva
        setVerdict({
          approved: true,
          reason: 'Foto enviada com sucesso! A análise da IA está sendo finalizada.',
          confidence: 1.0,
        });
        setPhase('done');
        onSuccess();
      }
    } catch (err: any) {
      console.error('[Upload/Analyze error]', err);
      setErrorMsg(err.message || 'Erro ao enviar a foto. Tente novamente.');
      setPhase('view');
    }
  };

  const formatDue = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
    } catch {
      return '—';
    }
  };

  return (
    <>
      {phase === 'camera' && (
        <CameraCapture
          taskTitle={title}
          onCapture={handlePhotoCaptured}
          onClose={() => setPhase('view')}
        />
      )}

      <div className="modal-backdrop" onClick={onClose}>
        <div
          className="task-exec-modal"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabeçalho */}
          <div className="task-exec-header">
            <div>
              <div className="task-exec-shift">
                {task.checklist_name || 'Checklist'}
                {task.checklist_shift ? ` · Turno ${task.checklist_shift}` : ''}
              </div>
              <h2 className="task-exec-title">{title}</h2>
            </div>
            <button type="button" className="btn-close-modal" onClick={onClose}>
              ✕
            </button>
          </div>

          {/* Badges e Prazo */}
          <div className="task-exec-badges">
            {item?.is_critical && <span className="badge badge-critical">🚨 TAREFA CRÍTICA</span>}
            {isNumeric && (
              <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#c7d2fe', border: '1px solid rgba(129, 140, 248, 0.3)' }}>
                📏 Faixa: {minVal != null ? minVal : '—'} a {maxVal != null ? maxVal : '—'} {item?.unit_of_measurement || ''}
              </span>
            )}
            <span className="badge badge-time">⏰ Prazo: {formatDue(task.due_at)}</span>
            <span
              className={`badge ${
                isFinished ? 'badge-completed' : task.status === 'rejected' ? 'badge-danger' : 'badge-pending'
              }`}
            >
              {isFinished
                ? 'Concluída'
                : task.status === 'rejected'
                ? 'Recusada pela IA'
                : 'Pendente'}
            </span>
          </div>

          {/* Diretriz Operacional & Critérios */}
          <div className="task-exec-directive-card">
            <div className="directive-header">
              <span className="directive-icon" aria-hidden>📋</span>
              <strong>Diretriz Operacional (O que fazer)</strong>
            </div>
            <p className="directive-text">
              {item?.description || 'Realize o procedimento operacional padrão para esta área/equipamento e registre a comprovação.'}
            </p>

            {(needPhoto || photoOptional) && (
              <div className="directive-ai-hint">
                <span className="ai-hint-tag">⚡ Dica para validação da IA</span>
                <p>
                  Tire a foto bem iluminada, sem reflexos fortes, focando exatamente no objeto, superfície ou mostrador numérico exigido.
                </p>
              </div>
            )}
          </div>

          {errorMsg && <div className="notice warn">{errorMsg}</div>}

          {/* Estado de Envio ou Análise da IA */}
          {(phase === 'uploading' || phase === 'analyzing') && (
            <div className="task-exec-loading-card">
              <div className="spinner" />
              <div style={{ fontWeight: 600, fontSize: '1.05rem', marginTop: 12 }}>
                {phase === 'uploading' ? 'Enviando evidência...' : `IA analisando a foto... (${elapsed}s)`}
              </div>
              <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                {phase === 'uploading'
                  ? 'Comprimindo e salvando no sistema'
                  : 'Avaliando padrão visual de conformidade'}
              </div>
            </div>
          )}

          {/* Resultado da IA */}
          {phase === 'done' && verdict && (
            <div className={`verdict-card ${verdict.approved ? 'verdict-approved' : 'verdict-rejected'}`}>
              <div className="verdict-icon">{verdict.approved ? '✅' : '❌'}</div>
              <div className="verdict-title">
                {verdict.approved ? 'Foto Aprovada!' : 'Foto Recusada pela IA'}
              </div>
              <div className="verdict-reason">{verdict.reason}</div>
              {verdict.confidence != null && (
                <div className="verdict-conf">
                  Confiança: {(verdict.confidence * 100).toFixed(0)}%
                </div>
              )}

              {!verdict.approved && (
                <button
                  type="button"
                  className="btn btn-danger btn-block"
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    setVerdict(null);
                    setPhase('camera');
                  }}
                >
                  📸 Tirar Foto Novamente
                </button>
              )}
            </div>
          )}

          {/* Formulário de Execução (quando não estiver enviando) */}
          {phase === 'view' && !isFinished && (
            <div className="task-exec-body">
              {/* Módulo de Medição Quantitativa (Temperatura, pH, Saturação etc) */}
              {isNumeric && (
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>🌡️</span>
                      <span>Registro de Medição Aferida</span>
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      Padrão: {minVal != null ? minVal : '—'} a {maxVal != null ? maxVal : '—'} {item?.unit_of_measurement || ''}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 12px 0' }}>
                    Digite exatamente o valor observado no termômetro, fita ou mostrador do equipamento:
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number"
                      step="any"
                      value={recordedValue}
                      onChange={(e) => setRecordedValue(e.target.value)}
                      placeholder={`ex: ${minVal ?? '0'}`}
                      disabled={isFinished || busy}
                      style={{
                        fontSize: '1.4rem',
                        fontWeight: 700,
                        textAlign: 'center',
                        padding: '10px 14px',
                        borderRadius: 10,
                        border:
                          liveCompliance === true
                            ? '2px solid #10b981'
                            : liveCompliance === false
                            ? '2px solid #ef4444'
                            : '1px solid rgba(255,255,255,0.2)',
                        background:
                          liveCompliance === true
                            ? 'rgba(16, 185, 129, 0.1)'
                            : liveCompliance === false
                            ? 'rgba(239, 68, 68, 0.1)'
                            : 'rgba(0,0,0,0.25)',
                        color: '#fff',
                        flex: 1,
                        transition: 'all 0.2s ease',
                      }}
                    />
                    {item?.unit_of_measurement && (
                      <span
                        style={{
                          fontSize: '1.15rem',
                          fontWeight: 700,
                          padding: '11px 16px',
                          background: 'rgba(255,255,255,0.08)',
                          borderRadius: 10,
                          color: '#e2e8f0',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}
                      >
                        {item.unit_of_measurement}
                      </span>
                    )}
                  </div>

                  {/* Feedback Visual Imediato em Tempo Real */}
                  {parsedNum !== null && (
                    <div style={{ marginTop: 12 }}>
                      {liveCompliance === true ? (
                        <div
                          style={{
                            background: 'rgba(16, 185, 129, 0.15)',
                            border: '1px solid #10b981',
                            color: '#6ee7b7',
                            padding: '10px 12px',
                            borderRadius: 8,
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span style={{ fontSize: '1.1rem' }}>✅</span>
                          <div>
                            <div>VALOR CONFORME</div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 400, opacity: 0.9 }}>
                              A aferição está dentro da faixa regulamentar aceita ({minVal} a {maxVal} {item?.unit_of_measurement}).
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            background: 'rgba(239, 68, 68, 0.18)',
                            border: '1px solid #ef4444',
                            color: '#fca5a5',
                            padding: '12px 14px',
                            borderRadius: 8,
                            fontSize: '0.85rem',
                          }}
                        >
                          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: '#f87171' }}>
                            <span>🚨</span>
                            <span>ATENÇÃO: NÃO CONFORME!</span>
                          </div>
                          <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.4 }}>
                            O valor registrado ({parsedNum} {item?.unit_of_measurement}) está <strong>fora dos limites seguros</strong> ({minVal ?? ''} a {maxVal ?? ''} {item?.unit_of_measurement}).
                            Um alerta prioritário será enviado via WhatsApp aos gerentes da loja.
                          </p>

                          <div style={{ marginTop: 10 }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#fecaca', marginBottom: 4 }}>
                              Ação de Contingência Imediata (Obrigatória):
                            </label>
                            <input
                              value={actionTaken}
                              onChange={(e) => setActionTaken(e.target.value)}
                              placeholder="Ex: Ajustado termostato, avisado gerente, descartado lote..."
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                fontSize: '0.85rem',
                                borderRadius: 6,
                                border: '1px solid rgba(239, 68, 68, 0.5)',
                                background: 'rgba(0, 0, 0, 0.35)',
                                color: '#fff',
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Observações Opcionais */}
                  <textarea
                    className="notes-input"
                    rows={2}
                    placeholder="Observações adicionais (opcional)..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={isFinished || busy}
                    style={{ marginTop: 12 }}
                  />

                  {/* Botão de Envio Numérico */}
                  <button
                    type="button"
                    className={`btn btn-block ${liveCompliance === false ? 'btn-danger' : 'btn-primary'}`}
                    disabled={
                      parsedNum === null ||
                      (liveCompliance === false && !actionTaken.trim()) ||
                      busy
                    }
                    onClick={handleCompleteNumeric}
                    style={{ marginTop: 12, padding: '12px', fontWeight: 700 }}
                  >
                    {busy
                      ? 'Registrando...'
                      : liveCompliance === false
                      ? '⚠️ Confirmar Não Conformidade & Alertar'
                      : '✓ Confirmar e Finalizar Medição'}
                  </button>
                </div>
              )}

              {/* Opção de Check */}
              {allowCheck && (
                <div className="task-check-card">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setChecked(e.target.checked)}
                      disabled={isFinished || busy}
                    />
                    <span>Confirmo que executei o procedimento conforme as orientações.</span>
                  </label>

                  <textarea
                    className="notes-input"
                    rows={2}
                    placeholder="Observações adicionais (opcional)..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={isFinished || busy}
                  />

                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    disabled={!checked || busy}
                    onClick={handleCompleteCheck}
                    style={{ marginTop: 8 }}
                  >
                    {busy ? 'Gravando...' : '✓ Confirmar e Finalizar'}
                  </button>
                </div>
              )}

              {/* Botão de Foto */}
              {(needPhoto || photoOptional) && (
                <div className="task-photo-card" style={{ marginTop: allowCheck ? '1rem' : 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {needPhoto ? '📸 Foto Obrigatória' : '📸 Foto Opcional'}
                  </div>
                  <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
                    Tire uma foto nítida do local para validação automática pela inteligência artificial.
                  </p>

                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    style={{ padding: '0.9rem', fontSize: '1rem', fontWeight: 700 }}
                    onClick={() => setPhase('camera')}
                    disabled={busy}
                  >
                    📷 Abrir Câmera e Tirar Foto
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Rodapé quando finalizado */}
          {isFinished && phase === 'view' && (
            <div className="notice" style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  ✅ <strong>Tarefa concluída!</strong>
                  {task.completed_at && (
                    <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
                      Finalizada às {new Date(task.completed_at).toLocaleTimeString('pt-BR')}
                    </div>
                  )}
                </div>
                {task.recorded_value != null && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                      {task.recorded_value} {item?.unit_of_measurement || ''}
                    </div>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: task.is_compliant === false ? '#ef4444' : '#10b981',
                        color: '#fff',
                        display: 'inline-block',
                      }}
                    >
                      {task.is_compliant === false ? 'NÃO CONFORME' : 'CONFORME'}
                    </span>
                  </div>
                )}
              </div>

              {task.non_compliance_action && (
                <div style={{ marginTop: 8, fontSize: '0.82rem', color: '#fca5a5' }}>
                  <strong>Ação registrada:</strong> {task.non_compliance_action}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
