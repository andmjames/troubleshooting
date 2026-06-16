// Downscale + re-encode an image in the browser before upload, so photos stay
// small (faster uploads, and within the model's per-image size limit). Falls back
// to the original file if anything goes wrong.
export async function compressImage(file, { maxDim = 1568, quality = 0.82 } = {}) {
  if (!file || !file.type || !file.type.startsWith('image/')) return file;
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('read failed'));
      r.readAsDataURL(file);
    });
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('decode failed'));
      im.src = dataUrl;
    });
    let { width, height } = img;
    if (!width || !height) return file;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob || file;
  } catch {
    return file;
  }
}
