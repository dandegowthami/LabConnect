import { useEffect, useState } from 'react';
import { ArrowLeft, LogOut, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import staffWorkspaceService from '../../services/staffWorkspaceService.js';

export default function PatientSearch() {
  const { user, logout } = useAuth();
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [patients, setPatients] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    staffWorkspaceService.searchPatients({ q: appliedQuery, page: pagination.page, limit: pagination.limit })
      .then((response) => {
        if (!active) return;
        setPatients(response.data.data.patients);
        setPagination(response.data.data.pagination);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Patients could not be searched.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appliedQuery, pagination.page, pagination.limit]);

  function search(event) {
    event.preventDefault();
    setPagination((current) => ({ ...current, page: 1 }));
    setAppliedQuery(query.trim());
  }

  return (
    <main className="import-page">
      <header className="import-header">
        <Link className="site-brand" to="/staff"><span className="site-brand-mark">L</span>LabConnect</Link>
        <div className="import-user-actions"><span>{user?.name}</span><button className="logout-button" type="button" onClick={() => logout()}><LogOut size={17} /> Sign out</button></div>
      </header>
      <div className="import-content">
        <Link className="back-link import-back-link" to="/staff"><ArrowLeft size={17} /> Staff dashboard</Link>
        <div className="import-page-title"><p className="eyebrow">STAFF WORKSPACE</p><h1>Patient search</h1><p>Search by patient ID, name, mobile number, or order ID. Mobile numbers are masked.</p></div>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <form className="report-search-form" onSubmit={search}>
          <label className="form-label" htmlFor="patient-search">Search records</label>
          <div className="input-group">
            <input id="patient-search" className="form-control form-control-lg" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} />
            <button type="submit" className="primary-button btn"><Search size={18} /> Search</button>
          </div>
        </form>
        <section className="import-card card mt-4">
          {loading ? <p role="status">Searching patients…</p> : patients.length === 0 ? (
            <div className="portal-empty"><h2>No patient records found</h2><p>Try a patient name, patient ID, mobile number or order ID.</p></div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table">
                  <thead><tr><th>Patient ID</th><th>Name</th><th>Mobile</th><th>Doctor consent</th><th>Recent orders</th><th>Reports</th><th /></tr></thead>
                  <tbody>{patients.map((patient) => (
                    <tr key={patient.patientId}>
                      <th scope="row">{patient.patientId}</th>
                      <td>{patient.name}</td><td>{patient.mobileMasked}</td><td>{patient.consentStatus}</td>
                      <td>{patient.orders.map((order) => `${order.orderId} (${order.status})`).join(', ') || 'None'}</td>
                      <td>{patient.reports.map((report) => `${report.reportId} (${report.status})`).join(', ') || 'None'}</td>
                      <td><Link className="btn btn-sm btn-outline-primary" to={`/staff/patients/${encodeURIComponent(patient.patientId)}`}>Open record</Link></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="delivery-pagination">
                <button className="btn btn-outline-secondary" type="button" disabled={pagination.page <= 1} onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}>Previous</button>
                <span>Page {pagination.page} of {pagination.pages || 1} · {pagination.total} patients</span>
                <button className="btn btn-outline-secondary" type="button" disabled={pagination.page >= pagination.pages} onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}>Next</button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
