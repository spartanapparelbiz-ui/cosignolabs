"use client";

import { useEffect, useRef, useState } from "react";
import type { MotionValue } from "framer-motion";
import { CosignoMark, LOGO_C_PATH, LOGO_CHECK_PATH } from "@/components/brand/Logo";

/**
 * The cosigno mark, in three dimensions.
 *
 * It is the real brand geometry — the same two path strings the favicon, the
 * OG image and every flat mark on the site are drawn from — parsed and
 * extruded, so the 3D object can never drift from the 2D one. Nothing here is
 * a model someone traced by hand.
 *
 * How it stays cheap enough to put on a landing page:
 *
 *  · three.js is imported inside an effect, so it lands in its own lazy chunk
 *    and never touches First Load JS or the LCP paint.
 *  · The server renders the flat SVG mark. The canvas replaces it only once
 *    the scene is actually built, so no-JS, no-WebGL, a failed import and a
 *    lost GPU context all leave a correct mark on screen.
 *  · The render loop runs only while the canvas is on screen, and stops dead
 *    when it isn't. Under `prefers-reduced-motion` there is no loop at all —
 *    one frame is drawn and the GPU goes quiet.
 *  · Device pixel ratio is capped at 2, and antialiasing is only requested
 *    where it is nearly free.
 *
 * Everything it owns — geometry, materials, renderer, observers, listeners —
 * is disposed on unmount, so React strict-mode double-mounting in development
 * cannot leak a WebGL context.
 */

export type MarkMode = "hero" | "ambient" | "spin" | "scatter";

export interface Mark3DProps {
  className?: string;
  /** Drives rotation and dolly. 0 → 1 across the owning section. */
  progress?: MotionValue<number>;
  /**
   * The check's home. `false` floats it out of the C along its own axis;
   * flipping to `true` springs it back — the signature landing, in space.
   */
  sealed?: boolean;
  /**
   * The same idea, scrubbed: 0 keeps the check out at arm's length and 1 has
   * it home. Given a motion value the seal follows the scrollbar frame by
   * frame instead of springing on a state change, which is what lets the mark
   * assemble itself as you read rather than snapping when you arrive.
   */
  seal?: MotionValue<number>;
  mode?: MarkMode;
  /** Size of the SSR fallback mark, in px. */
  fallbackSize?: number;
  /**
   * A watermark rather than an appearance of the brand.
   *
   * The flat fallback exists so that a visitor with no WebGL still sees a
   * correct cosigno mark wherever the page shows one. A mark sitting at 8%
   * opacity behind a card is not one of those places: it is texture, and
   * shipping its two long path strings in the document for each of seven
   * sections cost real parse and hydration time on a phone for something
   * nobody would notice missing. Decorative marks render nothing until their
   * scene exists.
   */
  decorative?: boolean;
  /** Honour the reduced-motion setting by holding still. */
  still?: boolean;
}

/**
 * Can this machine render the mark properly? Answered once per page, and only
 * when something is about to need it.
 *
 * Creating a WebGL context is not free — it can spin up a GPU process — and
 * this page mounts three marks. Probing on mount, three times, cost a couple
 * of hundred milliseconds of blocking time on a phone before anything had
 * even scrolled into view. The probe now happens behind the proximity gate,
 * and its answer is cached.
 *
 * Software rasterisers are excluded deliberately: a machine with no GPU still
 * reports WebGL and then draws a bevelled, lit solid on the CPU, which costs
 * seconds of blocking time. Those visitors get the flat mark, which is a
 * complete rendering of the brand rather than a placeholder for one.
 */
let capable: boolean | null = null;

/**
 * How many scenes may be alive at once.
 *
 * The page carries nine marks now. Contexts are not free — a browser will
 * start dropping the oldest once a page holds too many, and a phone pays in
 * memory long before that — so a scene is torn down as soon as its mark is a
 * screen and a half away and rebuilt when it comes back. In practice two or
 * three are ever live at a time; this counter is the backstop for a fast
 * scroll that outruns the release observer.
 */
const MAX_LIVE = typeof window !== "undefined" && window.innerWidth < 640 ? 3 : 6;
let liveScenes = 0;

