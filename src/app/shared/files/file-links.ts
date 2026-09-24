/**
 * Opening and downloading files from short-lived presigned URLs (D11).
 *
 * Files are fetched (no cookies sent) and handed to the browser as blob: URLs instead of
 * navigating to the storage URL. That keeps the page in place, lets the app name downloads,
 * and works with the mock service worker, which does not see navigations. Object storage must
 * allow GET from the app origin (CORS) for this to work against real buckets.
 */

async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`File request failed (HTTP ${response.status})`);
  return response.blob();
}

/** Saves the file under `fileName`. */
export async function downloadFile(url: string, fileName: string): Promise<void> {
  const objectUrl = URL.createObjectURL(await fetchBlob(url));
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/**
 * Opens a file in a new tab. The tab is opened synchronously (inside the click) so popup
 * blockers allow it, then pointed at the file once `resolveUrl` has produced a signed URL.
 */
export async function openFileInNewTab(resolveUrl: () => Promise<string>): Promise<void> {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const objectUrl = URL.createObjectURL(await fetchBlob(await resolveUrl()));
    if (tab) tab.location.href = objectUrl;
    else window.location.assign(objectUrl);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
