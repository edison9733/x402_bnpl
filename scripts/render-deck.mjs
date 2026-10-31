/**
 * Turns a deck into a narrated video (from version 1's pitch/render.mjs).
 *
 *   1. reads each slide's narration out of the deck source, so the video,
 *      the slides and the written script cannot drift apart;
 *   2. speaks it with the macOS `say` voice and sizes each slide to its audio;
 *   3. plays the deck in headless Chrome and records it;
 *   4. lays the narration under the picture with ffmpeg, and writes the
 *      script and a SubRip caption file next to the video.
 *
 * The result is a complete draft. For a submission, record the narration in
 * your own voice: render with `--no-voice` and talk over the silent video, or
 * present the deck live with its speaker notes (press n).
 *
 *   npm run web                          the site must be running
 *   npm run agents                       for the demo deck's live purchase
 *   node scripts/render-deck.mjs pitch   [--voice Daniel] [--no-voice | --mute] [--url http://localhost:5173] [--out DIR]
 *
 * --no-voice: silent, each slide for its declared `seconds`. --mute: silent, but
 * each slide as long as its narration takes, to talk over at the same pace.
 *   node scripts/render-deck.mjs demo
 *
 * Needs macOS (`say`), ffmpeg and Google Chrome. Writes to
 * apps/web/slides/dist/videos/ unless --out says otherwise.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = ['demo', 'update'].includes(process.argv[2]) ? process.argv[2] : 'pitch';
// Encode Club asks for a demo video of 2 to 4 minutes; the update is a one-minute format.
// The demo goes to hackathons that cap it at 3 minutes: warn well before that.
const limit = name === 'update' ? 60 : name === 'demo' ? 175 : 240;
const titles = { pitch: 'pitch', demo: 'technical demo', update: 'update' };
const flag = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const voice = flag('voice', 'Daniel');
const mute = process.argv.includes('--mute');
// Narration is generated for timing whenever it is not --no-voice; --mute leaves it out of the video.
const withVoice = !process.argv.includes('--no-voice');
// A slide that performs something live keeps its declared length even if its narration is shorter.
const floors = new Set(flag('floor', name === 'demo' ? 'checkout' : '').split(',').filter(Boolean));
const site = flag('url', 'http://localhost:5173');
const out = resolve(flag('out', join(repo, 'apps/web/slides/dist/videos')));
const base = `tessera-${name}${withVoice && !mute ? '' : '-silent'}`;
const work = join(out, `.${base}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).toString();

// ---- 1. the slides and what is said over them
const source = readFileSync(join(repo, `apps/web/src/deck/${name}.tsx`), 'utf8');
const slides = [];
const re = /id: '([^']+)',\s*seconds: (\d+),(?:\s*surface: '[^']+',)?\s*say:\s*(['"])((?:\\.|(?!\3)[^\\])*)\3/g;
for (let m; (m = re.exec(source)); ) slides.push({ id: m[1], seconds: Number(m[2]), say: m[4].replace(/\\(['"])/g, '$1').replace(/’/g, "'") });
if (!slides.length) throw new Error(`no slides found in ${name}.tsx`);
const declared = (source.match(/^\s+id: '/gm) ?? []).length;
if (declared !== slides.length) console.warn(`  !! ${declared} slides in ${name}.tsx but ${slides.length} matched the narration pattern`);

// ---- 2. narration, and how long each slide has to stay up
for (const s of slides) {
  s.audio = null;
  s.spoken = 0;
  if (withVoice) {
    s.audio = join(work, `${s.id}.aiff`);
    sh('say', ['-v', voice, '-r', '172', '-o', s.audio, s.say]);
    s.spoken = Number(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', s.audio]).trim());
  }
  s.hold = withVoice ? Math.max(4, floors.has(s.id) ? s.seconds : 0, Math.ceil((s.spoken + 1.1) * 10) / 10) : s.seconds;
}
const total = slides.reduce((n, s) => n + s.hold, 0);
console.log(`${name}: ${slides.length} slides, ${total.toFixed(1)} s${withVoice ? ` (${mute ? 'timed to' : 'voice'} ${voice})` : ''}`);
for (const s of slides) console.log(`  ${s.id.padEnd(18)} ${s.hold.toFixed(1).padStart(5)} s  ${s.say.slice(0, 70)}`);
if (total > limit) console.warn(`  !! ${total.toFixed(1)} s is over the ${limit}-second limit: shorten the narration`);

// the written script and the captions, generated from the same source
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const stamp = (t) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
let at = 0;
const rows = [];
const cues = [];
for (const [i, s] of slides.entries()) {
  rows.push(`| ${i + 1} | ${mmss(at)} | ${s.id} | ${s.say} |`);
  // One caption per sentence, timed in proportion to its length over the spoken audio.
  // Split only where a stop is followed by a space, so "2.0" or "0.25" stays in one piece.
  const sentences = s.say.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  const speak = withVoice ? s.spoken : s.hold - 1;
  const chars = sentences.reduce((n, x) => n + x.length, 0);
  let t = at + 0.6;
  for (const x of sentences) {
    const d = Math.max(1.2, (x.length / chars) * speak);
    cues.push({ from: t, to: Math.min(t + d, at + s.hold - 0.05), text: x });
    t += d;
  }
  at += s.hold;
}
writeFileSync(
  join(out, `${base}-script.md`),
  `# Tessera ${titles[name]} video: script\n\n` +
    `Generated by \`scripts/render-deck.mjs\` from \`apps/web/src/deck/${name}.tsx\`. Total ${mmss(total)} at the recorded pace.\n` +
    `Edit the \`say\` text in the deck, not this file.\n\n| # | Starts | Slide | Say |\n|---|---|---|---|\n${rows.join('\n')}\n`,
);
writeFileSync(join(out, `${base}.srt`), cues.map((c, i) => `${i + 1}\n${stamp(c.from)} --> ${stamp(c.to)}\n${c.text}\n`).join('\n'));

// ---- 3. play it and record it
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const size = { width: 1920, height: 1080 };
const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir: work, size } });
const page = await context.newPage();
// The recording starts when the page is created, so this is time zero of the video.
const opened = Date.now();
await page.goto(`${site}/#/deck/${name}?auto=1&clean=1&wait=1&t=${slides.map((s) => s.hold).join(',')}`);
page.on('pageerror', (e) => console.warn(`  page error: ${e.message.slice(0, 200)}`));
// A reload or a dev-server hot update restarts the deck: say so, with the time, if it happens.
page.on('load', () => console.log(`  page loaded at ${((Date.now() - opened) / 1000).toFixed(1)} s`));
page.on('console', (m) => {
  if (/\[vite\]/.test(m.text())) console.log(`  browser at ${((Date.now() - opened) / 1000).toFixed(1)} s: ${m.text().slice(0, 160)}`);
});
let startedAt;
let shown = -1;
for (;;) {
  const d = await page.evaluate(() => window.__deck);
  if (d?.startedAt && !startedAt) {
    startedAt = d.startedAt;
    console.log(`  deck started ${((startedAt - opened) / 1000).toFixed(1)} s after the recording began`);
  }
  if (d && d.index !== shown) {
    shown = d.index;
    if (startedAt) console.log(`  ${((Date.now() - startedAt) / 1000).toFixed(1).padStart(6)} s  slide ${shown + 1}/${d.total} ${slides[shown]?.id ?? ''}`);
  }
  if (d?.done) break;
  if (Date.now() - opened > (total + 90) * 1000) throw new Error(`the deck did not finish: it is on slide ${shown + 1} (${slides[shown]?.id})`);
  await new Promise((r) => setTimeout(r, 500));
}
await new Promise((r) => setTimeout(r, 1200));
const video = await page.video().path();
await context.close();
await browser.close();
const raw = join(work, 'raw.webm');
renameSync(video, raw);

// ---- 4. picture + narration
// Where the deck starts inside the recording. The wall clock is only a first
// guess (the recorder's time zero is not exactly page creation), so find one
// slide change in the picture itself: the first slide on the light surface is
// a jump in brightness that cannot be missed.
let lead = Math.max(0, (startedAt - opened) / 1000);
// the first slide on the light surface: the website purchase in the demo
const anchor = slides.findIndex((s) => s.id === { demo: 'checkout', update: 'shipped' }[name]);
if (anchor > 0) {
  const expected = slides.slice(0, anchor).reduce((n, s) => n + s.hold, 0);
  const luma = sh('ffmpeg', ['-loglevel', 'error', '-i', raw, '-vf', 'fps=10,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-']);
  const frames = [...luma.matchAll(/pts_time:([\d.]+)\s+lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const cross = frames.find(([t, y], i) => t > lead + expected - 4 && y > 110 && (frames[i - 1]?.[1] ?? 0) <= 110);
  if (cross) {
    // the old slide fades out for 0.55 s, then the new one is half visible about 0.3 s later
    const measured = cross[0] - 0.85 - expected;
    console.log(`  sync: slide "${slides[anchor].id}" appears at ${cross[0].toFixed(2)} s in the recording; deck start ${measured.toFixed(2)} s (clock said ${lead.toFixed(2)} s)`);
    if (Math.abs(measured - lead) < 3) lead = Math.max(0, measured);
    else console.warn(`  !! the measured start is more than 3 s from the clock; keeping the clock`);
  } else {
    console.warn(`  !! could not find slide "${slides[anchor].id}" in the picture; keeping the clock`);
  }
}
const mp4 = join(out, `${base}.mp4`);
const args = ['-y', '-loglevel', 'error', '-ss', lead.toFixed(2), '-i', raw];
if (withVoice && !mute) {
  let t = 0;
  const delays = [];
  slides.forEach((s, i) => {
    args.push('-i', s.audio);
    delays.push(`[${i + 1}:a]adelay=${Math.round((t + 0.6) * 1000)}:all=1[a${i}]`);
    t += s.hold;
  });
  const mix = `${delays.join(';')};${slides.map((_, i) => `[a${i}]`).join('')}amix=inputs=${slides.length}:normalize=0,apad[aout]`;
  args.push('-filter_complex', mix, '-map', '0:v', '-map', '[aout]', '-c:a', 'aac', '-b:a', '160k');
}
args.push('-t', (total + 1).toFixed(2), '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4);
sh('ffmpeg', args);
const seconds = Number(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).trim());
console.log(`wrote ${mp4} (${mmss(seconds)}, ${(readFileSync(mp4).length / 1e6).toFixed(1)} MB), ${base}.srt and ${base}-script.md`);
rmSync(work, { recursive: true, force: true });
