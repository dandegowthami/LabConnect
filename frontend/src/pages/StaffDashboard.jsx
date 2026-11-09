import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, BellRing, FileText, LogOut, Search, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import staffWorkspaceService from '../services/staffWorkspaceService.js';

const metrics = [
  ['Total patients', 'totalPatients', Users],
  ['Total orders', 'totalOrders', Activity],
  ['Processing reports', 'processingReports', FileText],
  ['Ready reports', 'readyReports', FileText],
  ['Reports delivered', 'deliveredReports', BellRing],
  ['Failed notifications', 'failedNotifications', AlertTriangle],
  ['Open critical callbacks', 'criticalCallbackTasks', AlertTriangle],
  ['Patient-flagged summaries', 'patientFlaggedSummaries', AlertTriangle]
];

export default function StaffDashboard() {
  const { user, logout } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    staffWorkspaceService.getDashboard()
      .then((response) => { if (active) setSummary(response.data.data); })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Dashboard data could not be loaded.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <main className="staff-workspace">
      <header className="import-header">
        <Link className="site-brand" to="/staff"><span className="site-brand-mark">L</span>LabConnect</Link>
        <div className="import-user-actions"><span>{user?.name}</span><button className="logout-button" type="button" onClick={() => logout()}><LogOut size={17} /> Sign out</button></div>
      </header>
      <div className="staff-workspace-content">
        <p className="eyebrow">STAFF WORKSPACE · {user?.role?.toUpperCase()}</p>
        <h1>Good day, {user?.name || 'team member'}.</h1>
        <p className="intro">Review current laboratory operations and follow up on reports that need attention.</p>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {loading ? <p role="status">Loading dashboard statistics…</p> : summary && (
          <section className="staff-metric-grid" aria-label="Laboratory statistics">
            {metrics.map(([label, key, Icon]) => (
              <article className="staff-metric-card" key={key}>
                <Icon size={22} aria-hidden="true" />
                <span>{label}</span>
                <strong>{summary[key]}</strong>
              </article>
            ))}
          </section>
        )}
        <nav className="staff-workspace-nav" aria-label="Staff tools">
          {(user?.role === 'staff' || user?.role === 'admin') && <>
            <Link className="primary-button btn" to="/staff/import">Import LIS CSV</Link>
            <Link className="secondary-button btn" to="/staff/reports">Report management</Link>
            <Link className="secondary-button btn" to="/staff/patients"><Search size={18} /> Patient search</Link>
            <Link className="secondary-button btn" to="/staff/delivery">Secure delivery and access history</Link>
          </>}
          <Link className="secondary-button btn" to="/staff/callbacks">Callback and flagged-summary review</Link>
          <Link className="secondary-button btn" to="/staff/critical-rules">Critical thresholds and doctor access</Link>
        </nav>
        <p className="portal-disclaimer">Critical thresholds require explicit pathologist approval. No threshold is assumed by the application.</p>
      </div>
    </main>
  );
}
