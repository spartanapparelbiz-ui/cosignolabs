import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The 3D mark's contract.
 *
 * A landing page may render the brand in three dimensions. It may not make
 * the brand *depend* on that — a visitor with no GPU, no WebGL, a blocked
 * chunk or JavaScript switched off still has to see a correct cosigno mark,
 * and nobody's phone should pay for a scene fifteen screens away.
 *
 * These pin the four rules that keep both halves true, because each of them
 * was a real defect first: an eager probe that cost a fifth of a second of
 * blocking time on load, a render loop that never idled, an unbounded idle
 * rotation that eventually presented the mark edge-on, and pointer parallax
 * measured against a canvas the cursor wasn't near.
 */

const MARK = readFileSync("src/components/home/Mark3D.tsx", "utf8");
const STICKY = readFileSync("src/components/home/StickyCta.tsx", "utf8");

describe("the mark never depends on WebGL", () => {
  it("three.js is only ever imported dynamically, never at module scope", () => {
    // A static import would put ~150kB of renderer into the page's own chunk
    // and run it during hydration.
    expect(MARK).not.toMatch(/^import .* from "three"/m);
    expect(MARK).toMatch(/await import\("three"\)/);
    expect(MARK).toMatch(/await import\("three\/examples\/jsm\/loaders\/SVGLoader\.js"\)/);
  });

  it("the flat mark is what renders until — and unless — a scene exists", () => {
    expect(MARK).toMatch(/CosignoMark/);
    // The one exception is a `decorative` mark: an 8%-opacity watermark behind
    // a card is texture, not an appearance of the brand, and shipping two long
    // path strings for each of them cost real parse time on a phone. Every
    // mark that stands for the brand still falls back.
    expect(MARK).toMatch(/\{!live && !decorative && \(/);
    // Losing the GPU context has to fall back too, not leave a dead canvas.
    expect(MARK).toMatch(/webglcontextlost/);
  });

  it("uses the real brand geometry rather than a traced copy", () => {
    expect(MARK).toMatch(/LOGO_C_PATH/);
    expect(MARK).toMatch(/LOGO_CHECK_PATH/);
  });

  it("software rasterisers are excluded, and the probe is lazy and cached", () => {
    expect(MARK).toMatch(/swiftshader\|llvmpipe/);
    expect(MARK).toMatch(/let capable: boolean \| null = null/);
    // The probe must sit behind the proximity gate, not run on mount.
    const gateAt = MARK.indexOf("new IntersectionObserver");
    const probeCallAt = MARK.indexOf("if (!canRender3D()) return;");
    expect(probeCallAt).toBeGreaterThan(gateAt);
  });
});

describe("the scene costs nothing when nothing is happening", () => {
  it("builds only once the mark is near the viewport", () => {
    expect(MARK).toMatch(/gate\.observe\(host\)/);
    expect(MARK).toMatch(/rootMargin: "400px"/);
  });

  it("releases the scene again once the mark is well past", () => {
    // Ten marks on one page. A scene that is never torn down holds its context
    // and its buffers for the rest of the session, so a reader who scrolled the
    // whole page ended up carrying every one of them at once.
    expect(MARK).toMatch(/far\.observe\(host\)/);
    expect(MARK).toMatch(/rootMargin: "1400px"/);
    expect(MARK).toMatch(/liveScenes = Math\.max\(0, liveScenes - 1\)/);
    expect(MARK).toMatch(/liveScenes >= MAX_LIVE/);
    // An in-flight build must be invalidated, or a fast scroll attaches an
    // orphan scene with no cleanup registered against it.
    expect(MARK).toMatch(/mine !== token/);
  });

  it("renders on damage, and idles only where there is a GPU to spare", () => {
    expect(MARK).toMatch(/let dirty = true/);
    expect(MARK).toMatch(/if \(drifts \|\| dirty \|\| easing\)/);
    expect(MARK).toMatch(/const drifts = window\.innerWidth >= 640/);
  });

  it("stops entirely off screen, and never starts under reduced motion", () => {
    expect(MARK).toMatch(/raf = visible && !stillRef\.current \? requestAnimationFrame\(frame\) : 0/);
    expect(MARK).toMatch(/if \(stillRef\.current\) \{/);
  });

  it("disposes everything it owns", () => {
    for (const call of [
      "cGeom.dispose()",
      "checkGeom.dispose()",
      "cMaterial.dispose()",
      "checkMaterial.dispose()",
      "renderer.dispose()",
      "io.disconnect()",
      "ro.disconnect()",
    ]) {
      expect(MARK).toContain(call);
    }
  });
});

describe("the mark always faces the reader", () => {
  it("no mode turns the object past the angle where the logo reads", () => {
    // A full revolution rendered the brand as a dark vertical slab either side
    // of 90° and as its own mirror image after it. The mark is not symmetrical:
    // there is a front, and the front is the logo. Every mode's scroll term is
    // a bounded sweep.
    expect(MARK).not.toMatch(/eased \* Math\.PI \* 2 \+/);
    expect(MARK).toMatch(/Math\.sin\(eased \* Math\.PI \* 2\) \* 0\.74/);
  });

  it("every rotation term is bounded", () => {
    // An unbounded `drift * 0.1` once turned the mark edge-on: an orange
    // sliver where the logo should be. Time may only enter through a sine.
    const rotationBlock = MARK.slice(
      MARK.indexOf("rig.rotation.y"),
      MARK.indexOf("rig.position.y")
    );
    const uses = [...rotationBlock.matchAll(/drift/g)];
    expect(uses.length).toBeGreaterThan(0);
    for (const use of uses) {
      const before = rotationBlock.slice(Math.max(0, (use.index ?? 0) - 9), use.index);
      expect(before, `unbounded use of drift: ...${before}drift`).toMatch(/Math\.sin\($/);
    }
  });

  it("pointer parallax is viewport-relative and clamped", () => {
    expect(MARK).toMatch(/clamp1/);
    expect(MARK).toMatch(/e\.clientX \/ w - 0\.5/);
    expect(MARK).not.toMatch(/getBoundingClientRect\(\);\s*\n\s*if \(!r\.width/);
  });

  it("a non-finite scroll progress cannot poison the transform", () => {
    expect(MARK).toMatch(/Number\.isFinite\(raw\)/);
  });
});

describe("the phone's start bar", () => {
  it("is out of the tab order and the accessibility tree until it appears", () => {
    expect(STICKY).toMatch(/aria-hidden=\{!shown\}/);
    expect(STICKY).toMatch(/inert=\{!shown\}/);
  });

  it("offers the two things a visitor wants, and only on phones", () => {
    expect(STICKY).toMatch(/href="\/sign-up"/);
    expect(STICKY).toMatch(/href="#pricing"/);
    expect(STICKY).toMatch(/sm:hidden/);
    // Above the iOS home indicator, not under it.
    expect(STICKY).toMatch(/env\(safe-area-inset-bottom\)/);
  });
});
