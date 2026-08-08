"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { ActionCard, Chip, PayloadWell, ReceiptLine, TierChip } from "./ui";
import { MaskedLines, Rise } from "./primitives";

/**
 * Four steps, told sideways.
 *
 * On a wide screen with motion allowed, the section becomes a horizontal
 * film: the page pins, and vertical scroll drives the panels past. GSAP's
 * ScrollTrigger does the scrubbing, but the pinning is plain CSS `sticky` —
 * no pin-spacer is injected, so the section can never shift the page under
 * the reader. GSAP itself is dynamically imported *inside* the branch that
 * uses it, so phones and reduced-motion visitors never download it.
 *
 * Everywhere else the same four panels stack vertically and read top to
 * bottom. That is also what the server renders, so the section is complete
 * before a single byte of animation code arrives.
 */

const PANELS: {
  id: string;
  step: string;
  title: string;
  body: string;
  scene: ReactNode;
}[] = [
  {
    id: "connect",
    step: "01",
    title: "connect what it may touch",
    body: "cosigno reaches your tools through the access you grant it, and only that. nothing is assumed, nothing is inherited, and you can take a tool back in one click.",
    scene: <ConnectScene />,
  },
  {
    id: "plan",
    step: "02",
    title: "it writes the plan before it moves",
    body: "the goal becomes steps, each naming the tool it will use and the authority it needs — runs on its own, needs your signature, or locked behind a typed confirmation.",
    scene: <PlanScene />,
  },
  {
    id: "sign",
    step: "03",
    title: "you sign the part that matters",
    body: "anything that sends, posts, changes, or spends stops at a card carrying its exact payload. you approve it, edit it, or veto it. the plan waits.",
    scene: <SignScene />,
  },
  {
    id: "done",
    step: "04",
    title: "the mission closes itself",
    body: "signed steps run, get verified, and land in an audit trail you can read, filter, and export — so the only question that matters always has an answer.",
    scene: <DoneScene />,
  },
];

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [active, setActive] = useState(0);

  // Progressive enhancement: the server renders the stacked reading order.
  // Only a wide viewport that hasn't asked for stillness gets the film.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 768px)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPinned(wide.matches && !calm.matches);
    update();
    wide.addEventListener("change", update);
    calm.addEventListener("change", update);
    return () => {
      wide.removeEventListener("change", update);
      calm.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!pinned) return;
    let cancelled = false;
    let ctx: { revert: () => void } | null = null;

    (async () => {
      const [gsapMod, stMod] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;
      const gsap = gsapMod.gsap ?? gsapMod.default;
      const ScrollTrigger = stMod.ScrollTrigger ?? stMod.default;
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        const track = trackRef.current;
        const stage = stageRef.current;
        if (!track || !stage) return;
        gsap.to(track, {
          // Recomputed on every refresh, so a resize or a font swap can't
          // leave the last panel stranded off-screen.
          x: () => -(track.scrollWidth - stage.clientWidth),
          ease: "none",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top top",
            end: "bottom bottom",
            scrub: 0.55,
            invalidateOnRefresh: true,
            onUpdate: (self: { progress: number }) => {
              const i = Math.min(
                PANELS.length - 1,
                Math.floor(self.progress * PANELS.length + 0.001)
              );
              setActive((prev) => (prev === i ? prev : i));
            },
          },
        });
      }, sectionRef);
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, [pinned]);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="how-title"
      className="relative bg-cream"
      style={pinned ? { height: `${PANELS.length * 100}vh` } : undefined}
    >
      <div className="sr-only">
        <h2 id="how-title">how cosigno works</h2>
      </div>

      {pinned ? (
        <div ref={stageRef} className="sticky top-0 h-[100dvh] overflow-hidden">
          <div
            ref={trackRef}
            className="flex h-full will-change-transform"
            style={{ width: `${PANELS.length * 100}%` }}
          >
            {PANELS.map((panel) => (
              <div
                key={panel.id}
                className="h-full shrink-0"
                style={{ width: `${100 / PANELS.length}%` }}
              >
                <PanelBody panel={panel} />
              </div>
            ))}
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-8 mx-auto flex w-full max-w-6xl items-center gap-2 px-6"
          >
            {PANELS.map((panel, i) => (
              <span
                key={panel.id}
                className="h-[3px] flex-1 overflow-hidden rounded-pill bg-line/70"
              >
                <span
                  className="block h-full origin-left rounded-pill bg-signal transition-transform duration-slow ease-brand-out"
                  style={{ transform: `scaleX(${i <= active ? 1 : 0})` }}
                />
              </span>
            ))}
            <span className="ml-3 shrink-0 font-mono text-[10px] tabular-nums text-ink-soft">
              {String(active + 1).padStart(2, "0")} / {String(PANELS.length).padStart(2, "0")}
            </span>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-line/50">
          {PANELS.map((panel) => (
            <Rise key={panel.id}>
              <PanelBody panel={panel} stacked />
            </Rise>
          ))}
        </div>
      )}
    </section>
  );
}

