import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { LoginPage } from './pages/LoginPage';
import { AdminLayout } from './layouts/AdminLayout';
import { MultistoreDashboard } from './pages/admin/MultistoreDashboard';
import { ChecklistBuilder } from './pages/admin/ChecklistBuilder';
import { UnitsPage } from './pages/admin/UnitsPage';
import { OperatorsPage } from './pages/admin/OperatorsPage';
import { RankingsPage } from './pages/admin/RankingsPage';
import { EvolutionPage } from './pages/admin/EvolutionPage';
import { TrainingPage } from './pages/admin/TrainingPage';
import { WhatsAppPage } from './pages/admin/WhatsAppPage';
import { PendingTasks } from './pages/admin/PendingTasks';
import { SectorsPage } from './pages/admin/SectorsPage';
import { EstoquePage } from './pages/admin/EstoquePage';
import { OperatorTasksPage } from './pages/operator/OperatorTasksPage';

function Guard({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="login-page">
        <div className="muted">Carregando…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'operator' ? '/operator' : '/admin'} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="login-page">
        <div className="muted">Carregando ConcluíAI…</div>
      </div>
    );
  }

  const defaultDestination = user?.role === 'operator' ? '/operator' : '/admin';

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? <Navigate to={defaultDestination} replace /> : <LoginPage />
        }
      />

      {/* Módulo do Operador (Mobile-First / PWA) */}
      <Route
        path="/operator"
        element={
          <Guard roles={['operator', 'admin', 'manager']}>
            <OperatorTasksPage />
          </Guard>
        }
      />

      {/* Painel Administrativo e Gestão */}
      <Route
        path="/admin"
        element={
          <Guard roles={['admin', 'manager']}>
            <AdminLayout />
          </Guard>
        }
      >
        <Route index element={<MultistoreDashboard />} />
        <Route path="pendings" element={<PendingTasks />} />
        <Route path="checklists" element={<ChecklistBuilder />} />
        <Route path="units" element={<UnitsPage />} />
        <Route path="sectors" element={<SectorsPage />} />
        <Route path="estoque" element={<EstoquePage />} />
        <Route path="operators" element={<OperatorsPage />} />
        <Route path="rankings" element={<RankingsPage />} />
        <Route path="evolution" element={<EvolutionPage />} />
        <Route path="whatsapp" element={<WhatsAppPage />} />
        <Route path="training" element={<TrainingPage />} />
      </Route>

      <Route
        path="*"
        element={
          <Navigate to={!user ? '/login' : defaultDestination} replace />
        }
      />
    </Routes>
  );
}

