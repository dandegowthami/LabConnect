import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BellRing, LogOut, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import DeliveryHistory from '../../components/staff/DeliveryHistory.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import deliveryService from '../../services/deliveryService.js';
import reportService from '../../services/reportService.js';

const emptyPagination = { page: 1, limit: 20, total: 0, pages: 0 };

export default function DeliveryManagement() {
  const { user, logout } = useAuth();
  const [reports, setReports] = useState([]);
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState(emptyPagination);
  const [channel, setChannel] = useState('SMS');
  const [filters, setFilters] = useState({ channel: '', status: '', from: '', to: '' });
  const [loadingReports, setLoadingReports] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [busyReportId, setBusyReportId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const response = await reportService.getStaffReports({ page: 1, limit: 50 });
      setReports(response.data.data.reports.filter((report) => report.pdfAvailable));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Ready reports could not be loaded.');
    } finally {
      setLoadingReports(false);
    }
  }, []);

  const loadLogs = useCallback(async (page, nextFilters) => {
    setLoadingLogs(true);
    setError('');
    try {
      const params = { page, limit: 20 };
      for (const [key, value] of Object.entries(nextFilters)) if (value) params[key] = value;
      const response = await deliveryService.getLogs(params);
      setLogs(response.data.data.logs);
      setPagination(response.data.data.pagination);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Delivery history could not be loaded.');
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);
  useEffect(() => { loadLogs(1, filters); }, [filters, loadLogs]);

  async function generate(report) {
    setBusyReportId(report.reportId);
    setError('');
    setNotice('');
    try {
      const response = await deliveryService.generate(report.reportId, channel);
      setNotice(`${report.reportId}: ${response.data.message}`);
      await loadLogs(1, filters);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The notification could not be prepared.');
    } finally {
      setBusyReportId('');
    }
  }

  async function resend(log) {
    if (!window.confirm(`Resend the secure report link to ${log.destinationMasked} using ${log.channel}? The previous link will be revoked.`)) return;
    setBusyReportId(log.reportId);
    setError('');
    setNotice('');
    try {
      const response = await deliveryService.resend(log.reportId, log.channel);
      setNotice(response.data.message);
      await loadLogs(pagination.page, filters);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The notification could not be resent.');
    } finally {
      setBusyReportId('');
    }
  }

  async function revoke(log) {
    if (!window.confirm(`Revoke active report links for ${log.reportId}?`)) return;
    setBusyReportId(log.reportId);
    setError('');
    setNotice('');
    try {
      const response = await deliveryService.revoke(log.reportId);
      setNotice(response.data.message);
      await loadLogs(pagination.page, filters);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The report link could not be revoked.');
    } finally {
      setBusyReportId('');
    }
  }

  function changeFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className="import-page">
      <header className="import-header">
        <Link className="site-brand" to="/staff"><span className="site-brand-mark">L</span>LabConnect</Link>
        <div className="import-user-actions"><span>{user?.name}</span><button type="button" className="logout-button" onClick={() => logout()}><LogOut size={17} /> Sign out</button></div>
      </header>
      <div className="import-content">
        <Link className="back-link import-back-link" to="/staff"><ArrowLeft size={17} /> Staff dashboard</Link>
        <div className="import-page-title">
          <p className="eyebrow">STAFF WORKSPACE</p>
          <h1>Secure report delivery</h1>
          <p>Notification delivery is simulated in this environment. No real SMS or WhatsApp messages are sent.</p>
        </div>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}

        <section className="import-card card delivery-ready-reports">
          <div className="delivery-history-heading">
            <div><p className="eyebrow">READY REPORTS</p><h2>Send a secure link</h2></div>
            <label className="delivery-channel-select">Channel
              <select className="form-select" value={channel} onChange={(event) => setChannel(event.target.value)}>
                <option>SMS</option><option>WhatsApp</option>
              </select>
            </label>
          </div>
          {loadingReports ? <p role="status">Loading Ready reports…</p> : reports.length === 0 ? (
            <div className="portal-empty"><h3>No Ready reports</h3><p>Signed reports with a validated PDF will appear here.</p></div>
          ) : (
            <div className="ready-delivery-list">
              {reports.map((report) => (
                <article className="ready-delivery-row" key={report.reportId}>
                  <div><strong>{report.reportId}</strong><span>{report.patient?.name || 'Patient'} · Order {report.orderId}</span></div>
                  <button type="button" className="primary-button btn" onClick={() => generate(report)} disabled={busyReportId === report.reportId}>
                    <Send size={17} /> {busyReportId === report.reportId ? 'Sending…' : 'Send link'}
                  </button>
                </article>
              ))}
            </div>
          )}
          <p className="delivery-safety-note"><BellRing size={17} /> Links expire after 72 hours and require one-time mobile OTP verification. Notifications contain no test results.</p>
        </section>

        <DeliveryHistory
          logs={logs}
          pagination={pagination}
          filters={filters}
          loading={loadingLogs}
          busyReportId={busyReportId}
          error=""
          onFilterChange={changeFilter}
          onPageChange={(page) => loadLogs(page, filters)}
          onResend={resend}
          onRevoke={revoke}
          onRefresh={() => loadLogs(pagination.page, filters)}
        />
      </div>
    </main>
  );
}
