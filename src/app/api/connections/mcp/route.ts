import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { assertIntegrationCapacity } from "@/lib/enforcement";
import { vaultConfigured } from "@/lib/integrations/crypto";
import { fromParsed, registerMcp, type McpRegisterInput } from "@/lib/integrations/mcp/register";
import { parseMcpConfig } from "@/lib/integrations/mcp/config";
import { catalogEntry } from "@/lib/integrations/mcp/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Add an MCP connection.
 *
 * The primary path is `config`: the JSON block the user pasted (or the gallery
 * pre-filled), in whatever shape their source published it. The explicit
 * url/transport/bearer/headers fields remain accepted so the older form — and
 * anything scripted against it — keeps working unchanged.
 *
 * The plan's connection limit is enforced here, server-side, exactly like
 * third-party apps.
 */
const schema = z
  .object({
    displayName: z.string().trim().min(1).max(60).optional(),
    /** Pasted configuration. Preferred. */
    config: z.string().trim().min(1).max(20_000).optional(),
    /** Which pasted server to add, when the config held several. */
    serverName: z.string().trim().max(60).optional(),
    /** Gallery entry this came from, recorded on the connection. */
    catalogId: z.string().trim().max(60).optional(),
    /* --- explicit form (still supported) --- */
    url: z.string().trim().min(1).max(2048).optional(),
    transport: z.enum(["http", "sse"]).optional(),
    bearer: z.string().max(4096).optional(),
    headers: z.record(z.string(), z.string().max(2048)).optional(),
  })
  .strict();

type Body = z.infer<typeof schema>;

/** Turn either accepted body shape into one registration input. */
function toInput(body: Body): { ok: true; input: McpRegisterInput } | { ok: false; message: string } {
  if (body.config) {
    const parsed = parseMcpConfig(body.config);
    if (!parsed.ok) return { ok: false, message: parsed.error ?? "that configuration couldn't be read." };
    // A paste can hold several servers. Add the named one, or the only one.
    const server = body.serverName
      ? parsed.servers.find((s) => s.name === body.serverName)
      : parsed.servers[0];
    if (!server) {
      return { ok: false, message: `“${body.serverName}” isn't in that configuration.` };
    }
    if (server.placeholders.length > 0) {
      return {
        ok: false,
        message: `fill in ${server.placeholders.join(", ")} before connecting — the configuration still has placeholders in it.`,
      };
    }
    const input = fromParsed(server, body.displayName);
    if (body.catalogId && catalogEntry(body.catalogId)) input.catalogId = body.catalogId;
    return { ok: true, input };
  }

  if (!body.url) return { ok: false, message: "paste a configuration, or give a server URL." };
  return {
    ok: true,
    input: {
      displayName: body.displayName ?? "",
      transport: body.transport ?? "http",
      url: body.url,
      bearer: body.bearer,
      headers: body.headers,
      ...(body.catalogId && catalogEntry(body.catalogId) ? { catalogId: body.catalogId } : {}),
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    if (!vaultConfigured()) {
      throw new ApiError(503, "vault_unconfigured", "connections aren't available right now.");
    }
    const body = parseStrict(schema, await readJsonBody(req), "mcp");

    const resolved = toInput(body);
    if (!resolved.ok) {
      return NextResponse.json({ error: "mcp_connect_failed", message: resolved.message }, { status: 400 });
    }

    // MCP is a pro+ power feature, and it counts against the plan's connection
    // limit like apps do — both enforced server-side here.
    await assertIntegrationCapacity(userId, { customMcp: true });

    const result = await registerMcp(userId, resolved.input);
    if (!result.ok) {
      // A failed handshake is a client-fixable 400 with a specific message.
      return NextResponse.json({ error: "mcp_connect_failed", message: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
