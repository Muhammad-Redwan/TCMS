import { HttpContextToken } from '@angular/common/http';

/** Set on requests whose 401 is an expected answer (e.g. the initial /me probe). */
export const SKIP_LOGIN_REDIRECT = new HttpContextToken<boolean>(() => false);
