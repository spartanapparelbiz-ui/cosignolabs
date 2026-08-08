/**
 * The page transition.
 *
 * A template re-mounts on every /app navigation, so this wrapper is the one
 * place the workspace's page-change motion lives. Content lifts 8px into place
 * over 260ms while the chrome around it — rail, header, footer — never moves.
 * The old page is replaced by its route's skeleton (see each loading.tsx), so
 * the sequence is content → skeleton → content, with no white frame anywhere in
 * it and no layout jump at either end.
 *
 * flex-1 column: it sits between the shell's <main> and the page, so it must
 * pass the full-height flex chain through or pages sit content-height.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col animate-page-in">{children}</div>;
}
