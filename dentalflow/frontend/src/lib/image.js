/**
 * Phone photos are often 3–8 MB. Before uploading, large JPEG/PNG/WebP photos are
 * resized to at most 2000 px on the long side (still plenty for clinical photos and
 * X-ray snaps) — uploads finish much faster on mobile data.
 */
const MAX_SIDE = 2000;
const SKIP_BELOW = 900 * 1024;

export async function prepareUpload(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < SKIP_BELOW) return file;
  try {
    const bitmap = await loadImage(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.(png|webp|jpe?g|heic)$/i, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

async function loadImage(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall back to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const isImageUrl = (url = '') => /\.(jpe?g|png|gif|webp|bmp|avif)(\?|$)/i.test(url);
export const isPdfUrl = (url = '') => /\.pdf(\?|$)/i.test(url);
