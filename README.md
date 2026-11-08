# LabConnect

LabConnect is a local development foundation for authenticated staff workflows, LIS imports, private report storage, and OTP-verified expiring report links. Phone verification alone does not identify a specific family member; patient dashboard APIs remain fail-closed until a separate patient identity verification workflow is integrated.

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

Use `Authorization: Bearer <token>` for protected endpoints. Patient sessions represent verified phone contact and contain no patient ID. Patient record endpoints remain fail-closed until a separate identity verification workflow can safely bind a patient ID; report-link access uses its independent one-report OTP grant described below.

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

## Patient portal and private PDF reports

The staff workspace includes **Report management** for associating one validated PDF with an existing report. Staff can search by report ID, inspect its patient/order/test metadata, upload a PDF (maximum 10 MB), then explicitly confirm that the document is signed and ready. Uploading alone never changes a Processing report to Ready, and an existing PDF cannot be silently replaced. The confirmation is an authorized staff attestation; this module does not cryptographically verify a PDF signature.

Uploaded files are validated as PDFs using their content and a PDF parser. In development and tests they are stored under `backend/private-storage/` (or the optional `PDF_STORAGE_DIR` directory), outside the frontend and never served as static files. MongoDB stores an opaque random storage key and upload metadata; API responses do not disclose the key or physical path. Test files use isolated temporary storage directories. The API requires a configured private production storage adapter in production; no cloud adapter is included, and upload/view/download requests return a service-unavailable error there until one is implemented and configured.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/patients/me` | Safe patient profile |
| GET | `/api/patients/me/orders?page=1&limit=20&sort=newest` | Paginated patient-owned orders |
| GET | `/api/patients/me/reports?page=1&limit=20` | Paginated patient-owned report summaries |
| GET | `/api/reports/:reportId` | Detailed report, after ownership/role authorization |
| GET | `/api/reports/:reportId/view` | Authenticated private PDF stream |
| GET | `/api/reports/:reportId/download` | Authenticated private PDF download |
| GET | `/api/staff/reports?search=RPT-...` | Staff report search |
| POST | `/api/staff/reports/:reportId/upload-pdf` | Staff-only multipart upload (`file` field) |
| POST | `/api/staff/reports/:reportId/confirm-signed` | Staff-only explicit sign-off and Ready action |

Patient routes filter by the database patient ID in a trusted, identity-bound patient token; they never accept a patient ID from the browser or use a mobile number to select a record. Existing OTP login only verifies phone contact and intentionally issues a contact-only token, because multiple people can share one number. Consequently, patient record endpoints currently fail closed with `403 Patient identity verification is required`; completing the patient dashboard requires a separate identity-verification/selection workflow before issuing an identity-bound token. Do not treat OTP contact verification as patient identity or work around this limitation with a mobile-number lookup. Patient routes and frontend are in place for that later identity integration, but access is not enabled by OTP alone. For identity-bound sessions, report results/details and PDFs are withheld until the report is Ready, signed, and has a valid private PDF; order/report status summaries remain available.

Staff and admin roles may manage PDFs. Patients may access a report or its PDF only when the authenticated patient ID owns it, the report is Ready, and a valid signed PDF is associated. Report upload, sign-off, view, and download actions are recorded as minimal audit events (action, report reference, actor ID and timestamp; no report contents). PDF responses use `Cache-Control: private, no-store` and are never redirected to public URLs.

## Secure expiring report delivery

When staff confirm a PDF as signed and Ready, LabConnect automatically creates a cryptographically random 32-byte access link, stores only its SHA-256 hash, and simulates an SMS notification. Link tokens are placed in the URL fragment (`/report-access/#TOKEN`) so browsers do not send them in the initial page request or referrer; the frontend removes the fragment from browser history after loading it. Links are bound to one patient and one report, expire after 72 hours, and a new link revokes prior links and any associated grants. Access requires a five-minute, single-use OTP sent to the mobile number already associated with that exact patient/report link. OTPs are bcrypt-hashed, limited to five attempts and three requests per link per 15 minutes (with additional IP rate limits). Successful verification creates a random hashed access grant that authorizes only the bound report for 15 minutes. Grants are held in page memory, never localStorage.

Notifications use `MockSMSProvider` or `MockWhatsAppProvider` and are simulated; **no real SMS or WhatsApp messages are sent**. The mock API exposes `developmentOtp` only in development/test to support local verification. To deterministically test provider failure, set `LABCONNECT_MOCK_NOTIFICATION_FAILURE=true` in the backend process outside production. Notification messages contain only the secure link and generic report-ready text; they include no test values, diagnoses, or patient name. Raw link tokens and message bodies are not stored in delivery logs. Delivery history includes only masked destinations, channel, provider status/ID and timestamps. Delivery requests are excluded from HTTP access logs to prevent token or patient data leakage.

Staff can use **Secure delivery history** (`/staff/delivery`) to send links to Ready reports, filter delivery logs, retry failed or previous deliveries, and revoke active links. Resending creates a fresh link and invalidates the previous one.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/delivery/reports/:reportId/generate` | Staff-only link generation and simulated notification; JSON body may select `{ "channel": "SMS" }` or `WhatsApp` |
| POST | `/api/delivery/reports/:reportId/resend` | Staff-only fresh link and notification retry; previous channel is reused unless provided |
| POST | `/api/delivery/reports/:reportId/revoke` | Staff-only revoke active links and related access grants |
| GET | `/api/delivery/logs?page=1&limit=20&status=Sent&channel=SMS&from=...&to=...` | Staff-only filtered, paginated history with masked phone numbers |
| POST | `/api/delivery/access/request-otp` | Public link validation and report-specific OTP request; JSON body `{ "token": "..." }` |
| POST | `/api/delivery/access/verify-otp` | Verify OTP and issue a 15-minute report-bound access grant; JSON body `{ "token": "...", "otp": "000000" }` |
| GET | `/api/delivery/access/report` | Stream the bound private PDF inline; requires `X-Report-Access-Grant` |
| GET | `/api/delivery/access/report/download` | Download the bound private PDF; requires `X-Report-Access-Grant` |

Local test instructions are unchanged: from `backend/` run `npm test`; from `frontend/` run `npm test` and `npm run build`. For real delivery, implement and configure a production SMS/WhatsApp provider, secure credential storage, delivery callbacks/retries and operational monitoring; the mock adapter is deliberately disabled in production and is not a production messaging integration. Private production PDF storage also remains unconfigured. Patient OTP login remains contact-only and is distinct from report-link OTP; shared mobile numbers do not widen a report access grant.

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
