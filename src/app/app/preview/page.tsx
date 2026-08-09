import { Preview } from "@/components/app/Preview";

export const dynamic = "force-dynamic";

export const metadata = { title: "preview" };

/**
 * Preview answers one question — "what happens if I turn this on?" — and it is
 * its own destination rather than a settings screen, because trying a rule is
 * an experiment someone runs, not a preference they set.
 */
export default function PreviewPage() {
  return <Preview />;
}
