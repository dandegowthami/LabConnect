import { useAuth } from '../context/AuthContext.jsx';

export default function StaffDashboard() {
  const { user, logout } = useAuth();
  return (
    <main className="dashboard container-fluid d-flex align-items-center justify-content-center">
      <div className="dashboard-card card">
        <div className="brand-mark brand-mark-small" aria-hidden="true">L</div>
        <p className="eyebrow">STAFF PORTAL</p>
        <h1>Welcome, {user?.name || 'team member'}.</h1>
        <p className="intro">This protected page confirms staff authentication is working. Staff tools are not part of this module.</p>
        <button className="secondary-button btn w-100" onClick={() => logout()}>Sign out</button>
      </div>
    </main>
  );
}
