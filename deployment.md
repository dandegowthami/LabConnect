# LabConnect setup and deployment

## Release status

This checkout implements the core staff workflows, LIS import, private PDF upload/sign-off, secure report-link delivery, deterministic abnormal detection, configurable multilingual AI explanation APIs, callback review, database-backed staff dashboards/search, and a restricted referring-doctor portal. The frontend integration and security controls are implemented and covered by local tests.

No live frontend or backend deployment has been configured or verified. Patient records require mobile OTP plus an identity-bound portal account activated by a one-time clinic code after an in-person identity check. The application cannot independently establish physical identity. There is also no production private-object-storage adapter or real SMS/OTP provider, so this checkout is **not ready for production medical-record delivery**.

## Prerequisites

- Node.js 20 or newer and npm.
- MongoDB Community locally, or a MongoDB Atlas database.
- PowerShell on Windows (commands below use PowerShell syntax).

## Local setup

From the repository root:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

Edit `backend\.env` locally. The example uses blank placeholders and is intentionally not directly runnable. Replace the blank values you use with valid values. Blank strings are not the same as omitted optional settings: remove or comment out optional variables that you do not use. Required and defaulted settings:

| Variable | Local development value/instructions |
|---|---|
| `PORT` | `5000` |
| `NODE_ENV` | `development` |
| `MONGODB_URI` | A MongoDB URI for a database you control. Use a newly provisioned database user; do not reuse any credential that may have appeared in repository history. |
| `JWT_SECRET` | A newly generated random secret of at least 32 characters. Keep it private. |
| `JWT_EXPIRES_IN` | A duration such as `1h`. |
| `FRONTEND_URL` | `http://localhost:5173` |
| `OTP_PROVIDER` | `mock` for local development only. |
| `DEMO_STAFF_EMAIL` | Optional. Set a private demo account email only if running `seed:staff`. |
| `DEMO_STAFF_PASSWORD` | Optional. Set a private password of at least 12 characters only if running `seed:staff`. |
| `DEMO_STAFF_ROLE` | Optional; `staff` by default, or `admin` / `pathologist` for a controlled local demonstration. |
| `PDF_STORAGE_DIR` | Optional local private storage directory. If omitted, files are stored under `backend\private-storage`, which is ignored by Git. |
| `AI_PROVIDER` | Optional; currently supports `openai-compatible`. |
| `AI_API_KEY` | Optional backend-only provider credential. Never set a `VITE_` variable for this key. |
| `AI_MODEL` | Optional model identifier supported by the configured provider. |
| `AI_API_BASE_URL` | Optional HTTPS provider API base URL; non-HTTPS URLs and embedded credentials are rejected. The application calls its chat-completions endpoint and rejects redirects. |
| `AI_TIMEOUT_MS` | Optional request timeout in milliseconds; defaults to 15000 (allowed range 1000–60000). |

If you are not seeding a demo staff user, remove the `DEMO_STAFF_EMAIL` and `DEMO_STAFF_PASSWORD` lines. Set `DEMO_STAFF_ROLE=staff` (or remove that variable so the default applies). If AI is not configured, remove the blank `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_API_BASE_URL`, and `AI_TIMEOUT_MS` lines. Blank strings are not treated as omitted values by the current configuration validator. `PORT`, `NODE_ENV`, `JWT_EXPIRES_IN`, `FRONTEND_URL`, and `OTP_PROVIDER` must also be set to valid values even though the server has defaults for omitted values.

Install and start the backend in one PowerShell window:

```powershell
Set-Location backend
npm install
npm run dev
```

Install and start the frontend in a second window:

```powershell
Set-Location frontend
npm install
```

Set `VITE_API_BASE_URL` in `frontend\.env` to `http://localhost:5000/api`, then run:

```powershell
npm run dev
```

The default Vite URL is `http://localhost:5173`. The local backend health endpoint is `http://localhost:5000/api/health`. These are local development addresses, not deployed service URLs.

## MongoDB and synthetic seed data

Start MongoDB and set `MONGODB_URI` before running seeds. Available scripts:

```powershell
Set-Location backend
npm run seed:patients
npm run seed:lis
```

To create a staff account, set `DEMO_STAFF_EMAIL` and `DEMO_STAFF_PASSWORD` locally, then run:

```powershell
npm run seed:staff
```

There are no shared demo credentials. To sign in locally, use the `DEMO_STAFF_EMAIL` and `DEMO_STAFF_PASSWORD` values that you configured before running `seed:staff`; no preset login is available. Seeded patient and order data is synthetic; it is not clinical guidance. Do not put credentials in the repository or submission ZIP.

Doctor accounts are not publicly registered or seeded. An authorized staff account can provision an account linked to an existing referring-doctor record from the staff workspace. An admin can provision a pathologist account. No demo passwords are included in source or documentation.

For patient portal access, staff must locate the patient record and complete the clinic's in-person identity checks before issuing a portal activation code. The code is shown once, expires after 24 hours, and must be handed directly to the patient. The patient verifies their mobile by OTP, enters the patient ID, activation code, a private password of at least eight characters, and accepts the patient portal privacy notice. Later logins use OTP, patient ID, and the password. One mobile may be shared across multiple family profiles; the patient ID/password pair binds a session to only one profile. Portal privacy acceptance is separate from referring-doctor sharing consent.

## OTP and notification behavior

In non-production development, `OTP_PROVIDER=mock` allows the patient login OTP response to include a `developmentOtp`. The code is generated per request, hashed in storage, expires after five minutes, and is single-use. The report-link OTP flow uses the same development/test delivery behavior.

