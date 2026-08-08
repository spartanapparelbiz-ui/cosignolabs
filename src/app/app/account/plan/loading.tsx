import { PanelSkeleton } from "@/components/Skeleton";
import { loadingMessageFor } from "@/lib/loadingMessages";

/**
 * Route loading state — the page's own shape, with the line that says what is
 * being fetched for it. Generic spinners are not used anywhere in cosigno;
 * see components/brand/LogoLoader.tsx and lib/loadingMessages.ts.
 */
export default function Loading() {
  return <PanelSkeleton title="your plan" message={loadingMessageFor("/app/account/plan")} />;
}