function canRender3D(): boolean {
  if (capable !== null) return capable;
  try {
    const probe = document.createElement("canvas");
    const gl = (probe.getContext("webgl2") ||
      probe.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return (capable = false);
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return (capable = !/swiftshader|llvmpipe|softwar|basic render|microsoft basic/i.test(gpu));
  } catch {
    return (capable = false);
  }
}

/** Read the brand's own CSS variables so the object matches the theme exactly. */
function readBrandColors(el: HTMLElement): { c: string; check: string } {
  const style = getComputedStyle(el);
  return {
    c: style.getPropertyValue("--logo-c").trim() || "#FB4C20",
    check: style.getPropertyValue("--logo-check").trim() || "#171512",
  };
}

export function Mark3D({
  className = "",
  progress,
  sealed = true,
  seal,
  mode = "hero",
  fallbackSize = 160,
  decorative = false,
  still = false,
}: Mark3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  // Values the render loop reads every frame without re-rendering React.
  const sealedRef = useRef(sealed);
  const sealRef = useRef(seal);
  const stillRef = useRef(still);
  const wakeRef = useRef<(() => void) | null>(null);
  sealedRef.current = sealed;
  sealRef.current = seal;
  stillRef.current = still;

  // Answering the card is a React state change, not a scroll or a pointer
  // move, so it has to knock on the render loop itself.
  useEffect(() => {
    wakeRef.current?.();
  }, [sealed]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let raf = 0;
    let cleanup: (() => void) | null = null;
    let idle = 0;
    let timer = 0;
    // A build already scheduled or in flight. Without it a fast scroll that
    // re-crosses the gate twice would start two scenes for one host.
    let pending = false;
    // Bumped whenever a build is started or released. `build` captures the
    // value and checks it after every await: a scroll fast enough to leave the
    // release margin while three.js is still loading would otherwise attach a
    // scene nobody is looking at, with no cleanup registered for it yet.
    let token = 0;

    async function build(mine: number) {
      const THREE = await import("three");
      const { SVGLoader } = await import("three/examples/jsm/loaders/SVGLoader.js");
      if (disposed || mine !== token || !hostRef.current) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      camera.position.set(0, 0, 7.4);

      // Phones pay for every pixel twice over: small screens cap lower.
      const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 640 ? 1.5 : 2);
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: dpr < 2,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(dpr);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      // No tone mapping. ACES is the right choice for a photographic scene and
      // the wrong one for a logo: it rolls saturated oranges toward brick, and
      // the whole point of rendering the real brand geometry is that the object
      // is the mark, not an interpretation of it. The light rig below is
      // balanced so a face pointed at the camera renders at #FB4C20 exactly,
      // which is checked by eye against the flat mark beside it.
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      renderer.domElement.setAttribute("aria-hidden", "true");

      /* ------------------------------------------------------ the geometry */

      const loader = new SVGLoader();
      /** Extrude one brand path into a centred, y-up mesh. */
      function buildGeometry(d: string, depth: number) {
        const parsed = loader.parse(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><path d="${d}"/></svg>`
        );
        const shapes = parsed.paths.flatMap((p) => SVGLoader.createShapes(p));
        const geom = new THREE.ExtrudeGeometry(shapes, {
          depth,
          bevelEnabled: true,
          bevelThickness: 1.6,
          bevelSize: 1.4,
          bevelSegments: 2,
          curveSegments: 8,
        });
        geom.computeBoundingBox();
        return geom;
      }

      // Depth is deliberately shallow. The mark has to read as the mark first
      // and as an object second; a deep extrusion turns the C into a slab and
      // the silhouette stops matching the favicon sitting in the same tab.
      const cGeom = buildGeometry(LOGO_C_PATH, 10);
      const checkGeom = buildGeometry(LOGO_CHECK_PATH, 11.5);

      // Centre both on the mark's shared 160×160 canvas, not on their own
      // bounds, or the check would recentre itself out of the C's opening.
      const CANVAS = 160;
      const SCALE = 2.55 / CANVAS;
      for (const g of [cGeom, checkGeom]) {
        g.translate(-CANVAS / 2, -CANVAS / 2, -7);
        g.scale(SCALE, SCALE, SCALE);
      }

      const { c: cColor, check: checkColor } = readBrandColors(hostRef.current);
      // MeshStandardMaterial, not MeshPhysical: clearcoat roughly doubles the
      // shader compile, and on a throttled phone that compile is the whole
      // budget. The sheen here comes from the light rig.
      const cMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(cColor),
        roughness: 0.33,
        metalness: 0.06,
      });
      const checkMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(checkColor),
        roughness: 0.28,
        metalness: 0.08,
      });

      const cMesh = new THREE.Mesh(cGeom, cMaterial);
      const checkMesh = new THREE.Mesh(checkGeom, checkMaterial);

      // SVG's y axis points down; three's points up. A rotation rather than a
      // negative scale, so winding — and therefore lighting — stays correct.
      const inner = new THREE.Group();
      inner.rotation.x = Math.PI;
      inner.add(cMesh, checkMesh);

      const rig = new THREE.Group();
      rig.add(inner);
      scene.add(rig);

      /* --------------------------------------------------------- the light */

      // A face light first, sitting where the reader is. Without it the front
      // of the extrusion — the part that IS the logo — was lit only by fill,
      // and rendered a full stop darker than the orange beside it in the nav
      // while the bevels caught the key and read brighter than either. The
      // mark looked like a different colour from itself.
      const face = new THREE.DirectionalLight(0xffffff, 2.65);
      face.position.set(0, 0.35, 6);
      scene.add(face);
      scene.add(new THREE.HemisphereLight(0xfff4e8, 0x6b5a48, 0.55));
      // The key exists for the bevels and the sense of a light source, not to
      // carry the colour.
      const key = new THREE.DirectionalLight(0xffffff, 0.85);
      key.position.set(3.4, 4.6, 5.2);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xffb59a, 0.55);
      rim.position.set(-4.2, -1.4, -3.6);
      scene.add(rim);
      hostRef.current.appendChild(renderer.domElement);
      liveScenes += 1;
      setLive(true);

      /* ---------------------------------------------------------- the loop */

      const AMBIENT = mode === "ambient";
      const SPIN = mode === "spin";
      const SCATTER = mode === "scatter";
      /**
       * The idle drift — the slow turn that keeps the object feeling alive —
       * is a desktop luxury. On a phone it would mean rendering a lit solid
       * sixty times a second for as long as the mark is on screen, to animate
       * something nobody asked to move. Below `sm` the object still rotates
       * with scroll, still parallaxes, still seals; it simply doesn't idle.
       */
      const drifts = window.innerWidth >= 640;
      let pointerX = 0;
      let pointerY = 0;
      let targetX = 0;
      let targetY = 0;
      // Damage flag: a frame is only rendered when something actually moved.
      let dirty = true;
      const touch = () => {
        dirty = true;
      };
      // The check's distance from home: 1 while unsigned, eased to 0 on seal.
      let apart = sealedRef.current ? 0 : 1;
      let visible = true;
      let clock = 0;

      /**
       * Parallax is measured against the VIEWPORT, not against this canvas.
       *
       * Measuring against the canvas rect looked reasonable and was wrong: a
       * cursor sitting a thousand pixels above a small canvas produces a
       * ratio of -6, and 6 × the tilt coefficient is most of a right angle —
       * which is exactly how the mark in the closing section ended up
       * presenting its own edge. Viewport-relative values are naturally in
       * [-1, 1], every mark on the page reacts to the same gesture, and the
       * clamp makes the bound explicit rather than incidental.
       */
      const clamp1 = (n: number) => (n < -1 ? -1 : n > 1 ? 1 : n);
      const onPointer = (e: PointerEvent) => {
        const w = window.innerWidth || 1;
        const h = window.innerHeight || 1;
        targetX = clamp1((e.clientX / w - 0.5) * 2);
        targetY = clamp1((e.clientY / h - 0.5) * 2);
        touch();
      };
      window.addEventListener("pointermove", onPointer, { passive: true });

      function resize() {
        const el = hostRef.current;
        if (!el) return;
        const w = el.clientWidth || 1;
        const h = el.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        touch();
      }
      const ro = new ResizeObserver(resize);
      ro.observe(hostRef.current);
      resize();

      const unwatch = progress?.on("change", touch);
      wakeRef.current = touch;

      const io = new IntersectionObserver(
        (entries) => {
          visible = entries.some((e) => e.isIntersecting);
          if (visible && !raf && !stillRef.current) raf = requestAnimationFrame(frame);
        },
        { rootMargin: "120px" }
      );
      io.observe(hostRef.current);

      function draw(t: number) {
        const raw = progress ? progress.get() : 0;
        const eased = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;

        // Scroll owns the main rotation; time adds a slow drift so the object
        // is alive even when the page is still. Every term is BOUNDED — an
        // earlier cut let the idle drift accumulate as `drift * 0.1`, which
        // eventually turned the mark edge-on and rendered the brand as an
        // orange sliver.
        //
        // The scroll term is deliberately the largest one: turning through
        // most of a quarter circle, rolling as it goes and pulling toward the
        // reader is what makes the object read as an object rather than a
        // picture. The budget is arithmetic, not hope — scroll 0.78 plus
        // drift 0.16 plus pointer 0.26, against a face that stops reading at
        // 1.57 (90°). Worst case lands near 66°, where the C and the check
        // both still read and the extrusion is at its most legible.
        const drift = stillRef.current || !drifts ? 0 : (t - clock) / 1000;
        const turn = eased - 0.5; // -0.5 → 0.5, so the middle of the scroll is level

        // Each mode is centred on the moment the reader is actually looking at
        // the mark. The hero's is the top of the page, so it rests near
        // face-on and turns away as you leave; an ambient mark is most visible
        // halfway through its section, so face-on lands at 0.5. SPIN is the
        // exception and the only place the mark is allowed past the readable
        // window: it turns a whole revolution across its section, so every
        // resting point in the scroll is a point it passes through rather than
        // one it stops at, and it lands face-on at both ends.
        if (SPIN) {
          // A wide sweep, not a revolution.
          //
          // A full turn looked like the boldest possible answer and rendered
          // the brand as a dark vertical slab for the quarter of the scroll
          // either side of 90°, and as its own mirror image for the half after
          // that. The mark is not a symmetrical object: there is a front, and
          // the front is the logo. So spin sweeps ±42° instead, and spends the
          // motion budget on roll and dolly, which read as depth without ever
          // turning the C into an edge.
          rig.rotation.y = Math.sin(eased * Math.PI * 2) * 0.74 + Math.sin(drift * 0.3) * 0.05;
          rig.rotation.x = 0.1 - Math.sin(eased * Math.PI) * 0.26 + Math.sin(drift * 0.33) * 0.04;
          rig.rotation.z = Math.sin(eased * Math.PI * 2) * 0.2 + Math.sin(drift * 0.27) * 0.03;
        } else if (SCATTER) {
          // Without a signature the object never settles: it tumbles, and the
          // check has already left. This is the only mark on the page allowed
          // to look unsettled — but it is still the logo, so the tumble is
          // bounded to the same readable window as everything else rather than
          // rolling through the back of the mark.
          rig.rotation.y = -0.5 + eased * 1.0 + Math.sin(drift * 0.9) * 0.28;
          rig.rotation.x = -0.3 + eased * 0.7 + Math.sin(drift * 0.7) * 0.3;
          rig.rotation.z = -0.45 + eased * 0.95 + Math.sin(drift * 1.1) * 0.35;
        } else {
          rig.rotation.y = AMBIENT
            ? -0.46 + eased * 0.92 + Math.sin(drift * 0.25) * 0.22
            : -0.16 + eased * 1.05 + Math.sin(drift * 0.42) * 0.16;
          rig.rotation.x =
            (AMBIENT ? 0.06 : 0.13) +
            Math.sin(drift * 0.33) * 0.05 -
            eased * (AMBIENT ? 0.3 : 0.34);
          rig.rotation.z = Math.sin(drift * 0.27) * 0.035 + turn * (AMBIENT ? 0.2 : 0.28);
        }

        // Pointer parallax, critically damped so it never overshoots.
        pointerX += (targetX - pointerX) * 0.045;
        pointerY += (targetY - pointerY) * 0.045;
        rig.rotation.y += pointerX * 0.26;
        rig.rotation.x += pointerY * 0.16;

        // Depth: the object swings through the frame and comes at you as the
        // section resolves, instead of sitting at one distance the whole way.
        rig.position.y = Math.sin(drift * 0.5) * 0.05 - eased * (AMBIENT ? 0.42 : 0.5);
        rig.position.x = turn * (AMBIENT ? 0.22 : 0.38);
        // The hero mark is the page's opening image and sits closer to the
        // lens than the ambient ones, which have to stay clear of the surfaces
        // they sit behind or inside.
        camera.position.z =
          (AMBIENT || SPIN || SCATTER ? 7.4 : 6.5) +
          eased * (AMBIENT || SPIN || SCATTER ? 1.5 : 3.2) -
          Math.sin(eased * Math.PI) * 0.6;

        // The check leaves and returns along its own axis, never through the C.
        // A scrubbed seal is read straight off the scrollbar; a boolean one is
        // eased, so answering a card still springs rather than snaps.
        const scrub = sealRef.current?.get();
        if (typeof scrub === "number" && Number.isFinite(scrub)) {
          apart = 1 - Math.max(0, Math.min(1, scrub));
        } else {
          const want = sealedRef.current ? 0 : 1;
          apart += (want - apart) * 0.09;
          if (Math.abs(want - apart) < 0.001) apart = want;
        }
        checkMesh.position.set(apart * 15, apart * -11, apart * 30);
        checkMesh.rotation.set(apart * 0.34, apart * -0.46, apart * 0.24);

        renderer.render(scene, camera);
      }

      function frame(t: number) {
        if (disposed) return;
        if (!clock) clock = t;
        // Something is still in flight if the pointer or the seal is easing.
        const easing =
          Math.abs(targetX - pointerX) > 0.001 ||
          Math.abs(targetY - pointerY) > 0.001 ||
          (!sealRef.current && apart !== (sealedRef.current ? 0 : 1));
        if (drifts || dirty || easing) {
          dirty = false;
          draw(t);
        }
        raf = visible && !stillRef.current ? requestAnimationFrame(frame) : 0;
      }

      if (stillRef.current) {
        clock = performance.now();
        draw(clock);
      } else {
        raf = requestAnimationFrame(frame);
      }

      // A lost context is a dead canvas — drop back to the flat mark rather
      // than leave a hole where the brand should be.
      const onLost = (e: Event) => {
        e.preventDefault();
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        renderer.domElement.remove();
        setLive(false);
      };
      renderer.domElement.addEventListener("webglcontextlost", onLost);

      cleanup = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        io.disconnect();
        ro.disconnect();
        unwatch?.();
        wakeRef.current = null;
        window.removeEventListener("pointermove", onPointer);
        renderer.domElement.removeEventListener("webglcontextlost", onLost);
        renderer.domElement.remove();
        cGeom.dispose();
        checkGeom.dispose();
        cMaterial.dispose();
        checkMaterial.dispose();
        renderer.dispose();
      };
    }

    /**
     * Build when the main thread is free, never during hydration.
     *
     * Parsing three.js and extruding two glyphs is a few tens of milliseconds
     * of work that has no business competing with the page becoming
     * interactive — the flat mark already holds the frame, so nobody is
     * looking at a hole while we wait. The timeout is the ceiling: on a busy
     * page it still arrives, just politely.
     */
    const start = (mine: number) => {
      idle = 0;
      timer = 0;
      void build(mine)
        .catch(() => {
          // Any failure at all — a blocked chunk, an exotic GPU driver —
          // simply leaves the flat mark in place.
          setLive(false);
        })
        .finally(() => {
          pending = false;
        });
    };
    const schedule = () => {
      pending = true;
      token += 1;
      const mine = token;
      const run = () => start(mine);
      const ric = (
        window as Window & {
          requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
        }
      ).requestIdleCallback;
      if (typeof ric === "function") idle = ric(run, { timeout: 1800 });
      else timer = window.setTimeout(run, 200);
    };

    /**
     * Nothing is built until the mark is nearly on screen, and nothing stays
     * built once it is well past.
     *
     * This page mounts nine of these. Building them all at load cost 3.5
     * seconds of blocking time on a throttled phone — a WebGL context, a
     * shader compile and two extruded glyphs each, for objects the visitor
     * would not reach for another fifteen screens. Gating the *build* (not
     * just the render loop) on proximity means a phone pays for exactly the
     * marks it is about to look at.
     *
     * The release half matters just as much once there are this many. A scene
     * that is never torn down holds its context and its buffers for the rest
     * of the session, so a reader who scrolls the whole page ends up carrying
     * every mark at once. Here the gate builds at 400px and the release
     * observer tears down at 1400px, which keeps two or three alive at a time
     * however far you scroll, and rebuilding on the way back up costs the same
     * idle callback it cost the first time.
     */
    const release = () => {
      token += 1;
      if (!cleanup) return;
      cleanup();
      cleanup = null;
      liveScenes = Math.max(0, liveScenes - 1);
      setLive(false);
    };

    const gate = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (cleanup || pending) return;
        if (!canRender3D()) return;
        if (liveScenes >= MAX_LIVE) return;
        schedule();
      },
      { rootMargin: "400px" }
    );
    gate.observe(host);

    const far = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) return;
        if (idle) {
          (
            window as Window & { cancelIdleCallback?: (h: number) => void }
          ).cancelIdleCallback?.(idle);
          idle = 0;
        }
        if (timer) {
          window.clearTimeout(timer);
          timer = 0;
        }
        pending = false;
        release();
      },
      { rootMargin: "1400px" }
    );
    far.observe(host);

    return () => {
      disposed = true;
      gate.disconnect();
      far.disconnect();
      if (idle) {
        (
          window as Window & { cancelIdleCallback?: (h: number) => void }
        ).cancelIdleCallback?.(idle);
      }
      if (timer) window.clearTimeout(timer);
      release();
      setLive(false);
    };
  }, [mode, progress]);

  return (
    <div ref={hostRef} className={`relative ${className}`} aria-hidden="true">
      {/* The flat mark holds the frame until — and unless — the scene arrives.
          Decorative marks skip it: see `decorative` above. */}
      {!live && !decorative && (
        <span className="absolute inset-0 grid place-items-center">
          <CosignoMark size={fallbackSize} />
        </span>
      )}
    </div>
  );
}
