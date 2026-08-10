import { bundledLogo, GENERIC_MCP_LOGO } from "../logos";

/**
 * The connection gallery.
 *
 * cosigno is not "the app with Gmail and Slack integrations" — it is the
 * approval layer for any MCP-compatible tool. This file is therefore DATA, not
 * capability: every entry is a name, a description, and a configuration to
 * pre-fill. Adding one adds no code, no executor, no per-tool handler. The
 * tools an entry exposes are discovered from the server at connect time and
 * classified automatically; nothing about them is written down here.
 *
 * Three ways an entry can run, and the gallery says which plainly:
 *
 *   "remote" — the vendor hosts an MCP server on the public internet. cosigno
 *              connects to it directly. This is the good case, and the one the
 *              product is built around.
 *
 *   "local"  — the server runs as a process on your own machine (stdio). We
 *              parse and store the configuration, but cosigno is a hosted
 *              service and cannot reach a process on your laptop, so these
 *              wait for the local bridge instead of pretending to connect.
 *
 *   "native" — a connector cosigno implements itself over the vendor's own
 *              API, because no MCP server exists for it yet. These are
 *              ADAPTERS: they present the same tools, the same approval tiers
 *              and the same audit trail as an MCP connection, and they are
 *              meant to be replaced by an MCP entry the day one ships.
 *
 * On endpoints: a remote entry's URL is pre-filled, never assumed correct.
 * Vendors move them. The Add flow always ends in a live Test Connection, so a
 * stale URL fails visibly, with the vendor's docs one click away, BEFORE
 * anything is saved. That is deliberately better than a catalog that claims to
 * be authoritative and silently isn't.
 */

export type CatalogDeployment = "remote" | "local" | "native";

export type CatalogGroup =
  | "development"
  | "communication"
  | "documents"
  | "data"
  | "infrastructure"
  | "commerce"
  | "design"
  | "automation";

export interface CatalogEntry {
  id: string;
  name: string;
  /** One line, in the user's language — what it lets cosigno do. */
  tagline: string;
  group: CatalogGroup;
  deployment: CatalogDeployment;
  /** Bundled logo path, or the generic MCP mark. Never a vendor hotlink. */
  icon: string;
  /** Where the vendor documents this server — shown next to the config. */
  docsUrl?: string;
  /**
   * The configuration pre-filled into the paste box, in the same format a user
   * would paste from the vendor's README. Absent for native adapters, which
   * connect by OAuth instead.
   */
  config?: string;
  /** Native adapters only: the provider key the OAuth connect flow uses. */
  providerKey?: string;
  /** Search aliases so "gsuite" finds Google Workspace. */
  keywords?: string[];
}

/** A remote server entry, formatted the way its vendor documents it. */
function remoteConfig(name: string, url: string, headers?: Record<string, string>): string {
  const server: Record<string, unknown> = { url };
  if (headers) server.headers = headers;
  return JSON.stringify({ mcpServers: { [name]: server } }, null, 2);
}

/** A stdio server entry, in the standard MCP client configuration format. */
function localConfig(
  name: string,
  args: string[],
  env?: Record<string, string>
): string {
  const server: Record<string, unknown> = { command: "npx", args: ["-y", ...args] };
  if (env) server.env = env;
  return JSON.stringify({ mcpServers: { [name]: server } }, null, 2);
}

