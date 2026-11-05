import { CheckCircle2 } from 'lucide-react';

export default function ImportSummary({ summary }) {
  return (
    <section className="import-summary card" aria-live="polite">
      <div className="import-summary-title">
        <CheckCircle2 aria-hidden="true" />
        <div>
          <p className="eyebrow">IMPORT COMPLETE</p>
          <h2>{summary.status}</h2>
        </div>
      </div>
      <div className="summary-counts">
        <div><strong>{summary.totalRows}</strong><span>Total rows</span></div>
        <div><strong>{summary.importedRows}</strong><span>Imported rows</span></div>
        <div><strong>{summary.skippedRows}</strong><span>Skipped rows</span></div>
        <div><strong>{summary.failedRows}</strong><span>Failed rows</span></div>
      </div>
      {summary.errors?.length > 0 && (
        <ul className="summary-errors">
          {summary.errors.map((error, index) => (
            <li key={`${error.row}-${index}`}>Row {error.row}{error.orderId ? ` · ${error.orderId}` : ''}: {error.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
