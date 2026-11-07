import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/common/ProtectedRoute.jsx';
import Home from '../pages/Home.jsx';
import Register from '../pages/Register.jsx';
import PatientLogin from '../pages/auth/PatientLogin.jsx';
import PatientOTP from '../pages/auth/PatientOTP.jsx';
import StaffLogin from '../pages/auth/StaffLogin.jsx';
import PatientDashboard from '../pages/PatientDashboard.jsx';
import StaffDashboard from '../pages/StaffDashboard.jsx';
import LISImport from '../pages/import/LISImport.jsx';
import ReportDetails from '../pages/patient/ReportDetails.jsx';
import PdfReportViewer from '../pages/patient/PdfReportViewer.jsx';
import ReportManagement from '../pages/staff/ReportManagement.jsx';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/register" element={<Register />} />
      <Route path="/patient/login" element={<PatientLogin />} />
      <Route path="/patient/otp" element={<PatientOTP />} />
      <Route path="/staff/login" element={<StaffLogin />} />
      <Route element={<ProtectedRoute roles={['patient']} />}>
        <Route path="/patient" element={<Navigate to="/patient/dashboard" replace />} />
        <Route path="/patient/dashboard" element={<PatientDashboard />} />
        <Route path="/patient/reports/:reportId" element={<ReportDetails />} />
        <Route path="/patient/reports/:reportId/view" element={<PdfReportViewer />} />
      </Route>
      <Route element={<ProtectedRoute roles={['staff', 'admin']} />}>
        <Route path="/staff" element={<StaffDashboard />} />
        <Route path="/staff/import" element={<LISImport />} />
        <Route path="/staff/reports" element={<ReportManagement />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
