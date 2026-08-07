import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '../../lib/api';

interface WhatsAppConfig {
  provider: string;
  apiUrl: string;
  instance: string;
  instanceNumber: string;
  phoneNumberId: string;
  hasToken: boolean;
  tokenHint?: string;
}

const PROVIDERS = [
  { value: 'mock', label: 'Mock (teste, não envia)' },
  { value: 'evolution', label: 'Evolution API' },
  { value: 'meta', label: 'Meta Cloud API' },
  { value: 'twilio', label: 'Twilio' },
];

export function WhatsAppPage() {
  const [cfg, setCfg] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [provider, setProvider] = useState('mock');
  const [apiUrl, setApiUrl] = useState('');
  const [instance, setInstance] = useState('');
  const [instanceNumber, setInstanceNumber] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = await apiGet<WhatsAppConfig>('/api/settings/whatsapp');
        setCfg(data);
        setProvider(data.provider);
        setApiUrl(data.apiUrl);
        setInstance(data.instance);
        setInstanceNumber(data.instanceNumber);
        setPhoneNumberId(data.phoneNumberId || '');
      } catch {
        setMsg({ type: 'err', text: 'Não foi possível carregar a configuração.' });
      } finally {
        setLoading(false);
      }
    })();
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
      const data = await apiGet<WhatsAppConfig>('/api/settings/whatsapp');
      setCfg(data);
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Falha ao salvar.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>WhatsApp — Alertas</h2>
          <p>
            Configure o provedor e as credenciais usadas nos alertas críticos. Alterado em tempo real,
            sem reiniciar o servidor.
          </p>
        </div>
      </div>

      <div className="notice">
        Número do robô é usado para impedir que o alerta seja enviado a si mesmo: o destinatário
        (gerente) deve ser um celular diferente do número do robô.
      </div>

      {loading ? (
        <div className="muted">Carregando…</div>
      ) : (
        <div className="card" style={{ maxWidth: 640 }}>
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
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>

          {msg && <div className={`notice ${msg.type === 'err' ? 'warn' : ''}`}>{msg.text}</div>}
        </div>
      )}
    </div>
  );
}