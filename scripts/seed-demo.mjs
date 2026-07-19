// Seeds deterministic demo state into the running dev server (:3400) so the
// visual audit captures real, populated screens — receipts w/ seal, proposals
// at the boundary, a completed delegation, an objective, temporary authority.
// Drives the SAME public API a user would; mutates no product code.
const BASE = "http://localhost:3400";

// A minimal valid 1x1 PNG data URI for the signature record.
const SIG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

async function api(path, method = "GET", body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) console.log(`  ! ${method} ${path} → ${res.status} ${JSON.stringify(json).slice(0, 160)}`);
  return { status: res.status, json };
}

async function command(text) {
  const { json } = await api("/api/command", "POST", { command: text });
  const session = json.session ?? json.result?.session;
  const actions = json.actions ?? json.result?.actions ?? [];
  return { session, actions, raw: json };
}

console.log("seeding demo state on", BASE);

// 1) A signed + executed action → Receipt with the Cosigno Seal.
{
  const { session, actions } = await command("send a launch update email to the design team");
  const target = actions.find((a) => a.status === "proposed") ?? actions[0];
  if (target) {
    const r = await api(`/api/actions/${target.id}/approve`, "POST", {
      confirmation: "CONFIRM",
      signature: { name: "Nicholas", image: SIG },
    });
    console.log(`  signed+executed → ${r.json.action?.status ?? r.status} (session ${session?.id?.slice(0, 8)})`);
  }
}

// 2) Two proposals kept at the boundary (Focus / approval bundle / sign).
await command("send a follow-up email to john about the proposal");
await command("send a thank-you email to sarah for the intro");
console.log("  two proposals parked at the boundary");

// 3) A completed delegation — planner proposes, user vetoes → nothing pending.
{
  const { actions } = await command("clear my inbox of newsletters");
  for (const a of actions.filter((x) => x.status === "proposed")) {
    await api(`/api/actions/${a.id}/veto`, "POST", { reason: "not needed right now" });
  }
  console.log("  one delegation completed (proposals vetoed)");
}

// 4) An objective with linked delegations (progress is derived).
{
  const { json } = await api("/api/objectives", "POST", {
    title: "Launch the company by August 1",
    target_date: "2026-08-01",
  });
  const objId = json.objective?.id;
  const { json: list } = await api("/api/delegations");
  const sessions = (list.delegations ?? list.sessions ?? list.items ?? []).slice(0, 3);
  if (objId) {
    for (const s of sessions) {
      const sid = s.id ?? s.session?.id;
      if (sid) await api(`/api/objectives/${objId}`, "POST", { session_id: sid });
    }
    console.log(`  objective created + ${sessions.length} delegations linked`);
  } else {
    console.log("  ! objective not created");
  }
}

// 5) A temporary authority grant (scoped, expiring).
{
  const r = await api("/api/authority", "POST", {
    category: "update_record",
    minutes: 120,
    note: "batch-updating CRM records for the launch",
  });
  console.log(`  temporary authority → ${r.status === 200 ? "granted" : r.status}`);
}

// Report resulting state.
const { json: state } = await api("/api/state");
console.log("\nstate summary:", JSON.stringify({
  needs_you: state.needs_you?.length ?? state.boundary?.length ?? "?",
  momentum: state.momentum,
}).slice(0, 200));
console.log("done.");
