import { FilesPanel } from "@/components/app/FilesPanel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Files" };

/** Files — text deliverables that live inside cosigno, versioned on every save. */
export default function FilesPage() {
  return (
    <div className="mx-auto flex w-full max-w-none flex-1 flex-col px-6 lg:px-10 py-8">
      <h1 className="font-display text-2xl font-bold lowercase">files</h1>
      <p className="mt-1 text-sm font-semibold text-ink-soft">
        the documents your missions produce — notes, drafts, checklists, csv
        exports. every save is a new version, and you can download anything.
      </p>
      <div className="mt-6 flex-1">
        <FilesPanel />
      </div>
    </div>
  );
}
