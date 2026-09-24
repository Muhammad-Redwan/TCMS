import { http, HttpResponse } from 'msw';
import { AppConfig } from '../app/core/config/app-config';
import { claimHandlers } from './api/claims';
import { employeeHandlers } from './api/employees';
import { organizationHandlers } from './api/organization';
import { policyHandlers } from './api/policies';
import { tenantHandlers } from './api/tenants';
import { userHandlers } from './api/users';
import { currentPersona, problem } from './http-helpers';
import { PERSONA_STORAGE_KEY } from './personas';

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

  ...organizationHandlers,
  ...employeeHandlers,
  ...tenantHandlers,
  ...userHandlers,
  ...policyHandlers,
  ...claimHandlers,

  // Any API route not mocked yet answers like a real missing endpoint would.
  http.all('/api/*', () => problem(404, 'NOT_FOUND')),
];
