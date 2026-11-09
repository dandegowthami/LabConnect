import { useEffect, useState } from 'react';
import { ArrowLeft, LogOut, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import doctorService from '../../services/doctorService.js';

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export default function DoctorReports() {
  const { user, logout } = useAuth();
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [from, setFrom] = useState(dateOffset(90));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [reports, setReports] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ pages: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    doctorService.getReports({ q: applied, from, to, page, limit: 20 })
      .then((response) => {
        if (!active) return;
        setReports(response.data.data.reports);
        setPagination(response.data.data.pagination);
      })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.message || 'Reports could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applied, from, to, page]);

  return (
    <main className="import-page">
      <header className="import-header"><Link className="site-brand" to="/doctor/dashboard"><span className="site-brand-mark">L</span>LabConnect</Link><div className="import-user-actions"><span>{user?.name}</span><button className="logout-button" type="button" onClick={() => logout()}><LogOut size={17} /> Sign out</button></div></header>
      <div className="import-content"><Link className="back-link import-back-link" to="/doctor/dashboard"><ArrowLeft size={17} /> Doctor dashboard</Link>
        <div className="import-page-title"><p className="eyebrow">AUTHORIZED REFERRALS</p><h1>Search reports</h1><p>Only your referred patients with consent are included. Date range cannot exceed the last 90 days.</p></div>
        <form className="import-card card" onSubmit={(event) => { event.preventDefault(); setPage(1); setApplied(query.trim()); }}>
          <label className="form-label" htmlFor="doctor-search">Patient name, patient ID, or order ID</label>
          <div className="input-group"><input id="doctor-search" className="form-control form-control-lg" maxLength="100" value={query} onChange={(event) => setQuery(event.target.value)} /><button className="primary-button btn" type="submit"><Search size={18} /> Search</button></div>
          <div className="row g-3 mt-2"><div className="col-md-6"><label className="form-label" htmlFor="report-from">From</label><input id="report-from" className="form-control" type="date" value={from} onChange={(event) => { setPage(1); setFrom(event.target.value); }} /></div><div className="col-md-6"><label className="form-label" htmlFor="report-to">To</label><input id="report-to" className="form-control" type="date" value={to} onChange={(event) => { setPage(1); setTo(event.target.value); }} /></div></div>
        </form>
        {error && <div className="alert alert-danger mt-3" role="alert">{error}</div>}
        <section className="import-card card mt-4">
          {loading ? <p role="status">Loading referred reports…</p> : reports.length === 0 ? <div className="portal-empty"><h2>No matching reports</h2><p>Only consented records referred by your account are searchable.</p></div> : (
            <div className="table-responsive"><table className="table"><thead><tr><th>Report</th><th>Patient</th><th>Order</th><th>Referring doctor</th><th>Date</th><th>Status</th><th>PDF</th></tr></thead><tbody>{reports.map((report) => <tr key={report.reportId}><th><Link to={`/doctor/reports/${encodeURIComponent(report.reportId)}`}>{report.reportId}</Link></th><td>{report.patient?.name} ({report.patient?.patientId})</td><td>{report.order?.orderId}</td><td>{user?.name}</td><td>{report.order?.orderDate ? new Date(report.order.orderDate).toLocaleDateString() : '—'}</td><td>{report.reportStatus}</td><td>{report.pdfAvailable ? 'Available' : 'Unavailable'}</td></tr>)}</tbody></table></div>
          )}
          {pagination.pages > 1 && <div className="delivery-pagination"><button className="btn btn-outline-secondary" disabled={page <= 1} type="button" onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {pagination.pages} · {pagination.total} reports</span><button className="btn btn-outline-secondary" disabled={page >= pagination.pages} type="button" onClick={() => setPage((value) => value + 1)}>Next</button></div>}
        </section>
      </div>
    </main>
  );
}
