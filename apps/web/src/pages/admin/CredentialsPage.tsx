/**
 * Página de referência para preenchimento futuro de APIs e credenciais.
 * Não armazena segredos — apenas orienta o time.
 */
const SECTIONS = [
  {
    title: 'Supabase (Database, Auth, Storage)',
    vars: [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
    ],
    steps: [
      'Crie um projeto em https://supabase.com',
      'Rode a migration em supabase/migrations/001_initial_schema.sql no SQL Editor',
      'Settings → API: copie URL, anon key e service_role (somente backend)',
      'Confirme o bucket evidences em Storage',
      'Auth → habilite e-mail/senha (ou o provider desejado)',
    ],
  },
  {
    title: 'IA / Visão Computacional',
    vars: ['AI_PROVIDER', 'OPENAI_API_KEY', 'OPENAI_VISION_MODEL', 'SPACEXAI_API_KEY', 'SPACEXAI_BASE_URL'],
    steps: [
      'Defina AI_PROVIDER=openai (ou spacexai / mock)',
      'OpenAI: https://platform.openai.com/api-keys — use modelo com vision (ex: gpt-4o-mini)',
      'Sem chave, o sistema usa mock e ainda permite testar o fluxo de evidências',
      'Endpoint: POST /api/vision/analyze e fluxo em POST /api/evidences/submit',
    ],
  },
  {
    title: 'WhatsApp — Alertas Críticos',
    vars: [
      'WHATSAPP_PROVIDER',
      'WHATSAPP_API_URL',
      'WHATSAPP_TOKEN',
      'WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    ],
    steps: [
      'Escolha o provedor: meta | evolution | twilio | mock',
      'Meta Cloud API: app em developers.facebook.com + WhatsApp Business + Phone Number ID',
      'Cadastre telefone dos gerentes no campo profiles.phone (E.164, ex: +5511…)',
      'Webhook de verificação: GET /webhooks/whatsapp',
      'Job automático verifica tarefas críticas vencidas a cada ALERT_CHECK_INTERVAL_MS',
    ],
  },
  {
    title: 'Score P / E / Q',
    vars: ['SCORE_WEIGHT_P', 'SCORE_WEIGHT_E', 'SCORE_WEIGHT_Q', 'SCORE_CRITICAL_MULTIPLIER'],
    steps: [
      'Pesos padrão: P=0.35, E=0.30, Q=0.35 (soma 1.0)',
      'Itens críticos multiplicam o peso por SCORE_CRITICAL_MULTIPLIER (1.5)',
      'Recálculo: POST /api/score/recalculate ou job SCORE_RECALC_INTERVAL_MS',
    ],
  },
];

export function CredentialsPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Credenciais & Integrações</h2>
          <p>
            Espaço de referência para preenchimento futuro. Copie <code>.env.example</code> →{' '}
            <code>.env</code> e complete os valores. Nunca commite segredos.
          </p>
        </div>
      </div>

      <div className="notice warn">
        A service role do Supabase e tokens de WhatsApp/OpenAI são <strong>somente backend</strong>. O
        frontend usa apenas <code>VITE_SUPABASE_ANON_KEY</code> (protegida por RLS).
      </div>

      <div className="stack">
        {SECTIONS.map((s) => (
          <div className="card" key={s.title}>
            <h3 style={{ color: 'var(--text)', fontSize: '1.1rem' }}>{s.title}</h3>
            <div className="row" style={{ margin: '0.75rem 0' }}>
              {s.vars.map((v) => (
                <code
                  key={v}
                  style={{
                    background: 'var(--bg-elevated)',
                    padding: '0.25rem 0.5rem',
                    borderRadius: 6,
                    fontSize: '0.78rem',
                    border: '1px solid var(--border)',
                  }}
                >
                  {v}
                </code>
              ))}
            </div>
            <ol style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-muted)' }}>
              {s.steps.map((step) => (
                <li key={step} style={{ marginBottom: 6 }}>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
