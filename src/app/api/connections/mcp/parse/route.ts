import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireUser } from "@/lib/api";
import { enforceLimit } from "@/lib/ratelimit";
import { parseStrict, readJsonBody } from "@/lib/schemas";
import { parseMcpConfig, redact, type ParsedServer } from "@/lib/integrations/mcp/config";
import {
  discoverAndClassify,
  handshakeMessage,
  sanitizeHeaders,
  validateMcpUrl,
} from "@/lib/integrations/mcp/register";
import { assertPublicUrl, SsrfError } from "@/lib/integrations/net/ssrf";
import { CATEGORY_LABEL, CATEGORY_RISK, type ToolCategory } from "@/lib/integrations/mcp/classify";
import { RISK_TIER } from "@/lib/integrations/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PARSE + TEST — the step between pasting a configuration and connecting.
 *
 * It reads whatever was pasted, says what it understood, and (for a remote
 * server) actually contacts it and lists the tools it would give cosigno,
 * already classified into approval tiers. NOTHING IS SAVED: no connection row,
 * no credential, no tool cache. That is the whole point — "Test Connection"
 * has to be free to fail, or people stop pressing it.
 *
 * The response is deliberately safe to render: every credential the paste
 * contained comes back masked (see `redact`), so the review screen and any
 * screenshot of it are clean.
 */

const schema = z
  .object({
    /** The pasted configuration: JSON in any common shape, or a bare URL. */
    config: z.string().trim().min(1).max(20_000),
    /** Skip the live handshake and only report what was parsed. */
    parseOnly: z.boolean().optional(),
  })
  .strict();

interface TestedTool {
  name: string;
  description: string;
  category: ToolCategory | null;
  categoryLabel: string | null;
  confidence: number | null;
  needsReview: boolean;
  tier: number;
}

interface TestedServer {
  /** The parsed config with every credential masked. */
  config: Record<string, unknown>;
  name: string;
  transport: string;
  runnable: boolean;
  /** Set only when a live handshake ran. */
  reachable?: boolean;
  serverName?: string;
  toolCount?: number;
  tools?: TestedTool[];
  needsReview?: string[];
  rejected?: { name: string; reason: string }[];
  flagged?: string[];
  /** Why the test didn't succeed — already in the user's language. */
  note?: string;
}

async function testServer(server: ParsedServer): Promise<TestedServer> {
  const base: TestedServer = {
    config: redact(server),
    name: server.name,
    transport: server.transport,
    runnable: server.runnable,
  };

  if (server.placeholders.length > 0) {
    return {
      ...base,
      note: `fill in ${server.placeholders.join(", ")} before connecting — the configuration still has placeholders in it.`,
    };
  }

  if (server.transport === "stdio") {
    return {
      ...base,
      note: "this server runs as a process on your own machine. cosigno runs in the cloud, so it can't start or reach it — the configuration will be saved and waits for the local bridge.",
    };
  }

  if (!server.url) return { ...base, note: "this server has no URL to connect to." };

  const urlCheck = validateMcpUrl(server.url);
  if (!urlCheck.ok) return { ...base, reachable: false, note: urlCheck.reason };

  try {
    await assertPublicUrl(server.url);
  } catch (err) {
    return {
      ...base,
      reachable: false,
      note:
        err instanceof SsrfError
          ? "that address isn't allowed (internal/private hosts are blocked)."
          : "couldn't validate that URL.",
    };
  }

  try {
    const discovered = await discoverAndClassify(
      {
        url: server.url,
        transport: server.transport,
        bearer: server.bearer,
        headers: sanitizeHeaders(server.headers),
      },
      12_000
    );
    return {
      ...base,
      reachable: true,
      serverName: discovered.serverName,
      toolCount: discovered.rows.length,
      // Show what cosigno would govern, and how, BEFORE anything is stored.
      tools: discovered.rows.map((t) => {
        const category = (t.category as ToolCategory | null) ?? null;
        return {
          name: t.name,
          description: t.description,
          category,
          categoryLabel: category ? CATEGORY_LABEL[category] : null,
          confidence: t.confidence,
          needsReview: discovered.needsReview.includes(t.name),
          tier: category ? RISK_TIER[CATEGORY_RISK[category]] : 2,
        };
      }),
      needsReview: discovered.needsReview,
      rejected: discovered.rejected,
      flagged: discovered.flagged,
    };
  } catch (err) {
    return { ...base, reachable: false, note: handshakeMessage(err) };
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    // A live handshake is an outbound network call, so this is rate-limited
    // like a command, not like a settings toggle.
    await enforceLimit("commandMinute", userId);
    const body = parseStrict(schema, await readJsonBody(req), "mcp_parse");

    const parsed = parseMcpConfig(body.config);
    if (!parsed.ok) {
      return NextResponse.json(
        { ok: false, error: "unreadable_config", message: parsed.error, warnings: parsed.warnings },
        { status: 400 }
      );
    }

    const servers = body.parseOnly
      ? parsed.servers.map((s) => ({
          config: redact(s),
          name: s.name,
          transport: s.transport,
          runnable: s.runnable,
        }))
      : // Multiple servers in one paste are tested concurrently: a config with
        // four servers should take as long as the slowest, not the sum.
        await Promise.all(parsed.servers.map(testServer));

    return NextResponse.json({ ok: true, servers, warnings: parsed.warnings });
  } catch (err) {
    return errorResponse(err);
  }
}
