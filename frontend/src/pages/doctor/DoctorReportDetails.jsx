import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, Eye, LogOut } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import doctorService from '../../services/doctorService.js';

function downloadBlob(blob, reportId) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `lab-report-${reportId}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DoctorReportDetails() {
  const { reportId } = useParams();
  const { user, logout } = useAuth();
  const [report, setReport] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    doctorService.getReport(reportId)
      .then((response) => { if (active) setReport(response.data.data.report); })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.message || 'Report is unavailable.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reportId]);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  async function viewPdf() {
    setBusy(true);
    setError('');
    try {
      const response = await doctorService.getPdf(reportId, 'view');
      setPdfUrl(URL.createObjectURL(response.data));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The private PDF could not be opened.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    setBusy(true);
    setError('');
    try {
      const response = await doctorService.getPdf(reportId, 'download');
      downloadBlob(response.data, reportId);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The private PDF could not be downloaded.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="import-page">
      <header className="import-header"><Link className="site-brand" to="/doctor/dashboard"><span className="site-brand-mark">L</span>LabConnect</Link><div className="import-user-actions"><span>{user?.name}</span><button className="logout-button" type="button" onClick={() => logout()}><LogOut size={17} /> Sign out</button></div></header>
      <div className="import-content"><Link className="back-link import-back-link" to="/doctor/reports"><ArrowLeft size={17} /> Search reports</Link>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {loading ? <p role="status">Verifying doctor authorization…</p> : report && (
          <>
            <div className="import-page-title"><p className="eyebrow">AUTHORIZED REFERRAL · {report.referringDoctor}</p><h1>{report.reportId}</h1><p>{report.patient.name} · {report.patient.patientId} · Order {report.orderId} · {new Date(report.orderDate).toLocaleDateString()}</p></div>
            <section className="import-card card"><h2>Signed report results</h2><p>Status: {report.reportStatus} · Signed {new Date(report.signedAt).toLocaleString()}</p><div className="table-responsive"><table className="table"><thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference range</th></tr></thead><tbody>{report.tests.map((test) => <tr key={test.testName}><th>{test.testName}</th><td>{test.result}</td><td>{test.unit}</td><td>{test.referenceMin}–{test.referenceMax}</td></tr>)}</tbody></table></div>
              <div className="d-flex flex-wrap gap-2"><button type="button" className="primary-button btn" disabled={busy || !report.pdfAvailable} onClick={viewPdf}><Eye size={18} /> View private PDF</button><button type="button" className="secondary-button btn" disabled={busy || !report.pdfAvailable} onClick={downloadPdf}><ArrowDownToLine size={18} /> Download PDF</button></div>
            </section>
            {pdfUrl && <section className="import-card card mt-4"><h2>Private signed PDF</h2><iframe title={`Authorized report ${reportId}`} className="pdf-frame" src={pdfUrl} /></section>}
          </>
        )}
      </div>
    </main>
  );
}
