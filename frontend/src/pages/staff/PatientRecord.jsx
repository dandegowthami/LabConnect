import { useEffect, useState } from 'react';
import { ArrowLeft, LogOut } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import staffWorkspaceService from '../../services/staffWorkspaceService.js';

export default function PatientRecord() {
  const { patientId } = useParams();
  const { user, logout } = useAuth();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activationCode, setActivationCode] = useState('');

  useEffect(() => {
    let active = true;
    staffWorkspaceService.getPatient(patientId)
      .then((response) => { if (active) setRecord(response.data.data); })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.message || 'Patient record could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [patientId]);

  async function setConsent(consentStatus) {
    const action = consentStatus === 'granted' ? 'record that documented consent has been provided' : 'record that consent has been withdrawn';
    if (!window.confirm(`Confirm you have documentation to ${action}? This controls referring-doctor report access.`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await staffWorkspaceService.setDoctorConsent(record.patient.patientId, consentStatus);
      setRecord((current) => ({ ...current, patient: { ...current.patient, consentStatus: response.data.data.consentStatus } }));
      setNotice(response.data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Consent status could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function issueActivationCode() {
    if (!window.confirm(`Confirm that you verified ${record.patient.name}'s identity in person before issuing a one-time portal activation code.`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    setActivationCode('');
    try {
      const response = await staffWorkspaceService.issuePatientPortalActivation(record.patient.patientId);
      setActivationCode(response.data.data.activationCode);
      setNotice('Give this code directly to the identity-verified patient. It is shown only once and expires in 24 hours.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'A patient activation code could not be issued.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="import-page">
      <header className="import-header"><Link className="site-brand" to="/staff"><span className="site-brand-mark">L</span>LabConnect</Link><div className="import-user-actions"><span>{user?.name}</span><button className="logout-button" type="button" onClick={() => logout()}><LogOut size={17} /> Sign out</button></div></header>
      <div className="import-content">
        <Link className="back-link import-back-link" to="/staff/patients"><ArrowLeft size={17} /> Patient search</Link>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        {loading ? <p role="status">Loading patient record…</p> : record && (
          <>
            <div className="import-page-title"><p className="eyebrow">AUTHORIZED STAFF RECORD</p><h1>{record.patient.name}</h1><p>{record.patient.patientId} · {record.patient.mobileMasked}</p></div>
            <section className="import-card card">
              <h2>Patient portal identity</h2>
              <p>Portal status: <strong>{record.patient.portalActivated ? 'Activated' : 'Not activated'}</strong>. Verify identity in person before issuing an activation code. This is separate from referring-doctor sharing consent.</p>
              {!record.patient.portalActivated && <button className="btn btn-primary" type="button" disabled={busy} onClick={issueActivationCode}>Issue one-time activation code</button>}
              {activationCode && (
                <div className="alert alert-warning mt-3" role="status">
                  <p className="mb-1">Give this code directly to the patient. Do not send it to the shared phone or another person.</p>
                  <code className="user-select-all">{activationCode}</code>
                </div>
              )}
            </section>
            <section className="import-card card mt-4">
              <h2>Referring doctor consent</h2>
              <p>Current recorded status: <strong>{record.patient.consentStatus}</strong>. Update only from documented patient authorization.</p>
              <div className="d-flex flex-wrap gap-2">
                <button className="btn btn-outline-primary" type="button" disabled={busy || record.patient.consentStatus === 'granted'} onClick={() => setConsent('granted')}>Record documented consent</button>
                <button className="btn btn-outline-danger" type="button" disabled={busy || record.patient.consentStatus !== 'granted'} onClick={() => setConsent('withdrawn')}>Record withdrawal</button>
              </div>
            </section>
            <section className="import-card card mt-4"><h2>Orders</h2><div className="table-responsive"><table className="table"><thead><tr><th>Order</th><th>Date</th><th>Referring doctor</th><th>Status</th></tr></thead><tbody>{record.orders.map((order) => <tr key={order.orderId}><th>{order.orderId}</th><td>{new Date(order.orderDate).toLocaleDateString()}</td><td>{order.referringDoctor || 'Unavailable'}</td><td>{order.status}</td></tr>)}</tbody></table></div></section>
            <section className="import-card card mt-4"><h2>Reports</h2><div className="table-responsive"><table className="table"><thead><tr><th>Report</th><th>Order</th><th>Status</th><th>Signed</th><th>Critical review</th></tr></thead><tbody>{record.reports.map((report) => <tr key={report.reportId}><th><Link to={`/staff/report/${encodeURIComponent(report.reportId)}`}>{report.reportId}</Link></th><td>{report.orderId}</td><td>{report.status}</td><td>{report.signedAt ? new Date(report.signedAt).toLocaleDateString() : 'Not signed'}</td><td>{report.criticalReviewStatus}</td></tr>)}</tbody></table></div></section>
          </>
        )}
      </div>
    </main>
  );
}
