# TCMS Frontend — Implementation and Backend Integration Guide

**Status:** implementation blueprint, 2026-09-23; aligned with kickoff decisions 2026-09-24 ([TCMS_PROJECT_STRATEGY.md](TCMS_PROJECT_STRATEGY.md), referenced below as D1–D19). **Audience:** frontend engineer, backend owner, QA, designer. **Product:** Transportation Claim Management System. This README specifies a separate frontend application and the handoff needed to integrate it with TCMS APIs. It does not claim that screens, endpoints, tests, or a repository already exist. Proposed paths and fields below are examples until approved in OpenAPI.

**Fixed stack:** Angular 22 (strict TypeScript, standalone, zoneless) + Angular Material, talking through a same-origin Spring gateway/BFF to a Spring Boot 4 / Java 25 modular monolith; Keycloak for identity (one realm, one Organization per tenant); PostgreSQL with row-level tenant isolation; S3-compatible file storage; OpenAPI 3.1 contract-first; RFC 9457 `ProblemDetail` errors.

## 1. Product and scope

TCMS lets each client company onboard employees, configure a transportation policy, collect receipts, validate claims, route approvals, and track settlement. Each company is a tenant with separate data. A client may use built-in HR/identity workflows, external systems, or a mixture. The first usable vertical slice is **company setup → employee provisioned by HR → employee uploads receipt and confirms claim → reviewer approves/rejects/requests changes → finance exports and tracks settlement**. Manual upload works without Uber/Careem OAuth, email sync, OCR, SSO, or external HR/finance integration. Do not imply a claim was paid solely because an export succeeded.

The frontend is a standalone deployable app in its own repository (`tcms-frontend`, alongside `tcms-backend` and `tcms-infra`; D6), with its own CI, runtime configuration, tests, and release version. It consumes versioned backend contracts; it does not share Java entities or database tables. Phase 00 establishes navigation, authentication shell, design system, API client, mocked journeys, and contract fixtures. Phases 01–02 cover company setup and identity. Phases 03–07 cover organization, policy, employee claim, approval, and finance. Phases 08–14 are later capabilities; build them behind feature flags when approved.

### Personas and access

| Persona | Main tasks | Example permission names (proposed; backend authoritative) |
| --- | --- | --- |
| Platform operator | Provision tenant and inspect onboarding status | `platform.tenants.read`, `platform.tenants.write` |
| Company admin | Manage company settings and integrations | `org.settings.read`, `org.settings.write` |
| HR operator | Create/import employees and assign managers | `employees.read`, `employees.write`, `employees.import` |
| Identity/IT admin | Manage users, roles, permission assignments | `users.read`, `users.write`, `roles.manage` |
| Employee | Create/view own claims | `claims.create`, `claims.own.read` |
| Approver | Review assigned claims | `approvals.read`, `approvals.decide` |
| Finance | Review settlement, export and record payment evidence | `settlements.read`, `settlements.export`, `settlements.update` |
| Auditor | View authorized history and reports | `audit.read`, `reports.read` |

A person may hold several roles. Roles are managed in Keycloak (per tenant Organization) and mapped to these permission names by the backend; the frontend reads the effective permission list from `GET /api/v1/me`. Navigation may hide inaccessible routes for usability, but backend authorization is definitive. For an external HR system, employee records may arrive through backend integrations without an HR user accessing these screens.

## 2. Recommended standalone frontend shape

**Decided 2026-09-24 (see [TCMS_PROJECT_STRATEGY.md](TCMS_PROJECT_STRATEGY.md) D1, D5, D13, D14):** Angular + TypeScript with strict compiler settings, standalone components, Angular Router, Signal Forms (reactive forms where needed), Angular HttpClient, Angular Material component library, Transloco for runtime Arabic/English switching, Vitest for unit/component tests, Playwright for end-to-end tests, and an OpenAPI-generated typed client (`ng-openapi-gen`, Node-only so frontend developers need no Java). Authentication runs through a Spring BFF/gateway backed by Keycloak, so the browser holds only an `HttpOnly` session cookie. Pin actual framework/tool versions in the frontend lockfile at repository creation.

