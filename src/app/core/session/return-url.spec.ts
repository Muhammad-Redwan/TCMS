import { isSafeReturnUrl, rememberReturnUrl, takeReturnUrl } from './return-url';

describe('return URL', () => {
  beforeEach(() => sessionStorage.clear());

  it.each(['/claims', '/claims/clm_1?tab=receipts', '/approvals#top'])(
    'accepts app path %s',
    (url) => {
      expect(isSafeReturnUrl(url)).toBe(true);
    },
  );

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'claims',
    '/login?returnUrl=/x',
    '',
    null,
    undefined,
  ])('rejects %s', (url) => {
    expect(isSafeReturnUrl(url)).toBe(false);
  });

  it('is consumed once', () => {
    rememberReturnUrl('/claims');
    expect(takeReturnUrl()).toBe('/claims');
    expect(takeReturnUrl()).toBeNull();
  });

  it('never stores an unsafe URL', () => {
    rememberReturnUrl('//evil.example');
    expect(takeReturnUrl()).toBeNull();
  });
});
