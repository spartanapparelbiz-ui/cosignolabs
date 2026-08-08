import { DashboardSkeleton } from "@/components/Skeleton";
import { loadingMessageFor } from "@/lib/loadingMessages";

/**
 * Home's loading state — and the first five seconds of the product.
 *
 * The shell (rail, header, footer) is already painted by the layout, so this
 * fills only the content column: the mark signing itself in, the line that
 * says what is actually being prepared, and the shape of the page underneath.
 * Nothing flashes white and nothing moves when the real dashboard lands.
 */
export default function Loading() {
  return <DashboardSkeleton message={loadingMessageFor("/app")} />;
}
