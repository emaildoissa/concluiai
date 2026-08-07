import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const paths: Record<string, string> = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  checklist: 'M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01',
  building: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2',
  layers: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ranking: 'M4 21v-7M10 21V8M16 21v-4M22 21V3',
  trend: 'M22 7l-8.5 8.5-4-4L2 19M22 7h-6M22 7v6',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',
  chat: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z',
};

function SideIcon({ name }: { name: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path d={paths[name] || paths.grid} />
    </svg>
  );
}

const links = [
  { to: '/admin', end: true, label: 'Multiloja', icon: 'grid' },
  { to: '/admin/checklists', label: 'Checklists', icon: 'checklist' },
  { to: '/admin/units', label: 'Unidades', icon: 'building' },
  { to: '/admin/sectors', label: 'Setores', icon: 'layers' },
  { to: '/admin/pendings', label: 'Pendências', icon: 'bell' },
  { to: '/admin/operators', label: 'Operadores', icon: 'users' },
  { to: '/admin/rankings', label: 'Rankings', icon: 'ranking' },
  { to: '/admin/evolution', label: 'Evolução', icon: 'trend' },
  { to: '/admin/whatsapp', label: 'WhatsApp', icon: 'chat' },
  { to: '/admin/training', label: 'Treinamento', icon: 'book' },
  { to: '/admin/credentials', label: 'Credenciais', icon: 'gear' },
];

export function AdminLayout() {
  const { user, logout, demoMode } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <h1>ConcluíAI</h1>
            <span>Padronização operacional</span>
          </div>
        </div>

        <nav className="nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <SideIcon name={l.icon} />
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {demoMode && (
            <div className="notice" style={{ margin: 0, fontSize: '0.75rem' }}>
              Modo demo — configure Supabase no .env
            </div>
          )}
          <div>
            <strong>{user?.full_name}</strong>
            <div className="muted" style={{ fontSize: '0.8rem' }}>
              {user?.role} · {user?.email}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void logout()}>
            Sair
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
