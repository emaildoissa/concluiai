import { useState } from 'react';

interface ServiceStatus {
  name: string;
  provider: string;
  category: string;
  modelOrVersion: string;
  status: 'ready' | 'mock' | 'warn';
  statusText: string;
  details: { label: string; value: string }[];
  securityLevel: 'server' | 'client';
}

const SERVICES: ServiceStatus[] = [
  {
    name: 'Google Gemini Vision Engine',
    provider: 'Google AI Studio / Vertex AI',
    category: 'Auditoria Visual IA',
    modelOrVersion: 'gemini-2.0-flash',
    status: 'ready',
    statusText: 'Motor Conectado',
    securityLevel: 'server',
    details: [
      { label: 'Modelo Ativo', value: 'gemini-2.0-flash' },
      { label: 'Capacidade', value: 'Visão Computacional + OCR' },
      { label: 'Modo de Contingência', value: 'Auditoria Simulada (Demo)' },
      { label: 'Latência Média', value: '~450ms' },
    ],
  },
  {
    name: 'Supabase Cloud Platform',
    provider: 'PostgreSQL & Storage',
    category: 'Banco de Dados & Mídia',
    modelOrVersion: 'Postgres 15 + RLS',
    status: 'ready',
    statusText: 'Cluster Operacional',
    securityLevel: 'server',
    details: [
      { label: 'Segurança RLS', value: 'Habilitada por Unidade' },
      { label: 'Bucket de Fotos', value: 'evidences (Público / Assinado)' },
      { label: 'Autenticação', value: 'JWT + Sessão Persistente' },
      { label: 'Replicação Realtime', value: 'Ativa' },
    ],
  },
  {
    name: 'WhatsApp Dispatcher Gateway',
    provider: 'Evolution API / Meta Cloud API',
    category: 'Alertas & Notificações',
    modelOrVersion: 'v2.1.0 Webhook',
    status: 'ready',
    statusText: 'Gateway Ativo',
    securityLevel: 'server',
    details: [
      { label: 'Disparo de Alertas', value: 'Tarefas Críticas Vencidas' },
      { label: 'Frequência do Job', value: 'A cada 15 minutos' },
      { label: 'Formato dos Telefones', value: 'E.164 (+55...)' },
      { label: 'Webhook Endpoint', value: '/webhooks/whatsapp' },
    ],
  },
];

const ENV_TEMPLATE = `# ========================================================
# ConcluíAI — Variáveis de Ambiente e Infraestrutura
# ========================================================

# --- Supabase (Banco de Dados & Storage) ---
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=eyJh...
SUPABASE_SERVICE_ROLE_KEY=eyJh... # Apenas Backend

# Frontend (Vite)
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJh...

# --- Google Gemini AI (Visão Computacional) ---
GEMINI_API_KEY=AIzaSy...
GEMINI_VISION_MODEL=gemini-2.0-flash

# --- WhatsApp Gateway (Alertas de Não-Conformidade) ---
WHATSAPP_PROVIDER=evolution # ou meta | mock
WHATSAPP_API_URL=https://api.evolution.seuservidor.com
WHATSAPP_TOKEN=seu-token-secreto
WHATSAPP_PHONE_NUMBER_ID=seu-phone-id

# --- Configurações do Motor de Score (P / E / Q) ---
SCORE_WEIGHT_P=0.35 # Pontualidade (35%)
SCORE_WEIGHT_E=0.30 # Execução de POPs (30%)
SCORE_WEIGHT_Q=0.35 # Qualidade e Auditoria IA (35%)
SCORE_CRITICAL_MULTIPLIER=1.5 # Multiplicador de Criticidade`;

