// Re-mounts on every /app navigation, giving a fast 120ms fade-through
// between workspace / activity / account. Non-blocking, transform/opacity.
// flex-1 column: it sits between the shell's <main> and the page, so it must
// pass the full-height flex chain through or pages sit content-height.
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col animate-fade-through">{children}</div>;
}
