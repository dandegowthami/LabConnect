import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import AIExplanationPanel from '../components/patient/AIExplanationPanel.jsx';
import StaffDashboard from './StaffDashboard.jsx';
import CallbackManagement from './staff/CallbackManagement.jsx';
import PatientSearch from './staff/PatientSearch.jsx';
import DoctorLogin from './auth/DoctorLogin.jsx';
import DoctorReports from './doctor/DoctorReports.jsx';
import PatientIdentitySetup from '../components/patient/PatientIdentitySetup.jsx';
import PatientRecord from './staff/PatientRecord.jsx';
import staffWorkspaceService from '../services/staffWorkspaceService.js';
import doctorService from '../services/doctorService.js';
import aiService from '../services/aiService.js';
import api from '../services/api.js';

vi.mock('../services/staffWorkspaceService.js', () => ({
  default: {
    getDashboard: vi.fn(),
    getCallbackTasks: vi.fn(),
    getUsers: vi.fn(),
    updateCallbackTask: vi.fn(),
    searchPatients: vi.fn(),
    getPatient: vi.fn(),
    issuePatientPortalActivation: vi.fn()
  }
}));

vi.mock('../services/doctorService.js', () => ({
  default: { login: vi.fn(), getReports: vi.fn() }
}));

vi.mock('../services/aiService.js', () => ({
  default: { getSummary: vi.fn(), generate: vi.fn(), flag: vi.fn() }
}));

vi.mock('../services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn() }
}));

