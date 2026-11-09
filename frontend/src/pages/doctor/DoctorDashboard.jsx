import { useEffect, useState } from 'react';
import { LogOut, Search, Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import doctorService from '../../services/doctorService.js';

export default function DoctorDashboard() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    doctorService.getDashboard()
      .then((response) => { if (active) setData(response.data.data); })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.message || 'Doctor dashboard could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <main className="staff-workspace">
      <header className="import-header"><Link className="site-brand" to="/doctor/dashboard"><span className="site-brand-mark">L</span>LabConnect</Link><div className="import-user-actions"><span>{user?.name}</span><button className="logout-button" type="button" onClick={() => logout()}><LogOut size={17} /> Sign out</button></div></header>
      <div className="staff-workspace-content">
        <p className="eyebrow"><Stethoscope size={16} /> REFERRING DOCTOR PORTAL</p>
        <h1>Welcome, {user?.name}.</h1>
        <p className="intro">Reports are limited to your referred patients with recorded consent and the last 90 days.</p>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {loading ? <p role="status">Loading your recent reports…</p> : data && (
          <>
            <div className="staff-metric-grid doctor-metric-grid">
              <article className="staff-metric-card"><span>Consented patients</span><strong>{data.totalPatients}</strong></article>
              <article className="staff-metric-card"><span>Reports in last 90 days</span><strong>{data.recentReports}</strong></article>
              <article className="staff-metric-card"><span>Ready reports</span><strong>{data.readyReports}</strong></article>
            </div>
            <section className="import-card card mt-4">
              <div className="delivery-history-heading"><div><p className="eyebrow">RECENT REPORTS</p><h2>{data.doctor.name}</h2></div><Link className="btn btn-outline-primary" to="/doctor/reports"><Search size={17} /> Search reports</Link></div>
              {data.reports.length === 0 ? <p className="portal-empty">No consented referring reports are available in the last 90 days.</p> : (
                <div className="table-responsive"><table className="table"><thead><tr><th>Report</th><th>Patient ID</th><th>Patient</th><th>Referring date</th><th>Status</th><th>PDF</th></tr></thead><tbody>{data.reports.map((report) => <tr key={report.reportId}><th><Link to={`/doctor/reports/${encodeURIComponent(report.reportId)}`}>{report.reportId}</Link></th><td>{report.patient?.patientId}</td><td>{report.patient?.name}</td><td>{report.order?.orderDate ? new Date(report.order.orderDate).toLocaleDateString() : '—'}</td><td>{report.reportStatus}</td><td>{report.pdfAvailable ? 'Available' : 'Not available'}</td></tr>)}</tbody></table></div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
