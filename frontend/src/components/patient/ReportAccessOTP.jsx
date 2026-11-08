import { useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';

export default function ReportAccessOTP({
  destinationMasked,
  developmentOtp,
  loading,
  verifying,
  error,
  onRequestOtp,
  onVerify
}) {
  const [otp, setOtp] = useState('');

  function submit(event) {
    event.preventDefault();
    if (/^\d{6}$/.test(otp)) onVerify(otp);
  }

  return (
    <section className="access-card">
      <div className="access-icon"><ShieldCheck size={24} /></div>
      <h1>Verify to view your report</h1>
      <p className="access-intro">
        We will send a one-time code to the mobile number registered for this report
        {destinationMasked ? <> <strong>{destinationMasked}</strong></> : ''}.
      </p>
      {developmentOtp && <p className="alert alert-info" role="status">Development test code: <strong>{developmentOtp}</strong></p>}
      {error && <p className="alert alert-danger" role="alert">{error}</p>}
      {!destinationMasked ? (
        <button className="primary-button btn w-100" type="button" onClick={onRequestOtp} disabled={loading}>
          {loading ? 'Requesting code…' : 'Send verification code'}
        </button>
      ) : (
        <form onSubmit={submit}>
          <label className="form-label" htmlFor="report-access-otp">Six-digit verification code</label>
          <input
            id="report-access-otp"
            className="form-control access-otp-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
            disabled={verifying}
          />
          <button className="primary-button btn w-100" type="submit" disabled={verifying || otp.length !== 6}>
            {verifying ? 'Verifying code…' : 'Verify and open report'}
          </button>
          <button className="resend-button btn btn-link" type="button" onClick={onRequestOtp} disabled={loading || verifying}>
            <RefreshCw size={16} /> {loading ? 'Sending another code…' : 'Send a new code'}
          </button>
        </form>
      )}
      <p className="access-privacy">The code authorizes access to this report only. It cannot be used to view other patient records.</p>
    </section>
  );
}
