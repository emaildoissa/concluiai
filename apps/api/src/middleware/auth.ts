import type { Request, Response, NextFunction } from 'express';
import { config, hasSupabaseConfig } from '../config.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

export interface AuthUser {
  id: string;
  email?: string;
  role?: string;
  company_id?: string;
  unit_id?: string | null;
  full_name?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      accessToken?: string;
    }
  }
}

const defaultAdmin: AuthUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'demo@concluiai.local',
  role: 'admin',
  company_id: '11111111-1111-1111-1111-111111111111',
  unit_id: '22222222-2222-2222-2222-222222222221',
  full_name: 'Admin Demo',
};

/**
 * Valida autenticação.
 * Ordem: X-Api-Key compartilhada (scripts) → x-demo-user (modo demo) →
 * Bearer JWT do Supabase Auth.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (config.apiKey && req.header('x-api-key') === config.apiKey) {
    req.user = defaultAdmin;
    return next();
  }

  if (!hasSupabaseConfig()) {
    const demo = req.header('x-demo-user');
    if (demo) {
      try {
        req.user = JSON.parse(demo) as AuthUser;
        return next();
      } catch {
        /* fallback abaixo */
      }
    }
    req.user = defaultAdmin;
    return next();
  }

  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = header.slice(7);
  req.accessToken = token;

  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      return;
    }

    const { data: profile } = await sb
      .from('profiles')
      .select('id, email, role, company_id, unit_id, full_name')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!profile) {
      res.status(403).json({ error: 'Perfil não encontrado. Complete seu cadastro.' });
      return;
    }

    req.user = {
      id: data.user.id,
      email: profile.email,
      role: profile.role,
      company_id: profile.company_id,
      unit_id: profile.unit_id,
      full_name: profile.full_name,
    };
    next();
  } catch (err) {
    console.error('[auth]', err);
    res.status(500).json({ error: 'Falha ao validar autenticação.' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.role || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Permissão insuficiente' });
    }
    next();
  };
}
