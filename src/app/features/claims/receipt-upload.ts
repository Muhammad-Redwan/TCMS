import { inject, Service } from '@angular/core';
import { Api } from '../../api/api';
import { completeReceiptUpload, createReceiptUpload } from '../../api/functions';
import { Receipt, ReceiptUploadPolicy } from '../../api/models';
import { newIdempotencyKey } from '../../core/http/versioned';

export type UploadRejection = 'UNSUPPORTED_MEDIA_TYPE' | 'PAYLOAD_TOO_LARGE' | 'TOO_MANY_RECEIPTS';

/** Extension check is only a first filter: the backend scans the bytes (guide §4 "Files"). */
const EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
};

/** Client-side pre-check (FE-005). A rejected file is never sent or shown as attached. */
export function precheck(
  file: File,
  policy: ReceiptUploadPolicy,
  attachedCount: number,
): UploadRejection | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const typeAllowed = policy.allowedContentTypes.includes(file.type);
  const extensionMatches = (EXTENSIONS[file.type] ?? []).includes(extension);
  if (!typeAllowed || !extensionMatches) return 'UNSUPPORTED_MEDIA_TYPE';
  if (file.size > policy.maxFileSizeBytes) return 'PAYLOAD_TOO_LARGE';
  if (attachedCount >= policy.maxReceiptsPerClaim) return 'TOO_MANY_RECEIPTS';
  return null;
}

export class StorageUploadError extends Error {
  constructor(readonly status: number) {
    super(`Upload to storage failed (HTTP ${status})`);
  }
}

/**
 * Presigned upload flow (D11): reserve a slot from the API, PUT the bytes straight to object
 * storage, then confirm. XMLHttpRequest is used for the PUT because it reports upload progress
 * (fetch does not) and, unlike the app's HttpClient, sends no cookies or CSRF headers to storage.
 */
@Service()
export class ReceiptUploader {
  private readonly api = inject(Api);

  async upload(
    claimId: string,
    file: File,
    onProgress: (percent: number) => void,
  ): Promise<Receipt> {
    const slot = await this.api.invoke(createReceiptUpload, {
      claimId,
      'Idempotency-Key': newIdempotencyKey(),
      body: { fileName: file.name, contentType: file.type, sizeBytes: file.size },
    });
    await this.put(slot.uploadUrl, slot.headers, file, onProgress);
    return this.api.invoke(completeReceiptUpload, { claimId, receiptId: slot.receiptId });
  }

  private put(
    url: string,
    headers: Record<string, string>,
    file: File,
    onProgress: (percent: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new StorageUploadError(xhr.status));
      xhr.onerror = () => reject(new StorageUploadError(0));
      xhr.send(file);
    });
  }
}
