import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Home from './Home.jsx';
import Register from './Register.jsx';

describe('public pages', () => {
  it('lets visitors move from the home page to registration and patient sign-in', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<Register />} />
          <Route path="/patient/login" element={<h1>Patient sign-in screen</h1>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /your health journey/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'New to LabConnect?' }));

    expect(screen.getByRole('heading', { name: /get started with labconnect/i })).toBeInTheDocument();
    expect(screen.getByText(/diagnostic centre needs to create your patient profile/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /continue to patient sign in/i }));

    expect(screen.getByRole('heading', { name: 'Patient sign-in screen' })).toBeInTheDocument();
  });
});