For local patient-contact testing, seed synthetic patients, request an OTP using one of their seeded mobile numbers, and use the `developmentOtp` returned by the development API response. Never enable this behavior in production or publish a demo OTP. This contact OTP does not identify a specific patient record.

Report delivery supports mock SMS/WhatsApp only. It does not send real messages. Mock notification failure can be exercised locally with `LABCONNECT_MOCK_NOTIFICATION_FAILURE=true`. No real SMS provider is configured; `OTP_PROVIDER=sms` currently reports that the provider is unavailable.

## AI configuration

AI is optional. To enable the backend service, set `AI_PROVIDER=openai-compatible`, `AI_API_KEY`, `AI_MODEL`, and an HTTPS `AI_API_BASE_URL` in `backend\.env`. Embedded URL credentials and redirects are rejected. Set `AI_TIMEOUT_MS` only if a non-default timeout is needed. Keys remain backend-only. Automated tests use mocked provider responses; no external AI integration was exercised in this release verification.

AI output is constrained to validated structured JSON and stored with its language/model/prompt metadata. Supported languages are English (`en`), Telugu (`te`), and Hindi (`hi`). The prompt prohibits diagnosis and treatment advice. Deterministic reference-range logic—not the LLM—classifies results. The AI API is unavailable without provider configuration and does not fabricate a response when the provider fails.

Critical results that match an approved lab rule bypass patient-facing AI generation and create urgent callback work. No critical thresholds are preloaded. A pathologist must approve any proposed rule before it can apply. Patient dashboard/AI requests require OTP contact verification plus the identity-bound portal session. First activation requires a staff-issued one-time code following the clinic's in-person identity check.

## PDF storage

Development and tests use a private local filesystem directory. PDF files are not served as static assets, and API responses do not expose storage keys. Local storage is ephemeral on many hosting platforms and is not suitable for permanent production records.

Production PDF upload/access is intentionally unavailable until a private persistent storage adapter with authorization, encryption, retention, backup, and operational controls is implemented and tested. The deployment target must fail closed rather than use `PDF_STORAGE_DIR` as production storage. Do not point `PDF_STORAGE_DIR` at a public web directory or treat a container's ephemeral disk as durable storage.

## Deployment preparation (not yet verified)

No hosting provider, region, database cluster, private storage bucket, or live URL has been configured or verified. A deployment should not proceed for real patient data until the following are complete:

1. Rotate any MongoDB credential that was present in the historical tracked environment template. Remove exposed credentials from repository history using an explicitly approved repository-history remediation process; the current task does not rewrite or force-push history.
2. Provision MongoDB with least-privilege access, backups, network restrictions, and a verified data region. No India-region residency claim is made by this project.
3. Implement and test a private persistent PDF storage adapter. Keep object access private and grant-based; do not use public object URLs.
4. Configure a real OTP/SMS provider and production-safe delivery behavior. Mock SMS/WhatsApp is not a production integration and mock OTP is rejected in production.
5. Independently review and operationalize the in-person patient identity check and activation-code handoff before enabling real patient dashboard or AI access. The code workflow binds an account but cannot itself verify a physical identity.
6. Configure a backend service with `NODE_ENV=production`, `PORT`, `MONGODB_URI`, a fresh `JWT_SECRET`, `JWT_EXPIRES_IN`, and `FRONTEND_URL`; configure `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_API_BASE_URL` only when using an approved provider. The application currently has no cloud object-storage or production SMS-provider adapter.
7. Deploy the frontend as a static site and set `VITE_API_BASE_URL` to the actual HTTPS backend API base. Restrict backend CORS to the exact frontend origin.
8. Configure TLS, secret management, access monitoring, backups/retention, incident response, and operational alerts. Select hosting/storage regions only after independently verifying provider configuration.
9. Run the tests and verify health, staff authentication, imports, private PDF access, link expiry/revocation, and OTP behavior against the deployment without using real patient records.

Once deployed, the backend health URL has the form `https://<verified-backend-host>/api/health`. Replace the placeholder only after deployment and verification; no live URL is currently known.

## Tests

From the repository root:

```powershell
npm --prefix backend test
npm --prefix frontend test
npm --prefix frontend run build
```

Latest local verification: 84 backend tests passed, 26 frontend tests passed, and `npm --prefix frontend run build` succeeded. Browser smoke checks confirmed public pages and role-specific protected-route redirects. The configured MongoDB connection and API health endpoint responded successfully; the check did not read or modify business records. The AI provider is mocked in automated tests; no external AI, real notification, production storage, live deployment, or full external-service workflow was verified.

## Troubleshooting

- **Backend exits during startup:** verify `MONGODB_URI`, `JWT_SECRET` (minimum 32 characters), and all non-optional values in `backend\.env`.
- **Frontend cannot reach API:** confirm the backend is listening on port 5000 and `VITE_API_BASE_URL` ends in `/api`; restart Vite after changing the frontend environment file.
- **MongoDB connection fails:** verify the service is running, the URI database user and network access are valid, and the selected database is reachable.
- **Staff seed refuses to run:** set both optional demo staff variables locally; never place them in source control.
- **OTP is unavailable:** mock OTP works only outside production. There is no configured real SMS provider.
- **PDF operations return service unavailable in production:** production private storage is not implemented. Do not work around this by enabling public/local static file access.
- **Patient report or AI API returns 403:** mobile OTP alone is not sufficient. Complete in-person identity verification with staff, get a portal activation code, and link the patient ID to a private password. Do not choose an account from the shared mobile number alone.
- **AI explanation is unavailable:** verify all four required backend AI variables and confirm the provider accepts the configured model and chat-completions request.
- **Doctor cannot see a report:** verify the order explicitly references that doctor, patient consent is granted, and the order date is within the 90-day default range.
