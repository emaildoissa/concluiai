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
import { CredentialsPage } from './pages/admin/CredentialsPage';
import { WhatsAppPage } from './pages/admin/WhatsAppPage';

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
    return <Navigate to="/login" replace />;
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

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? <Navigate to="/admin" replace /> : <LoginPage />
        }
      />

      <Route
        path="/admin"
        element={
          <Guard roles={['admin', 'manager']}>
            <AdminLayout />
          </Guard>
        }
      >
        <Route index element={<MultistoreDashboard />} />
        <Route path="checklists" element={<ChecklistBuilder />} />
        <Route path="units" element={<UnitsPage />} />
        <Route path="operators" element={<OperatorsPage />} />
        <Route path="rankings" element={<RankingsPage />} />
        <Route path="evolution" element={<EvolutionPage />} />
        <Route path="whatsapp" element={<WhatsAppPage />} />
        <Route path="training" element={<TrainingPage />} />
        <Route path="credentials" element={<CredentialsPage />} />
      </Route>

      <Route
        path="*"
        element={
          <Navigate to={!user ? '/login' : '/admin'} replace />
        }
      />
    </Routes>
  );
}
