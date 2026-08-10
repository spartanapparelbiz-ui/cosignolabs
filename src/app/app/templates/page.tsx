import { TemplateGallery } from "@/components/app/TemplateGallery";

export const dynamic = "force-dynamic";

export const metadata = { title: "templates" };

/**
 * Templates — a browsable map of what cosigno can genuinely do, not a list
 * of shortcuts. Every card starts something with a complete working backend;
 * nothing here is a demo of a capability the engine lacks.
 */
export default function TemplatesPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-8 lg:px-10">
      <h1 className="font-display text-2xl font-bold lowercase">templates</h1>
      <p className="mt-1 max-w-2xl text-sm font-semibold text-ink-soft">
        ready-made work. one click starts a real mission — read-only work runs on its
        own, and anything that changes your apps waits for your approval.
      </p>
      <div className="mt-8 flex-1">
        <TemplateGallery />
      </div>
    </div>
  );
}
