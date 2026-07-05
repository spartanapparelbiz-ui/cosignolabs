// Re-mounts on every /app navigation, giving a fast 120ms fade-through
// between workspace / activity / account. Non-blocking, transform/opacity.
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-through">{children}</div>;
}