```text
tcms-frontend/
├── README.md                         # this guide
├── package.json / package-lock.json
├── public/config.json                # runtime settings for local dev; replaced per environment at deploy
├── public/i18n/                      # ar.json and en.json translations
├── src/
│   ├── app/core/                     # session, tenant context, API client, interceptors, error mapping, guards
│   ├── app/shared/                   # Angular Material wrappers, design tokens, formatters, field and table components
│   ├── app/features/
│   │   ├── auth/
│   │   ├── platform-tenants/
│   │   ├── organization/
│   │   ├── hr/
│   │   ├── identity/
│   │   ├── policies/
│   │   ├── claims/
│   │   ├── approvals/
│   │   ├── finance/
│   │   ├── reports/
│   │   ├── integrations/
│   │   ├── notifications/
│   │   ├── audit/
│   │   └── settings/
│   ├── app/api/                      # generated client (ng-openapi-gen), never edited by hand
│   └── mocks/                        # MSW handlers, fabricated personas, mock sign-in (mock build only)
├── contracts/                        # pinned OpenAPI snapshot and fixtures
├── e2e/                              # Playwright persona journeys and tenant isolation
├── deploy/                           # nginx config and security headers for the container image
└── docs/                             # screen specifications and decisions
```

Keep route + page + UI components + API adapter + model + tests together per feature. Never import an API adapter directly from another feature. Shared DTOs come from generated contracts. Avoid a frontend database model that encodes backend implementation details.

### Developer commands (illustrative; wire to actual scripts)

```bash
npm ci
npm run api:generate     # regenerate typed client from contracts/openapi.yaml
npm run start:mock       # frontend + mock API driven by the OpenAPI snapshot
npm run start:local      # frontend proxied to local gateway (tcms-infra docker-compose)
npm run lint
npm run typecheck
npm run test             # Vitest unit/component
npm run test:e2e         # Playwright
npm run build
```

**Runtime configuration (D17):** one production build is promoted through DEV → STAGING → PROD. Angular does not read `.env` files at runtime, so settings are fetched at startup from `/config.json`, served per environment by the hosting layer. Fields: `apiBasePath` (normally `/api`), `defaultLocale`, `supportedLocales`, `featureFlags`, `errorReporting` (public DSN/environment only). There are no OIDC settings in the browser: sign-in is a redirect to the gateway's login endpoint (D5). Never put database credentials, OAuth client secrets, tokens, or internal service URLs in `config.json`, source maps, or the bundle. The SPA and API share one origin (`https://app.<domain>/` and `/api/**`, D16), so no CORS configuration is needed.

## 3. Navigation and complete screen inventory

**Every screen owns** loading skeleton, empty state, validation, recoverable error, access-denied, offline/network failure, and success feedback. A detail URL refresh must restore the view after authentication. Page names/routes are proposed and should be reconciled with design and backend permissions.

