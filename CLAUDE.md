You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is the default in Angular v22+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `model()` for two-way bound properties with `[(prop)]` syntax instead of pairing `input()` with `output()`
- Use `computed()` for derived state
- Use `linkedSignal()` for state derived from multiple reactive sources that must stay synchronized
- Prefer inline templates for small components
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation
- When not using Signal Forms, prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- Do NOT import `CommonModule`, import only the directives and pipes the template uses, such as `AsyncPipe` or `DatePipe`
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
- Use the `inject()` function instead of constructor injection

## TCMS project rules

These come from the frontend guide (`../TCMS_FRONTEND_README.md`) and strategy (`../TCMS_PROJECT_STRATEGY.md`).

- Never edit `src/app/api/` by hand. Change `contracts/openapi.yaml`, then run `npm run api:generate`.
- Never store tokens, passwords or tenant IDs the server should trust in browser storage. Auth is a gateway session cookie (D5).
- Every user-facing string goes in both `public/i18n/en.json` and `public/i18n/ar.json`. Use CSS logical properties (`margin-inline`, `inset-inline-start`), never `left`/`right`. Wrap user-provided text in `<bdi>` when it sits inside translated text.
- Use Angular Material components and `--mat-sys-*` tokens. Do not add another UI library without an ADR.
- Show server errors by `ApiError.code` translation key plus trace ID, never the server's `title`/`detail` text.
- Money and totals come from the backend as decimal strings; never compute authoritative amounts in the client.
- Mock data is fabricated only (`src/mocks/personas.ts`); never use real employee data.
- Before finishing a change, run: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e` for UI flows.

### Feature patterns (follow the existing screens)

- **Forms use typed Reactive Forms, not Signal Forms** (decided 2026-09-24): Angular Material 22 has no built-in Signal Forms integration, so error states would break. Revisit when Material supports it.
- Load data with `resource()` + `Api.invoke`; show `mat-progress-bar` while loading, `<app-error-alert>` with retry on error, and a distinct empty state vs "no results for these filters".
- Lists keep page/size/sort/search/filters in the URL via `ListQueryState`; the server sorts and filters.
- Edits: read with `invoke$Response` + `versioned()` and send the ETag as `If-Match`; on 409/412 show the `.conflict` block with "Load latest version", never a success message.
- Creates send `Idempotency-Key` from `newIdempotencyKey()`, created once per form and replaced only after success.
- Server field errors go through `applyServerErrors()` then `focusFirstInvalid(host, injector)`; field messages come from `<app-field-error>` (`validation.*` / `validation.server.<CODE>` keys).
- Edit pages implement `HasUnsavedChanges` and use `unsavedChangesGuard`.
- Async jobs: `JobPoller.watch(jobId)`; unsubscribe on destroy; re-read the owning resource when the job ends.
- Dates: `tenantDate` pipe (tenant time zone, date-only values never shifted).
- Pickers over large lists (employees) search the server, like `EmployeePicker`; never load a full list into a select.
- Every new endpoint gets an MSW handler in `src/mocks/api/` that behaves like the contract: permissions (403), validation (422 + fieldErrors), If-Match (412), Idempotency-Key replay.
- E2E: in Playwright use `getByLabel(text, { exact: true })` (labels match substrings by default) and wait for dialogs to focus before typing.
