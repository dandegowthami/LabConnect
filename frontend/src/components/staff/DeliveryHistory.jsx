import { RefreshCw, RotateCw, ShieldOff } from 'lucide-react';

export default function DeliveryHistory({
  logs,
  pagination,
  filters,
  loading,
  busyReportId,
  error,
  onFilterChange,
  onPageChange,
  onResend,
  onRevoke,
  onRefresh
}) {
  return (
    <section className="import-card card delivery-history">
      <div className="delivery-history-heading">
        <div><p className="eyebrow">MESSAGE HISTORY</p><h2>Delivery attempts</h2></div>
        <button className="portal-refresh" type="button" onClick={onRefresh} aria-label="Refresh delivery history"><RefreshCw size={18} /></button>
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="delivery-filters">
        <label>Channel
          <select className="form-select" value={filters.channel} onChange={(event) => onFilterChange('channel', event.target.value)}>
            <option value="">All channels</option><option>SMS</option><option>WhatsApp</option>
          </select>
        </label>
        <label>Status
          <select className="form-select" value={filters.status} onChange={(event) => onFilterChange('status', event.target.value)}>
            <option value="">All statuses</option><option>Sent</option><option>Failed</option><option>Pending</option>
          </select>
        </label>
        <label>From
          <input className="form-control" type="date" value={filters.from} onChange={(event) => onFilterChange('from', event.target.value)} />
        </label>
        <label>To
          <input className="form-control" type="date" value={filters.to} onChange={(event) => onFilterChange('to', event.target.value)} />
        </label>
      </div>
      {loading ? <p role="status">Loading delivery history…</p> : logs.length === 0 ? (
        <div className="portal-empty"><h3>No delivery attempts</h3><p>Delivery attempts for secure reports will appear here.</p></div>
      ) : (
        <div className="table-responsive">
          <table className="table delivery-table">
            <thead><tr><th>Report</th><th>Patient</th><th>Destination</th><th>Channel</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <th scope="row">{log.reportId}</th>
                  <td>{log.patientName}</td>
                  <td>{log.destinationMasked}</td>
                  <td>{log.channel}</td>
                  <td><span className={`portal-status ${log.status.toLowerCase()}`}>{log.status}</span>{log.failureReason && <small className="delivery-failure">{log.failureReason}</small>}</td>
                  <td>{new Date(log.createdAt).toLocaleString()}</td>
                  <td>
                    <div className="delivery-row-actions">
                      <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => onResend(log)} disabled={busyReportId === log.reportId}>
                        <RotateCw size={15} /> Resend
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onRevoke(log)} disabled={busyReportId === log.reportId}>
                        <ShieldOff size={15} /> Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pagination.pages > 1 && (
        <div className="delivery-pagination">
          <button className="btn btn-outline-secondary" type="button" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}>Previous</button>
          <span>Page {pagination.page} of {pagination.pages}</span>
          <button className="btn btn-outline-secondary" type="button" disabled={pagination.page >= pagination.pages} onClick={() => onPageChange(pagination.page + 1)}>Next</button>
        </div>
      )}
    </section>
  );
}
