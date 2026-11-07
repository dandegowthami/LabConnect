import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, Eye } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import reportService from '../../services/reportService.js';

function saveBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export default function ReportDetails() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    reportService.getReport(reportId)
      .then((response) => { if (active) setReport(response.data.data.report); })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.message || 'The report could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reportId]);

  async function downloadPdf() {
    setDownloading(true);
    setError('');
    try {
      const response = await reportService.getReportPdf(reportId, 'download');
      saveBlob(response.data, `lab-report-${reportId}.pdf`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The PDF could not be downloaded.');
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <main className="portal-page"><div className="portal-loading" role="status">Loading report…</div></main>;

  return (
    <main className="portal-page">
      <header className="portal-header">
        <Link className="site-brand" to="/patient/dashboard"><span className="site-brand-mark">L</span>LabConnect</Link>
      </header>
      <div className="portal-content">
        <Link className="back-link" to="/patient/dashboard"><ArrowLeft size={18} /> Back to dashboard</Link>
        <section className="portal-section report-details">
          <p className="eyebrow">LABORATORY REPORT</p>
          <h1>Report details</h1>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          {!report && !error ? <p>Report not found.</p> : report && (
            <>
              <dl className="report-meta">
                <div><dt>Order ID</dt><dd>{report.orderId}</dd></div>
                <div><dt>Report ID</dt><dd>{report.reportId}</dd></div>
                <div><dt>Report date</dt><dd>{report.signedAt ? new Date(report.signedAt).toLocaleDateString() : 'Not signed'}</dd></div>
                <div><dt>Availability</dt><dd>{report.pdfAvailable ? 'Signed report available' : 'Not ready'}</dd></div>
              </dl>
              <div className="table-responsive">
                <table className="table report-results">
                  <thead><tr><th scope="col">Test</th><th scope="col">Result</th><th scope="col">Unit</th><th scope="col">Reference range</th></tr></thead>
                  <tbody>
                    {report.tests.map((test) => {
                      const outsideRange = test.result < test.referenceMin || test.result > test.referenceMax;
                      return (
                        <tr className={outsideRange ? 'result-outside-range' : ''} key={test.testName}>
                          <th scope="row">{test.testName}</th>
                          <td>{test.result}</td><td>{test.unit}</td><td>{test.referenceMin}–{test.referenceMax}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="portal-disclaimer">Values are displayed as provided by the laboratory. A highlighted value is outside its listed reference range; this is not a diagnosis.</p>
              <div className="report-actions">
                {report.pdfAvailable ? (
                  <>
                    <button className="primary-button btn" type="button" onClick={() => navigate(`/patient/reports/${encodeURIComponent(reportId)}/view`)}><Eye size={18} /> View full report</button>
                    <button className="secondary-button btn" type="button" onClick={downloadPdf} disabled={downloading}><ArrowDownToLine size={18} /> {downloading ? 'Preparing download…' : 'Download PDF'}</button>
                  </>
                ) : <p className="portal-pending">PDF actions will be available when the signed report is ready.</p>}
                <Link className="back-link" to="/patient/dashboard"><ArrowLeft size={18} /> Back to dashboard</Link>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
