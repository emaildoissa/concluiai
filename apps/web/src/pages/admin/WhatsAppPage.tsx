import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut } from '../../lib/api';

interface WhatsAppConfig {
  provider: string;
  apiUrl: string;
  instance: string;
  instanceNumber: string;
  phoneNumberId: string;
  alertsEnabled?: boolean;
  alertTemplate?: string;
  defaultAlertTemplate?: string;
  hasToken: boolean;
  tokenHint?: string;
}

interface WhatsAppStatus {
  provider: string;
  state: string;
  connected: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

const DEFAULT_TEMPLATE_FALLBACK =
  `{prioridade} ConcluíAI\n` +
  `Unidade: {unidade}\n` +
  `Tarefa: {tarefa}\n` +
  `Prazo: {prazo}\n` +
  `Status: não executada no prazo.\n` +
  `Acesse o painel para acompanhar.`;

const PROVIDERS = [
  {
    id: 'evolution',
    name: 'Evolution API',
    tag: 'Recomendado',
    description: 'Servidor Baileys dedicado. Suporta instâncias múltiplas, envio de mídias e webhooks.',
  },
  {
    id: 'meta',
    name: 'Meta Cloud API',
    tag: 'Oficial',
    description: 'API corporativa oficial do WhatsApp Business com Phone Number ID.',
  },
  {
    id: 'twilio',
    name: 'Twilio Gateway',
    tag: 'Global',
    description: 'Gateway internacional de mensageria empresarial para WhatsApp.',
  },
  {
    id: 'mock',
    name: 'Simulador Mock',
    tag: 'Desenvolvimento',
    description: 'Ambiente seguro para testes internos. Registra envios sem disparar mensagens reais.',
  },
];

const TEMPLATE_VARS = [
  { key: '{unidade}', label: 'Unidade' },
  { key: '{tarefa}', label: 'Tarefa' },
  { key: '{prazo}', label: 'Prazo' },
  { key: '{prioridade}', label: 'Prioridade (🚨/⚠️)' },
  { key: '{status}', label: 'Status' },
  { key: '{link_painel}', label: 'Link do Painel' },
];

export function WhatsAppPage() {
  const [cfg, setCfg] = useState<WhatsAppConfig | null>(null);
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; payload?: unknown } | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [provider, setProvider] = useState('evolution');
  const [apiUrl, setApiUrl] = useState('');
  const [instance, setInstance] = useState('');
  const [instanceNumber, setInstanceNumber] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [token, setToken] = useState('');
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [alertTemplate, setAlertTemplate] = useState(DEFAULT_TEMPLATE_FALLBACK);
  const [defaultTemplate, setDefaultTemplate] = useState(DEFAULT_TEMPLATE_FALLBACK);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<WhatsAppConfig>('/api/settings/whatsapp');
      setCfg(data);
      setProvider(data.provider || 'evolution');
      setApiUrl(data.apiUrl || '');
      setInstance(data.instance || '');
      setInstanceNumber(data.instanceNumber || '');
      setPhoneNumberId(data.phoneNumberId || '');
      setAlertsEnabled(data.alertsEnabled !== false);
      setAlertTemplate(data.alertTemplate || data.defaultAlertTemplate || DEFAULT_TEMPLATE_FALLBACK);
      setDefaultTemplate(data.defaultAlertTemplate || DEFAULT_TEMPLATE_FALLBACK);

