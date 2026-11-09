import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import patientService from '../services/patientService.js';

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : 'Date unavailable';
}

export default function PatientDashboard() {
  const { logout } = useAuth();
  const [patient, setPatient] = useState(null);
  const [orders, setOrders] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [reportSummary, setReportSummary] = useState({ readyReports: 0, processingReports: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [profileResponse, ordersResponse, reportsResponse] = await Promise.all([
        patientService.getProfile(),
        patientService.getOrders({ page: 1, limit: 20 }),
        patientService.getReports({ page: 1, limit: 20 })
      ]);
      setPatient(profileResponse.data.data.patient);
      setOrders(ordersResponse.data.data.orders);
      setTotalOrders(ordersResponse.data.data.pagination.total);
      setReportSummary(reportsResponse.data.data.summary);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Your records could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  return (
    <main className="portal-page">
      <header className="portal-header">
        <Link className="site-brand" to="/patient/dashboard"><span className="site-brand-mark">L</span>LabConnect</Link>
        <button className="portal-logout" type="button" onClick={() => logout()}><LogOut size={18} /> Sign out</button>
      </header>
      <div className="portal-content">
        <section className="portal-welcome">
          <div>
            <p className="eyebrow">PATIENT PORTAL</p>
            <h1>{patient ? `Welcome, ${patient.name}` : 'Your health reports'}</h1>
            <p className="intro">View your laboratory orders and securely access signed reports.</p>
          </div>
          <div className="portal-security-note"><ShieldCheck size={22} /> Your records are private</div>
        </section>

        {error && (
          <section className="portal-alert alert alert-warning" role="alert">
            <h2>{error.toLowerCase().includes('identity verification') ? 'Patient identity verification required' : 'Your records could not be loaded'}</h2>
            <p>{error} {error.toLowerCase().includes('identity verification')
              ? 'Verifying a shared mobile number confirms contact only. Use your patient ID, portal password, and clinic activation code (first-time setup) to verify which family member owns this profile.'
              : 'Please check your connection and try again.'}</p>
            {error.toLowerCase().includes('identity verification')
              ? <Link className="primary-button btn" to="/patient/activate">Verify my patient profile</Link>
              : <button type="button" className="secondary-button btn" onClick={loadDashboard}><RefreshCw size={17} /> Try again</button>}
          </section>
        )}

        {loading ? (
          <div className="portal-loading" role="status">Loading your orders and reports…</div>
        ) : !error && (
          <>
            <section className="portal-summary" aria-label="Report summary">
              <article><span>Total orders</span><strong>{totalOrders}</strong></article>
              <article><span>Ready reports</span><strong>{reportSummary.readyReports}</strong></article>
              <article><span>Processing reports</span><strong>{reportSummary.processingReports}</strong></article>
            </section>
            <section className="portal-section">
              <div className="portal-section-heading">
                <div><p className="eyebrow">RECENT ACTIVITY</p><h2>Your orders</h2></div>
                <button type="button" className="portal-refresh" onClick={loadDashboard} aria-label="Refresh orders"><RefreshCw size={18} /></button>
              </div>
              {orders.length === 0 ? (
                <div className="portal-empty"><h3>No orders to show yet</h3><p>When the laboratory adds an order to your verified profile, it will appear here.</p></div>
              ) : (
                <div className="portal-order-list">
                  {orders.map((order) => {
                    return (
                      <article className="portal-order-card" key={order.orderId}>
                        <div className="portal-order-main">
                          <div>
                            <h3>Order {order.orderId}</h3>
                            <p>{formatDate(order.orderDate)} · {order.laboratory}</p>
                            <p className="portal-tests">{order.testNames.join(', ')}</p>
                          </div>
                          <span className={`portal-status ${order.status.toLowerCase()}`}>{order.status}</span>
                        </div>
                        {order.reportAvailable && order.reportId ? (
                          <Link className="portal-view-link" to={`/patient/reports/${encodeURIComponent(order.reportId)}`}>
                            View report <ArrowRight size={17} />
                          </Link>
                        ) : (
                          <p className="portal-pending">Your signed report is not ready yet. Please check again later.</p>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
