import type { ImageInput } from './ai/types';

/** What the browser sends: base64 (no data: prefix) plus the type it claims. */
export interface ImageUpload {
  name: string;
  type: string;
  data: string;
}

export interface ValidImage {
  name: string;
  mime: string;
  bytes: Buffer;
}

export class AttachmentError extends Error {}

export const MAX_IMAGES = 3;
export const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 6 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

/** Identify an image by its first bytes, never by what the client says it is. */
export function sniffImage(b: Buffer): (typeof ALLOWED)[number] | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/** Validate uploads: count, size, base64, allowed type, and that the bytes really are that image type (SVG and friends are refused). */
export function validateAttachments(uploads: ImageUpload[] | undefined): ValidImage[] {
  const list = uploads ?? [];
  if (list.length > MAX_IMAGES) throw new AttachmentError(`At most ${MAX_IMAGES} images per job`);
  let total = 0;
  return list.map((u, i) => {
    if (!(ALLOWED as readonly string[]).includes(u.type)) throw new AttachmentError(`Image ${i + 1}: only PNG, JPEG, WebP or GIF are allowed`);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(u.data)) throw new AttachmentError(`Image ${i + 1}: not valid base64`);
    const bytes = Buffer.from(u.data, 'base64');
    if (bytes.length === 0) throw new AttachmentError(`Image ${i + 1} is empty`);
    if (bytes.length > MAX_IMAGE_BYTES) throw new AttachmentError(`Image ${i + 1} is larger than ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(1)} MB`);
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) throw new AttachmentError(`Images together are larger than ${MAX_TOTAL_BYTES / 1024 / 1024} MB`);
    const real = sniffImage(bytes);
    if (real !== u.type) throw new AttachmentError(`Image ${i + 1}: the file content does not match its type`);
    // eslint-disable-next-line no-control-regex
    const name = (u.name || `image-${i + 1}`).replace(/[\u0000-\u001f\u007f<>"'\\/]/g, '').slice(0, 80) || `image-${i + 1}`;
    return { name, mime: real, bytes };
  });
}

export const toImageInputs = (images: ValidImage[]): ImageInput[] => images.map((i) => ({ mimeType: i.mime, data: i.bytes.toString('base64') }));