| ID | Phase | Screen / proposed route | Principal interactions and data | Priority |
| --- | --- | --- | --- | --- |
| A01 | 00/02 | Sign in `/login` | Landing page that redirects to gateway login (Keycloak hosted page; local or company SSO); preserves safe return URL | MVP |
| A02 | 02 | Password recovery | Handled by Keycloak hosted pages, themed to TCMS; no SPA screen | Keycloak |
| A03 | 00 | App shell `/` | Tenant name, persona navigation, notifications, profile, sign out | MVP |
| A04 | 00 | Forbidden `/403`, not found `/404`, unavailable `/error` | Safe actionable states, correlation ID | MVP |
| T01 | 01 | Tenant list `/platform/tenants` | Search/status; platform operator only | MVP admin |
| T02 | 01 | Tenant create/detail `/platform/tenants/new`, `/:id` | Company identity, provisioning status, retry visibility | MVP admin |
| T03 | 01 | Company onboarding `/setup` | Steps: organization, access, employee source, policy, readiness. Policy step links to P01 and is shown as pending until Phase 04 ships | MVP |
| O01 | 03 | Company profile `/organization` | Legal/display info, timezone, currency, departments | MVP |
| O02 | 03 | Org structure `/organization/departments` | Department list, manager assignment, validation | MVP |
| H01 | 03 | Employee list `/hr/employees` | Search, filters, pagination, create/import actions | MVP |
| H02 | 03 | Employee create/edit/detail `/hr/employees/new`, `/:id` | Employee ID, name, contact, department, manager, status | MVP |
| H03 | 03 | Bulk import `/hr/imports` | Upload CSV, preview errors, commit, job progress/results | Post-MVP |
| I01 | 02 | User list/detail `/identity/users`, `/:id` | Status, identity linkage, assign predefined roles (backend writes to Keycloak) | MVP |
| I02 | 02 | Roles/permissions `/identity/roles`, `/:id` | Create custom role, select permissions, see affected users | Post-MVP (MVP uses predefined roles) |
| I03 | 02 | SSO configuration `/identity/sso` | Company IdP brokering via Keycloak; status and test connection | Later/conditional |
| P01 | 04 | Policy list/detail `/policies`, `/:id` | Draft policy, eligibility, thresholds, effective date/version | MVP minimal |
| P02 | 04 | Approval routing `/policies/approvals` | Manager/reviewer sequence and fallback | MVP minimal |
| C01 | 05 | My claims `/claims` | Search/status/date filters, totals, pagination | MVP |
| C02 | 05 | Create claim `/claims/new` | Period/trip details, receipts, review calculated totals, save/submit | MVP |
| C03 | 05 | Claim detail/edit `/claims/:id` | Status, line items, file previews, timeline; edit allowed only by state | MVP |
| C04 | 05 | Receipt detail `/claims/:id/receipts/:receiptId` | Preview/download, captured fields, corrections | MVP |
| V01 | 06 | My approval queue `/approvals` | Assigned work, filters, counts, pagination | MVP |
| V02 | 06 | Decision `/approvals/:claimId` | Evidence, policy findings, approve/reject/request changes with reason | MVP |
| F01 | 07 | Settlement queue `/finance/settlements` | Approved claims, batch selection and totals | MVP |
| F02 | 07 | Batch detail/export `/finance/settlements/:id` | CSV/XLSX export, status and payment evidence | MVP |
| R01 | 11 | Reports `/reports` | Monthly totals and filters/export | Post-MVP |
| N01 | 09 | Notification inbox `/notifications` | Unread/read and deep links | Later |
| U01 | 12 | Integrations `/integrations` | HR/SSO/finance connector status and sync errors | Later |
| D01 | 10 | Audit `/audit` | Searchable read-only activity with scope | Later |
| X01 | 08 | IT requests/assets `/it/*` | Separate feature only if product scope approved | Later |
| X02 | 13/14 | Subscription/operations `/platform/*` | Commercial and operations tooling | Later |

### Core journeys and states

1. **New company:** platform operator creates tenant → backend starts a provisioning job (database records + Keycloak Organization + first admin invitation) → UI shows `PROVISIONING` → only after backend confirms `READY` can the company admin sign in and finish setup. Display failed provisioning and support reference, not a fake success.
2. **HR onboarding:** HR creates employee or imports batch → record is linked to an identity if required → employee signs in → sees only own claims. HR record and user account have different identifiers.
3. **Claim:** employee saves draft → uploads receipts → corrects captured trip details → sees backend calculated total and policy findings → submits → approver decides or requests correction → finance exports approved items → finance records settlement evidence. Reload always restores server state.
4. **Existing client:** external HR may provision employees; the company's own IdP signs users in through Keycloak identity brokering; same employee claim journey applies. SSO login does not itself synchronize employee data.
5. **Failure:** rejected upload/duplicate hint/expired session/conflicting update show specific recovery actions; uncertain duplicate is reviewed, never silently deleted.

**Suggested claim states, subject to backend state machine:** `DRAFT`, `SUBMITTED`, `NEEDS_CHANGES`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `READY_FOR_SETTLEMENT`, `SETTLED`. Render returned state and permitted actions from backend; do not infer a transition from a button click.

