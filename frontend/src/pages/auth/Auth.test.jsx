import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PatientLogin from './PatientLogin.jsx';
import PatientOTP from './PatientOTP.jsx';
import StaffLogin from './StaffLogin.jsx';
import { AuthProvider } from '../../context/AuthContext.jsx';
import api from '../../services/api.js';
import ProtectedRoute from '../../components/common/ProtectedRoute.jsx';

vi.mock('../../services/api.js', () => ({
  default: { post: vi.fn(), get: vi.fn() }
}));

const renderWithContext = (element, initialEntries = ['/']) => render(
  <MemoryRouter initialEntries={initialEntries}>
    <AuthProvider>{element}</AuthProvider>
  </MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  api.get.mockResolvedValue({ data: { data: { user: null } } });
});

afterEach(cleanup);

describe('authentication screens', () => {
  it('validates patient mobile input before calling the API', async () => {
    renderWithContext(<PatientLogin />);
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('valid 10-digit Indian mobile number');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('sends a valid mobile number to request an OTP', async () => {
    api.post.mockResolvedValue({ data: { success: true } });
    renderWithContext(<PatientLogin />);
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/patient/request-otp', { mobile: '9876543210' }));
  });

  it('validates OTP interaction and submits a six-digit code', async () => {
    api.post.mockResolvedValueOnce({ data: { data: { token: 'signed-token', patient: { role: 'patient' } } } });
    render(
      <MemoryRouter initialEntries={[{ pathname: '/patient/otp', state: { mobile: '9876543210' } }]}>
        <AuthProvider>
          <Routes>
            <Route path="/patient/otp" element={<PatientOTP />} />
            <Route element={<ProtectedRoute roles={['patient']} />}>
              <Route path="/patient" element={<p>Patient dashboard</p>} />
            </Route>
            <Route element={<ProtectedRoute roles={['staff', 'admin']} />}>
              <Route path="/staff" element={<p>Staff dashboard</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText('One-time code'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /verify and continue/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('six-digit code');
    fireEvent.change(screen.getByLabelText('One-time code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify and continue/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/patient/verify-otp', { mobile: '9876543210', otp: '123456' }));
    expect(await screen.findByText('Patient dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Staff dashboard')).not.toBeInTheDocument();
  });

  it('validates staff login fields', async () => {
    renderWithContext(<StaffLogin />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('valid work email and password');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('takes staff directly to LIS import after successful login', async () => {
    api.post.mockResolvedValueOnce({
      data: { data: { token: 'staff-token', user: { id: 'staff-1', role: 'staff' } } }
    });
    render(
      <MemoryRouter initialEntries={['/staff/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/staff/login" element={<StaffLogin />} />
            <Route element={<ProtectedRoute roles={['staff', 'admin']} />}>
              <Route path="/staff/import" element={<p>LIS report importer</p>} />
              <Route path="/staff" element={<p>Staff dashboard</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'staff@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'DemoPassword123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('LIS report importer')).toBeInTheDocument();
    expect(screen.queryByText('Staff dashboard')).not.toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/staff/login', {
      email: 'staff@example.com',
      password: 'DemoPassword123'
    });
  });

  it('redirects unauthenticated users away from protected pages', async () => {
    render(
      <MemoryRouter initialEntries={['/patient']}>
        <AuthProvider>
          <Routes>
            <Route element={<ProtectedRoute roles={['patient']} />}>
              <Route path="/patient" element={<p>Private patient page</p>} />
            </Route>
            <Route path="/patient/login" element={<p>Patient sign-in page</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText('Patient sign-in page')).toBeInTheDocument();
    expect(screen.queryByText('Private patient page')).not.toBeInTheDocument();
  });
});
