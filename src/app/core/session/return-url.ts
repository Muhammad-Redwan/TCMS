const KEY = 'tcms.returnUrl';

/**
 * Only same-app relative paths are accepted, so a crafted link cannot turn the
 * post-login redirect into an open redirect (e.g. "//evil.com" or "https://...").
 */
export function isSafeReturnUrl(url: string | null | undefined): url is string {
  return (
    typeof url === 'string' &&
    url.startsWith('/') &&
    !url.startsWith('//') &&
    !url.startsWith('/\\') &&
    !url.startsWith('/login')
  );
}

export function rememberReturnUrl(url: string): void {
  if (!isSafeReturnUrl(url)) return;
  try {
    sessionStorage.setItem(KEY, url);
  } catch {
    // Storage unavailable (private mode): user lands on the home page instead.
  }
}

export function takeReturnUrl(): string | null {
  try {
    const url = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return isSafeReturnUrl(url) ? url : null;
  } catch {
    return null;
  }
}
