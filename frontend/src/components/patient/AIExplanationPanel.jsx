import { useEffect, useState } from 'react';
import { AlertTriangle, Languages, MessageSquareWarning } from 'lucide-react';
import { Link } from 'react-router-dom';
import aiService from '../../services/aiService.js';

const languageNames = { en: 'English', te: 'Telugu', hi: 'Hindi' };

export default function AIExplanationPanel({ reportId, tests = [], criticalReviewStatus }) {
  const [language, setLanguage] = useState('en');
  const [explanation, setExplanation] = useState(null);
  const [classifications, setClassifications] = useState(tests);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const critical = criticalReviewStatus === 'Urgent review'
    || classifications.some(({ classification }) => classification === 'Critical');

  useEffect(() => {
    let active = true;
    setExplanation(null);
    setError('');
    if (critical) return () => { active = false; };
    setLoading(true);
    aiService.getSummary(reportId, language)
      .then((response) => {
        if (!active) return;
        const data = response.data.data;
        setExplanation(data.explanation);
        if (data.classifications) setClassifications(data.classifications);
      })
      .catch((requestError) => {
        if (!active) return;
        if (requestError.response?.status === 409) {
          setError('This result requires review by the laboratory or your doctor. No AI explanation is available.');
        } else {
          setError(requestError.response?.data?.message || 'The explanation status could not be loaded.');
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [critical, language, reportId]);

  async function generate() {
    setGenerating(true);
    setError('');
    setNotice('');
    try {
      const response = await aiService.generate(reportId, language);
      setExplanation(response.data.data.explanation);
      setClassifications(response.data.data.classifications || tests);
    } catch (requestError) {
      if (requestError.response?.status === 409) {
        setError('This result requires review by the laboratory or your doctor. No AI explanation is available.');
      } else {
        setError(requestError.response?.data?.message || 'AI explanation is currently unavailable.');
      }
    } finally {
      setGenerating(false);
    }
  }

  async function flag() {
    setError('');
    setNotice('');
    try {
      const response = await aiService.flag(reportId, language, reason);
      setNotice(response.data.message);
      setReason('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Your feedback could not be submitted.');
    }
  }

  return (
    <section className="portal-section ai-explanation-panel" aria-labelledby="ai-explanation-heading">
      <p className="eyebrow"><Languages size={16} /> OPTIONAL PATIENT EXPLANATION</p>
      <h2 id="ai-explanation-heading">Understand your results</h2>
      {critical ? (
        <div className="alert alert-warning" role="status">
          <AlertTriangle size={20} />
          <span>This result requires review by the laboratory or your doctor. An AI explanation is not available for critical results.</span>
        </div>
      ) : (
        <>
          <label className="form-label" htmlFor="explanation-language">Explanation language</label>
          <select
            id="explanation-language"
            className="form-select form-select-lg"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            {Object.entries(languageNames).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>

          <div className="table-responsive mt-3">
            <table className="table">
              <thead><tr><th>Test</th><th>Result and reference range</th><th>Rule-based range status</th></tr></thead>
              <tbody>
                {classifications.map((test) => (
                  <tr key={test.testName || test.parameterName}>
                    <th scope="row">{test.testName || test.parameterName}</th>
                    <td>{test.result} {test.unit} (reference {test.referenceMin}–{test.referenceMax})</td>
                    <td>{test.classification || 'Not evaluated'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {loading && <p role="status">Checking for a saved explanation…</p>}
          {explanation ? (
            <div className="ai-explanation-copy">
              <p className="badge text-bg-info">AI-generated explanation · {languageNames[language]}</p>
              <p>{explanation.summary}</p>
              <p className="portal-disclaimer">This is not a diagnosis or treatment advice. Consult your doctor for interpretation. The full signed laboratory report is authoritative.</p>
              <Link className="back-link" to={`/patient/reports/${encodeURIComponent(reportId)}/view`}>Open the original signed PDF</Link>
              <div className="ai-flag-form mt-3">
                <label className="form-label" htmlFor="summary-flag-reason">Something confusing or incorrect?</label>
                <textarea
                  id="summary-flag-reason"
                  className="form-control"
                  rows="2"
                  maxLength="1000"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <button className="btn btn-outline-secondary mt-2" type="button" disabled={reason.trim().length < 3} onClick={flag}>
                  <MessageSquareWarning size={17} /> Send feedback to the laboratory
                </button>
              </div>
            </div>
          ) : !loading && (
            <div>
              <p>AI explanations are optional and are only shown when the service is configured and a valid explanation is available.</p>
              <button type="button" className="primary-button btn" onClick={generate} disabled={generating}>
                {generating ? 'Preparing explanation…' : `Generate ${languageNames[language]} explanation`}
              </button>
            </div>
          )}
        </>
      )}
      {error && <div className="alert alert-warning mt-3" role="alert">{error}</div>}
      {notice && <div className="alert alert-success mt-3" role="status">{notice}</div>}
    </section>
  );
}
