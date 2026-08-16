import { useState } from 'react';
import type { UserRole } from '@concluiai/shared';
import { useAuth } from '../lib/auth';
import { isLanAccess, isSupabaseConfigured } from '../lib/config';

export function LoginPage() {
  const { login, loginDemo, demoMode } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const lan = typeof window !== 'undefined' && isLanAccess();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (isSignUp) {
        const { getSupabase } = await import('../lib/supabase');
        const sb = getSupabase();
        if (!sb) throw new Error('Supabase não configurado');
        const { error: signUpErr } = await sb.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (signUpErr) throw signUpErr;
        // Faz login automático após criar a conta
        await login(email, password);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao autenticar');
    } finally {
      setLoading(false);
    }
  }

  function enterDemo(role: UserRole) {
    loginDemo(role);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand" style={{ padding: 0, marginBottom: '1rem' }}>
          <div className="brand-mark">C</div>
          <div>
            <h1 style={{ fontSize: '1.35rem' }}>ConcluíAI</h1>
            <span>O restaurante no padrão, mesmo sem o dono</span>
          </div>
        </div>

        {lan && (
          <div className="notice" style={{ marginBottom: '1rem' }}>
            <strong>📱 Acesso pelo celular</strong>
            <div style={{ marginTop: 4, fontSize: '0.85rem' }}>
              Você está em <code>{typeof window !== 'undefined' ? window.location.host : ''}</code>.
              As chamadas de API usam o proxy do Vite (mesma origem) — não precisam de{' '}
              <code>localhost:4000</code>. Entre como <strong>Administrador</strong> para o painel.
            </div>
          </div>
        )}

        {demoMode && (
          <div className="notice">
            <strong>Modo demonstração ativo.</strong>
            <div style={{ marginTop: 4 }}>
              Supabase ainda não configurado. Escolha um perfil abaixo ou preencha{' '}
              <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no{' '}
              <code>.env</code> (veja <code>.env.example</code>).
            </div>
          </div>
        )}

        {isSupabaseConfigured() && (
          <div>
            <div className="row" style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${!isSignUp ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setIsSignUp(false); setError(''); }}
              >
                Entrar
              </button>
              <button
                type="button"
                className={`btn btn-sm ${isSignUp ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setIsSignUp(true); setError(''); }}
              >
                Criar Conta
              </button>
            </div>

            <form className="form-grid" onSubmit={onSubmit}>
              {isSignUp && (
                <div className="field">
                  <label htmlFor="fullName">Nome Completo</label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required={isSignUp}
                    placeholder="Seu nome"
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="email">E-mail</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="seu@email.com"
                />
              </div>
              <div className="field">
                <label htmlFor="password">Senha</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              {error && (
                <div className="notice warn" style={{ margin: 0 }}>
                  {error}
                </div>
              )}
              {message && (
                <div className="notice" style={{ margin: 0 }}>
                  {message}
                </div>
              )}
              <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
                {loading ? 'Aguarde…' : isSignUp ? 'Cadastrar e Entrar' : 'Entrar'}
              </button>
            </form>
          </div>
        )}

        <div style={{ marginTop: '1.25rem' }}>
          <div className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            Entrar como (demo):
          </div>
          <div className="demo-roles">
            <button type="button" className="btn btn-primary" onClick={() => enterDemo('admin')}>
              Administrador — dashboard multiloja
            </button>
            <button type="button" className="btn" onClick={() => enterDemo('manager')}>
              Gerente de Unidade
            </button>
            <button type="button" className="btn" onClick={() => enterDemo('operator')}>
              📱 Operador — tarefas e fotos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
