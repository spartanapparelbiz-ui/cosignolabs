/**
 * The URLs the workspace shares.
 *
 * A cache key is a string, which means two components ask the same question
 * only if they spell it identically — and `limit=20` versus `limit=200` is two
 * questions to a cache and one question to a person. Naming the handful of
 * shared reads here is what keeps that from drifting back apart.
 *
 * The pending-approvals limit is deliberately generous: the response carries
 * however many approvals are actually waiting (nearly always a handful), and
 * the cap only matters in the pathological case — so one query can serve the
 * rail's badge, home's queue and the approvals page instead of three.
 */
export const PENDING_APPROVALS_KEY = "/api/actions?status=proposed&limit=200";
export const MISSIONS_KEY = "/api/missions?include=steps";
export const CONNECTIONS_KEY = "/api/connections";
export const USAGE_KEY = "/api/usage";
export const RULES_KEY = "/api/rules";
/** Deployment capability, not user data — safe to hold for a long time. */
export const BACKGROUND_HEALTH_KEY = "/api/health/mission";
