import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { UserRole } from '@concluiai/shared';
import { getSupabase } from './supabase';
import { isSupabaseConfigured } from './config';

export interface AuthProfile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  company_id: string;
  unit_id?: string | null;
  phone?: string | null;
}

interface AuthContextValue {
  user: AuthProfile | null;
  loading: boolean;
  demoMode: boolean;
  loginDemo: (role: UserRole) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
  isOperator: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEMO_USERS: Record<UserRole, AuthProfile> = {
  admin: {
    id: '00000000-0000-0000-0000-000000000001',
    full_name: 'Ana Admin',
    email: 'admin@demo.concluiai',
    role: 'admin',
    company_id: '11111111-1111-1111-1111-111111111111',
    unit_id: null,
  },
  manager: {
    id: '00000000-0000-0000-0000-000000000002',
    full_name: 'Marcos Gerente',
    email: 'gerente@demo.concluiai',
    role: 'manager',
    company_id: '11111111-1111-1111-1111-111111111111',
    unit_id: '22222222-2222-2222-2222-222222222221',
    phone: '+5511999990001',
  },
  operator: {
    id: '00000000-0000-0000-0000-000000000003',
    full_name: 'Pedro Operador',
    email: 'operador@demo.concluiai',
    role: 'operator',
    company_id: '11111111-1111-1111-1111-111111111111',
    unit_id: '22222222-2222-2222-2222-222222222221',
  },
};

const STORAGE_KEY = 'concluiai_demo_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const demoMode = !isSupabaseConfigured();

  useEffect(() => {
    async function init() {
      if (demoMode) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          try {
            setUser(JSON.parse(raw));
          } catch {
            /* ignore */
          }
        }
        setLoading(false);
        return;
      }

      const sb = getSupabase();
      if (!sb) {
        setLoading(false);
        return;
      }

      const { data } = await sb.auth.getSession();
      if (data.session?.user) {
        const { data: profile } = await sb
          .from('profiles')
          .select('*')
          .eq('id', data.session.user.id)
          .maybeSingle();

        setUser(
          (profile as AuthProfile) || {
            id: data.session.user.id,
            email: data.session.user.email || '',
            full_name: data.session.user.user_metadata?.full_name || data.session.user.email?.split('@')[0] || 'Usuário',
            role: 'admin',
            company_id: '11111111-1111-1111-1111-111111111111',
            unit_id: '22222222-2222-2222-2222-222222222221',
          }
        );
      }

      // Guarda a subscription para fazer cleanup no unmount (evita memory leak
      // em hot-reload e callbacks duplicados se o componente remontar).
      const { data: { subscription } } = sb.auth.onAuthStateChange(async (_event, session) => {
        if (!session?.user) {
          setUser(null);
          return;
        }
        const { data: profile } = await sb
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        setUser(
          (profile as AuthProfile) || {
            id: session.user.id,
            email: session.user.email || '',
            full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Usuário',
            role: 'admin',
            company_id: '11111111-1111-1111-1111-111111111111',
            unit_id: '22222222-2222-2222-2222-222222222221',
          }
        );
      });

      setLoading(false);
      return () => subscription.unsubscribe();
    }
    void init();
  }, [demoMode]);

  const loginDemo = useCallback((role: UserRole) => {
    const profile = DEMO_USERS[role];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    setUser(profile);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase não configurado. Use o modo demo ou preencha VITE_SUPABASE_*.');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      demoMode,
      loginDemo,
      login,
      logout,
      isAdmin: user?.role === 'admin',
      isManager: user?.role === 'manager' || user?.role === 'admin',
      isOperator: user?.role === 'operator',
    }),
    [user, loading, demoMode, loginDemo, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora de AuthProvider');
  return ctx;
}
