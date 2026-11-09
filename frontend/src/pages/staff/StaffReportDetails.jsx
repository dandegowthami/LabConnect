import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, LogOut, RefreshCw, ShieldOff } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import deliveryService from '../../services/deliveryService.js';
import reportService from '../../services/reportService.js';
import staffWorkspaceService from '../../services/staffWorkspaceService.js';

export default function StaffReportDetails() {
  const { reportId } = useParams();
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await staffWorkspaceService.getReport(reportId);
      setData(response.data.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Report details could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [reportId]);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  async function showPdf() {
    setBusy(true);
    setError('');
    try {
      const response = await reportService.getReportPdf(reportId, 'view');
      const url = URL.createObjectURL(response.data);
      setPdfUrl((current) => { if (current) URL.revokeObjectURL(current); return url; });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Private report PDF could not be opened.');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!window.confirm(`Resend the secure report link for ${reportId}? This invalidates the previous link.`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await deliveryService.resend(reportId);
      setNotice(response.data.message);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The notification could not be resent.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!window.confirm(`Revoke all active access links for ${reportId}?`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await deliveryService.revoke(reportId);
      setNotice(response.data.message);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Active report links could not be revoked.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="import-page">
      <header className="import-header"><Link className="site-brand" to="/staff"><span className="site-brand-mark">L</span>LabConnect</Link><div className="import-user-actions"><span>{user?.name}</span><button className="logout-button" type="button" onClick={() => logout()}><LogOut size={17} /> Sign out</button></div></header>
      <div className="import-content"><Link className="back-link import-back-link" to="/staff/reports"><ArrowLeft size={17} /> Report management</Link>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        {loading ? <p role="status">Loading report record…</p> : data && (
          <>
            <div className="import-page-title"><p className="eyebrow">STAFF REPORT WORKSPACE</p><h1>{data.report.reportId}</h1><p>{data.report.patient?.name} · {data.report.patient?.patientId} · {data.report.patient?.mobileMasked}</p></div>
            <section className="import-card card"><h2>Report status and access</h2><dl className="report-meta"><div><dt>Order</dt><dd>{data.report.order?.orderId}</dd></div><div><dt>Report status</dt><dd>{data.report.status}</dd></div><div><dt>PDF attached</dt><dd>{data.report.pdfAttached ? 'Yes' : 'No'}</dd></div><div><dt>Critical review</dt><dd>{data.report.criticalReviewStatus}</dd></div><div><dt>Doctor consent</dt><dd>{data.report.patient?.consentStatus}</dd></div><div><dt>Delivery attempts</dt><dd>{data.deliveryAttempts}</dd></div></dl>
              <div className="d-flex flex-wrap gap-2">{data.report.pdfAttached && <button className="btn btn-outline-primary" type="button" disabled={busy} onClick={showPdf}><ArrowDownToLine size={17} /> View private PDF</button>}<button className="btn btn-outline-primary" type="button" disabled={busy || data.report.status !== 'Ready'} onClick={resend}><RefreshCw size={17} /> Resend secure link</button><button className="btn btn-outline-danger" type="button" disabled={busy} onClick={revoke}><ShieldOff size={17} /> Revoke active links</button></div>
            </section>
            {pdfUrl && <section className="import-card card mt-4"><h2>Private report PDF</h2><iframe title={`Private signed report ${reportId}`} className="pdf-frame" src={pdfUrl} /></section>}
            <section className="import-card card mt-4"><h2>Delivery history</h2>{data.deliveryHistory.length === 0 ? <p>No delivery attempts.</p> : <div className="table-responsive"><table className="table"><thead><tr><th>Channel</th><th>Destination</th><th>Status</th><th>Sent</th><th>Failure</th></tr></thead><tbody>{data.deliveryHistory.map((entry) => <tr key={`${entry.createdAt}-${entry.channel}`}><td>{entry.channel}</td><td>{entry.destinationMasked}</td><td>{entry.status}</td><td>{entry.sentAt ? new Date(entry.sentAt).toLocaleString() : '—'}</td><td>{entry.failureReason || '—'}</td></tr>)}</tbody></table></div>}</section>
            <section className="import-card card mt-4"><h2>Report access history</h2>{data.accessHistory.length === 0 ? <p>No PDF access events recorded.</p> : <ul>{data.accessHistory.map((event) => <li key={`${event._id}`}>{event.action.replaceAll('-', ' ')} · {new Date(event.createdAt).toLocaleString()}</li>)}</ul>}</section>
          </>
        )}
      </div>
    </main>
  );
}