function PanelBody({
  panel,
  stacked = false,
}: {
  panel: (typeof PANELS)[number];
  stacked?: boolean;
}) {
  return (
    <div
      className={`relative mx-auto flex w-full max-w-6xl flex-col justify-center px-6 ${
        stacked ? "gap-8 py-16" : "h-full gap-10 pb-20 pt-24"
      } lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16`}
    >
      {/* the step number, oversized and ghosted — type as texture, not decoration */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-4 bottom-0 select-none font-display text-[26vw] font-bold leading-[0.7] tracking-tighter text-ink opacity-[0.035] lg:text-[18vw]"
      >
        {panel.step}
      </span>
      <div className="relative">
        <span className="font-mono text-[11px] tracking-[0.2em] text-signal">{panel.step}</span>
        {stacked ? (
          <h3 className="mt-3 font-display text-[clamp(1.7rem,6vw,2.6rem)] font-bold leading-[1.02] tracking-[-0.03em] text-ink">
            {panel.title}
          </h3>
        ) : (
          <MaskedLines
            as="h3"
            lines={[panel.title]}
            className="mt-3 font-display text-[clamp(2rem,4.4vw,4.1rem)] font-bold leading-[1] tracking-[-0.035em] text-ink"
          />
        )}
        <p className="mt-6 max-w-md text-base font-semibold leading-relaxed text-ink-soft">
          {panel.body}
        </p>
      </div>
      <div className="relative min-w-0">{panel.scene}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ scenes */

const APPS = [
  ["github", "github"],
  ["slack", "slack"],
  ["google", "gmail"],
  ["google-calendar", "calendar"],
  ["google-drive", "drive"],
  ["notion", "notion"],
  ["outlook", "outlook"],
  ["mcp", "your own api"],
] as const;

function ConnectScene() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {APPS.map(([key, label]) => (
        <div
          key={key}
          className="flex flex-col items-start gap-2.5 rounded-card bg-surface p-3 shadow-soft"
        >
          <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-btn bg-cream-deep/70">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/logos/${key}.svg`} alt="" width={20} height={20} loading="lazy" decoding="async" />
          </span>
          <span className="text-[11px] font-extrabold lowercase text-ink">{label}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold lowercase text-ink-soft">
            <Check size={11} strokeWidth={3} className="text-signal" aria-hidden="true" />
            connected
          </span>
        </div>
      ))}
    </div>
  );
}

const PLAN = [
  ["read the last 14 days of replies", "auto"],
  ["group them by what they asked for", "auto"],
  ["draft one answer per group", "auto"],
  ["send the four answers", "sign"],
  ["refund the two duplicate charges", "locked"],
  ["write the summary to drive", "sign"],
] as const;

function PlanScene() {
  return (
    <div className="rounded-card bg-surface p-4 shadow-depth">
      <p className="text-[11px] font-extrabold lowercase text-ink-soft">
        plan · answer everyone waiting since the 1st
      </p>
      <ul className="mt-3 space-y-1.5">
        {PLAN.map(([label, tier], i) => (
          <li
            key={label}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-btn bg-cream-deep/45 px-3 py-2"
          >
            <span className="font-mono text-[10px] text-ink-soft">{i + 1}</span>
            <span className="min-w-0 flex-1 text-[12.5px] font-bold lowercase text-ink">
              {label}
            </span>
            <TierChip tier={tier} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SignScene() {
  return (
    <div className="space-y-3">
      <ActionCard
        interactive={false}
        action={{
          id: "s1",
          title: "refund the two duplicate charges — $96.00",
          meta: "stripe · 2 customers · cannot be undone",
          tier: "locked",
          payload: (
            <>
              ch_3PmQ1a → $48.00 · dana@northwind.co
              <br />
              ch_3PmQ7f → $48.00 · sam@lumen.io
              <br />
              reason: duplicate charge on the same invoice
            </>
          ),
        }}
        approveLabel="type REFUND to approve"
      />
      <PayloadWell>
        <span className="text-ink">REFUND</span>
        <span className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] bg-ink motion-safe:animate-shimmer" />
        <span className="ml-2 text-ink-soft">— typed, not clicked</span>
      </PayloadWell>
    </div>
  );
}

function DoneScene() {
  return (
    <div className="rounded-card bg-surface p-4 shadow-depth">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-extrabold lowercase text-ink">
          mission complete · 6 of 6
        </span>
        <Chip tone="signal">
          <Check size={11} strokeWidth={3} aria-hidden="true" />
          closed 11:04
        </Chip>
      </div>
      <div className="mt-3 space-y-1">
        <ReceiptLine id="r_1a90c4" what="4 replies sent · signed by you 10:58" />
        <ReceiptLine id="r_1a90c5" what="$96.00 refunded · typed confirmation 11:01" />
        <ReceiptLine id="r_1a90c6" what="summary written to drive · signed by you 11:03" />
        <ReceiptLine id="r_1a90c7" what="217 messages read · ran on its own" />
      </div>
      <p className="mt-3 text-[11px] font-semibold leading-relaxed text-ink-soft">
        every line above is filterable and exportable. what did it do, and who
        said yes — answered, permanently.
      </p>
    </div>
  );
}
