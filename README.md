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

## LIS CSV imports

Authenticated staff can open **LIS Report Import** from the staff dashboard. Upload a `.csv` file to preview grouped orders and row-level validation results; review the preview and explicitly confirm to commit the valid orders. A preview is stored server-side for 30 minutes, is tied to the staff account that uploaded it, and can be committed once. Uploads are held in memory (not saved as temporary files), limited to 2 MB and 5,000 data rows.

The CSV header must contain these columns:

```csv
orderId,patientId,patientName,mobile,doctorName,testName,result,unit,referenceMin,referenceMax,status
ORD-71204,DEMO-LIS-PAT-001,Lakshmi Prasanna K,9000000011,Dr. S. Ramanaiah,Haemoglobin,10.2,g/dL,12.0,15.5,Ready
ORD-71219,DEMO-LIS-PAT-002,Venkata Rao M,9000000012,Dr. P. Anitha,LDL Cholesterol,142,mg/dL,0,100,Processing
ORD-71233,DEMO-LIS-PAT-003,Farzana Begum,9000000013,Dr. K. Sure,Potassium,6.8,mmol/L,3.5,5.1,Ready
```

The matching synthetic example file is [`sample-data/lis-demo.csv`](./sample-data/lis-demo.csv). Use one row per test; rows with the same `orderId` and patient, doctor and status are grouped into one order and report. Mobile numbers must be 10-digit Indian numbers; numeric results and reference ranges must be valid with `referenceMin <= referenceMax`. Status must be `Processing`, `Ready` or `Cancelled`. The import preserves the provided numeric values and does not infer clinical result classifications.

Patients are matched by `patientId`, never by mobile alone. Existing IDs with conflicting names or numbers are rejected without overwriting existing patient data. Existing order IDs are skipped, as are race-time duplicate order insertions. Doctors are deduplicated using a deterministic ID derived from their normalized name. Each order has at most one report, and imported reports are not signed. Validation failures are available in the preview and are recorded in import history after commit; order/report writes are recovered at the order level if report creation fails.

Staff-only API endpoints (all require `Authorization: Bearer <token>`):

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/import/lis/preview` | Multipart CSV upload in the `file` field; validates and stages server-side preview only |
| POST | `/api/import/lis/commit` | Commits validated staged rows; JSON body: `{ "previewId": "..." }` |
| GET | `/api/import/history?page=1&limit=10` | Paginated import summaries, newest first |
| GET | `/api/import/:id` | One import summary and its row-level errors |

Seed three synthetic patients, doctors, orders and report metadata records with stable IDs (re-running is idempotent):

```sh
cd backend
npm run seed:lis
```

The seed data uses fictional identities and clearly demo-designated mobile values. It is not clinical guidance.

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
