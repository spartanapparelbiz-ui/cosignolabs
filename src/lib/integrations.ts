/** The integrations cosigno can connect (beta stubs). */
export const AVAILABLE_INTEGRATIONS = [
  {
    key: "gmail",
    name: "Gmail",
    detail: "read, draft, send — sends always wait for approval.",
    scopes: "read · draft · send",
  },
  {
    key: "webhook",
    name: "generic webhook",
    detail: "POST a signed payload to an endpoint you configure.",
    scopes: "outbound POST",
  },
] as const;

export const INTEGRATION_KEYS = AVAILABLE_INTEGRATIONS.map((i) => i.key) as [
  string,
  ...string[],
];
