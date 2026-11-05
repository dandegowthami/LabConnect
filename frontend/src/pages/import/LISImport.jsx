import { useState } from 'react';
import { ArrowLeft, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../services/api.js';
import CSVPreview from './CSVPreview.jsx';
import CSVUpload from './CSVUpload.jsx';
import ImportHistory from './ImportHistory.jsx';
import ImportSummary from './ImportSummary.jsx';

export default function LISImport() {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [summary, setSummary] = useState(null);
  const [refreshHistory, setRefreshHistory] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function upload(file) {
    setLoading(true);
    setError('');
    setNotice('');
    setPreview(null);
    setSummary(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/import/lis/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setPreview(response.data.data);
      setNotice('The file was validated. Review the grouped orders before importing.');
    } catch (uploadError) {
      setError(uploadError.response?.data?.message || 'The CSV could not be previewed. Please check the file and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function commit() {
    if (!preview?.previewId) return;
    setCommitting(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post('/import/lis/commit', { previewId: preview.previewId });
      setSummary(response.data.data);
      setPreview(null);
      setRefreshHistory((value) => value + 1);
      setNotice('Import results have been saved to history.');
    } catch (commitError) {
      setError(commitError.response?.data?.message || 'The import could not be committed. Please try again.');
    } finally {
      setCommitting(false);
    }
  }

  return (
    <main className="import-page">
      <header className="import-header">
        <Link className="site-brand" to="/staff"><span className="site-brand-mark">L</span>LabConnect</Link>
        <div className="import-user-actions">
          <span>{user?.name}</span>
          <button type="button" className="logout-button" onClick={() => logout()}><LogOut size={17} /> Sign out</button>
        </div>
      </header>
      <div className="import-content">
        <Link className="back-link import-back-link" to="/staff"><ArrowLeft size={17} /> Staff dashboard</Link>
        <div className="import-page-title">
          <p className="eyebrow">STAFF WORKSPACE</p>
          <h1>LIS Report Import</h1>
          <p>Upload a laboratory CSV, review validation results, then confirm to add its order and report metadata.</p>
        </div>

        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        <div className="import-layout">
          <div className="import-main-column">
            <CSVUpload onUpload={upload} loading={loading} />
            {preview && <CSVPreview preview={preview} onCommit={commit} committing={committing} />}
            {summary && <ImportSummary summary={summary} />}
          </div>
          <aside className="import-side-column">
            <section className="import-card card csv-format-card">
              <p className="eyebrow">SUPPORTED CSV FORMAT</p>
              <h2>Required columns</h2>
              <code>orderId, patientId, patientName, mobile, doctorName, testName, result, unit, referenceMin, referenceMax, status</code>
              <p>Use one row per test. Rows sharing an order ID are grouped into a single order and report.</p>
              <p>Each mobile must be a 10-digit Indian number. Status must be Processing, Ready or Cancelled.</p>
            </section>
          </aside>
        </div>
        <ImportHistory refreshKey={refreshHistory} />
      </div>
    </main>
  );
}