**Suggested settlement batch states (separate from claim state):** `DRAFT`, `EXPORT_PENDING`, `EXPORT_CREATED`, `EXPORT_FAILED`, `PAYMENT_RECORDED`, `CLOSED`. A claim moves to `SETTLED` only when finance records payment evidence (`PAYMENT_RECORDED`), never because an export file was produced. Both state machines are `OPEN` until the backend publishes them.

## 4. Frontend–backend boundary and contract process

**Contract-first (D7).** The backend owns one OpenAPI 3.1 spec in `tcms-backend/api/`, including request/response examples, error codes, permissions, enums, pagination, upload/download behavior, and deprecated fields. An endpoint is implemented only after its spec change is merged. Each backend release publishes a versioned spec artifact; the frontend pins it in `contracts/openapi.yaml` and generates the client with `ng-openapi-gen` reproducibly in CI. CI fails if the generated client is out of date or mocks do not validate against the pinned spec. A contract change requires a frontend PR showing changed types, screen impact, fixtures, and tests. The frontend does not invent endpoints from service/module names. The table below is a **negotiation checklist**, not an assertion that APIs already exist.

| Capability | Proposed API shape | Must agree before wiring |
| --- | --- | --- |
| Session | `GET /api/v1/me`; gateway `/login` and `/logout` redirects (BFF, D5) | session lifetime and idle timeout, CSRF cookie/header names, multi-tenant membership |
| Tenant | `GET/POST /api/v1/platform/tenants`, `GET /:id` | platform authentication, provisioning states, errors |
| Organization | `GET/PATCH /api/v1/organization`, departments CRUD | server-owned tenant scope, IDs, edit permission |
| Employees | list/create/get/update, `POST /api/v1/employees/imports` | identity link, import template, async status, partial failures |
| Identity | users, roles, permissions | role assignment, permission catalog, optimistic concurrency |
| Policies | policies and approval routes | published version, effective date, monetary rules |
| Claims | list/create/get/update, submit; receipt upload via presigned URL (D11) | line item schema, allowed transitions, ownership, idempotency, scan status |
| Approvals | queue/get/decision | reviewers, delegated approval, reason requirements, conflict handling |
| Settlement | queue/batches/export/status evidence | whether export is a background job, file expiration, payment proof |
| Reporting/audit | authorized filtered list/export | date semantics, redaction, retention |

**Successful responses** return the resource directly (no wrapper). The version for optimistic locking comes in the `ETag` header and in the body; the trace ID comes in a `traceparent`/`X-Trace-Id` response header.

```json
{ "id": "clm_123", "status": "DRAFT", "version": 3, "totalAmount": "125.500", "currency": "KWD" }
```

**Errors use RFC 9457 `ProblemDetail` (D8)**, `Content-Type: application/problem+json`, with TCMS extensions `code`, `traceId`, and `fieldErrors`:

```json
{
  "type": "https://tcms.example/problems/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "code": "VALIDATION_FAILED",
  "traceId": "8e920af2c7654abc",
  "fieldErrors": [{ "field": "tripDate", "code": "FUTURE_DATE", "message": "Date cannot be in the future" }]
}
```

Money is sent as a decimal string with an explicit currency, never as a JSON float. Never show raw backend HTML, stack traces, or `title`/`detail` strings from the server directly. Translate by `code` (and `fieldErrors[].code`) into Arabic/English messages, with a generic fallback that shows the trace ID.

### Cross-cutting request rules

