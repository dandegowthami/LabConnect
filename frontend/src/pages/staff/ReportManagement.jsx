import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileText, LogOut, Search, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import reportService from '../../services/reportService.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function ReportManagement() {
  const { user, logout } = useAuth();
  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef(null);

  const loadReports = useCallback(async (term = '') => {
    setLoading(true);
    setError('');
    try {
      const response = await reportService.getStaffReports({ search: term, page: 1, limit: 50 });
      setReports(response.data.data.reports);
      setSelectedId((current) => response.data.data.reports.some((report) => report.reportId === current)
        ? current
        : response.data.data.reports[0]?.reportId || '');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Reports could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReports(''); }, [loadReports]);

  const selected = reports.find((report) => report.reportId === selectedId);

  function chooseFile(event) {
    const chosen = event.target.files?.[0] || null;
    setFile(null);
    setError('');
    if (!chosen) return;
    if (!chosen.name.toLowerCase().endsWith('.pdf') || chosen.type !== 'application/pdf') {
      setError('Choose a PDF file with the application/pdf file type.');
      event.target.value = '';
      return;
    }
    if (chosen.size > MAX_FILE_SIZE) {
      setError('The PDF must be 10 MB or smaller.');
      event.target.value = '';
      return;
    }
    setFile(chosen);
  }

  async function uploadPdf(event) {
    event.preventDefault();
    if (!selected || !file) return;
    setBusy(true);
    setError('');
    setNotice('');
    setProgress(0);
    try {
      const response = await reportService.uploadPdf(selected.reportId, file, (eventProgress) => {
        if (eventProgress.total) setProgress(Math.round((eventProgress.loaded / eventProgress.total) * 100));
      });
      setNotice(response.data.message);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      await loadReports(search);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The PDF could not be uploaded.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmSigned() {
    if (!selected) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await reportService.confirmSigned(selected.reportId);
      setNotice(response.data.message);
      await loadReports();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The report could not be marked Ready.');
    } finally {
      setBusy(false);
    }
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
          <h1>Report management</h1>
          <p>Upload a signed report PDF and explicitly confirm it is ready before patients can access it.</p>
        </div>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        <section className="import-card card report-management-card">
          <label className="form-label" htmlFor="report-search">Find a report</label>
          <form className="report-search-form" onSubmit={(event) => { event.preventDefault(); loadReports(search); }}>
            <div className="input-group">
              <span className="input-group-text"><Search size={18} /></span>
              <input id="report-search" className="form-control" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by report ID" />
              <button className="btn btn-outline-secondary" type="submit">Search</button>
            </div>
          </form>

          {loading ? <p role="status">Loading reports…</p> : reports.length === 0 ? (
            <p className="portal-empty">No reports were found. Import report metadata before uploading a PDF.</p>
          ) : (
            <>
              <label className="form-label" htmlFor="report-select">Select report</label>
              <select id="report-select" className="form-select report-select" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setFile(null); }}>
                {reports.map((report) => <option key={report.reportId} value={report.reportId}>{report.reportId} — order {report.orderId}</option>)}
              </select>
              {selected && (
                <article className="selected-report">
                  <p><strong>Patient:</strong> {selected.patient?.name || 'Unavailable'} ({selected.patient?.patientId || 'No patient ID'})</p>
                  <p><strong>Order:</strong> {selected.orderId} · {selected.orderDate ? new Date(selected.orderDate).toLocaleDateString() : 'Date unavailable'}</p>
                  <p><strong>Tests:</strong> {selected.testNames.join(', ') || 'No test names available'}</p>
                  <p><strong>Status:</strong> {selected.reportStatus} {selected.pdfUploaded ? '· PDF uploaded' : '· No PDF uploaded'}</p>
                </article>
              )}
              {selected && !selected.pdfUploaded && (
                <form className="pdf-upload-form" onSubmit={uploadPdf}>
                  <label className="form-label" htmlFor="signed-pdf">Signed PDF (maximum 10 MB)</label>
                  <input ref={fileInput} id="signed-pdf" className="form-control" type="file" accept="application/pdf,.pdf" onChange={chooseFile} disabled={busy} />
                  {file && <p className="file-selected"><FileText size={17} /> {file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MB</p>}
                  {busy && <progress className="upload-progress" value={progress} max="100" aria-label="Upload progress">{progress}%</progress>}
                  <button className="primary-button btn" type="submit" disabled={!file || busy}><Upload size={18} /> {busy ? `Uploading… ${progress}%` : 'Upload PDF'}</button>
                </form>
              )}
              {selected?.pdfUploaded && !selected.pdfAvailable && (
                <div className="confirm-report">
                  <p>Confirm only after verifying that this is the signed report for the patient and order shown above. This action makes the PDF available to the patient.</p>
                  <button className="primary-button btn" type="button" onClick={confirmSigned} disabled={busy}><CheckCircle2 size={18} /> Confirm signed and mark Ready</button>
                </div>
              )}
              {selected?.pdfAvailable && <p className="alert alert-success mb-0">This signed report is Ready and available to the authenticated patient.</p>}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
