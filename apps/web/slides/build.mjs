/**
 * Builds the pitch and demo decks as click-through HTML: each slide animates
 * in by itself, and the presenter only clicks (or presses → / Space) to move
 * on. ← goes back, F is full screen, N shows the speaker notes, and a swipe
 * works on a phone.
 *
 *   npm run slides
 *
 * Two variants of each deck:
 * - apps/web/public/decks/tessera-<name>-slides.html, served by the site. Its
 *   script is the separate file decks/slides.js, because the site's
 *   Content-Security-Policy only runs scripts loaded from the site itself.
 * - apps/web/slides/dist/tessera-<name>-slides.html, one self-contained file
 *   with the script inline, for opening from disk without a connection
 *   (fonts then fall back to the system's).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const decks = resolve(here, '../public/decks');
const dist = join(here, 'dist');
mkdirSync(dist, { recursive: true });

// The four-tile mark the site's nav and footer use.
const MARK = '<rect x="1" y="1" width="12" height="12" rx="3" fill="#5EE6AB"/><rect x="15.8" y="1.8" width="10.4" height="10.4" rx="2.4" fill="none" stroke="#E8EDE9" stroke-width="1.6"/><rect x="1.8" y="15.8" width="10.4" height="10.4" rx="2.4" fill="none" stroke="#E8EDE9" stroke-width="1.6"/><rect x="15" y="15" width="12" height="12" rx="3" fill="#F5BE55"/>';
const LOGO = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 28 28" aria-label="Tessera logo">${MARK}</svg>`;
const FAVICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0B0E0D"/><g transform="translate(11 11) scale(1.5)"><rect x="1" y="1" width="12" height="12" rx="3" fill="#5EE6AB"/><rect x="15.8" y="1.8" width="10.4" height="10.4" rx="2.4" fill="none" stroke="#E8EDE9" stroke-width="1.6"/><rect x="1.8" y="15.8" width="10.4" height="10.4" rx="2.4" fill="none" stroke="#E8EDE9" stroke-width="1.6"/><rect x="15" y="15" width="12" height="12" rx="3" fill="#F5BE55"/></g></svg>')}`;

// The site's design (apps/web/src/styles.css, landing.css): Bricolage Grotesque headings with the
// accent in mint, Geist text, Geist Mono labels and code, on the dark surface.
const STYLE = `
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #000; overflow: hidden; cursor: pointer; -webkit-font-smoothing: antialiased; touch-action: manipulation; }
#stage { position: fixed; left: 50%; top: 50%; width: 1920px; height: 1080px; transform-origin: 0 0; }
section { position: absolute; inset: 0; overflow: hidden; padding: 96px 110px; background: #0B0E0D; color: #A3ADA7; font-family: 'Geist', ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 26px; display: none; flex-direction: column;
  background-image: radial-gradient(circle at 1px 1px, rgba(201, 198, 182, 0.09) 1px, transparent 0); background-size: 26px 26px; }
section.active { display: flex; }
section.paper { background-image: none; color: #E8EDE9; }
section.center { align-items: center; justify-content: center; text-align: center; }
.kicker { font-family: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace; font-size: 20px; letter-spacing: 0.14em; text-transform: uppercase; color: #86918B; margin: 0 0 22px; }
h1 { font-family: 'Bricolage Grotesque', 'Geist', ui-sans-serif, system-ui, sans-serif; font-weight: 700; color: #E8EDE9; margin: 0; line-height: 1.02; letter-spacing: -0.04em; text-wrap: balance; }
h1 em, .display em { font-style: normal; color: #5EE6AB; }
.display { font-family: 'Bricolage Grotesque', 'Geist', ui-sans-serif, system-ui, sans-serif; font-weight: 700; letter-spacing: -0.04em; line-height: 1; }
.mono { font-family: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace; }
.mint { color: #5EE6AB; } .white { color: #E8EDE9; } .grey { color: #86918B; } .warn { color: #F5BE55; } .gold { color: #F5BE55; }
.card { padding: 20px 26px; border-radius: 18px; border: 1px solid #232C28; background: #101513; }
.card.on { border-color: #5EE6AB; background: #13201A; }
.card h3 { font-family: 'Bricolage Grotesque', 'Geist', ui-sans-serif, system-ui, sans-serif; font-weight: 700; letter-spacing: -0.03em; font-size: 34px; color: #E8EDE9; margin: 0; }
.card p { margin: 6px 0 0; font-size: 21px; line-height: 1.38; }
.source { position: absolute; left: 110px; right: 110px; bottom: 44px; margin: 0; font-family: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace; font-size: 15px; color: #86918B; line-height: 1.5; }
.row { display: flex; gap: 48px; }
.col { display: flex; flex-direction: column; gap: 16px; }
pre { margin: 0; font-family: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace; white-space: pre; }
.term { border-radius: 22px; background: #070908; border: 1px solid #232C28; padding: 26px 32px; flex: 1; }
.term div { font-family: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace; white-space: pre; overflow: hidden; line-height: 1.62; }
.caption { position: absolute; padding: 18px 26px; border-radius: 18px; background: rgba(11,14,13,0.92); border: 1px solid #232C28; color: #E8EDE9; line-height: 1.35; }
.shot { border-radius: 18px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.45); }
.shot img { display: block; width: 100%; height: 100%; object-fit: cover; }

/* motion: every marked element rises in, one after another */
.a { opacity: 0; }
section.active .a { animation: rise 0.9s cubic-bezier(0.2, 0.7, 0.1, 1) both; animation-delay: calc(var(--i) * var(--gap, 110ms) + 120ms); }
@keyframes rise { from { opacity: 0; transform: translateY(26px); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
section.active .a.pop { animation-name: pop; }
@keyframes pop { from { opacity: 0; transform: scale(0.6) rotate(-18deg); } to { opacity: 1; transform: none; } }
section.active .a.wipe { animation-name: wipe; animation-duration: 1.6s; }
@keyframes wipe { from { opacity: 1; clip-path: inset(0 100% 0 0); } to { opacity: 1; clip-path: inset(0 0 0 0); } }
section.active .kb img { animation: kb 14s ease-out both; }
@keyframes kb { from { transform: scale(1.0); } to { transform: scale(1.07); } }
.bar { height: 14px; border-radius: 8px; background: #1A211E; overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 8px; transform-origin: left; transform: scaleX(0); }
section.active .bar i { animation: grow 1.4s cubic-bezier(0.2, 0.7, 0.1, 1) both; animation-delay: calc(var(--i, 0) * 110ms + 500ms); }
@keyframes grow { to { transform: scaleX(1); } }
.track { position: relative; flex: 1; height: 22px; }
.track::before { content: ''; position: absolute; left: 0; right: 0; top: 10px; height: 2px; background: #232C28; }
.track b { position: absolute; top: 2px; left: 0; width: 18px; height: 18px; border-radius: 18px; }
section.active .track b { animation: run var(--t) linear infinite; }
@keyframes run { 0% { left: 0; } 85%, 100% { left: calc(100% - 18px); } }
.line { position: absolute; background: #3A4741; transform-origin: left top; }
section.active .line { animation: draw 1.2s ease both; animation-delay: 1.3s; }
@keyframes draw { from { clip-path: inset(0 100% 100% 0); } to { clip-path: inset(0 0 0 0); } }

#progress { position: fixed; left: 0; bottom: 0; height: 4px; width: 0; background: #5EE6AB; transition: width 0.5s ease; z-index: 5; }
#notes { position: fixed; left: 24px; right: 24px; bottom: 24px; padding: 18px 24px; border-radius: 14px; background: rgba(11,14,13,0.92); border: 1px solid #232C28; color: #E8EDE9; font: 20px/1.45 'Geist', ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif; display: none; z-index: 6; }
#notes.on { display: block; }
#hint { position: fixed; right: 18px; top: 14px; font: 13px 'Geist', ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif; color: rgba(232,237,233,0.5); z-index: 6; transition: opacity 1s; display: none; }
#fallback { position: fixed; inset: 0; display: grid; place-items: center; text-align: center; padding: 24px; color: #E8EDE9; font: 20px/1.5 'Geist', ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif; z-index: 7; }
#fallback a { color: #5EE6AB; }
`;

/** The slide runtime. The hosted decks load it as decks/slides.js; the offline files carry it inline. */
const RUNTIME = `(function () {
  if (window.__tesseraSlides) return;
  window.__tesseraSlides = true;
  var fallback = document.getElementById('fallback');
  if (fallback) fallback.remove();
  var stage = document.getElementById('stage');
  var slides = Array.prototype.slice.call(stage.querySelectorAll('section'));
  var progress = document.getElementById('progress');
  var notes = document.getElementById('notes');
  var hint = document.getElementById('hint');

  // What animates: a slide's direct children, and the items of every row, column and terminal.
  slides.forEach(function (s) {
    s.querySelectorAll(':scope > *:not(.source), .row > *, .col > *, .term > div, .anim').forEach(function (el) { el.classList.add('a'); });
    var marked = s.querySelectorAll('.a');
    marked.forEach(function (el, i) { el.style.setProperty('--i', i); });
    s.querySelectorAll('.source').forEach(function (el) { el.classList.add('a'); el.style.setProperty('--i', marked.length); });
  });

  function fit() {
    var k = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = 'scale(' + k + ') translate(-50%, -50%)';
  }
  addEventListener('resize', fit);
  fit();

  var gen = 0;
  function count(s, g) {
    s.querySelectorAll('[data-count]').forEach(function (el) {
      var to = Number(el.dataset.count), t0 = performance.now(), dur = 1500, delay = 400;
      var fmt = function (v) { return el.dataset.format === 'comma' ? Math.round(v).toLocaleString('en-US') : String(Math.round(v)); };
      el.textContent = fmt(0);
      var step = function (now) {
        if (g !== gen) return;
        var p = Math.min(1, Math.max(0, (now - t0 - delay) / dur));
        el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  var at = -1;
  function show(n) {
    n = Math.max(0, Math.min(slides.length - 1, n));
    if (n === at) return; // the first or last slide: nothing to replay
    at = n;
    gen += 1;
    slides.forEach(function (s) { s.classList.remove('active'); });
    void stage.offsetWidth; // restart the animations
    slides[at].classList.add('active');
    count(slides[at], gen);
    progress.style.width = ((at + 1) / slides.length) * 100 + '%';
    notes.textContent = slides[at].dataset.speakerNotes || '';
    try { history.replaceState(null, '', '#' + (at + 1)); } catch (e) { /* rate-limited: the slide still changed */ }
  }
  function fromHash() {
    var n = parseInt(location.hash.slice(1), 10);
    return isFinite(n) ? n - 1 : 0;
  }

  function fullscreen() {
    var d = document, el = d.documentElement;
    var current = d.fullscreenElement || d.webkitFullscreenElement;
    if (current) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
    var request = el.requestFullscreen || el.webkitRequestFullscreen;
    if (request) Promise.resolve(request.call(el)).catch(function () {});
  }

  addEventListener('click', function () { show(at + 1); });
  addEventListener('contextmenu', function (e) { if (e.shiftKey) return; e.preventDefault(); show(at - 1); });
  addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === ' ' && e.shiftKey) { e.preventDefault(); show(at - 1); }
    else if (['ArrowRight', ' ', 'PageDown', 'Enter'].indexOf(k) > -1) { e.preventDefault(); show(at + 1); }
    else if (['ArrowLeft', 'PageUp', 'Backspace'].indexOf(k) > -1) { e.preventDefault(); show(at - 1); }
    else if (k === 'Home') show(0);
    else if (k === 'End') show(slides.length - 1);
    else if (k === 'f') fullscreen();
    else if (k === 'n') notes.classList.toggle('on');
  });
  addEventListener('hashchange', function () { show(fromHash()); });

  // A swipe on a phone or tablet: left for the next slide, right to go back.
  var x0 = null, y0 = null;
  addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { e.preventDefault(); show(dx < 0 ? at + 1 : at - 1); }
  });

  hint.style.display = 'block';
  setTimeout(function () { hint.style.opacity = 0; }, 4000);
  show(fromHash());
})();
`;

function page(body, title, pdf, script) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Geist:wght@300..700&family=Geist+Mono:wght@400..600&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head>
<body>
<div id="fallback">The slides are loading. If nothing appears, open the PDF version: <a href="${pdf}">${pdf}</a></div>
<div id="stage">
${body}
</div>
<div id="progress"></div>
<div id="notes"></div>
<div id="hint">click or → for the next slide · ← back · F full screen · N notes</div>
${script}
</body>
</html>
`;
}

function build(name, title) {
  let body = readFileSync(join(here, `${name}.src.html`), 'utf8');
  body = body.replace(/\{\{logo:(\d+)\}\}/g, (_, n) => LOGO(Number(n)));
  body = body.replace(/src="img\/([\w-]+\.png)"/g, (_, f) => `src="data:image/png;base64,${readFileSync(join(here, 'img', f)).toString('base64')}"`);
  const pdf = `tessera-${name}-deck.pdf`;
  const file = `tessera-${name}-slides.html`;
  writeFileSync(join(decks, file), page(body, title, pdf, '<script src="slides.js" defer></script>'));
  writeFileSync(join(dist, file), page(body, title, pdf, `<script>${RUNTIME}</script>`));
  console.log(`${name}: ${(body.match(/<section/g) ?? []).length} slides -> public/decks/${file} (hosted), slides/dist/${file} (offline)`);
}

writeFileSync(join(decks, 'slides.js'), RUNTIME);
build('pitch', 'Tessera · pitch');
build('demo', 'Tessera · how it works');
