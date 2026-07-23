import { getStore } from "../store";
import { detectRadar, type RadarInputs } from "./detect";
import { RADAR_CATEGORY_META, type RadarItem } from "./types";
import type { RadarCategory, RadarStateStatus } from "../types";

export type { RadarItem } from "./types";
export { RADAR_CATEGORY_META } from "./types";
export { detectRadar } from "./detect";

/** A radar item joined with the user's disposition. */
export interface RadarItemView extends RadarItem {
  status: RadarStateStatus;
  snoozed_until: string | null;
  first_seen: string;
}

export interface RadarOverview {
  as_of: string;
  categories: { category: RadarCategory; label: string; blurb: string; count: number }[];
  items: RadarItemView[];
  /** Count of currently-active (not dismissed/snoozed) items. */
  active: number;
}

/**
 * Assemble the Radar overview for a user: detect over their OWN state, join
 * stored dispositions, and hide dismissed / still-snoozed items from the
 * active view (they remain queryable). Nothing here executes anything.
 */
export async function buildRadar(userId: string, now = Date.now()): Promise<RadarOverview> {
  const store = getStore();
  const [actions, missions, automations, connections, subscription] = await Promise.all([
    store.listActions(userId, { limit: 400 }),
    store.listMissions(userId, 200),
    store.listAutomations(userId),
    store.listConnections(userId),
    store.getSubscription(userId),
  ]);

  const inputs: RadarInputs = { now, actions, missions, automations, connections, subscription };
  const detected = detectRadar(inputs);

  const states = await store.ensureRadarStates(
    userId,
    detected.map((d) => d.key)
  );
  const byKey = new Map(states.map((s) => [s.item_key, s]));

  const items: RadarItemView[] = detected.map((d) => {
    const st = byKey.get(d.key);
    let status = st?.status ?? "new";
    // A snooze that has elapsed is treated as active again.
    if (
      status === "snoozed" &&
      st?.snoozed_until &&
      new Date(st.snoozed_until).getTime() <= now
    ) {
      status = "new";
    }
    return {
      ...d,
      status,
      snoozed_until: st?.snoozed_until ?? null,
      first_seen: st?.first_seen ?? new Date(now).toISOString(),
    };
  });

  const visible = items.filter(
    (i) => i.status !== "dismissed" && i.status !== "snoozed"
  );

  const counts = new Map<RadarCategory, number>();
  for (const i of visible) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);

  const categories = (Object.keys(RADAR_CATEGORY_META) as RadarCategory[]).map((category) => ({
    category,
    label: RADAR_CATEGORY_META[category].label,
    blurb: RADAR_CATEGORY_META[category].blurb,
    count: counts.get(category) ?? 0,
  }));

  return {
    as_of: new Date(now).toISOString(),
    categories,
    items,
    active: visible.length,
  };
}

/** Look up a single detected item by key (server-side, for Prepare Mission). */
export async function radarItemByKey(
  userId: string,
  key: string,
  now = Date.now()
): Promise<RadarItem | null> {
  const store = getStore();
  const [actions, missions, automations, connections, subscription] = await Promise.all([
    store.listActions(userId, { limit: 400 }),
    store.listMissions(userId, 200),
    store.listAutomations(userId),
    store.listConnections(userId),
    store.getSubscription(userId),
  ]);
  const detected = detectRadar({ now, actions, missions, automations, connections, subscription });
  return detected.find((d) => d.key === key) ?? null;
}
