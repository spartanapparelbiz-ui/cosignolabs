import { LogoLoader } from "@/components/brand/LogoLoader";

/** Route-level loading state — the living mark, never a bare spinner. */
export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <LogoLoader label="loading your workspace" />
    </div>
  );
}
