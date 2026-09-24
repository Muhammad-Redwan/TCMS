/**
 * Mock object storage for receipt files. Small files are kept in localStorage so previews
 * survive a reload; larger ones only in memory (they then show as unavailable after reload).
 */
const PREFIX = 'tcms.mock.file.';
const PERSIST_LIMIT = 1_500_000;
const memory = new Map<string, { bytes: Uint8Array; type: string }>();

export function putFile(id: string, bytes: Uint8Array, type: string): void {
  memory.set(id, { bytes, type });
  if (bytes.length > PERSIST_LIMIT) return;
  try {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    localStorage.setItem(PREFIX + id, JSON.stringify({ type, data: btoa(binary) }));
  } catch {
    // Storage full: memory copy only.
  }
}

export function getFile(id: string): { bytes: Uint8Array; type: string } | null {
  const cached = memory.get(id);
  if (cached) return cached;
  try {
    const stored = localStorage.getItem(PREFIX + id);
    if (!stored) return null;
    const { type, data } = JSON.parse(stored) as { type: string; data: string };
    const binary = atob(data);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    memory.set(id, { bytes, type });
    return { bytes, type };
  } catch {
    return null;
  }
}

export function deleteFile(id: string): void {
  memory.delete(id);
  try {
    localStorage.removeItem(PREFIX + id);
  } catch {
    // ignore
  }
}

/** Removes every stored receipt file (used by "Reset mock data"). */
export function clearFiles(): void {
  memory.clear();
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
}
