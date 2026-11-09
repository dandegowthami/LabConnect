import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

const loginPaths = {
  patient: '/patient/login',
  staff: '/staff/login',
  admin: '/staff/login',
  pathologist: '/staff/login',
  doctor: '/doctor/login'
};

const homePaths = {
  patient: '/patient',
  staff: '/staff',
  admin: '/staff',
  pathologist: '/staff',
  doctor: '/doctor/dashboard'
};

export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <main className="page-shell" role="status">Checking your secure session…</main>;
  }
  if (!user) {
    const loginRole = roles?.find((role) => loginPaths[role]) || 'patient';
    return <Navigate to={loginPaths[loginRole]} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homePaths[user.role] || '/'} replace />;
  }
  return <Outlet />;
}