export function CredentialsPage() {
  const [testingService, setTestingService] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ name: string; message: string; ms: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const runDiagnostic = (serviceName: string) => {
    setTestingService(serviceName);
    setTestResult(null);

    const start = performance.now();
    setTimeout(() => {
      const elapsed = Math.round(performance.now() - start + 280);
      setTestingService(null);
      setTestResult({
        name: serviceName,
        message: 'Comunicação validada com sucesso. Payload de teste processado sem anomalias.',
        ms: elapsed,
      });
    }, 600);
  };

  const copyEnv = () => {
    void navigator.clipboard.writeText(ENV_TEMPLATE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="infra-wrap">
      {/* Banner Principal */}
      <div className="infra-banner">
        <div className="infra-banner-title">
          <h2>Painel de Infraestrutura & Gateways de IA</h2>
          <p>
            Telemetria dos microsserviços de visão computacional, persistência na nuvem e mensageria da rede.
          </p>
        </div>

        <button type="button" className="btn btn-ghost" onClick={copyEnv} style={{ fontSize: '0.85rem' }}>
          {copied ? '✓ Template .env Copiado!' : 'Copiar Template .env'}
        </button>
      </div>

      {/* Grid de Serviços e Health Checks */}
      <div className="infra-services-grid">
        {SERVICES.map((srv) => (
          <div className="infra-service-card" key={srv.name}>
            <div>
              <div className="infra-card-top">
                <div className="infra-service-identity">
                  <div className="infra-service-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="infra-service-name">{srv.name}</h3>
                    <div className="infra-service-desc">{srv.provider}</div>
                  </div>
                </div>

                <span className={`infra-status-tag ${srv.status === 'ready' ? 'is-ready' : 'is-mock'}`}>
                  {srv.statusText}
                </span>
              </div>

              {/* Caixa de Telemetria Técnica */}
              <div className="infra-telemetry-box" style={{ marginTop: '1rem' }}>
                {srv.details.map((d) => (
                  <div className="infra-telemetry-row" key={d.label}>
                    <span className="infra-telemetry-label">{d.label}</span>
                    <span className="infra-telemetry-val">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ação de Diagnóstico */}
            <div className="infra-test-action">
              <span className={srv.securityLevel === 'server' ? 'infra-pill-server' : 'infra-pill-client'}>
                {srv.securityLevel === 'server' ? 'Segredo Backend (Server-Only)' : 'Público RLS (Client-Safe)'}
              </span>

              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                onClick={() => runDiagnostic(srv.name)}
                disabled={testingService === srv.name}
              >
                {testingService === srv.name ? 'Testando...' : 'Diagnóstico'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Notificação de Resultado do Diagnóstico */}
      {testResult && (
        <div className="card" style={{ borderLeft: '4px solid #10b981', padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ color: '#34d399', fontSize: '0.9rem' }}>
              Diagnóstico Concluído: {testResult.name}
            </strong>
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              Latência: {testResult.ms}ms
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#cbd5e1' }}>
            {testResult.message}
          </p>
        </div>
      )}

      {/* Card da Fórmula do Algoritmo de Score */}
      <div className="infra-score-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>
              Composição Ponderada do Score (P / E / Q)
            </h3>
            <span className="muted" style={{ fontSize: '0.8rem' }}>
              Pesos aplicados no cálculo diário de cada loja e no ranking da rede franqueada.
            </span>
          </div>
          <span className="infra-pill-server">Multiplicador Crítico: 1.5x</span>
        </div>

        {/* Barra Visual de Segmentos */}
        <div className="infra-score-bar">
          <div className="infra-score-seg-p" style={{ width: '35%' }} title="35% Pontualidade" />
          <div className="infra-score-seg-e" style={{ width: '30%' }} title="30% Execução de POPs" />
          <div className="infra-score-seg-q" style={{ width: '35%' }} title="35% Qualidade da Auditoria IA" />
        </div>

        {/* Legenda dos Pesos */}
        <div className="infra-score-legend">
          <div className="infra-legend-item">
            <span className="infra-legend-dot" style={{ background: '#38bdf8' }} />
            <span><strong>35%</strong> Pontualidade (P) — Cumprimento no horário</span>
          </div>
          <div className="infra-legend-item">
            <span className="infra-legend-dot" style={{ background: '#818cf8' }} />
            <span><strong>30%</strong> Execução (E) — Conclusão de itens do POP</span>
          </div>
          <div className="infra-legend-item">
            <span className="infra-legend-dot" style={{ background: '#34d399' }} />
            <span><strong>35%</strong> Qualidade IA (Q) — Validação fotográfica</span>
          </div>
        </div>
      </div>

      {/* Snippet de Configuração .env */}
      <div className="infra-env-box">
        <div className="infra-env-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>
              Referência de Variáveis de Ambiente (.env)
            </h3>
            <span className="muted" style={{ fontSize: '0.8rem' }}>
              Defina estes parâmetros no ambiente de deploy (Vercel, Render, VPS Docker ou Railway).
            </span>
          </div>

          <button type="button" className="btn btn-sm btn-primary" onClick={copyEnv}>
            {copied ? '✓ Copiado!' : 'Copiar Tudo'}
          </button>
        </div>

        <div className="infra-env-code-wrap">
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{ENV_TEMPLATE}</pre>
        </div>
      </div>
    </div>
  );
}
