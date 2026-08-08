import { FilesPanel } from "@/components/app/FilesPanel";
import { Page, PageHeader } from "@/components/ui/Page";

export const dynamic = "force-dynamic";

export const metadata = { title: "files" };

/** Files — text deliverables that live inside cosigno, versioned on every save. */
export default function FilesPage() {
  return (
    <Page width="work">
      <PageHeader
        title="What has cosigno produced?"
        description="Notes, drafts, checklists and exports. Every save is a new version, and you can download any of them."
      />
      <div className="mt-12 flex-1">
        <FilesPanel />
      </div>
    </Page>
  );
}
