import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import ReportAccessOTP from '../../components/patient/ReportAccessOTP.jsx';
import ReportAccessResult from '../../components/patient/ReportAccessResult.jsx';
import deliveryService from '../../services/deliveryService.js';

export default function ReportAccess() {
  const { token: routeToken } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const linkToken = routeToken || location.hash.slice(1);
  const [token, setToken] = useState(linkToken);
  const [destinationMasked, setDestinationMasked] = useState('');
  const [developmentOtp, setDevelopmentOtp] = useState('');
  const [grant, setGrant] = useState('');
  const [grantExpiresAt, setGrantExpiresAt] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (routeToken || location.hash) navigate('/report-access', { replace: true });
  }, [location.hash, navigate, routeToken]);

  async function requestOtp() {
    setRequesting(true);
    setError('');
    try {
      const response = await deliveryService.requestOtp(token);
      setDestinationMasked(response.data.data.destinationMasked);
      setDevelopmentOtp(response.data.data.developmentOtp || '');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'This report link could not be verified.');
    } finally {
      setRequesting(false);
    }
  }

  async function verifyOtp(otp) {
    setVerifying(true);
    setError('');
    try {
      const response = await deliveryService.verifyOtp(token, otp);
      setGrant(response.data.data.accessGrant);
      setGrantExpiresAt(response.data.data.expiresAt);
      setToken('');
      setDevelopmentOtp('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The code could not be verified.');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <main className="report-access-page">
      <header className="portal-header">
        <Link className="site-brand" to="/"><span className="site-brand-mark">L</span>LabConnect</Link>
        <span className="access-header-security"><ShieldCheck size={19} /> Secure report access</span>
      </header>
      <div className={`report-access-content ${grant ? 'report-access-wide' : ''}`}>
        {!grant ? (
          <ReportAccessOTP
            destinationMasked={destinationMasked}
            developmentOtp={developmentOtp}
            loading={requesting}
            verifying={verifying}
            error={error}
            onRequestOtp={requestOtp}
            onVerify={verifyOtp}
          />
        ) : <ReportAccessResult grant={grant} expiresAt={grantExpiresAt} />}
      </div>
    </main>
  );
}
