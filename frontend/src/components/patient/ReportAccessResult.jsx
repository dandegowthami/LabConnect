import { useEffect, useState } from 'react';
import { ArrowDownToLine, Clock3 } from 'lucide-react';
import deliveryService from '../../services/deliveryService.js';

function downloadBlob(blob) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = 'labconnect-report.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export default function ReportAccessResult({ grant, expiresAt }) {
  const [pdfUrl, setPdfUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl;
    deliveryService.getReportPdf(grant)
      .then((response) => {
        objectUrl = URL.createObjectURL(response.data);
        if (active) setPdfUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'The report could not be opened.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [grant]);

  async function download() {
    setDownloading(true);
    setError('');
    try {
      const response = await deliveryService.getReportPdf(grant, 'download');
      downloadBlob(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The report could not be downloaded.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="access-card access-result-card">
      <div className="access-icon"><Clock3 size={24} /></div>
      <h1>Your report is available</h1>
      <p className="access-intro">This private report session expires at {new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Close this page when you are finished.</p>
      <div className="access-actions">
        <button className="secondary-button btn" type="button" onClick={download} disabled={downloading}>
          <ArrowDownToLine size={18} /> {downloading ? 'Preparing download…' : 'Download PDF'}
        </button>
      </div>
      {error && <p className="alert alert-danger" role="alert">{error}</p>}
      {loading && <p role="status">Opening your secure report…</p>}
      {pdfUrl && <iframe className="pdf-frame access-pdf-frame" src={pdfUrl} title="Secure laboratory report" />}
    </section>
  );
}
