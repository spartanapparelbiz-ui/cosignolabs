import { FilesPanel } from "@/components/app/FilesPanel";

export const dynamic = "force-dynamic";

export const metadata = { title: "files" };

/** Files — text deliverables that live inside cosigno, versioned on every save. */
export default function FilesPage() {
  return (
    <div className="page page-wide flex flex-1 flex-col">
      <header>
        <h1 className="page-title">files</h1>
        <p className="page-lede">Everything your missions produced, versioned on every save.</p>
      </header>
      <div className="mt-8 flex-1">
        <FilesPanel />
      </div>
    </div>
  );
}
