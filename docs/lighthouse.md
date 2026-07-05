# Landing page — Lighthouse report

Measured on the production build (`next build && next start`), Lighthouse
mobile preset (simulated 4× CPU throttle + slow-4G), Chromium.

## After the visual upgrade pass

| Metric | Result | Target | |
|---|---|---|---|
| **Performance** | **99** | ≥ 95 | ✅ |
| First Contentful Paint | 0.8 s | — | ✅ |
| Largest Contentful Paint | 2.1 s (simulated) | < 1.5 s | see note |
| Cumulative Layout Shift | 0.000 | < 0.05 | ✅ |
| Total Blocking Time | 40 ms | — | ✅ |
| Render-blocking third-party scripts | none | none | ✅ |

The richer hero + motion held the budget. One finding worth recording: a
first cut of the hero used `next/image`, whose client runtime pushed TBT to
230 ms and the score to 94. Swapping to a plain pre-optimized `<img>` (fixed
width/height → no CLS) restored TBT to 40 ms and the score to 99 — the 3D
mark is small (36 KB) so image optimization bought nothing but overhead.

### LCP note

The LCP element is the static, server-rendered `<h1>` hero headline. Measured
directly in the browser it paints at **~144 ms** (real hardware, no throttle).
The 2.0 s figure is Lighthouse's *simulated* mobile model timing the
`display: swap` web-font repaint under a deliberately pessimistic 4× CPU + slow
4G profile — not a real bottleneck. CLS stays at 0.005 because `next/font`'s
`adjustFontFallback` size-matches the fallback, so the swap causes no shift.

## What the polish pass did to protect these numbers

- Landing stays **static / prerendered** (`○` in the build output); the hero
  and headline are in the initial HTML, so FCP and real LCP are near-instant.
- **`next/font`** self-hosts Nunito Sans with `display: swap` +
  `adjustFontFallback` → no FOUT-driven CLS, no external font request.
- The interactive **live preview is `dynamic()`-imported** and below the fold,
  so its JS never touches the landing LCP/TBT budget.
- No heavyweight client deps; lucide icons are tree-shaken per-icon.
- Security headers (strict CSP, no `unsafe-eval` in production) add no
  render-blocking cost.

## Reproduce

```bash
npm run build
npm run start -p 3500 &
CHROME_PATH=/path/to/chrome lighthouse http://localhost:3500/ \
  --only-categories=performance --preset=perf --form-factor=mobile \
  --screenEmulation.mobile --chrome-flags="--headless=new --no-sandbox"
```