const ENTRIES: CatalogEntry[] = [
  /* ---------------------------------------------------------- remote MCP */
  {
    id: "github",
    name: "GitHub",
    tagline: "repositories, issues, pull requests and code search.",
    group: "development",
    deployment: "remote",
    icon: bundledLogo("github") ?? GENERIC_MCP_LOGO,
    docsUrl: "https://github.com/github/github-mcp-server",
    config: remoteConfig("github", "https://api.githubcopilot.com/mcp/", {
      Authorization: "Bearer ${GITHUB_TOKEN}",
    }),
    keywords: ["git", "repo", "pull request", "issues", "code"],
  },
  {
    id: "linear",
    name: "Linear",
    tagline: "issues, projects and cycles.",
    group: "development",
    deployment: "remote",
    icon: GENERIC_MCP_LOGO,
    docsUrl: "https://linear.app/docs/mcp",
    config: remoteConfig("linear", "https://mcp.linear.app/sse"),
    keywords: ["issues", "tickets", "sprint", "project"],
  },
  {
    id: "notion-mcp",
    name: "Notion",
    tagline: "search, read and write pages and databases.",
    group: "documents",
    deployment: "remote",
    icon: bundledLogo("notion") ?? GENERIC_MCP_LOGO,
    docsUrl: "https://developers.notion.com/docs/mcp",
    config: remoteConfig("notion", "https://mcp.notion.com/mcp"),
    keywords: ["docs", "wiki", "notes", "database"],
  },
  {
    id: "stripe",
    name: "Stripe",
    tagline: "customers, invoices, payments and refunds.",
    group: "commerce",
    deployment: "remote",
    icon: GENERIC_MCP_LOGO,
    docsUrl: "https://docs.stripe.com/mcp",
    config: remoteConfig("stripe", "https://mcp.stripe.com", {
      Authorization: "Bearer ${STRIPE_SECRET_KEY}",
    }),
    keywords: ["payments", "billing", "invoice", "refund", "money"],
  },
  {
    id: "sentry",
    name: "Sentry",
    tagline: "errors, issues and release health.",
    group: "development",
    deployment: "remote",
    icon: GENERIC_MCP_LOGO,
    docsUrl: "https://docs.sentry.io/product/sentry-mcp/",
    config: remoteConfig("sentry", "https://mcp.sentry.dev/mcp"),
    keywords: ["errors", "monitoring", "exceptions", "crash"],
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    tagline: "workers, bindings, DNS and observability.",
    group: "infrastructure",
    deployment: "remote",
    icon: GENERIC_MCP_LOGO,
    docsUrl: "https://developers.cloudflare.com/agents/model-context-protocol/",
    config: remoteConfig("cloudflare", "https://observability.mcp.cloudflare.com/sse"),
    keywords: ["dns", "workers", "cdn", "edge"],
  },
  {
    id: "vercel",
    name: "Vercel",
    tagline: "projects, deployments and logs.",
    group: "infrastructure",
    deployment: "remote",
    icon: GENERIC_MCP_LOGO,
    docsUrl: "https://vercel.com/docs/mcp",
    config: remoteConfig("vercel", "https://mcp.vercel.com"),
    keywords: ["deploy", "hosting", "logs", "preview"],
  },

  /* ----------------------------------------------------------- local MCP */
  {
    id: "filesystem",
    name: "Filesystem",
    tagline: "read and write files in folders you choose.",
    group: "data",
    deployment: "local",
    icon: GENERIC_MCP_LOGO,
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    config: localConfig("filesystem", [
      "@modelcontextprotocol/server-filesystem",
      "/path/to/allowed/dir",
    ]),
    keywords: ["files", "folder", "disk", "local"],
  },
  {
    id: "postgres",
    name: "Postgres",
    tagline: "query and inspect a Postgres database.",
    group: "data",
    deployment: "local",
    icon: GENERIC_MCP_LOGO,
    docsUrl: "https://github.com/modelcontextprotocol/servers",
    config: localConfig("postgres", [
      "@modelcontextprotocol/server-postgres",
      "postgresql://localhost/mydb",
    ]),
    keywords: ["sql", "database", "query", "table"],
  },
  {
    id: "supabase",
    name: "Supabase",
    tagline: "tables, edge functions, auth and storage.",
    group: "data",
    deployment: "local",
    icon: GENERIC_MCP_LOGO,
    docsUrl: "https://supabase.com/docs/guides/getting-started/mcp",
    config: localConfig(
      "supabase",
      ["@supabase/mcp-server-supabase@latest", "--read-only"],
      { SUPABASE_ACCESS_TOKEN: "${SUPABASE_ACCESS_TOKEN}" }
    ),
    keywords: ["database", "postgres", "auth", "storage", "backend"],
  },
  {
    id: "git",
    name: "Git",
    tagline: "history, diffs and branches in a local repository.",
    group: "development",
    deployment: "local",
    icon: GENERIC_MCP_LOGO,
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/git",
    config: JSON.stringify(
      {
        mcpServers: {
          git: { command: "uvx", args: ["mcp-server-git", "--repository", "/path/to/repo"] },
        },
      },
      null,
      2
    ),
    keywords: ["commit", "diff", "branch", "version control"],
  },
  {
    id: "playwright",
    name: "Playwright",
    tagline: "drive a real browser: navigate, click, extract, screenshot.",
    group: "automation",
    deployment: "local",
    icon: GENERIC_MCP_LOGO,
    docsUrl: "https://github.com/microsoft/playwright-mcp",
    config: localConfig("playwright", ["@playwright/mcp@latest"]),
    keywords: ["browser", "scrape", "automation", "e2e", "screenshot"],
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    tagline: "headless Chrome automation and page capture.",
    group: "automation",
    deployment: "local",
    icon: GENERIC_MCP_LOGO,
    docsUrl: "https://github.com/modelcontextprotocol/servers",
    config: localConfig("puppeteer", ["@modelcontextprotocol/server-puppeteer"]),
    keywords: ["browser", "chrome", "headless", "scrape"],
  },
  {
    id: "docker",
    name: "Docker",
    tagline: "containers, images and compose stacks.",
    group: "infrastructure",
    deployment: "local",
    icon: GENERIC_MCP_LOGO,
    docsUrl: "https://github.com/docker/mcp-servers",
    config: JSON.stringify(
      { mcpServers: { docker: { command: "uvx", args: ["docker-mcp"] } } },
      null,
      2
    ),
    keywords: ["container", "image", "compose", "devops"],
  },
  {
    id: "slack-mcp",
    name: "Slack (MCP)",
    tagline: "channels, messages and threads via the community server.",
    group: "communication",
    deployment: "local",
    icon: bundledLogo("slack") ?? GENERIC_MCP_LOGO,
    docsUrl: "https://github.com/modelcontextprotocol/servers",
    config: localConfig("slack", ["@modelcontextprotocol/server-slack"], {
      SLACK_BOT_TOKEN: "${SLACK_BOT_TOKEN}",
      SLACK_TEAM_ID: "${SLACK_TEAM_ID}",
    }),
    keywords: ["chat", "channel", "message", "team"],
  },

  /* -------------------------------------------------------- native adapters */
  {
    id: "google",
    name: "Gmail",
    tagline: "search, read, draft and send mail.",
    group: "communication",
    deployment: "native",
    icon: bundledLogo("google") ?? GENERIC_MCP_LOGO,
    providerKey: "google",
    keywords: ["email", "mail", "inbox", "google", "workspace"],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    tagline: "events, free time and scheduling.",
    group: "communication",
    deployment: "native",
    icon: bundledLogo("google-calendar") ?? GENERIC_MCP_LOGO,
    providerKey: "google-calendar",
    keywords: ["calendar", "meeting", "schedule", "google", "workspace"],
  },
  {
    id: "google-drive",
    name: "Google Drive",
    tagline: "save and update documents.",
    group: "documents",
    deployment: "native",
    icon: bundledLogo("google-drive") ?? GENERIC_MCP_LOGO,
    providerKey: "google-drive",
    keywords: ["files", "docs", "storage", "google", "workspace"],
  },
  {
    id: "outlook",
    name: "Outlook",
    tagline: "Microsoft 365 mail: search, draft and send.",
    group: "communication",
    deployment: "native",
    icon: bundledLogo("outlook") ?? GENERIC_MCP_LOGO,
    providerKey: "outlook",
    keywords: ["email", "microsoft", "office", "365", "exchange"],
  },
  {
    id: "github-native",
    name: "GitHub (OAuth)",
    tagline: "repositories and issues over GitHub's own API.",
    group: "development",
    deployment: "native",
    icon: bundledLogo("github") ?? GENERIC_MCP_LOGO,
    providerKey: "github",
    keywords: ["git", "repo", "issues", "oauth"],
  },
  {
    id: "slack-native",
    name: "Slack (OAuth)",
    tagline: "list channels and post messages.",
    group: "communication",
    deployment: "native",
    icon: bundledLogo("slack") ?? GENERIC_MCP_LOGO,
    providerKey: "slack",
    keywords: ["chat", "channel", "message", "oauth"],
  },
  {
    id: "notion-native",
    name: "Notion (OAuth)",
    tagline: "search pages, create pages, append notes.",
    group: "documents",
    deployment: "native",
    icon: bundledLogo("notion") ?? GENERIC_MCP_LOGO,
    providerKey: "notion",
    keywords: ["docs", "wiki", "notes", "oauth"],
  },
];