      const st = await apiGet<WhatsAppStatus>('/api/settings/whatsapp/status').catch(() => null);
      if (st) setStatus(st);
    } catch {
      setMsg({ type: 'err', text: 'Não foi possível carregar a configuração atual do gateway.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      await apiPut<{ ok: boolean }>('/api/settings/whatsapp', {
        provider,
        apiUrl,
        instance,
        instanceNumber,
        phoneNumberId,
        alertsEnabled,
        alertTemplate,
        token: token || undefined,
      });
      setToken('');
      setMsg({ type: 'ok', text: 'Configurações de mensageria e modelo de alerta salvos com sucesso.' });
      await loadData();
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Falha ao salvar configurações.' });
    } finally {
      setSaving(false);
    }
  }

  function renderPreviewText(tmpl: string) {
    const now = new Date();
    const formattedDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(
      2,
      '0'
    )}/${now.getFullYear()}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    return tmpl
      .replace(/\{prioridade\}/g, '🚨 CRÍTICA')
      .replace(/\{unidade\}/g, 'Matriz - Centro')
      .replace(/\{tarefa\}/g, 'Higienização da Câmara Fria')
      .replace(/\{prazo\}/g, formattedDate)
      .replace(/\{status\}/g, 'não executada no prazo')
      .replace(/\{link_painel\}/g, 'https://painel.concluiai.com.br');
  }

  function handleInsertTag(tag: string) {
    setAlertTemplate((prev) => (prev ? `${prev} ${tag}` : tag));
  }

  function handleResetTemplate() {
    setAlertTemplate(defaultTemplate);
  }

  async function handleTestSend(customMsg?: string) {
    if (!testPhone.trim()) {
      setTestResult({
        ok: false,
        message: 'Informe o número do destinatário com DDI e DDD (ex: 5551999998888)',
      });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiPost<{ ok: boolean; status?: string; details?: unknown }>(
        '/api/settings/whatsapp/test',
        {
          toPhone: testPhone,
          customMessage: customMsg,
        }
      );
      setTestResult({
        ok: true,
        message: `Disparo de teste concluído com sucesso para ${testPhone}.`,
        payload: res.details,
      });
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : 'Falha ao processar teste de envio.',
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="wa-settings-wrap">
      {/* Header da Página */}
      <div className="page-header">
        <div>
          <h2>Gateway & Notificações WhatsApp</h2>
          <p>Configuração de instâncias de disparo e canais de alerta operacional para gerentes e operadores.</p>
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void loadData()}
          disabled={loading}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          Verificar Status
        </button>
      </div>

      {msg && (
        <div
          className={`notice ${msg.type === 'err' ? 'warn' : ''}`}
          style={
            msg.type === 'ok'
              ? {
                  color: '#34d399',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                }
              : undefined
          }
        >
          {msg.text}
        </div>
      )}

      {/* Banner de Telemetria de Conexão */}
      <div className="wa-status-banner">
        <div className="wa-status-live">
          <div
            className={`wa-pulse-indicator ${
              status?.provider === 'mock'
                ? 'mock'
                : status?.connected
                  ? 'online'
                  : 'offline'
            }`}
          />
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#ffffff' }}>
              {status?.provider === 'mock'
                ? 'Modo Simulação Ativo (Mock)'
                : status?.connected
                  ? 'Instância Conectada & Operante'
                  : 'Instância Desconectada ou Não Configurada'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Provedor Atual:{' '}
              <strong style={{ color: '#ffffff', textTransform: 'uppercase' }}>
                {status?.provider || provider}
              </strong>{' '}
              {status?.state && `· Estado: ${status.state}`}
            </div>
          </div>
        </div>

        <div>
          <span
            className={`badge ${
              status?.provider === 'mock'
                ? 'badge-info'
                : status?.connected
                  ? 'badge-completed'
                  : 'badge-critical'
            }`}
          >
            {status?.provider === 'mock' ? 'SIMULAÇÃO' : status?.connected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Card de Modalidade de Alertas & Notificações */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>
                Alertas de Tarefas Atrasadas para Gerentes
              </h3>
              <span className={`badge ${alertsEnabled ? 'badge-completed' : 'badge-info'}`}>
                {alertsEnabled ? 'ALERTAS ATIVADOS' : 'MODO APENAS PAINEL'}
              </span>
            </div>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: 650 }}>
              Quando ativado, o robô monitora as tarefas e notifica os gerentes da unidade quando o prazo for ultrapassado.
              Desative caso esteja em fase de teste inicial ou não deseje mensagens no WhatsApp da empresa.
            </p>
          </div>

          <label className="switch-toggle" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={alertsEnabled}
              onChange={(e) => setAlertsEnabled(e.target.checked)}
              style={{ display: 'none' }}
            />
            <div className={`switch-track ${alertsEnabled ? 'active' : ''}`}>
              <div className="switch-thumb" />
            </div>
          </label>
        </div>

        {!alertsEnabled && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.85rem 1rem',
              borderRadius: 8,
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              color: '#38bdf8',
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>ℹ️</span>
            <div>
              <strong>Modo de Teste / Somente Painel Ativo:</strong> Nenhuma mensagem será enviada aos gerentes no WhatsApp. As tarefas atrasadas continuarão sendo marcadas como "Em Atraso" normalmente no painel.
            </div>
          </div>
        )}
      </div>

      {/* Editor do Modelo de Mensagem com Prévia Visual WhatsApp */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>
              Modelo da Mensagem de Alerta (Gerente)
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Personalize o texto que os gerentes recebem quando uma tarefa crítica não for executada no prazo.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleResetTemplate}
            title="Restaurar mensagem padrão original"
          >
            Restaurar Mensagem Padrão
          </button>
        </div>

        <div className="wa-template-layout">
          {/* Coluna Esquerda: Editor de Texto e Tags */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  marginBottom: '0.4rem',
                  color: 'var(--text-muted)',
                }}
              >
                Variáveis Dinâmicas Disponíveis (Clique para Inserir):
              </label>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {TEMPLATE_VARS.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    className="wa-tag-chip"
                    onClick={() => handleInsertTag(v.key)}
                  >
                    <code>{v.key}</code>
                    <span>{v.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  marginBottom: '0.35rem',
                  color: 'var(--text-muted)',
                }}
              >
                Corpo do Alerta:
              </label>
              <textarea
                rows={7}
                value={alertTemplate}
                onChange={(e) => setAlertTemplate(e.target.value)}
                placeholder="Escreva o modelo da mensagem..."
                style={{
                  width: '100%',
                  padding: '0.75rem 0.9rem',
                  background: 'var(--bg-soft)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 8,
                  color: '#ffffff',
                  fontSize: '0.88rem',
                  lineHeight: 1.5,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>
          </div>

          {/* Coluna Direita: Prévia Visual Estilo WhatsApp */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.78rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                marginBottom: '0.4rem',
                color: 'var(--text-muted)',
              }}
            >
              Prévia em Tempo Real (Visão do Gerente):
            </label>

            <div className="wa-preview-screen">
              <div className="wa-preview-header">
                <div className="wa-preview-avatar">🤖</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#ffffff' }}>ConcluíAI Alertas</div>
                  <div style={{ fontSize: '0.7rem', color: '#34d399' }}>online</div>
                </div>
              </div>

              <div className="wa-preview-chat-body">
                <div className="wa-chat-bubble">
                  <div className="wa-chat-text">{renderPreviewText(alertTemplate)}</div>
                  <div className="wa-chat-footer">
                    <span>14:02</span>
                    <span className="wa-check-icon">✓✓</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Seletor Visual de Provedor */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.78rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '0.75rem',
            color: 'var(--text-muted)',
          }}
        >
          Provedor de Conexão WhatsApp
        </label>

        <div className="wa-provider-grid">
          {PROVIDERS.map((p) => {
            const isSelected = provider === p.id;
            return (
              <div
                key={p.id}
                className={`wa-provider-card ${isSelected ? 'is-selected' : ''}`}
                onClick={() => setProvider(p.id)}
              >
                <div className="wa-provider-title">
                  <span>{p.name}</span>
                  <span
                    className={`badge ${
                      isSelected ? 'badge-completed' : 'badge-info'
                    }`}
                    style={{ fontSize: '0.68rem' }}
                  >
                    {p.tag}
                  </span>
                </div>
                <p className="wa-provider-desc">{p.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Formulário de Parâmetros e Credenciais */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>
          Parâmetros do Gateway ({provider.toUpperCase()})
        </h3>

        {provider === 'mock' ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem', lineHeight: 1.5 }}>
            <p style={{ margin: '0 0 0.5rem' }}>
              O modo <strong>Mock (Simulador)</strong> não realiza conexões HTTP externas. Ele simula respostas com sucesso para todas
              as mensagens enviadas por rotinas ou alertas de supervisores.
            </p>
            <p style={{ margin: 0 }}>Ideal para testes rápidos, validações em homologação ou demonstrações sem ler QR Code.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {provider === 'evolution' && (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      marginBottom: '0.35rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    URL Base da Evolution API *
                  </label>
                  <input
                    type="url"
                    placeholder="https://evolution.seuservidor.com"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      background: 'var(--bg-soft)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 8,
                      color: '#ffffff',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      marginBottom: '0.35rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Nome da Instância *
                  </label>
                  <input
                    type="text"
                    placeholder="concluiai-prod"
                    value={instance}
                    onChange={(e) => setInstance(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      background: 'var(--bg-soft)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 8,
                      color: '#ffffff',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>
              </div>
            )}

            {provider === 'meta' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    marginBottom: '0.35rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  Meta Phone Number ID *
                </label>
                <input
                  type="text"
                  placeholder="Ex: 109876543210987"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    background: 'var(--bg-soft)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>
            )}

            {provider === 'twilio' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    marginBottom: '0.35rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  Número Remetente Twilio (whatsapp:+...) *
                </label>
                <input
                  type="text"
                  placeholder="whatsapp:+14155238886"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    background: 'var(--bg-soft)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    marginBottom: '0.35rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  Token / API Key Secreta
                </label>
                <input
                  type="password"
                  placeholder={
                    cfg?.hasToken ? `••••${cfg.tokenHint || ''} (deixe em branco para manter)` : 'Insira o token'
                  }
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    background: 'var(--bg-soft)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    marginBottom: '0.35rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  Número do Robô (E.164)
                </label>
                <input
                  type="tel"
                  placeholder="5551988887777 (sem traços)"
                  value={instanceNumber}
                  onChange={(e) => setInstanceNumber(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    background: 'var(--bg-soft)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 8,
                    color: '#ffffff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>
            </div>

            <div
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                background: 'rgba(0, 0, 0, 0.2)',
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              Configurar o número do robô previne que o sistema envie notificações ou alertas para o próprio número da
              instância.
            </div>
          </div>
        )}

        <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? 'Salvando Configuração…' : 'Salvar e Aplicar'}
          </button>
        </div>
      </div>

      {/* Terminal de Teste e Diagnóstico em Tempo Real */}
      <div className="wa-console-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#ffffff' }}>
              Console de Diagnóstico & Disparo Imediato
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Envie uma mensagem de teste para validar a entrega no WhatsApp do gerente ou operador.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void handleTestSend(renderPreviewText(alertTemplate))}
            disabled={testing || !testPhone.trim()}
            title="Envia a mensagem com o modelo de alerta configurado"
          >
            Testar com Modelo de Alerta
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="tel"
            placeholder="Telefone de teste: 5551999998888"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            style={{
              flex: 1,
              minWidth: 240,
              padding: '0.6rem 0.85rem',
              background: '#05080f',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 8,
              color: '#ffffff',
              fontSize: '0.9rem',
              fontFamily: 'var(--font-mono)',
            }}
          />

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleTestSend()}
            disabled={testing}
          >
            {testing ? 'Disparando Teste…' : 'Enviar Mensagem Padrão'}
          </button>
        </div>

        {testResult && (
          <div>
            <div
              className={`notice ${testResult.ok ? '' : 'warn'}`}
              style={
                testResult.ok
                  ? {
                      color: '#34d399',
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                    }
                  : undefined
              }
            >
              {testResult.message}
            </div>

            {testResult.payload ? (
              <div className="wa-console-terminal">
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>// Resposta do Gateway:</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(testResult.payload, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}