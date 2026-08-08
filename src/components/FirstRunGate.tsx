"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { SEEN_KEY } from "@/lib/firstRun";

/**
 * First-run onboarding is shown exactly once per browser, and then never
 * again — so shipping it inside home's bundle charged every returning user,
 * on every visit, for a dialog they will never see.
 *
 * This gate is the only part that loads with the page: one localStorage read.
 * The dialog itself arrives as its own chunk, fetched only when the answer is
 * "yes, this person is new". Nothing about the first-run experience changes;
 * everyone else stops paying for it.
 */
const Dialog = dynamic(
  () => import("@/components/FirstRunIntro").then((m) => m.FirstRunIntroDialog),
  { ssr: false }
);

export function FirstRunGate() {
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setIsNew(true);
    } catch {
      // storage unavailable → never block the app
    }
  }, []);

  return isNew ? <Dialog /> : null;
}
