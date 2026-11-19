// "Export PDF" for every document page (press release, press kit, call sheet, show sheet, show
// plan, stage plot, tour sheet, money, calendar). Browsers have no built-in "make a PDF" call, so
// the document is printed from a hidden frame and you pick "Save as PDF" as the printer. No pop-up
// is opened, so pop-up blockers don't get in the way.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const escBr = (s) => esc(s).replace(/\n/g, '<br>');

/** Plain print styles shared by the documents: A4/Letter friendly, black on white. */
export const DOC_CSS = `@page{margin:14mm}*{box-sizing:border-box}body{font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;color:#111;background:#fff}
h1{font-size:22px;margin:0 0 2px}h2{font-size:14px;margin:18px 0 6px;padding-bottom:3px;border-bottom:1px solid #bbb;text-transform:uppercase;letter-spacing:.04em}
.meta{color:#555;margin:0 0 10px}table{border-collapse:collapse;width:100%;margin:4px 0}td,th{border:1px solid #bbb;padding:4px 7px;text-align:left;vertical-align:top}
th{background:#f1f1f1}td.n,th.n{text-align:right;white-space:nowrap}.muted{color:#666}.small{font-size:11px}ul,ol{margin:4px 0;padding-left:20px}li{margin:2px 0}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}.box{border:1px solid #bbb;padding:8px 10px;border-radius:4px}.foot{margin-top:24px;color:#777;font-size:10px}
tr,li,.box{break-inside:avoid}h2{break-after:avoid}`;

/** A complete document page with the shared styles. `body` is trusted HTML built with esc(). */
export function docHTML(title, body, { subtitle = '', css = '' } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOC_CSS}${css}</style></head><body>
<h1>${esc(title)}</h1>${subtitle ? `<p class="meta">${esc(subtitle)}</p>` : ''}
${body}
<p class="foot">Made with Band Manager</p></body></html>`;
}

/** The last document sent to print (the browser checks read it). */
export const lastDoc = { title: '', html: '' };

/**
 * Print `html` from a hidden frame so you can save it as a PDF. The frame's title becomes the
 * suggested file name in most browsers.
 */
export function exportPDF(html, title = 'document') {
  lastDoc.title = title;
  lastDoc.html = html;
  document.querySelectorAll('iframe.pdf-frame').forEach((f) => f.remove());
  const frame = document.createElement('iframe');
  frame.className = 'pdf-frame';
  frame.title = `Print ${title}`;
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.addEventListener('load', () => {
    const w = frame.contentWindow;
    if (!w) return;
    // images (the press kit's photos) need a moment to decode before printing
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch {
        /* a browser that blocks printing from a frame: the document is still in lastDoc */
      }
    }, 300);
  });
  frame.srcdoc = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  document.body.append(frame);
  return frame;
}

/** File-name friendly slug for a document title. */
export const docSlug = (s) => String(s || 'document').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'document';