export const GROUP_LABEL: Record<CatalogGroup, string> = {
  development: "development",
  communication: "communication",
  documents: "documents",
  data: "data",
  infrastructure: "infrastructure",
  commerce: "commerce",
  design: "design",
  automation: "automation",
};

export function listCatalog(): CatalogEntry[] {
  return ENTRIES;
}

export function catalogEntry(id: string): CatalogEntry | undefined {
  return ENTRIES.find((e) => e.id === id);
}

/**
 * Search the gallery by name, tagline, group or alias. An empty query returns
 * everything (the gallery is meant to be browsed, not interrogated).
 */
export function searchCatalog(query: string): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return ENTRIES;
  const terms = q.split(/\s+/).filter(Boolean);
  return ENTRIES.map((entry) => {
    const hay = [
      entry.name,
      entry.tagline,
      entry.group,
      entry.deployment,
      ...(entry.keywords ?? []),
    ]
      .join(" ")
      .toLowerCase();
    // Every term must appear somewhere — "google mail" shouldn't match every
    // Google entry, and a two-word query is a narrowing, not a widening.
    const score = terms.every((t) => hay.includes(t))
      ? (entry.name.toLowerCase().startsWith(q) ? 3 : 0) +
        (entry.name.toLowerCase().includes(q) ? 2 : 0) +
        1
      : 0;
    return { entry, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.entry);
}
