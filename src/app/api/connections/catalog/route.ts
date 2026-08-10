import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/api";
import { GROUP_LABEL, searchCatalog } from "@/lib/integrations/mcp/catalog";
import { getProvider } from "@/lib/integrations/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The connection gallery, searchable.
 *
 * Every entry carries the configuration that would be pre-filled, so the Add
 * flow is "pick a card → the paste box is already filled in → Test Connection".
 * Native adapters additionally report whether this deployment can actually
 * connect them, because a card that opens an OAuth flow the server has no
 * client id for is a dead end, and the honest place to say so is here rather
 * than after the click.
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const q = new URL(req.url).searchParams.get("q") ?? "";
    const entries = searchCatalog(q).map((e) => {
      const provider = e.providerKey ? getProvider(e.providerKey) : undefined;
      return {
        id: e.id,
        name: e.name,
        tagline: e.tagline,
        group: e.group,
        groupLabel: GROUP_LABEL[e.group],
        deployment: e.deployment,
        icon: e.icon,
        docsUrl: e.docsUrl,
        config: e.config,
        providerKey: e.providerKey,
        // Native adapters only. Undefined for MCP entries, which need no
        // server-side credentials — the user brings their own.
        configured: provider ? provider.isConfigured() : undefined,
        setupEnv: provider?.setupEnv ?? undefined,
      };
    });
    return NextResponse.json({ entries, query: q });
  } catch (err) {
    return errorResponse(err);
  }
}
