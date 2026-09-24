import { http, HttpResponse } from 'msw';
import { AppConfig } from '../app/core/config/app-config';
import { PERSONA_STORAGE_KEY, PERSONAS } from './personas';

/** Mock mode signs in through a local page instead of the gateway + Keycloak. */
export const MOCK_LOGIN_PATH = '/mock/sign-in';
const MOCK_LOGOUT_PATH = '/mock/sign-out';

const mockConfig: AppConfig = {
  apiBasePath: '/api',
  loginPath: MOCK_LOGIN_PATH,
  logoutPath: MOCK_LOGOUT_PATH,
  defaultLocale: 'en',
  supportedLocales: ['en', 'ar'],
  featureFlags: {},
};

function problem(status: number, code: string) {
  return HttpResponse.json(
    { type: 'about:blank', title: code, status, code, traceId: `mock-${Date.now().toString(16)}` },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

function currentPersona() {
  const key = localStorage.getItem(PERSONA_STORAGE_KEY);
  return key ? PERSONAS[key] : undefined;
}

export const handlers = [
  http.get('/config.json', () => HttpResponse.json(mockConfig)),

  http.get('/api/v1/me', () => {
    const me = currentPersona();
    return me ? HttpResponse.json(me) : problem(401, 'UNAUTHENTICATED');
  }),

  http.post(MOCK_LOGOUT_PATH, () => {
    localStorage.removeItem(PERSONA_STORAGE_KEY);
    return new HttpResponse(null, { status: 204, headers: { Location: '/login' } });
  }),

  // Any API route not mocked yet answers like a real missing endpoint would.
  http.all('/api/*', () => problem(404, 'NOT_FOUND')),
];
