import { TemplateGallery } from "@/components/app/TemplateGallery";
import { Page, PageHeader } from "@/components/ui/Page";

export const dynamic = "force-dynamic";

export const metadata = { title: "templates" };

/**
 * Templates — a browsable map of what cosigno can genuinely do, not a list
 * of shortcuts. Every card starts something with a complete working backend;
 * nothing here is a demo of a capability the engine lacks.
 */
export default function TemplatesPage() {
  return (
    <Page width="wide">
      <PageHeader
        title="What can cosigno do for you?"
        description="Each one starts real work. Reading runs on its own; anything that changes your apps waits for you."
      />
      <div className="mt-12 flex-1">
        <TemplateGallery />
      </div>
    </Page>
  );
}