function renderWithAuth(path, element) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>{element}</AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  api.get.mockResolvedValue({ data: { data: { user: null } } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Module 5 and 6 workspaces', () => {
  it('renders staff dashboard counts from the workspace API', async () => {
    window.sessionStorage.setItem('labconnect_token', 'staff-token');
    api.get.mockResolvedValueOnce({
      data: { data: { user: { name: 'Staff Reviewer', role: 'staff' } } }
    });
    staffWorkspaceService.getDashboard.mockResolvedValue({
      data: { data: {
        totalPatients: 12,
        totalOrders: 18,
        processingReports: 3,
        readyReports: 6,
        deliveredReports: 5,
        failedNotifications: 1,
        criticalCallbackTasks: 2,
        patientFlaggedSummaries: 1
      } }
    });

    renderWithAuth('/staff', <StaffDashboard />);

    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('Total patients')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /patient search/i })).toHaveAttribute('href', '/staff/patients');
    expect(staffWorkspaceService.getDashboard).toHaveBeenCalledOnce();
  });

  it('searches patients and displays masked contact details', async () => {
    staffWorkspaceService.searchPatients.mockResolvedValue({
      data: { data: {
        patients: [{
          patientId: 'PAT-100',
          name: 'Synthetic Patient',
          mobileMasked: '******0042',
          consentStatus: 'granted',
          orders: [],
          reports: []
        }],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 }
      } }
    });

    renderWithAuth('/staff/patients', <PatientSearch />);

    expect(await screen.findByText('PAT-100')).toBeInTheDocument();
    expect(screen.getByText('******0042')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search records'), { target: { value: 'ORD-100' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    await waitFor(() => expect(staffWorkspaceService.searchPatients).toHaveBeenLastCalledWith({
      q: 'ORD-100',
      page: 1,
      limit: 20
    }));
  });

  it('shows patient feedback and saves callback assignments and notes', async () => {
    staffWorkspaceService.getCallbackTasks.mockResolvedValue({
      data: { data: { tasks: [{
        id: 'task-1',
        reportId: 'RPT-1',
        patient: { name: 'Synthetic Patient', mobileMasked: '******0042' },
        parameterName: 'Synthetic analyte',
        severity: 'Patient flagged summary',
        assignedTo: null,
        status: 'Pending',
        resolutionNotes: '',
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
        flagReason: 'The wording is confusing.',
        flaggedLanguage: 'en'
      }] } }
    });
    staffWorkspaceService.getUsers.mockResolvedValue({
      data: { data: { users: [{ id: 'staff-1', name: 'Staff Reviewer', role: 'staff' }] } }
    });
    staffWorkspaceService.updateCallbackTask.mockResolvedValue({ data: { success: true } });

    renderWithAuth('/staff/callbacks', <CallbackManagement />);

    expect(await screen.findByText('The wording is confusing.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Assigned staff/pathologist'), { target: { value: 'staff-1' } });
    fireEvent.change(screen.getByLabelText('Task status'), { target: { value: 'In Progress' } });
    fireEvent.change(screen.getByLabelText('Resolution/review notes'), { target: { value: 'Reviewed with the laboratory supervisor.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save review' }));

    await waitFor(() => expect(staffWorkspaceService.updateCallbackTask).toHaveBeenCalledWith('task-1', {
      status: 'In Progress',
      assignedTo: 'staff-1',
      resolutionNotes: 'Reviewed with the laboratory supervisor.'
    }));
  });

  it('authenticates provisioned doctors and routes them to their portal', async () => {
    doctorService.login.mockResolvedValue({
      data: { data: { token: 'doctor-token', user: { id: 'doctor-1', role: 'doctor', name: 'Dr Synthetic' } } }
    });
    render(
      <MemoryRouter initialEntries={['/doctor/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/doctor/login" element={<DoctorLogin />} />
            <Route path="/doctor/dashboard" element={<p>Doctor dashboard</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'doctor@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'DoctorPassword123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in securely' }));

    expect(await screen.findByText('Doctor dashboard')).toBeInTheDocument();
    expect(doctorService.login).toHaveBeenCalledWith('doctor@example.test', 'DoctorPassword123');
    expect(window.sessionStorage.getItem('labconnect_token')).toBe('doctor-token');
  });

  it('shows referred report search and submits date-bounded queries', async () => {
    window.sessionStorage.setItem('labconnect_token', 'doctor-token');
    api.get.mockResolvedValueOnce({
      data: { data: { user: { name: 'Dr Synthetic', role: 'doctor' } } }
    });
    doctorService.getReports.mockResolvedValue({
      data: { data: {
        reports: [{
          reportId: 'RPT-DOCTOR-1',
          patient: { name: 'Synthetic Patient', patientId: 'PAT-100' },
          order: { orderId: 'ORD-100', orderDate: '2026-01-01T00:00:00.000Z' },
          reportStatus: 'Ready',
          pdfAvailable: true
        }],
        pagination: { pages: 1, total: 1 }
      } }
    });
    renderWithAuth('/doctor/reports', <DoctorReports />);

    expect(await screen.findByText('RPT-DOCTOR-1')).toBeInTheDocument();
    expect(screen.getAllByText('Dr Synthetic').length).toBeGreaterThanOrEqual(1);
    expect(doctorService.getReports).toHaveBeenCalledWith(expect.objectContaining({
      from: expect.any(String),
      to: expect.any(String),
      page: 1,
      limit: 20
    }));
  });

  it('generates, labels, and flags an optional AI explanation', async () => {
    const tests = [{
      testName: 'Synthetic analyte',
      result: 5,
      unit: 'demo-unit',
      referenceMin: 3,
      referenceMax: 8,
      classification: 'Normal'
    }];
    aiService.getSummary.mockResolvedValue({
      data: { data: { explanation: null, classifications: tests } }
    });
    aiService.generate.mockResolvedValue({
      data: { data: {
        explanation: { summary: 'This example is within its supplied range.' },
        classifications: tests
      } }
    });
    aiService.flag.mockResolvedValue({ data: { message: 'Feedback sent to the laboratory.' } });

    renderWithAuth('/patient/reports/RPT-1', <AIExplanationPanel reportId="RPT-1" tests={tests} />);

    expect(await screen.findByText('Normal')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Explanation language'), { target: { value: 'te' } });
    await waitFor(() => expect(aiService.getSummary).toHaveBeenLastCalledWith('RPT-1', 'te'));
    fireEvent.click(screen.getByRole('button', { name: 'Generate Telugu explanation' }));
    expect(await screen.findByText('AI-generated explanation · Telugu')).toBeInTheDocument();
    expect(screen.getByText(/not a diagnosis or treatment advice/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the original signed PDF' })).toHaveAttribute('href', '/patient/reports/RPT-1/view');

    fireEvent.change(screen.getByLabelText('Something confusing or incorrect?'), { target: { value: 'Could you clarify this?' } });
    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));
    expect(await screen.findByRole('status')).toHaveTextContent('Feedback sent to the laboratory.');
    expect(aiService.flag).toHaveBeenCalledWith('RPT-1', 'te', 'Could you clarify this?');
  });

  it('withholds AI generation for critical results', () => {
    renderWithAuth('/patient/reports/RPT-CRITICAL', (
      <AIExplanationPanel
        reportId="RPT-CRITICAL"
        criticalReviewStatus="Urgent review"
        tests={[{ testName: 'Synthetic analyte', classification: 'Critical' }]}
      />
    ));

    expect(screen.getByRole('status')).toHaveTextContent('requires review by the laboratory or your doctor');
    expect(screen.queryByRole('button', { name: /generate/i })).not.toBeInTheDocument();
    expect(aiService.getSummary).not.toHaveBeenCalled();
  });

  it('lets a patient bind their profile after entering the clinic activation code and consent', async () => {
    api.post.mockResolvedValueOnce({
      data: { data: { token: 'patient-identity-token', patient: { id: 'patient-1', patientId: 'PAT-100', role: 'patient' } } }
    });
    render(
      <MemoryRouter initialEntries={['/patient/activate']}>
        <AuthProvider>
          <Routes>
            <Route path="/patient/activate" element={<PatientIdentitySetup />} />
            <Route path="/patient/dashboard" element={<p>Patient dashboard</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Patient ID'), { target: { value: 'PAT-100' } });
    fireEvent.change(screen.getByLabelText('One-time clinic activation code (first-time setup)'), { target: { value: 'a'.repeat(43) } });
    fireEvent.change(screen.getByLabelText('Create or enter your portal password'), { target: { value: 'MyPrivatePassphrase' } });
    fireEvent.click(screen.getByLabelText(/I agree to use the patient portal/i));
    fireEvent.click(screen.getByRole('button', { name: 'Verify and open my reports' }));

    expect(await screen.findByText('Patient dashboard')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/patient/identify', {
      patientId: 'PAT-100',
      password: 'MyPrivatePassphrase',
      activationCode: 'a'.repeat(43),
      portalConsentAccepted: true
    });
    expect(window.sessionStorage.getItem('labconnect_token')).toBe('patient-identity-token');
  });

  it('requires staff to confirm an in-person identity check before issuing a portal activation code', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    staffWorkspaceService.getPatient.mockResolvedValue({
      data: { data: {
        patient: { patientId: 'PAT-100', name: 'Synthetic Patient', mobileMasked: '******0042', portalActivated: false, consentStatus: 'pending' },
        orders: [],
        reports: []
      } }
    });
    staffWorkspaceService.issuePatientPortalActivation.mockResolvedValue({
      data: { data: { activationCode: 'b'.repeat(43) } }
    });
    render(
      <MemoryRouter initialEntries={['/staff/patients/PAT-100']}>
        <AuthProvider>
          <Routes><Route path="/staff/patients/:patientId" element={<PatientRecord />} /></Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Issue one-time activation code' }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('identity in person'));
    expect(staffWorkspaceService.issuePatientPortalActivation).toHaveBeenCalledWith('PAT-100');
    expect(await screen.findByText('b'.repeat(43))).toBeInTheDocument();
    confirm.mockRestore();
  });
});
