import { useState, useEffect } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const paths: Record<string, string> = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  checklist: 'M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01',
  building: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2',
  box: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12',
  layers: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ranking: 'M4 21v-7M10 21V8M16 21v-4M22 21V3',
  trend: 'M22 7l-8.5 8.5-4-4L2 19M22 7h-6M22 7v6',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',
  chat: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M18 6 6 18M6 6l12 12',
  smartphone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};

function SideIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
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

interface NavItem {
  to: string;
  end?: boolean;
  label: string;
  icon: string;
  badge?: { text: string; type: 'alert' | 'active' };
}

interface NavSection {
  title: string;
  links: NavItem[];
}

const sections: NavSection[] = [
  {
    title: 'Operação de Rede',
    links: [
      { to: '/admin', end: true, label: 'Multiloja · War Room', icon: 'grid' },
      { to: '/admin/checklists', label: 'Checklists & POPs', icon: 'checklist' },
      { to: '/admin/units', label: 'Unidades & Lojas', icon: 'building' },
      { to: '/admin/sectors', label: 'Setores Operacionais', icon: 'layers' },
      { to: '/admin/estoque', label: 'Estoque & Insumos', icon: 'box' },
    ],
  },
  {
    title: 'Auditoria & Telemetria',
    links: [
      {
        to: '/admin/pendings',
        label: 'Pendências Críticas',
        icon: 'bell',
        badge: { text: 'Alerta', type: 'alert' },
      },
      { to: '/admin/rankings', label: 'Ranking de Lojas', icon: 'ranking' },
      { to: '/admin/evolution', label: 'Evolução Temporal', icon: 'trend' },
    ],
  },
  {
    title: 'Governança & Acessos',
    links: [
      { to: '/admin/operators', label: 'Operadores de Campo', icon: 'users' },
      {
        to: '/admin/whatsapp',
        label: 'WhatsApp Gateway',
        icon: 'chat',
        badge: { text: 'Online', type: 'active' },
      },
      { to: '/admin/training', label: 'Central de Treinamento', icon: 'book' },
      { to: '/admin/credentials', label: 'Configurações de IA', icon: 'gear' },
    ],
  },
];

export function AdminLayout() {
  const { user, logout, demoMode } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Fecha o drawer em mudanças de rota
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Iniciais do usuário para avatar
  const initials = user?.full_name
    ? user.full_name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((n) => n[0].toUpperCase())
        .join('')
    : 'AD';

  return (
    <div className={`app-shell ${mobileOpen ? 'is-mobile-open' : ''}`}>
      {/* Header Superior Mobile */}
      <header className="mobile-admin-header">
        <div className="mobile-header-brand">
          <div className="brand-mark-tactical" style={{ width: 32, height: 32, fontSize: '0.95rem' }}>
            C
          </div>
          <div className="mobile-brand-title">
            <span className="brand-name-text">ConcluíAI</span>
            <span className="brand-pro-pill">PRO</span>
          </div>
        </div>

        <div className="mobile-header-actions">
          <Link to="/operator" className="mobile-op-shortcut" title="Ir para Modo Operador">
            <SideIcon name="smartphone" size={14} />
            <span>Operador</span>
          </Link>

          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
          >
            <SideIcon name={mobileOpen ? 'close' : 'menu'} size={20} />
          </button>
        </div>
      </header>

      {/* Backdrop para fechar o menu no mobile */}
      {mobileOpen && (
        <div
          className="sidebar-mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar Principal (Desktop fixo / Mobile drawer) */}
      <aside className="sidebar">
        {/* Brand Header */}
        <div className="brand">
          <div className="brand-mark-tactical">C</div>
          <div className="brand-text-wrap">
            <h1>
              ConcluíAI
              <span className="brand-pro-badge">PRO</span>
            </h1>
          </div>

          {/* Botão fechar visível no drawer mobile */}
          <button
            type="button"
            className="sidebar-drawer-close-btn"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar gaveta de menu"
          >
            <SideIcon name="close" size={18} />
          </button>
        </div>

        {/* Card Tático de Acesso ao PWA Operador */}
        <Link
          to="/operator"
          className="sidebar-operator-card"
          title="Acessar visão do funcionário na cozinha"
          onClick={() => setMobileOpen(false)}
        >
          <div className="op-card-left">
            <div className="op-card-icon">
              <SideIcon name="smartphone" size={16} />
            </div>
            <div>
              <div className="op-card-title">Modo Operador</div>
              <div className="op-card-sub">Terminal de campo</div>
            </div>
          </div>
          <span className="op-card-arrow">→</span>
        </Link>

        {/* Links de Navegação */}
        <nav className="nav">
          {sections.map((section) => (
            <div key={section.title} className="nav-section">
              <div className="nav-section-title">{section.title}</div>
              {section.links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                  onClick={() => setMobileOpen(false)}
                >
                  <div className="nav-link-content">
                    <SideIcon name={l.icon} />
                    <span>{l.label}</span>
                  </div>
                  {l.badge && (
                    <span
                      className={`nav-badge-pill ${
                        l.badge.type === 'alert' ? 'badge-pill-alert' : 'badge-pill-active'
                      }`}
                    >
                      {l.badge.text}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer com Perfil do Gestor */}
        <div className="sidebar-footer">
          {demoMode && (
            <div className="demo-mode-badge-bar">
              Modo Demonstração Ativo
            </div>
          )}

          <div className="user-profile-bar">
            <div className="user-profile-left">
              <div className="user-avatar-mark">
                {initials}
                <span className="user-online-dot" />
              </div>
              <div className="user-profile-info">
                <div className="user-profile-name" title={user?.full_name || 'Administrador'}>
                  {user?.full_name || 'Administrador'}
                </div>
                <div className="user-profile-role">
                  <span>{user?.role?.toUpperCase() || 'GESTOR'}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="user-logout-btn"
              onClick={() => void logout()}
              title="Encerrar sessão"
            >
              <SideIcon name="logout" size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <main className="main">
        <Outlet />
      </main>

      {/* Barra de Navegação Inferior no Mobile (Quick Reach) */}
      <nav className="mobile-bottom-nav">
        <NavLink
          to="/admin"
          end
          className={({ isActive }) => `mobile-tab-item ${isActive ? 'is-active' : ''}`}
        >
          <SideIcon name="grid" size={20} />
          <span>War Room</span>
        </NavLink>

        <NavLink
          to="/admin/checklists"
          className={({ isActive }) => `mobile-tab-item ${isActive ? 'is-active' : ''}`}
        >
          <SideIcon name="checklist" size={20} />
          <span>POPs</span>
        </NavLink>

        <NavLink
          to="/admin/pendings"
          className={({ isActive }) => `mobile-tab-item ${isActive ? 'is-active' : ''}`}
        >
          <div className="mobile-tab-icon-wrap">
            <SideIcon name="bell" size={20} />
            <span className="mobile-tab-dot-alert" />
          </div>
          <span>Alertas</span>
        </NavLink>

        <NavLink
          to="/admin/units"
          className={({ isActive }) => `mobile-tab-item ${isActive ? 'is-active' : ''}`}
        >
          <SideIcon name="building" size={20} />
          <span>Lojas</span>
        </NavLink>

        <button
          type="button"
          className={`mobile-tab-item ${mobileOpen ? 'is-active' : ''}`}
          onClick={() => setMobileOpen(true)}
        >
          <SideIcon name="more" size={20} />
          <span>Mais</span>
        </button>
      </nav>
    </div>
  );
}
