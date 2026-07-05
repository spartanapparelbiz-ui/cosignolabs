/**
 * Hero headline whose words stagger-fade up on load (80ms apart), once.
 * Server-rendered with per-word animation delays — no JS needed; reduced
 * motion collapses it to an instant reveal via globals.css.
 */
export function StaggerHeadline({ text, className = "" }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <h1 className={className} aria-label={text}>
      {words.map((w, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="mr-[0.25em] inline-block animate-word-in"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          {w}
        </span>
      ))}
    </h1>
  );
}
