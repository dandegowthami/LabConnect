import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext.jsx';
import ProtectedRoute from '../../components/common/ProtectedRoute.jsx';
import api from '../../services/api.js';
import LISImport from './LISImport.jsx';

vi.mock('../../services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn() }
}));

const previewData = {
  previewId: 'preview-1',
  fileName: 'lab.csv',
  totalRows: 1,
  validRecords: 1,
  validOrders: 1,
  invalidRecords: 0,
  duplicateRecords: 0,
  groupedOrders: [{
    orderId: 'ORD-1',
    patient: { patientId: 'PAT-1', fullName: 'Synthetic Patient', mobile: '9000000011' },
    doctorName: 'Dr. Example',
    tests: [{ testName: 'Example Test', result: 12.5, unit: 'mg/L', referenceMin: 2, referenceMax: 20 }],
    status: 'Ready'
  }],
  rowErrors: [],
  skippedRows: 0
};

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.sessionStorage.setItem('labconnect_token', 'staff-token');
  api.get.mockImplementation((path) => {
    if (path === '/auth/me') {
      return Promise.resolve({ data: { data: { user: { id: 'staff-1', name: 'Demo Staff', role: 'staff' } } } });
    }
    return Promise.resolve({ data: { data: { imports: [], pagination: { page: 1, pages: 1, total: 0 } } } });
  });
});

afterEach(cleanup);

describe('LIS import page', () => {
  it('previews a selected CSV and commits the server-side preview', async () => {
    api.post
      .mockResolvedValueOnce({ data: { data: previewData } })
      .mockResolvedValueOnce({
        data: { data: { totalRows: 1, importedRows: 1, skippedRows: 0, failedRows: 0, status: 'completed', errors: [] } }
      });

    render(
      <MemoryRouter initialEntries={['/staff/import']}>
        <AuthProvider><LISImport /></AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'LIS Report Import' })).toBeInTheDocument();
    const file = new File(['orderId,patientId'], 'lab.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } });
    fireEvent.submit(screen.getByLabelText('CSV file').closest('form'));
    expect(await screen.findByText('Synthetic Patient')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/import/lis/preview', expect.any(FormData), expect.any(Object));

    fireEvent.click(screen.getByRole('button', { name: /import 1 valid order/i }));
    expect(await screen.findByText('completed')).toBeInTheDocument();
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/import/lis/commit', { previewId: 'preview-1' }));
  });

  it('does not render the import page for a patient account', async () => {
    api.get.mockImplementation((path) => path === '/auth/me'
      ? Promise.resolve({ data: { data: { user: { role: 'patient' } } } })
      : Promise.resolve({ data: { data: { imports: [], pagination: { page: 1, pages: 1, total: 0 } } } }));
    render(
      <MemoryRouter initialEntries={['/staff/import']}>
        <AuthProvider>
          <Routes>
            <Route element={<ProtectedRoute roles={['staff', 'admin']} />}>
              <Route path="/staff/import" element={<LISImport />} />
            </Route>
            <Route path="/patient" element={<p>Patient dashboard</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText('Patient dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'LIS Report Import' })).not.toBeInTheDocument();
  });
});
