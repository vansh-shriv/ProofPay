import type { UploadImage } from './api';

export const MAX_IMAGES = 3;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_SIDE = 1280;

export interface PreparedImage extends UploadImage {
  /** data: URL for the thumbnail in the form. */
  preview: string;
}

/** Shrink a picked/pasted/dropped image in the browser (max 1280px, JPEG) so uploads stay small and fast. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ALLOWED.includes(file.type)) throw new Error(`"${file.name || 'That file'}" is not a PNG, JPEG, WebP or GIF image.`);
  if (file.size > 15 * 1024 * 1024) throw new Error(`"${file.name}" is larger than 15 MB.`);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; // flatten transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not process the image'))), 'image/jpeg', 0.82));
  const preview: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('Could not read the image'));
    r.readAsDataURL(blob);
  });
  const base = (file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
  return { name: `${base}.jpg`, type: 'image/jpeg', data: preview.split(',')[1], preview };
}
