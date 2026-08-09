import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { assertIntegrationCapacity } from "@/lib/enforcement";
import { vaultConfigured } from "@/lib/integrations/crypto";
import { registerMcp } from "@/lib/integrations/mcp/register";
import { parseMcpPaste, PASTE_HELP, type ParsedMcpServer } from "@/lib/integrations/mcp/import";
import type { McpTransport } from "@/lib/integrations/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Connect a new capability from one paste.
 *
 * The manual route asks three questions before anything happens: URL,
 * transport, and a display name. Two of those the server can answer itself —
 * the transport by trying, the name by asking the server what it is called —
 * so this asks for the one thing only the user has.
 *
 * Accepts a bare URL or the standard JSON config people already copy between
 * MCP clients, including one containing several servers.
 */

const schema = z
  .object({
    /** A URL, or a JSON config blob. */
    paste: z.string().trim().min(1).max(20_000),
  })
  .strict();

export interface ImportOutcome {
  name: string;
  ok: boolean;
  connectionId?: string;
  toolCount?: number;
  message?: string;
}

/**
 * Register one server, discovering its transport by trying.
 *
 * When a config doesn't say, `http` is attempted first (the current
 * transport) and `sse` second (the older one). Trying is strictly better than
 * a dropdown: most people pasting a URL genuinely do not know which their
 * server speaks, and a wrong guess reads as "the server is broken".
 */
async function connectOne(userId: string, server: ParsedMcpServer): Promise<ImportOutcome> {
  const attempts: McpTransport[] = server.transport ? [server.transport] : ["http", "sse"];
  const label = server.displayName?.trim() || hostLabel(server.url);
  let lastError = "that server couldn't be reached.";

  for (const transport of attempts) {
    const result = await registerMcp(userId, {
      // Empty when the config carried no name, so the server's own name for
      // itself is used — more accurate than anything inferred from a URL.
      displayName: server.displayName?.trim() ?? "",
      url: server.url,
      transport,
      bearer: server.bearer,
      headers: server.headers,
    });
    if (result.ok) {
      return {
        name: result.serverName || label,
        ok: true,
        connectionId: result.connectionId,
        toolCount: result.toolCount,
      };
    }
    lastError = result.error ?? lastError;
  }
  return { name: label, ok: false, message: lastError };
}

/** A readable fallback name: the host, minus the noise. */
function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").split(".")[0] || "server";
  } catch {
    return "server";
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    await enforceLimit("transitionMinute", userId);
    if (!vaultConfigured()) {
      throw new ApiError(503, "vault_unconfigured", "connections aren't available right now.");
    }

    const { paste } = parseStrict(schema, await readJsonBody(req), "mcp_import");
    const { servers, skipped } = parseMcpPaste(paste);

    if (servers.length === 0) {
      // Something recognizable but unusable (a local command-based config) is
      // explained on its own terms rather than as a parse failure.
      if (skipped.length > 0) {
        return NextResponse.json(
          { connected: [], skipped, message: skipped[0].reason },
          { status: 400 }
        );
      }
      throw new ApiError(400, "nothing_to_connect", PASTE_HELP);
    }

    // Capacity is checked before any handshake, so a plan limit is reported
    // as a plan limit rather than surfacing as a failed connection.
    await assertIntegrationCapacity(userId, { customMcp: true });

    // Sequential on purpose: each one consumes plan capacity, and a burst of
    // parallel handshakes to an unknown host is exactly the shape of an
    // amplification attack we shouldn't be able to launch.
    const connected: ImportOutcome[] = [];
    for (const server of servers) {
      try {
        connected.push(await connectOne(userId, server));
      } catch (err) {
        // One bad server must not lose the ones that worked.
        if (err instanceof ApiError && err.status === 402) {
          connected.push({ name: hostLabel(server.url), ok: false, message: err.message });
          break;
        }
        connected.push({
          name: hostLabel(server.url),
          ok: false,
          message: err instanceof Error ? err.message : "that server couldn't be connected.",
        });
      }
    }

    const wins = connected.filter((c) => c.ok);
    return NextResponse.json({
      connected,
      skipped,
      // Said in outcomes, not counts of internal objects.
      message:
        wins.length === 0
          ? "none of those could be connected."
          : `connected ${wins.map((w) => w.name).join(", ")} — ${wins.reduce((n, w) => n + (w.toolCount ?? 0), 0)} tools found. every tool starts switched off until you turn it on.`,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
