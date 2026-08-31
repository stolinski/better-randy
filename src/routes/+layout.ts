// The whole app renders client-side: GFX is a local-first editor whose pages
// are canvases and panels, not documents. Server routes (/api/*) are untouched;
// the release identity meta lives in app.html, so the shell still declares it.
export const ssr = false;
