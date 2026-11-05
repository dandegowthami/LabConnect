import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <main className="page-shell" role="status">Checking your secure session…</main>;
  }
  if (!user) return <Navigate to="/patient/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={user.role === 'patient' ? '/patient' : '/staff'} replace />;
  return <Outlet />;
}
