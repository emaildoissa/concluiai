import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut } from '../../lib/api';

interface WhatsAppConfig {
  provider: string;
  apiUrl: string;
  instance: string;
  instanceNumber: string;
  phoneNumberId: string;
  hasToken: boolean;
  tokenHint?: string;
}

interface WhatsAppStatus {
  provider: string;
  state: string;
  connected: boolean;
  error?: string;
}

const PROVIDERS = [
  { value: 'mock', label: 'Mock (teste, não envia)' },
  { value: 'evolution', label: 'Evolution API' },
  { value: 'meta', label: 'Meta Cloud API' },
  { value: 'twilio', label: 'Twilio' },
];

export function WhatsAppPage() {
  const [cfg, setCfg] = useState<WhatsAppConfig | null>(null);
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testMsg, setTestMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [provider, setProvider] = useState('mock');
  const [apiUrl, setApiUrl] = useState('');
  const [instance, setInstance] = useState('');
  const [instanceNumber, setInstanceNumber] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [token, setToken] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await apiGet<WhatsAppConfig>('/api/settings/whatsapp');
      setCfg(data);
      setProvider(data.provider);
      setApiUrl(data.apiUrl);
      setInstance(data.instance);
      setInstanceNumber(data.instanceNumber);
      setPhoneNumberId(data.phoneNumberId || '');

      const st = await apiGet<WhatsAppStatus>('/api/settings/whatsapp/status').catch(() => null);
      if (st) setStatus(st);
    } catch {
      setMsg({ type: 'err', text: 'Não foi possível carregar a configuração.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

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
        token: token || undefined,
      });
      setToken('');
      setMsg({ type: 'ok', text: 'Configuração salva e aplicada em tempo real.' });
      await loadData();
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Falha ao salvar.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestSend() {
    if (!testPhone.trim()) {
      setTestMsg({ type: 'err', text: 'Informe um número de celular para teste (ex: 55 51 99999-9999)' });
      return;
    }
    setTesting(true);
    setTestMsg(null);
    try {
      await apiPost<{ ok: boolean }>('/api/settings/whatsapp/test', { toPhone: testPhone });
      setTestMsg({ type: 'ok', text: `✅ Mensagem de teste enviada com sucesso para ${testPhone}!` });
    } catch (e) {
      setTestMsg({ type: 'err', text: e instanceof Error ? e.message : 'Falha ao enviar mensagem de teste.' });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>WhatsApp — Alertas e Integração</h2>
          <p>
            Configure o provedor e as credenciais usadas nos alertas críticos e notificações. Alterado em tempo real,
            sem reiniciar o servidor.
          </p>
        </div>
      </div>

      <div className="notice">
        Número do robô é usado para impedir que o alerta seja enviado a si mesmo: o destinatário
        (gerente/operador) deve ser um celular diferente do número do robô.
      </div>

      {loading ? (
        <div className="muted">Carregando…</div>
      ) : (
        <div className="stack" style={{ gap: '1.5rem', maxWidth: 640 }}>
          {status && (
            <div
              className="card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderLeft: `4px solid ${status.connected ? '#10b981' : '#f59e0b'}`,
              }}
            >
              <div>
                <strong style={{ fontSize: '1rem' }}>Status da Conexão</strong>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  Provedor: <strong>{status.provider}</strong> | Estado:{' '}
                  <strong>{status.state || 'desconhecido'}</strong>
                </div>
              </div>
              <span className={`badge ${status.connected ? 'badge-info' : 'badge-late'}`}>
                {status.connected ? 'ONLINE' : 'DESCONECTADO'}
              </span>
            </div>
          )}

          <div className="card">
            <div className="field">
              <label>Provedor</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {provider !== 'mock' && (
              <>
                {provider === 'evolution' && (
                  <>
                    <div className="field">
                      <label>URL da API (base)</label>
                      <input
                        value={apiUrl}
                        onChange={(e) => setApiUrl(e.target.value)}
                        placeholder="https://evolution.server.nf"
                      />
                    </div>
                    <div className="field">
                      <label>Instância</label>
                      <input value={instance} onChange={(e) => setInstance(e.target.value)} placeholder="celularteste" />
                    </div>
                  </>
                )}
                {provider === 'meta' && (
                  <div className="field">
                    <label>Phone Number ID</label>
                    <input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} />
                  </div>
                )}
                {provider === 'twilio' && (
                  <div className="field">
                    <label>From (whatsapp:+…)</label>
                    <input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} />
                  </div>
                )}

                <div className="field">
                  <label>Token / API Key</label>
                  <input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    type="password"
                    placeholder={cfg?.hasToken ? `••••${cfg.tokenHint ?? ''} (deixe em branco para manter)` : 'Token'}
                  />
                </div>

                <div className="field">
                  <label>Número do robô (E.164, evita auto-envio)</label>
                  <input
                    value={instanceNumber}
                    onChange={(e) => setInstanceNumber(e.target.value)}
                    placeholder="55 51 9xxxxxxxx"
                    inputMode="tel"
                  />
                </div>
              </>
            )}

            <div className="row" style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar Configurações'}
              </button>
            </div>

            {msg && <div className={`notice ${msg.type === 'err' ? 'warn' : ''}`}>{msg.text}</div>}
          </div>

          {provider !== 'mock' && (
            <div className="card">
              <h3>Testar Envio de Mensagem</h3>
              <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                Envie uma mensagem de diagnóstico imediata para conferir se o número recebe no WhatsApp.
              </p>
              <div className="field">
                <label>Número de WhatsApp para teste</label>
                <div className="row" style={{ gap: '0.5rem' }}>
                  <input
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="55 51 99325-7923"
                    inputMode="tel"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void handleTestSend()}
                    disabled={testing}
                  >
                    {testing ? 'Enviando…' : 'Testar Envio'}
                  </button>
                </div>
              </div>
              {testMsg && <div className={`notice ${testMsg.type === 'err' ? 'warn' : ''}`}>{testMsg.text}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}