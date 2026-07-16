// Browser-side PDF rendering. pdf.js is loaded from a CDN at runtime so it never
// goes through the build (no webpack/worker headaches) and stays out of the deploy.

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

// Cache the loaded PDF document per URL so the viewer can render many pages without
// re-downloading, and thumbnails reuse the same document.
const docCache = new Map();

export async function getPdf(url) {
  if (docCache.has(url)) return docCache.get(url);
  const p = (async () => {
    const pdfjsLib = await loadPdfjs();
    return pdfjsLib.getDocument({ url }).promise;
  })();
  p.catch(() => { if (docCache.get(url) === p) docCache.delete(url); });
  docCache.set(url, p);
  return p;
}

// Render a page of an already-loaded document to a PNG data URL.
export async function renderPageToDataUrl(doc, pageNumber, scale) {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/png');
}

// Cache single rendered thumbnail pages for the session.
const thumbCache = new Map();

export async function renderPdfPage(url, pageNumber, { scale = 2.2 } = {}) {
  const key = `${url}#${pageNumber}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const doc = await getPdf(url);
  const dataUrl = await renderPageToDataUrl(doc, pageNumber, scale);
  thumbCache.set(key, dataUrl);
  return dataUrl;
}
