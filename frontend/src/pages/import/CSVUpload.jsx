import { useState } from 'react';
import { FileUp } from 'lucide-react';

export default function CSVUpload({ onUpload, loading }) {
  const [file, setFile] = useState(null);

  function submit(event) {
    event.preventDefault();
    if (file) onUpload(file);
  }

  return (
    <section className="import-card card">
      <div className="import-card-heading">
        <div>
          <p className="eyebrow">UPLOAD FILE</p>
          <h2>Select a laboratory export</h2>
        </div>
        <FileUp aria-hidden="true" />
      </div>
      <form onSubmit={submit}>
        <label className="form-label" htmlFor="lis-csv">CSV file</label>
        <input
          id="lis-csv"
          className="form-control"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          disabled={loading}
          required
        />
        <p className="import-help">CSV only, up to 2 MB and 5,000 data rows.</p>
        <button className="primary-button btn w-100" type="submit" disabled={!file || loading}>
          {loading ? 'Validating CSV…' : 'Upload and preview'}
        </button>
      </form>
    </section>
  );
}
