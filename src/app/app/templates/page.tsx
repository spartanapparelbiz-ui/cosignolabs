import { TemplateGallery } from "@/components/app/TemplateGallery";

export const dynamic = "force-dynamic";

/**
 * Templates — installable jobs, not blog cards. Only jobs with a COMPLETE
 * working backend are listed (no dead controls): each shows the outcome, the
 * apps it uses, what runs automatically, what waits for your signature, and
 * a one-click start that creates a real mission.
 */
export default function TemplatesPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8">
      <h1 className="font-display text-2xl font-bold lowercase">templates</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        ready-made jobs. one click creates a real mission — read-only work runs
        on its own; anything consequential still waits for your signature.
      </p>
      <div className="mt-6 flex-1">
        <TemplateGallery />
      </div>
    </div>
  );
}
