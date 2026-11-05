import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function CSVPreview({ preview, onCommit, committing }) {
  return (
    <section className="import-card card" aria-labelledby="preview-title">
      <div className="import-card-heading">
        <div>
          <p className="eyebrow">REVIEW BEFORE IMPORT</p>
          <h2 id="preview-title">CSV preview</h2>
          <p className="import-help">{preview.fileName}</p>
        </div>
        <div className="preview-counts">
          <span>{preview.totalRows} rows</span>
          <span>{preview.validRecords} valid rows</span>
          <span>{preview.invalidRecords} invalid rows</span>
          <span>{preview.duplicateRecords} duplicate rows</span>
          <span>{preview.groupedOrders.length} valid orders</span>
        </div>
      </div>

      {preview.groupedOrders.length > 0 && (
        <div className="table-responsive">
          <table className="table align-middle import-table">
            <thead>
              <tr><th>Order</th><th>Patient</th><th>Doctor</th><th>Tests</th><th>Status</th></tr>
            </thead>
            <tbody>
              {preview.groupedOrders.map((order) => (
                <tr key={order.orderId}>
                  <td>{order.orderId}</td>
                  <td>{order.patient.fullName}<small>{order.patient.patientId} · {order.patient.mobile}</small></td>
                  <td>{order.doctorName}</td>
                  <td>
                    {order.tests.map((test) => (
                      <div className="test-preview" key={`${order.orderId}-${test.testName}`}>
                        {test.testName}: {test.result} {test.unit}
                        <small>Reference {test.referenceMin}–{test.referenceMax}</small>
                      </div>
                    ))}
                  </td>
                  <td>{order.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview.rowErrors.length > 0 && (
        <div className="import-validation" role="alert">
          <h3><AlertTriangle size={18} aria-hidden="true" /> Rows requiring correction</h3>
          <ul>
            {preview.rowErrors.map((error, index) => (
              <li key={`${error.row}-${index}`}>Row {error.row}{error.orderId ? ` · ${error.orderId}` : ''}: {error.message}</li>
            ))}
          </ul>
        </div>
      )}

      {preview.skippedRows > 0 && (
        <p className="import-note"><CheckCircle2 size={17} aria-hidden="true" /> {preview.skippedRows} row(s) belong to orders already in the system and will be skipped.</p>
      )}
      <button className="primary-button btn" type="button" onClick={onCommit} disabled={committing}>
        {committing
          ? 'Importing validated orders…'
          : preview.validOrders > 0
            ? `Import ${preview.validOrders} valid order(s)`
            : 'Save validation results'}
      </button>
    </section>
  );
}
