import { useEffect, useState } from 'react';
import api from '../../services/api.js';

export default function ImportHistory({ refreshKey }) {
  const [imports, setImports] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [details, setDetails] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.get('/import/history', { params: { page: pagination.page, limit: 10 } })
      .then(({ data }) => {
        if (!active) return;
        setImports(data.data.imports);
        setPagination(data.data.pagination);
      })
      .catch(() => {
        if (active) setError('Import history could not be loaded. Please try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [pagination.page, refreshKey]);

  async function showDetails(id) {
    try {
      const { data } = await api.get(`/import/${id}`);
      setDetails(data.data);
    } catch {
      setError('Import details could not be loaded. Please try again.');
    }
  }

  return (
    <section className="import-card card">
      <div className="import-card-heading">
        <div><p className="eyebrow">RECENT ACTIVITY</p><h2>Import history</h2></div>
      </div>
      {error && <p className="alert alert-danger" role="alert">{error}</p>}
      {loading ? <p role="status">Loading import history…</p>
        : imports.length === 0 ? <p className="import-empty">No imports yet. A completed import will appear here.</p>
          : (
            <>
              <div className="table-responsive">
                <table className="table align-middle import-table">
                  <thead><tr><th>File</th><th>Imported</th><th>Imported by</th><th>Rows</th><th>Successful</th><th>Failed</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {imports.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.fileName}</td>
                        <td>{new Date(entry.importedAt).toLocaleString()}</td>
                        <td>{entry.importedBy?.name ?? 'Unknown'}</td>
                        <td>{entry.totalRows}</td>
                        <td>{entry.importedRows}</td>
                        <td>{entry.failedRows}</td>
                        <td><span className={`import-status status-${entry.status}`}>{entry.status}</span></td>
                        <td><button className="detail-button" type="button" onClick={() => showDetails(entry.id)}>Details</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="history-pagination">
                <span>Page {pagination.page} of {pagination.pages}</span>
                <div>
                  <button type="button" className="secondary-button btn" disabled={pagination.page <= 1} onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}>Previous</button>
                  <button type="button" className="secondary-button btn" disabled={pagination.page >= pagination.pages} onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}>Next</button>
                </div>
              </div>
            </>
          )}
      {details && (
        <div className="import-detail-panel">
          <div className="import-card-heading"><h3>{details.fileName} details</h3><button type="button" className="detail-button" onClick={() => setDetails(null)}>Close</button></div>
          <p>{details.totalRows} total · {details.importedRows} imported · {details.skippedRows} skipped · {details.failedRows} failed</p>
          {details.errors.length === 0 ? <p>No row errors were recorded.</p> : (
            <ul>{details.errors.map((error, index) => <li key={`${error.row}-${index}`}>Row {error.row}: {error.message}</li>)}</ul>
          )}
        </div>
      )}
    </section>
  );
}