- **Tenant:** the active tenant comes from the session (the user's Keycloak Organization membership, exposed by `/me`); the backend enforces it with PostgreSQL row-level security (D9). The browser never sends a tenant ID that the server trusts on its own; if a user belongs to several tenants, switching is a server call that the backend verifies against membership. Clear cached data and active forms when switching tenants. Prefix client cache keys with tenant + user.
- **Auth (D5):** the gateway/BFF performs OIDC Authorization Code + PKCE with Keycloak and keeps all tokens server-side. The browser holds only an `HttpOnly; Secure; SameSite=Lax` session cookie. The SPA stores no tokens anywhere (no localStorage, sessionStorage, or memory) and has no refresh logic. Angular `HttpClient` XSRF support sends the CSRF token on mutating requests. On 401, redirect once to the gateway login with a safe relative return URL. 403 shows access denied.
- **Pagination:** agree `page` zero/one indexing, `size`, `sort`, filters, and response `items/total/page`; reset page on filter changes. Server does the sorting and filtering.
- **Time/money:** API timestamps as ISO 8601 with offset/UTC; date-only trip day distinct from timestamp. Show dates in tenant timezone. Currency and decimal precision come from backend; no floating point money calculations or client-authoritative totals.
- **Concurrency:** send `version`/`ETag` (`If-Match`) for edits/decisions; 409/412 triggers refetch and a visible conflict message. Disable duplicate submits while a request is pending; backend still enforces idempotency.
- **Idempotency:** send a stable `Idempotency-Key` per create/submit/decision operation if contract supports it. Do not generate a new key on network retry of the same intent.
- **Files (D11):** the SPA asks the backend for a presigned upload URL, uploads directly to object storage, then confirms the upload to the backend. A receipt is usable only after the backend reports scan status `CLEAN`; show `SCANNING` and `REJECTED` states. Downloads use short-lived presigned URLs issued after authorization. Allowed content types, max size/count, and URL expiry come from the contract. Never treat extension alone as proof of type. Preview only safe formats; provide authorized download otherwise.
- **Jobs (D12):** import, export, and tenant provisioning are asynchronous, database-backed jobs. Show status, counters, retry advice, and the persisted job ID; poll `GET /api/v1/jobs/{id}` with bounded backoff (for example 1s doubling to 15s max). Stop polling on navigation; resume from the job ID after reload.
- **Caching:** no cross-user or cross-tenant browser caching of private API data; sign-out clears query caches and transient sensitive state.

### HTTP handling matrix

| Response | Frontend behavior |
| --- | --- |
| 400/422 | Map field errors, preserve form, focus first invalid field |
| 401 | Session expired: redirect once to gateway login with safe return URL (no token renewal in SPA) |
| 403 | Access denied, clear disallowed UI actions |
| 404 | Not-found state without disclosing another tenant's resource |
| 409/412 | Refresh and explain stale state or duplicate request |
| 413/415 | Show upload size/type guidance from contract |
| 429 | Respect `Retry-After`, prevent rapid resubmission |
| 5xx/network | Generic retry with trace ID if available; never assert operation failed if outcome uncertain |

## 5. Screen-specific validation and acceptance

Rules below are **UI checks proposed for immediate feedback**. The backend must repeat authoritative checks and return stable error codes. Confirm numeric limits, requiredness, formats, and localized messages in a field dictionary before implementation; do not silently impose guessed limits.

| Form / field | Client checks | Backend-owned rule / edge case |
| --- | --- | --- |
| Sign in | None in SPA: credentials are entered only on Keycloak hosted pages | throttling, brute-force protection, account state, MFA/SSO (Keycloak) |
| Tenant/company | Required display name; supported locale/timezone | uniqueness, legal identity, provisioning and tenant isolation |
| Employee | Required employee ID/name; valid email or phone as configured; selected department/manager | employee ID uniqueness **within tenant**, manager validity, inactive users |
| Bulk import | Approved file type/size; preview columns; confirm before commit | deduplication, row-level validation, max rows per file (`OPEN`, set in field dictionary), partial success and resume |
| Role editor | Nonempty name and selected permission set; warn on unsaved edits | uniqueness, protected roles, forbidden permission escalation |
| Policy | Required effective date, positive/allowed limits, explicit currency | overlap, published version immutability, effective policy on claim date |
| Claim trip | Required date, amount, currency, journey fields required by policy | eligibility, date range, rate limits, policy and duplicate findings |
| Receipt | Allowed format and max size/count from backend config; upload progress | MIME/content scan, ownership, duplicate hash, retention |
| Submit claim | All required items uploaded/ready; show server total; confirmation | final recalculation and state transition, replay protection |
| Approval decision | Reason required for rejection/change request; confirmation | reviewer authorization, separation of duties, current state/version |
| Settlement update | Reference/evidence required according to payment method | only authorized finance action can mark settled; audit trail |
| Filter/export | Valid date range, bounded selection | tenant scope, maximum export size, permission and masking |

Render backend field errors by path, including array items such as `receipts[1].amount`. Normalize whitespace carefully; preserve meaningful spaces in names. Mark required fields visually and programmatically, use accessible labels and error descriptions, retain entered data after recoverable errors. The server decides whether a claim with a future date, duplicate receipt, or policy exception can proceed.

## 6. Test strategy with executable case IDs

Every feature PR adds tests for its actual behavior and updates the mock contract. Tests use fabricated tenant/user/receipt data, never employee production data. Unit tests cover pure validation, money/date formatting, guards, and error mapping. Component tests cover interactions and accessible state changes. API contract tests verify mocks against pinned OpenAPI and detect missing/renamed fields. E2E tests run a mocked vertical slice on each PR and a backend-integrated slice in DEV when available. Use deterministic dates/timezones. Avoid tests that only repeat component implementation.

| ID | Level | Scenario / expected assertion |
| --- | --- | --- |
| FE-001 | E2E | Platform operator provisions tenant; UI remains pending until backend returns `READY` |
| FE-002 | E2E | HR creates employee; employee sees own profile and zero claims |
| FE-003 | Component | Import preview marks bad rows; commit requires explicit confirmation; result counts shown |
| FE-004 | E2E | Employee uploads valid receipt, saves draft, reloads, submits; server total and status persist |
| FE-005 | Component/API | Unsupported/oversize file is rejected with useful message; failed upload is not treated as attached |
| FE-006 | E2E | Reviewer approves assigned claim; employee sees updated timeline after refetch |
| FE-007 | E2E | Reviewer requests changes with required reason; employee edits and resubmits |
| FE-008 | E2E | Finance exports approved batch; UI shows export ID, never payment success from export alone |
| FE-009 | API | Expired session (401) → single redirect to gateway login and return to same page; 403 → forbidden; no redirect/request loop |
| FE-010 | API | 409/412 after concurrent decision → state refreshed; stale decision is not shown as successful |
| FE-011 | E2E | Tenant A user cannot view Tenant B claim by copied URL; no old cached data leaks after tenant switch |
| FE-012 | Component | Missing permission hides action; direct route still resolves to forbidden on backend denial |
| FE-013 | Component | Backend field error maps to correct array row; form content preserved |
| FE-014 | Component | Arabic/English direction, keyboard flow, focus/error announcements, responsive layout work |
| FE-015 | API | Lost response after submit preserves same idempotency key and checks result before allowing retry |
| FE-016 | E2E | Import/export job still displays correct persisted state after reload |
| FE-017 | Component | UTC timestamp, tenant timezone and date-only trip date render without day shift |
| FE-018 | E2E | Sign out clears user/tenant cache; browser back does not reveal sensitive API data |

**Definition of done for a screen:** design reviewed; responsive at agreed breakpoints; keyboard and screen reader basics checked; loading/empty/error/success/forbidden states present; role and tenant scoping verified; contract mock updated; relevant tests passing; no console error; backend trace ID available for support; acceptance evidence linked to screen ID and PR. Accessibility target: WCAG 2.2 AA where practical; test focus order, labels, contrast, touch targets, and RTL before release.

## 7. UI system and localization

**Component library: Angular Material 3 + CDK (D13)**, wrapped in thin TCMS components in `app/shared/` where screens need a TCMS-specific pattern, themed through `--mat-sys-*` design tokens. Material has no built-in file uploader or timeline, so those are built on the CDK. Use reusable form field, status badge, money/date, searchable table, pagination, file uploader, document preview, confirmation dialog, toast/inline alert, empty state, and timeline components. Keycloak login and account pages get a matching TCMS theme (Arabic and English). Desktop and mobile layouts cover key employee tasks; data tables may become stacked cards on narrow screens. Arabic and English are both required from Sprint 0 (D15); strings live in translation files; RTL changes layout direction, not merely text alignment, and is checked in every screen's definition of done. Do not concatenate translated fragments. Format money and dates with locale + tenant timezone while retaining source values unmodified. Status colors must also include readable labels/icons.

Design source should contain page flows and responsive states for every screen ID. Figma links are added when designs exist; this README does not imply they already exist. Create an explicit design decision for branding, breakpoints, and the exact component library.

## 8. Integration handoff between backend and frontend

For each screen, record: screen ID; persona; permission; route; request/response OpenAPI reference; example fixtures for success, empty, validation, forbidden, conflict, error; allowed state transitions; fields and limits; localization keys; test case IDs; backend owner and frontend owner. Review this together before implementation of the screen.

**Recommended integration order:** (1) gateway login, `/me`, tenant membership; (2) tenant provisioning job; (3) organization + employee list/create + user role assignment; (4) policy read; (5) claim create/upload/submit; (6) approval; (7) settlement/export and payment evidence. Mock earlier API contracts so UI development can proceed before backend availability. On each backend slice, replace mocks with real DEV integration, compare network payloads with OpenAPI, and update fixtures. Never mark a mocked E2E test as proof of backend integration.

### Contract questions to close first

| Decision | Status | Owner / evidence needed |
| --- | --- | --- |
| Frontend framework, repo, package manager | **CLOSED**: Angular, `tcms-frontend`, npm (D1, D6, D14) | CI system still `OPEN` until repos are created |
| Deploy target and gateway base URL | **CLOSED** shape: same origin, `/api/**` via gateway (D16); hosting provider `OPEN` | Backend/infra; working DEV endpoint |
| Authentication | **CLOSED**: Keycloak + BFF session cookie (D4, D5) | Tenant switch semantics for multi-tenant users `OPEN`; identity owner; flow diagram |
| Error format | **CLOSED**: `ProblemDetail` + `code`/`traceId`/`fieldErrors` (D8) | Backend; error code catalog `OPEN` |
| Pagination and concurrency | **PROPOSED** by frontend in `tcms-frontend/contracts/openapi.yaml`: Spring Data `PagedModel` JSON (`?page` 0-based, `size`, `sort=field,dir`; `{content, page:{size, number, totalElements, totalPages}}`), weak ETags `W/"<version>"` with `If-Match` and 412 | Backend to accept or counter-propose |
| API versioning, permission catalog | `OPEN` | Backend; OpenAPI examples |
| Employee fields/identity linkage and import template | `OPEN` | HR/backend; approved field dictionary |
| Claim states, policy checks, upload limits and amount calculation | **PROPOSED** in `tcms-frontend/contracts/openapi.yaml`: server returns `totalAmount`, `findings[]` (code, severity INFO/WARNING/BLOCKING, itemIndex, params) and `allowedActions[]`; submit fails with 422 `CLAIM_HAS_BLOCKING_FINDINGS`; presigned upload → `complete` → scan status AWAITING_UPLOAD/SCANNING/CLEAN/REJECTED; money as decimal strings | Claims/backend; confirm finding codes, limits (mock: 5 MB, JPEG/PNG/WebP/PDF, 20 per claim) and state diagram |
| Approval and settlement transitions, payment evidence | **PROPOSED** in `tcms-frontend/contracts/openapi.yaml`: route fixed at submission (line/department manager, fallback, optional second approval above an amount), `allowedDecisions[]`, reason required to reject or request changes, 403 `SELF_APPROVAL`, 409/412 on a decided claim; batches DRAFT → EXPORT_PENDING → EXPORT_CREATED/EXPORT_FAILED → PAYMENT_RECORDED, export as a job, claims SETTLED only when payment evidence is recorded | Approval/finance owner; confirm rules, delegation and export formats (mock offers CSV only) |
| First-release screen list and Arabic/English priority | **CLOSED**: MVP screens per §3, both languages (D15) | Product/design; design links `OPEN` |
| Async job status, polling limits and export file lifecycle | **CLOSED** approach: database-backed jobs + polling (D12); limits `OPEN` | Backend; contract + DEV demo |

A decision remaining open is recorded as `OPEN`; the frontend can use a mock but must not treat it as backend behavior. A closed decision receives a link to the OpenAPI revision or approved product rule.

## 9. Delivery plan and CI

Two-week sprints; full detail in [TCMS_PROJECT_STRATEGY.md §3](TCMS_PROJECT_STRATEGY.md).

| Sprint | Weeks | Frontend scope | Tests |
| --- | --- | --- | --- |
| 0 — Foundations | 1–2 | Repo, Angular Material + design tokens, Arabic/English + RTL, routing shell (A01, A03, A04), `/config.json` loader, generated client, interceptors, guards, mock server, CI | Unit tests for error mapper, guards, formatters |
| 1–2 | 3–6 | T01–T03, O01–O02, H01–H02, I01 — **built against mocks 2026-09-24**, awaiting backend | FE-001, FE-002, FE-009, FE-010, FE-012, FE-013, FE-016 (mocked); FE-011 needs a second tenant in DEV |
| 3–4 | 7–10 | P01 (minimal), C01–C04 — **built against mocks 2026-09-24**, awaiting backend | FE-004, FE-005, FE-007 (employee side), FE-015 (unit), FE-017 (mocked) |
| 5–6 | 11–14 | P02, V01–V02, F01–F02 — **built against mocks 2026-09-24**, awaiting backend | FE-006, FE-007 (reviewer side), FE-008, FE-010 (decisions and batching), FE-012, FE-016 (mocked) |
| 7 — Hardening | 15–16 | Accessibility, RTL, security and performance review; STAGING soak; pilot release | FE-003 and FE-014 across all MVP screens |

After MVP: I02 role editor, H03 bulk import, R01 reports, then Phases 08–14 behind feature flags.

**PR gate:** clean install, lint, typecheck, unit/component tests, generated client up to date, mocks valid against pinned OpenAPI, mocked E2E smoke, production build, accessibility checks for changed screens, dependency vulnerability scan. DEV integrated smoke runs when API/environment exist; record which tests are mocked versus real. No secrets in Git, source maps or browser bundle. Use feature flags for incomplete later screens, and keep routes inaccessible until backend contract and permission are ready.

### Non-functional baseline

- **Security headers** (set by gateway/nginx): strict Content-Security-Policy (no inline scripts, `connect-src 'self'` plus the object-storage host for presigned uploads), HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`.
- **Browser support:** current and previous major versions of Chrome, Edge, Safari (macOS and iOS) and Firefox. No Internet Explorer.
- **Performance budget:** initial JS bundle ≤ 500 KB compressed with lazy-loaded feature routes; main screens interactive in under 3 s on a mid-range phone over 4G. Enforced with Angular build budgets.
- **Error reporting (D18):** frontend errors go to the chosen error-reporting tool, tagged with environment, release, screen ID, and backend `traceId`; no personal data or receipt content in reports.
- **Screens calling several APIs:** show the page when the primary resource loads; secondary panels (timeline, policy findings) have their own loading and error states and a retry, so one failure does not blank the page.

## 10. Immediate handoff checklist

- [ ] Frontend lead creates `tcms-frontend` (Angular strict + Angular Material + Vitest + Playwright) — done 2026-09-24, see `tcms-frontend/` and owns design-system setup.
- [ ] Infra owner delivers `tcms-infra` docker-compose (PostgreSQL, Keycloak with realm export, MinIO, ClamAV, gateway) so the SPA can sign in locally.
- [ ] Backend owner publishes initial OpenAPI for `/me`, tenant context, employee and claim vertical slice.
- [ ] Both sides sign off pagination, date/money, upload, concurrency and job contracts (error format already fixed by D8).
- [ ] Designer supplies screen flows with empty/loading/error/RTL/mobile states; map each to IDs above.
- [ ] Frontend builds with mocks and demonstrates FE-001, FE-002, FE-004, FE-006, FE-008.
- [ ] Integrate the same journey with DEV API and run FE-009 through FE-011 before declaring integration ready.

**Source alignment:** TCMS Phase 00 execution register and step-by-step runbook (2026-09-20) define the product direction, tenant separation, ownership and phased scope. [TCMS_PROJECT_STRATEGY.md](TCMS_PROJECT_STRATEGY.md) (2026-09-24) fixes the stack, architecture and delivery plan (D1–D19). This document is the frontend implementation guide built on both; endpoint names, exact schemas, and release boundaries await review against the backend OpenAPI.
