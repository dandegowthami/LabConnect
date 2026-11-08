import { ArrowRight, BellRing, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function StaffDashboard() {
  const { user, logout } = useAuth();
  return (
    <main className="dashboard container-fluid d-flex align-items-center justify-content-center">
      <div className="dashboard-card card">
        <div className="brand-mark brand-mark-small" aria-hidden="true">L</div>
        <p className="eyebrow">STAFF PORTAL</p>
        <h1>Welcome, {user?.name || 'team member'}.</h1>
        <p className="intro">Import laboratory exports and review validated patient orders and report metadata.</p>
        <Link className="primary-button btn w-100 staff-import-link" to="/staff/import">
          LIS Report Import <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <Link className="secondary-button btn w-100 staff-import-link" to="/staff/reports">
          Manage signed reports <FileText size={18} aria-hidden="true" />
        </Link>
        <Link className="secondary-button btn w-100 staff-import-link" to="/staff/delivery">
          Secure delivery history <BellRing size={18} aria-hidden="true" />
        </Link>
        <button className="secondary-button btn w-100" onClick={() => logout()}>Sign out</button>
      </div>
    </main>
  );
}
