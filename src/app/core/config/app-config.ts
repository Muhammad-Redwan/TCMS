import { InjectionToken } from '@angular/core';

export type Locale = 'ar' | 'en';

/**
 * Runtime settings loaded from /config.json at startup (D17).
 * One build is promoted through environments; each environment serves its own config.json.
 * Never put secrets, tokens or internal service URLs here: this file is public.
 */
export interface AppConfig {
  /** Base path of the same-origin API behind the gateway (D16). */
  apiBasePath: string;
  /** Gateway endpoint that starts OIDC login with Keycloak (D5). */
  loginPath: string;
  /** Gateway endpoint that ends the session; called with POST + CSRF. */
  logoutPath: string;
  defaultLocale: Locale;
  supportedLocales: Locale[];
  featureFlags: Record<string, boolean>;
  errorReporting?: { dsn: string; environment: string };
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

const REQUIRED_KEYS: (keyof AppConfig)[] = [
  'apiBasePath',
  'loginPath',
  'logoutPath',
  'defaultLocale',
  'supportedLocales',
];

export async function loadAppConfig(fetchFn: typeof fetch = fetch): Promise<AppConfig> {
  const response = await fetchFn('/config.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Cannot load /config.json (HTTP ${response.status})`);
  }
  const raw = (await response.json()) as Partial<AppConfig>;
  const missing = REQUIRED_KEYS.filter((key) => raw[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`/config.json is missing: ${missing.join(', ')}`);
  }
  return { featureFlags: {}, ...raw } as AppConfig;
}
