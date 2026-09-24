# tcms-frontend

Angular frontend for **TCMS — Transportation Claim Management System**.

- Scope, screens, contract rules and tests: [TCMS_FRONTEND_README.md](../TCMS_FRONTEND_README.md) (the "frontend guide")
- Stack and architecture decisions D1–D19: [TCMS_PROJECT_STRATEGY.md](../TCMS_PROJECT_STRATEGY.md)

## Stack

Angular 22 (standalone, zoneless, strict TypeScript) · Angular Material 3 · Transloco (Arabic/English, RTL) · ng-openapi-gen · Vitest · Playwright · MSW · ESLint + Prettier

## Getting started

Requires Node 24+.

```bash
npm ci
```

```bash
npm run start:mock
```

Open http://localhost:4200, choose **Continue to sign in**, then pick a fabricated persona. Mock mode needs no backend: [MSW](https://mswjs.io) answers `/config.json` and `/api/**` from `src/mocks/`.

To run against the local backend stack (`tcms-infra` docker-compose with the gateway on port 8080):

```bash
npm run start:local
```

`proxy.local.json` forwards `/api`, `/oauth2`, `/login/oauth2` and `/logout` to the gateway so the browser stays same-origin (D16). The gateway's Keycloak client must allow `http://localhost:4200/login/oauth2/code/*` as a redirect URI.

## Scripts

| Script | Purpose |
| --- | --- |
| `start:mock` | Dev server with mocked API and personas |
| `start:local` | Dev server proxied to the local gateway |
| `api:generate` | Regenerate `src/app/api` from `contracts/openapi.yaml` |
| `api:check` | Fail if the generated client is out of date (CI) |
| `lint` / `format` / `format:check` | ESLint and Prettier |
| `typecheck` | Strict TypeScript for app and tests |
| `test` / `test:watch` | Vitest unit and component tests |
| `test:e2e` | Playwright against the mock build (Chromium desktop + mobile) |
| `build` | Production build to `dist/tcms-frontend/browser` |

First-time E2E setup: `npx playwright install chromium`.

## Layout

```text
contracts/openapi.yaml       pinned API contract (currently a frontend-written DRAFT; replace with backend spec)
src/app/api/                 generated client — never edit by hand
src/app/core/                config loader, session, guards, interceptor, errors, i18n, navigation
src/app/layout/              app shell (A03)
src/app/features/<feature>/  one folder per feature: routes, pages, components, adapters, tests
src/mocks/                   MSW handlers, personas, mock sign-in (mock build only)
public/config.json           runtime settings for local dev; replaced per environment at deploy
public/i18n/{en,ar}.json     translations
e2e/                         Playwright journeys
deploy/                      nginx config and security headers for the container image
```

## How the pieces fit

- **Runtime config (D17).** `main.ts` fetches `/config.json` before bootstrapping, so the same build runs in every environment. Nothing in that file may be secret.
- **Sign-in (D5).** The SPA never handles tokens or passwords. `SessionService` calls `GET /api/v1/me`. On 401 the user goes to `/login`, which hands off to the gateway (`loginPath`), which runs OIDC with Keycloak. The requested URL is kept in `sessionStorage` (relative paths only) and restored after sign-in.
- **HTTP.** `apiInterceptor` marks API calls as XHR, converts failures to `ApiError` from RFC 9457 `ProblemDetail` (D8), and redirects once to login on 401. Angular's built-in XSRF support sends Spring Security's `XSRF-TOKEN` cookie back as `X-XSRF-TOKEN`.
- **Permissions.** `permissionGuard('x.y')` protects routes and `NAV_ITEMS` hides links; the backend remains the authority.
- **Language.** `LocaleService` switches Transloco and sets `<html lang dir>`. Styles use CSS logical properties, and user-provided text is wrapped in `<bdi>` or `dir` so Latin names render correctly inside Arabic.
- **Mocks.** The `mock` build configuration swaps `src/mocks/enable-mocks.ts` for `enable-mocks.mock.ts`, so MSW and fake data never ship in production bundles.

## Deployment

```bash
docker build -t tcms-frontend .
```

The image serves the build with nginx on port 8080, with security headers from `deploy/security-headers.conf`. Mount the environment's `config.json` at `/usr/share/nginx/html/config.json`. The gateway in front routes `/api/**` and the login/logout endpoints to the backend.

## Status

Sprint 0 foundations done. Sprint 1 screens are built against the mock API: tenants with provisioning (T01–T02), company setup (T03), organization profile and departments (O01–O02), employees (H01–H02), users and role assignment (I01). Sprint 3–4 screens are built too: policy versions with draft/publish/new-version (P01), my claims (C01), claim create/edit with trips, receipts, server-calculated total, policy findings and submit (C02–C03), and receipt detail (C04). Sprint 5–6 completes the first end-to-end flow: approval routing (P02), my approval queue and decision page (V01–V02), and settlement with batches, CSV export as a background job, and payment evidence (F01–F02). Other screens are placeholders naming their screen ID and sprint. `contracts/openapi.yaml` is still a frontend-written draft awaiting the backend spec; see the guide §9 for the sprint plan.

In mock mode, a tenant whose name contains "fail" fails provisioning so the failure and retry path can be tried. A receipt whose file name contains "virus" or "eicar" fails the security scan, and one whose bytes do not match its type is rejected. The Employee Demo persona has a claim waiting for changes (CLM-2026-0117), Approver Demo has three claims to decide, and Finance Demo has four approved claims ready to settle. **Reset mock data** on the mock sign-in page restores the seed data.
