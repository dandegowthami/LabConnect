import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReportAccess from './ReportAccess.jsx';
import deliveryService from '../../services/deliveryService.js';

vi.mock('../../services/deliveryService.js', () => ({
  default: {
    requestOtp: vi.fn(),
    verifyOtp: vi.fn(),
    getReportPdf: vi.fn()
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:private-report'),
    revokeObjectURL: vi.fn()
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAccessPage() {
  return render(
    <MemoryRouter initialEntries={[`/report-access/${'a'.repeat(43)}`]}>
      <Routes>
        <Route path="/report-access/:token" element={<ReportAccess />} />
        <Route path="/report-access" element={<ReportAccess />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('expiring report access page', () => {
  it('requests report OTP, verifies it and loads the PDF using the temporary grant', async () => {
    const rawLinkToken = 'a'.padEnd(44, 'b');
    deliveryService.requestOtp.mockResolvedValue({
      data: { data: { destinationMasked: '90******42', developmentOtp: '123456' } }
    });
    deliveryService.verifyOtp.mockResolvedValue({
      data: { data: { accessGrant: 'grant'.padEnd(43, 'x'), expiresAt: '2026-11-08T15:00:00.000Z' } }
    });
    deliveryService.getReportPdf.mockResolvedValue({ data: new Blob(['private report']) });

    render(
      <MemoryRouter initialEntries={[`/report-access/#${rawLinkToken}`]}>
        <Routes>
          <Route path="/report-access/:token" element={<ReportAccess />} />
          <Route path="/report-access" element={<ReportAccess />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /send verification code/i }));
    expect(await screen.findByText(/Development test code/i)).toBeInTheDocument();
    expect(screen.getByText('90******42')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Six-digit verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify and open report/i }));

    expect(await screen.findByRole('heading', { name: 'Your report is available' })).toBeInTheDocument();
    await waitFor(() => expect(deliveryService.requestOtp).toHaveBeenCalledWith(rawLinkToken));
    expect(deliveryService.verifyOtp).toHaveBeenCalledWith(rawLinkToken, '123456');
    expect(deliveryService.getReportPdf).toHaveBeenCalledWith('grant'.padEnd(43, 'x'));
    expect(screen.getByTitle('Secure laboratory report')).toHaveAttribute('src', 'blob:private-report');
    expect(window.localStorage.length).toBe(0);
  });

  it('shows an expired or revoked link error without requesting a report', async () => {
    deliveryService.requestOtp.mockRejectedValue({
      response: { status: 410, data: { message: 'This report access link has expired.' } }
    });

    renderAccessPage();

    fireEvent.click(await screen.findByRole('button', { name: /send verification code/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/has expired/i);
    expect(deliveryService.getReportPdf).not.toHaveBeenCalled();
  });
});
