import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/common/ProtectedRoute.jsx';
import Home from '../pages/Home.jsx';
import Register from '../pages/Register.jsx';
import PatientLogin from '../pages/auth/PatientLogin.jsx';
import PatientOTP from '../pages/auth/PatientOTP.jsx';
import StaffLogin from '../pages/auth/StaffLogin.jsx';
import PatientDashboard from '../pages/PatientDashboard.jsx';
import PatientIdentitySetup from '../components/patient/PatientIdentitySetup.jsx';
import StaffDashboard from '../pages/StaffDashboard.jsx';
import LISImport from '../pages/import/LISImport.jsx';
import ReportDetails from '../pages/patient/ReportDetails.jsx';
import PdfReportViewer from '../pages/patient/PdfReportViewer.jsx';
import ReportManagement from '../pages/staff/ReportManagement.jsx';
import ReportAccess from '../pages/patient/ReportAccess.jsx';
import DeliveryManagement from '../pages/staff/DeliveryManagement.jsx';
import PatientSearch from '../pages/staff/PatientSearch.jsx';
import PatientRecord from '../pages/staff/PatientRecord.jsx';
import CallbackManagement from '../pages/staff/CallbackManagement.jsx';
import CriticalRuleManagement from '../pages/staff/CriticalRuleManagement.jsx';
import StaffReportDetails from '../pages/staff/StaffReportDetails.jsx';
import DoctorLogin from '../pages/auth/DoctorLogin.jsx';
import DoctorDashboard from '../pages/doctor/DoctorDashboard.jsx';
import DoctorReports from '../pages/doctor/DoctorReports.jsx';
import DoctorReportDetails from '../pages/doctor/DoctorReportDetails.jsx';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/register" element={<Register />} />
      <Route path="/patient/login" element={<PatientLogin />} />
      <Route path="/patient/otp" element={<PatientOTP />} />
      <Route path="/report-access/:token" element={<ReportAccess />} />
      <Route path="/report-access" element={<ReportAccess />} />
      <Route path="/staff/login" element={<StaffLogin />} />
      <Route path="/doctor/login" element={<DoctorLogin />} />
      <Route element={<ProtectedRoute roles={['patient']} />}>
        <Route path="/patient" element={<Navigate to="/patient/dashboard" replace />} />
        <Route path="/patient/activate" element={<PatientIdentitySetup />} />
        <Route path="/patient/dashboard" element={<PatientDashboard />} />
        <Route path="/patient/reports/:reportId" element={<ReportDetails />} />
        <Route path="/patient/reports/:reportId/view" element={<PdfReportViewer />} />
      </Route>
      <Route element={<ProtectedRoute roles={['staff', 'admin', 'pathologist']} />}>
        <Route path="/staff" element={<StaffDashboard />} />
        <Route path="/staff/import" element={<LISImport />} />
        <Route path="/staff/reports" element={<ReportManagement />} />
        <Route path="/staff/delivery" element={<DeliveryManagement />} />
        <Route path="/staff/patients" element={<PatientSearch />} />
        <Route path="/staff/patients/:patientId" element={<PatientRecord />} />
        <Route path="/staff/callbacks" element={<CallbackManagement />} />
        <Route path="/staff/critical-rules" element={<CriticalRuleManagement />} />
        <Route path="/staff/report/:reportId" element={<StaffReportDetails />} />
      </Route>
      <Route element={<ProtectedRoute roles={['doctor']} />}>
        <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
        <Route path="/doctor/reports" element={<DoctorReports />} />
        <Route path="/doctor/reports/:reportId" element={<DoctorReportDetails />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
