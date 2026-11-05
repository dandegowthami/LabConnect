# LabConnect

LabConnect is the foundation for a healthcare diagnostic report delivery platform. This initial module provides patient phone verification and staff authentication, with protected placeholder dashboards. It does not include report management or claim that a verified phone identifies a specific family member.

## Technology

- Frontend: React, Vite, React Router, Axios, Context API, Bootstrap 5, custom CSS, Lucide React, Vitest and React Testing Library
- Backend: Node.js ES modules, Express, MongoDB/Mongoose, JWT, bcryptjs, Zod, Helmet, CORS, express-rate-limit and Vitest/Supertest

## Structure

```text
frontend/  React app, authentication screens, routes, tests and Vite/Bootstrap config
backend/   Express API, MongoDB models, authentication, seeds and API tests
```

## Prerequisites

- Node.js 20 or newer and npm
- MongoDB locally or a MongoDB connection string

Install dependencies separately:

```sh
cd backend
npm install
copy .env.example .env
```

Set `MONGODB_URI` and replace `JWT_SECRET` with a randomly generated secret of at least 32 characters in `backend/.env`. Configure `FRONTEND_URL` to match the frontend origin. `OTP_PROVIDER=mock` is only supported outside production.

In another terminal:

```sh
cd frontend
npm install
copy .env.example .env
```

`VITE_API_BASE_URL` points to the backend API and must not contain backend secrets.

## Local demo data

Start MongoDB, then seed synthetic patient accounts:

```sh
cd backend
npm run seed:patients
```

To create a demo front-desk account, set `DEMO_STAFF_EMAIL` and `DEMO_STAFF_PASSWORD` in `backend/.env` (use a private local value), then run:

```sh
npm run seed:staff
```

No staff password is included in source or documentation. Staff passwords are stored as bcrypt hashes. Seeded patient information is synthetic. Two synthetic patients intentionally share a phone number to demonstrate that phone verification alone does not identify a patient.

With the mock OTP provider, the API response includes `developmentOtp` only outside production. It is generated per request, stored as a bcrypt hash, expires after five minutes, and may be used once. Production rejects `OTP_PROVIDER=mock`. An SMS adapter is not configured in this initial module; setting `OTP_PROVIDER=sms` returns a clear service-unavailable error until one is integrated.

## Run locally

Start the backend (MongoDB must be running):

```sh
cd backend
npm run dev
```

Start the frontend in a second terminal:

```sh
cd frontend
npm run dev
```

Visit the Vite URL (normally `http://localhost:5173`). The backend health check is `GET http://localhost:5000/api/health`.

## Authentication API

All responses use `{ "success": boolean, "message"?: string, "data"?: object }`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | API health status |
| POST | `/api/auth/patient/request-otp` | Validate a registered Indian mobile and request a code |
| POST | `/api/auth/patient/verify-otp` | Verify a six-digit code and issue a patient contact-session JWT |
| POST | `/api/auth/staff/login` | Sign in with an active staff/admin account |
| GET | `/api/auth/me` | Return the safe profile for the authenticated token |
| POST | `/api/auth/logout` | Document client-side sign-out behavior; requires a valid token |

Use `Authorization: Bearer <token>` for protected endpoints. Patient sessions represent verified phone contact and contain no patient ID. There are deliberately no report endpoints or patient-specific authorization claims; a later workflow must establish and authorize patient identity separately, especially for shared family phone numbers.

Staff and patient sessions are kept separate by role and protected frontend routes. The frontend stores the JWT in `sessionStorage` (not `localStorage`), so it is cleared when the browser tab session ends, but JavaScript running on the origin can still access it. The patient JWT contains a random contact-session subject rather than phone or patient details. Patient display data otherwise remains in memory. Logout removes the token in the browser; it is not server-side revocation, and a copied token remains valid until expiry.

## Tests

Backend tests use an isolated ephemeral MongoDB instance and do not touch development/production databases:

```sh
cd backend
npm test
```

Frontend interaction tests:

```sh
cd frontend
npm test
npm run build
```

## Scope and deployment

This is a local development foundation, not a production-ready medical records system. Before deployment, configure a production SMS provider, secret management, HTTPS, monitoring, privacy/compliance controls, and patient-specific identity/authorization. Production mode rejects the mock OTP provider.
