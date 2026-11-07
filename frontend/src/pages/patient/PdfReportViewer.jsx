import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import reportService from '../../services/reportService.js';

export default function PdfReportViewer() {
  const { reportId } = useParams();
  const [pdfUrl, setPdfUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let objectUrl;
    reportService.getReportPdf(reportId)
      .then((response) => {
        objectUrl = URL.createObjectURL(response.data);
        if (active) setPdfUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'The PDF could not be opened.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [reportId]);

  return (
    <main className="portal-page pdf-viewer-page">
      <header className="portal-header">
        <Link className="site-brand" to="/patient/dashboard"><span className="site-brand-mark">L</span>LabConnect</Link>
        <Link className="back-link" to={`/patient/reports/${encodeURIComponent(reportId)}`}><ArrowLeft size={18} /> Report details</Link>
      </header>
      <div className="portal-content">
        <div className="pdf-viewer-heading"><h1>Secure report viewer</h1>
          {pdfUrl && <a className="secondary-button btn" href={pdfUrl} download={`lab-report-${reportId}.pdf`}><ArrowDownToLine size={18} /> Download PDF</a>}
        </div>
        {loading && <div className="portal-loading" role="status">Loading your private PDF…</div>}
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {pdfUrl && <iframe className="pdf-frame" src={pdfUrl} title={`Laboratory report ${reportId}`} />}
      </div>
    </main>
  );
}
