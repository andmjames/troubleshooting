// Renders a single PDF page to a PNG data URL, entirely in the browser.
// pdf.js is loaded from a CDN at runtime so it never goes through the build —
// that keeps it out of webpack (no bundler/worker headaches) and out of the deploy.

const PDFJS_VERSION = '3.11.174';
let pdfjsPromise = null;

function loadPdfjs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
    s.async = true;
    s.onload = () => {
      const lib = window.pdfjsLib;
      if (!lib) { reject(new Error('PDF viewer failed to load')); return; }
      lib.GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
      resolve(lib);
    };
    s.onerror = () => reject(new Error('PDF viewer failed to load'));
    document.head.appendChild(s);
  });
  return pdfjsPromise;
}

// Cache rendered pages for the session so re-opening is instant.
const cache = new Map();

export async function renderPdfPage(url, pageNumber, { scale = 1.6 } = {}) {
  const key = `${url}#${pageNumber}`;
  if (cache.has(key)) return cache.get(key);

  const pdfjsLib = await loadPdfjs();
  const doc = await pdfjsLib.getDocument({ url }).promise;
  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/png');
    cache.set(key, dataUrl);
    return dataUrl;
  } finally {
    try { doc.destroy(); } catch { /* ignore */ }
  }
}
