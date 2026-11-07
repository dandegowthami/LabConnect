import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext.jsx';
import PatientDashboard from '../PatientDashboard.jsx';
import ReportDetails from './ReportDetails.jsx';
import ReportManagement from '../staff/ReportManagement.jsx';
import patientService from '../../services/patientService.js';
import reportService from '../../services/reportService.js';

vi.mock('../../services/patientService.js', () => ({
  default: { getProfile: vi.fn(), getOrders: vi.fn(), getReports: vi.fn() }
}));

vi.mock('../../services/reportService.js', () => ({
  default: {
    getReport: vi.fn(),
    getReportPdf: vi.fn(),
    getStaffReports: vi.fn(),
    uploadPdf: vi.fn(),
    confirmSigned: vi.fn()
  }
}));

const report = {
  reportId: 'RPT-TEST-1',
  orderId: 'ORD-TEST-1',
  reportStatus: 'Ready',
  signedAt: '2026-01-05T00:00:00.000Z',
  pdfAvailable: true,
  tests: [{ testName: 'Example test', result: 25, unit: 'mg/L', referenceMin: 2, referenceMax: 20 }]
};

function renderPage(path, element) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/patient/dashboard" element={<PatientDashboard />} />
          <Route path="/patient/reports/:reportId" element={<ReportDetails />} />
          <Route path="/staff/reports" element={<ReportManagement />} />
        </Routes>
        {element}
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

afterEach(cleanup);

describe('patient portal screens', () => {
  it('explains that contact verification alone cannot authorize records', async () => {
    patientService.getProfile.mockRejectedValue({ response: { status: 403, data: { message: 'Patient identity verification is required' } } });
    patientService.getOrders.mockRejectedValue({ response: { status: 403, data: { message: 'Patient identity verification is required' } } });
    patientService.getReports.mockRejectedValue({ response: { status: 403, data: { message: 'Patient identity verification is required' } } });

    renderPage('/patient/dashboard');

    expect(await screen.findByRole('heading', { name: 'Patient identity verification required' })).toBeInTheDocument();
    expect(screen.getByText(/shared mobile number confirms contact only/i)).toBeInTheDocument();
    expect(patientService.getOrders).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('shows exact laboratory values and marks an out-of-range value without interpreting it', async () => {
    reportService.getReport.mockResolvedValue({ data: { data: { report } } });

    renderPage('/patient/reports/RPT-TEST-1');

    expect(await screen.findByRole('heading', { name: 'Report details' })).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('2–20')).toBeInTheDocument();
    expect(screen.getByText('25').closest('tr')).toHaveClass('result-outside-range');
    expect(screen.getByRole('button', { name: /view full report/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument();
  });
});

describe('staff report management', () => {
  it('uploads a PDF for the selected report then requires explicit sign-off', async () => {
    const listedReport = {
      reportId: 'RPT-STAFF-1',
      patient: { patientId: 'PAT-1', name: 'Synthetic Patient' },
      orderId: 'ORD-1',
      orderDate: '2026-01-01T00:00:00.000Z',
      testNames: ['Example test'],
      reportStatus: 'Processing',
      pdfUploaded: false,
      pdfAvailable: false
    };
    const uploadedReport = { ...listedReport, pdfUploaded: true };
    reportService.getStaffReports
      .mockResolvedValueOnce({ data: { data: { reports: [listedReport] } } })
      .mockResolvedValueOnce({ data: { data: { reports: [uploadedReport] } } });
    reportService.uploadPdf.mockResolvedValue({ data: { message: 'PDF uploaded securely.' } });

    renderPage('/staff/reports');

    expect(await screen.findByText(/Synthetic Patient/)).toBeInTheDocument();
    const file = new File(['pdf bytes'], 'signed.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/signed pdf/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /upload pdf/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('PDF uploaded securely.');
    await waitFor(() => expect(reportService.uploadPdf).toHaveBeenCalledWith('RPT-STAFF-1', file, expect.any(Function)));
    expect(await screen.findByRole('button', { name: /confirm signed and mark ready/i })).toBeInTheDocument();
  });
});
