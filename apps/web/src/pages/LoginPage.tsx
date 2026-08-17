import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { isSupabaseConfigured } from '../lib/config';

export function LoginPage() {
  const { login, loginDemo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isSupabaseConfigured()) {
        await login(email, password);
      } else {
        // Modo local/demo: autenticação automática de diretoria
        loginDemo('admin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao autenticar credenciais. Verifique seu e-mail e senha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-portal-wrap">
      <div className="login-portal-container">
        {/* Coluna Esquerda: Showcase de Autoridade & Telemetria */}
        <div className="login-hero-showcase">
          <div className="login-hero-brand">
            <div className="login-brand-icon">C</div>
            <div>
              <h1>ConcluíAI</h1>
              <p>Plataforma de Inteligência Operacional para Restaurantes</p>
            </div>
          </div>

          <h2 className="login-hero-title">
            O restaurante no padrão, <span>mesmo sem o dono.</span>
          </h2>

          <div className="login-features-list">
            <div className="login-feature-item">
              <div className="login-feature-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <div className="login-feature-text">
                <h4>Auditoria Visual com Gemini Vision</h4>
                <p>Análise automática de fotos enviadas pela equipe para garantir conformidade sanitária e POPs.</p>
              </div>
            </div>

            <div className="login-feature-item">
              <div className="login-feature-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 20V10" />
                  <path d="M12 20V4" />
                  <path d="M6 20v-6" />
                </svg>
              </div>
              <div className="login-feature-text">
                <h4>Telemetria P·E·Q em Tempo Real</h4>
                <p>Métricas consolidadas de Pontualidade, Execução e Qualidade por loja e por turno.</p>
              </div>
            </div>

            <div className="login-feature-item">
              <div className="login-feature-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <div className="login-feature-text">
                <h4>Disparo Tático de Cobrança WhatsApp</h4>
                <p>Notificação instantânea para tarefas críticas em atraso e reabertura de refações.</p>
              </div>
            </div>
          </div>

          {/* Micro-Card de Simulação de Telemetria */}
          <div className="login-sim-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="ops-pulse-dot" style={{ width: 10, height: 10 }} />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff' }}>Rede Operacional Conectada</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Unidades Sincronizadas · 98.4% Conforme</div>
              </div>
            </div>
            <span className="badge badge-completed" style={{ fontSize: '0.75rem' }}>
              Operação Normal
            </span>
          </div>
        </div>

        {/* Coluna Direita: Formulário de Autenticação Único */}
        <div className="login-auth-card">
          <div className="login-auth-header">
            <h2>Acesso ao Sistema</h2>
            <p>Entre com seu e-mail e senha para acessar o painel operacional.</p>
          </div>

          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            <div className="login-input-group">
              <label htmlFor="email">E-mail Corporativo</label>
              <div className="login-input-wrap">
                <span className="login-input-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </span>
                <input
                  id="email"
                  type="email"
                  className="login-input-field"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="seuemail@restaurante.com.br"
                />
              </div>
            </div>

            <div className="login-input-group">
              <label htmlFor="password">Senha de Acesso</label>
              <div className="login-input-wrap">
                <span className="login-input-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="login-input-field"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Sua senha"
                />
                <button
                  type="button"
                  className="login-pw-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {showPassword ? (
                      <>
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </>
                    ) : (
                      <>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {error && (
              <div className="notice warn" style={{ margin: 0, padding: '0.65rem 0.85rem' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              style={{ padding: '0.78rem', fontSize: '0.92rem', fontWeight: 800, marginTop: '0.5rem' }}
              disabled={loading}
            >
              {loading ? 'Autenticando...' : 'Entrar no Sistema'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
