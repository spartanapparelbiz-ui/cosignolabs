// Builds the capture-record gallery page from media/manifest.json.
//
// Everything is inlined — fonts as data URIs, stills as JPEG data URIs — so
// the page holds together with no network access at all.
//
// Run: node scripts/build-gallery.mjs   (after capture-video.mjs and thumbs.mjs)
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MEDIA = join(ROOT, "media");
const THUMBS = join(MEDIA, "thumbs");
const OUT = join(MEDIA, "gallery.html");

const manifest = JSON.parse(readFileSync(join(MEDIA, "manifest.json"), "utf8"));

/* ------------------------------------------------------------------ fonts --
   The brand faces, taken from the app's own build output so the record is set
   in the same type as the product it documents. */
const FONT_DIR = join(ROOT, ".next", "static", "media");
function font(file) {
  const p = join(FONT_DIR, file);
  if (!existsSync(p)) return null;
  return readFileSync(p).toString("base64");
}
const NUNITO = font("68180864d7f93f02-s.p.woff2");
const FRAUNCES = font("af4bf8399d1aacdf-s.p.woff2");

const fontFaces = [
  NUNITO &&
    `@font-face{font-family:'Nunito Sans';font-style:normal;font-weight:400 900;font-stretch:100%;font-display:swap;src:url(data:font/woff2;base64,${NUNITO}) format('woff2')}`,
  FRAUNCES &&
    `@font-face{font-family:'Fraunces';font-style:normal;font-weight:600 700;font-display:swap;src:url(data:font/woff2;base64,${FRAUNCES}) format('woff2')}`,
]
  .filter(Boolean)
  .join("\n");

/* --------------------------------------------------------------- chapters --
   What each recording actually demonstrates. Keyed by the video slug. */
const CHAPTERS = {
  "01-landing-and-product": {
    title: "The public site",
    blurb:
      "Every page a visitor sees before signing up — the landing page end to end, the product explainer, the three pricing tiers, and the security page that states plainly what cosigno will not do on its own.",
  },
  "02-first-run": {
    title: "First run",
    blurb:
      "The three-screen introduction a new account meets on its first visit to /app: what cosigno is, how it works, and the one thing it wants you to know before it starts.",
  },
  "03-now-and-command": {
    title: "Now — the home surface",
    blurb:
      "The operator's home. Current state and the delegation box, the morning briefing card, the live capability report answering “what can you do right now”, and Cosigno Presence — the Ctrl-K command overlay that matches as you type.",
  },
  "04-delegations": {
    title: "Delegations",
    blurb:
      "Everything handed to cosigno, with its state and the actions available on each. Opens “Brief me” — why a delegation is waiting — and the replay timeline showing every step it took to get there.",
  },
  "05-objectives": {
    title: "Objectives",
    blurb:
      "The outcomes cosigno is driving toward rather than the individual tasks. Drills into a single objective to show progress and the delegations linked beneath it.",
  },
  "06-boundary-and-sign": {
    title: "The boundary — approval and signature",
    new: true,
    blurb:
      "The heart of the product: where cosigno stops and asks. Reviewing a bundle of approvals together, taking control by hand mid-task, handing it back with “Cosigno, continue”, and then Cosigno Sign — drawing a real signature to authorise the action and watching it seal.",
  },
  "07-trust-receipts": {
    title: "Activity and trust receipts",
    blurb:
      "The ledger of everything done, filterable and searchable. Opens a trust receipt with the cosigno seal, then expands the full trace of the permission used and the steps behind it.",
  },
  "08-watch-standing-orders": {
    title: "Watch and standing orders",
    blurb:
      "The things cosigno keeps an eye on continuously, and the flow for writing a new standing order across the three trust modes — observe, prepare, operate.",
  },
  "09-connections-and-rules": {
    title: "Connections and safety rules",
    new: true,
    blurb:
      "The most recently rebuilt surfaces. Connections now sells the job each integration does rather than naming an API, and never fails silently. Safety rules match on what an action genuinely is, not on what it happens to be called.",
  },
  "10-account-and-permissions": {
    title: "Account and permission tiers",
    blurb:
      "The control centre, panel by panel — the permission board that sorts every action into auto, approve, or sign, plus profile, security, usage and integrations.",
  },
  "11-cosigno-hold": {
    title: "Cosigno Hold — the authority brake",
    blurb:
      "The stop button. Pulling the brake puts a hold on all external action and banners it across the app; releasing it returns cosigno to work. Recorded live against the real hold API.",
  },
  "12-other-surfaces": {
    title: "The rest of the app",
    blurb:
      "Skills, files, rules and memory, team, workspace, the decision inbox, and the health page that reports whether background execution is actually wired up.",
  },
};

/* ----------------------------------------------------------- group by chapter
   capture-video.mjs pushes stills as they are taken and the video entry once
   the chapter's context closes, so each video terminates its own run of
   stills. */
const chapters = [];
let pending = [];
for (const entry of manifest) {
  if (entry.kind === "still") {
    pending.push(entry);
    continue;
  }
  const slug = entry.file.replace(/^video\//, "").replace(/\.webm$/, "");
  chapters.push({ slug, video: entry, stills: pending, meta: CHAPTERS[slug] ?? {} });
  pending = [];
}
if (pending.length) {
  chapters.push({ slug: "unfiled", video: null, stills: pending, meta: { title: "Unfiled" } });
}

/* ------------------------------------------------------------------ thumbs -- */
const thumbCache = new Map();
function thumb(stillFile) {
  const name = stillFile.replace(/^stills\//, "").replace(/\.png$/, ".jpg");
  if (thumbCache.has(name)) return thumbCache.get(name);
  const p = join(THUMBS, name);
  const v = existsSync(p) ? readFileSync(p).toString("base64") : null;
  thumbCache.set(name, v);
  return v;
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const totalVideoMB = chapters
  .filter((c) => c.video)
  .reduce((n, c) => n + Number(c.video.mb || 0), 0);
const stillCount = manifest.filter((m) => m.kind === "still").length;
const videoCount = chapters.filter((c) => c.video).length;

const captured = new Date(
  statSync(join(MEDIA, "manifest.json")).mtime,
).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/* -------------------------------------------------------------------- html -- */
const sections = chapters
  .map((c, i) => {
    const n = String(i + 1).padStart(2, "0");
    const stills = c.stills
      .map((s) => {
        const b64 = thumb(s.file);
        const full = s.file.replace(/^stills\//, "");
        if (!b64) return "";
        return `
        <figure class="frame">
          <button class="frame-open" type="button" data-src="data:image/jpeg;base64,${b64}" data-note="${esc(s.note)}" data-file="${esc(full)}">
            <img src="data:image/jpeg;base64,${b64}" alt="${esc(s.note)}" loading="lazy" />
          </button>
          <figcaption>
            <span class="frame-note">${esc(s.note)}</span>
            <span class="frame-file">${esc(full)}</span>
          </figcaption>
        </figure>`;
      })
      .join("");

    return `
      <section class="chapter" id="${esc(c.slug)}">
        <header class="chapter-head">
          <span class="chapter-n">${n}</span>
          <div class="chapter-title-wrap">
            <h2 class="chapter-title">${esc(c.meta.title ?? c.slug)}${
              c.meta.new ? ' <span class="tag-new">rebuilt</span>' : ""
            }</h2>
            <p class="chapter-blurb">${esc(c.meta.blurb ?? "")}</p>
          </div>
        </header>
        ${
          c.video
            ? `<div class="reel">
                 <span class="reel-label">screen recording</span>
                 <span class="reel-file">${esc(c.video.file)}</span>
                 <span class="reel-size">${esc(c.video.mb)} MB</span>
               </div>`
            : ""
        }
        <div class="frames">${stills}</div>
      </section>`;
  })
  .join("");

const html = `<title>cosigno — capture record</title>
<style>
${fontFaces}

/* Light is the product's own palette; dark uses the app's real dark tokens,
   so the record reads in the same two themes the product ships. */
:root{
  --ground:#f8f0e8;
  --surface:#ffffff;
  --raised:#efe5d7;
  --ink:#141414;
  --ink-soft:#5c5650;
  --line:#e4d9c8;
  --signal:#fb4c20;
  --shadow:0 2px 16px rgba(20,20,20,.06);
  --shadow-lift:0 10px 32px rgba(20,20,20,.10);
  --overlay:rgba(20,18,15,.82);
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#181511;
    --surface:#221e18;
    --raised:#26211a;
    --ink:#f5f0e8;
    --ink-soft:#ada59a;
    --line:#3a342b;
    --signal:#ff6340;
    --shadow:0 2px 16px rgba(0,0,0,.34);
    --shadow-lift:0 10px 32px rgba(0,0,0,.46);
    --overlay:rgba(8,7,6,.88);
  }
}
:root[data-theme="dark"]{
  --ground:#181511;
  --surface:#221e18;
  --raised:#26211a;
  --ink:#f5f0e8;
  --ink-soft:#ada59a;
  --line:#3a342b;
  --signal:#ff6340;
  --shadow:0 2px 16px rgba(0,0,0,.34);
  --shadow-lift:0 10px 32px rgba(0,0,0,.46);
  --overlay:rgba(8,7,6,.88);
}

*{box-sizing:border-box}

body{
  margin:0;
  background:var(--ground);
  color:var(--ink);
  font-family:'Nunito Sans',system-ui,-apple-system,'Segoe UI',sans-serif;
  font-weight:400;
  line-height:1.6;
  -webkit-font-smoothing:antialiased;
}

.wrap{
  max-width:1140px;
  margin:0 auto;
  padding:clamp(28px,5vw,64px) clamp(18px,4vw,40px) 96px;
  display:flex;
  flex-direction:column;
  gap:clamp(38px,5vw,60px);
}

/* ---- masthead ---- */
.masthead{display:flex;flex-direction:column;gap:18px}
.eyebrow{
  font-size:12px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;
  color:var(--signal);
}
h1{
  font-family:'Fraunces',Georgia,serif;
  font-weight:700;
  font-size:clamp(34px,6vw,58px);
  line-height:1.04;
  letter-spacing:-.015em;
  margin:0;
  text-wrap:balance;
}
/* The dotted i is an inline-block, which is a legal break opportunity — without
   this the wordmark splits across lines as "cosi / gno". */
h1 .brand{white-space:nowrap}
h1 .dotted{position:relative;display:inline-block}
h1 .dotted::after{
  content:"";position:absolute;left:50%;top:.2em;width:.15em;height:.15em;
  transform:translateX(-50%);border-radius:999px;background:var(--signal);
}
.standfirst{
  margin:0;max-width:62ch;font-size:clamp(16px,1.9vw,18.5px);color:var(--ink-soft);
}

/* ---- summary strip ---- */
.strip{
  display:flex;flex-wrap:wrap;gap:0;
  background:var(--surface);
  border-radius:14px;
  box-shadow:var(--shadow);
  overflow:hidden;
}
.stat{
  flex:1 1 150px;padding:18px 22px;
  border-right:1px solid var(--line);
  display:flex;flex-direction:column;gap:3px;
}
.stat:last-child{border-right:0}
.stat-n{
  font-family:'Fraunces',Georgia,serif;font-weight:700;
  font-size:27px;line-height:1.1;font-variant-numeric:tabular-nums;
}
.stat-k{font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-soft)}

.note{
  margin:0;padding:16px 20px;border-radius:14px;
  background:var(--raised);
  color:var(--ink-soft);font-size:15px;max-width:78ch;
}
.note strong{color:var(--ink);font-weight:800}
.note code{
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13.5px;
  background:var(--surface);padding:1px 6px;border-radius:5px;
}

/* ---- chapters ---- */
.chapter{display:flex;flex-direction:column;gap:20px;scroll-margin-top:24px}
.chapter-head{display:flex;gap:18px;align-items:flex-start}
.chapter-n{
  font-family:'Fraunces',Georgia,serif;font-weight:700;font-size:15px;
  font-variant-numeric:tabular-nums;color:var(--signal);
  padding-top:7px;flex:0 0 auto;
}
.chapter-title-wrap{display:flex;flex-direction:column;gap:7px;min-width:0}
.chapter-title{
  font-family:'Fraunces',Georgia,serif;font-weight:600;
  font-size:clamp(22px,3vw,28px);line-height:1.18;margin:0;
  letter-spacing:-.01em;text-wrap:balance;
}
.tag-new{
  font-family:'Nunito Sans',system-ui,sans-serif;
  font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ground);background:var(--signal);
  padding:3px 9px;border-radius:999px;vertical-align:middle;
  position:relative;top:-3px;
}
.chapter-blurb{margin:0;max-width:70ch;color:var(--ink-soft);font-size:15.5px}

.reel{
  display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;
  padding:12px 16px;border-radius:10px;
  background:var(--surface);box-shadow:var(--shadow);
  border-left:3px solid var(--signal);
}
.reel-label{
  font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;
  color:var(--signal);
}
.reel-file{
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:13.5px;font-weight:600;word-break:break-all;
}
.reel-size{
  font-size:13px;color:var(--ink-soft);font-variant-numeric:tabular-nums;
  margin-left:auto;
}

/* ---- frames ---- */
.frames{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));
  gap:20px;
}
.frame{margin:0;display:flex;flex-direction:column;gap:9px}
.frame-open{
  display:block;padding:0;border:0;background:var(--surface);
  border-radius:10px;overflow:hidden;cursor:zoom-in;
  box-shadow:var(--shadow);line-height:0;
  transition:box-shadow 220ms cubic-bezier(.22,1,.36,1),transform 220ms cubic-bezier(.22,1,.36,1);
}
.frame-open:hover{box-shadow:var(--shadow-lift);transform:translateY(-2px)}
.frame-open:focus-visible{outline:2px solid var(--signal);outline-offset:3px}
.frame-open img{width:100%;height:auto;display:block}
figcaption{display:flex;flex-direction:column;gap:2px}
.frame-note{font-size:14px;font-weight:600;line-height:1.4}
.frame-file{
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:12px;color:var(--ink-soft);word-break:break-all;
}

/* ---- lightbox ---- */
.lightbox{
  position:fixed;inset:0;z-index:50;display:none;
  background:var(--overlay);
  padding:clamp(16px,4vw,44px);
  flex-direction:column;gap:14px;align-items:center;justify-content:center;
}
.lightbox[data-open="true"]{display:flex}
.lightbox img{
  max-width:100%;max-height:calc(100vh - 130px);
  border-radius:10px;box-shadow:var(--shadow-lift);
}
.lightbox-cap{
  color:#fff;font-size:14.5px;text-align:center;max-width:70ch;
  display:flex;flex-direction:column;gap:2px;
}
.lightbox-cap span:last-child{
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;opacity:.72;
}
.lightbox-close{
  position:absolute;top:16px;right:18px;
  background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.28);
  border-radius:999px;width:40px;height:40px;font-size:20px;cursor:pointer;line-height:1;
}
.lightbox-close:focus-visible{outline:2px solid var(--signal);outline-offset:2px}

footer{
  border-top:1px solid var(--line);padding-top:22px;
  color:var(--ink-soft);font-size:14px;
}

@media (prefers-reduced-motion:reduce){
  *{transition:none!important;animation:none!important}
}
</style>

<div class="wrap">
  <header class="masthead">
    <span class="eyebrow">capture record · ${esc(captured)}</span>
    <h1>Every surface of <span class="brand">cos<span class="dotted">ı</span>gno</span>, recorded end to end</h1>
    <p class="standfirst">
      The app was booted and driven for real — no mockups, no stitched frames. Each chapter below is a
      screen recording of the running product, with the stills pulled from that same pass.
    </p>
  </header>

  <div class="strip">
    <div class="stat"><span class="stat-n">${videoCount}</span><span class="stat-k">screen recordings</span></div>
    <div class="stat"><span class="stat-n">${stillCount}</span><span class="stat-k">screenshots</span></div>
    <div class="stat"><span class="stat-n">${totalVideoMB.toFixed(1)}<span style="font-size:16px"> MB</span></span><span class="stat-k">of video</span></div>
    <div class="stat"><span class="stat-n">1280<span style="font-size:16px">×800</span></span><span class="stat-k">capture size</span></div>
  </div>

  <p class="note">
    <strong>The videos are the files, not this page.</strong> Recordings are <code>.webm</code> under
    <code>media/video/</code> and play in any browser — drag one into a tab. The stills below are
    compressed for the page; the full-resolution PNGs sit in <code>media/stills/</code>. Everything
    was captured against the live app on <code>localhost:3400</code>, with a visible cursor and a
    caption drawn into the recording so each step reads on playback.
  </p>

  ${sections}

  <footer>
    Captured from the running app by <code>scripts/capture-video.mjs</code>. Re-run it any time the
    product changes — chapters, stills and this page regenerate from the same pass.
  </footer>
</div>

<div class="lightbox" id="lb" role="dialog" aria-modal="true" aria-label="Enlarged screenshot">
  <button class="lightbox-close" id="lb-close" type="button" aria-label="Close">×</button>
  <img id="lb-img" alt="" />
  <div class="lightbox-cap"><span id="lb-note"></span><span id="lb-file"></span></div>
</div>

<script>
(function(){
  var lb=document.getElementById('lb'),img=document.getElementById('lb-img'),
      note=document.getElementById('lb-note'),file=document.getElementById('lb-file'),
      close=document.getElementById('lb-close'),last=null;
  function open(btn){
    last=btn;
    img.src=btn.dataset.src; img.alt=btn.dataset.note;
    note.textContent=btn.dataset.note; file.textContent=btn.dataset.file;
    lb.dataset.open='true'; close.focus();
  }
  function shut(){ lb.dataset.open='false'; img.src=''; if(last) last.focus(); }
  document.querySelectorAll('.frame-open').forEach(function(b){
    b.addEventListener('click',function(){ open(b); });
  });
  close.addEventListener('click',shut);
  lb.addEventListener('click',function(e){ if(e.target===lb) shut(); });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&lb.dataset.open==='true') shut();
  });
})();
</script>
`;

writeFileSync(OUT, html);
console.log(
  `gallery → media/gallery.html  (${(statSync(OUT).size / 1e6).toFixed(2)} MB, ` +
    `${chapters.length} chapters, ${stillCount} stills)`,
);
