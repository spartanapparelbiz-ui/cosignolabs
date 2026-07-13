-- cosigno · browser operator MVP — real product findings + page preview
--
-- browser_products stores what the operator ACTUALLY found on a page during
-- research: only fields present on the page are set, everything else is null
-- (missing data is never invented). Rows are workspace-scoped by RLS and are
-- untrusted page data — the injection flag records when a page tried to steer
-- the agent; it is never obeyed.
--
-- browser_sessions gains screenshot_ref: a bounded JPEG data URI of the
-- current page (or a labeled sandbox placeholder), shown on the browser view.

alter table browser_sessions add column screenshot_ref text;

create table browser_products (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mission_id uuid not null references missions (id) on delete cascade,
  session_id uuid not null references browser_sessions (id) on delete cascade,
  name text not null check (char_length(name) <= 300),
  brand text not null default '',
  current_price numeric,
  currency text not null default 'USD',
  retailer text not null default '',
  product_url text not null check (char_length(product_url) <= 2048),
  processor text,
  memory text,
  storage text,
  display text,
  graphics text,
  battery_claim text,
  availability text,
  warranty text,
  return_policy text,
  source_title text not null default '',
  injection_flag boolean not null default false,
  simulated boolean not null default true,
  accessed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index browser_products_mission_idx on browser_products (mission_id, created_at);
create index browser_products_user_idx on browser_products (user_id);

alter table browser_products enable row level security;
revoke all on browser_products from authenticated, anon;
grant select on browser_products to authenticated;
create policy browser_products_self on browser_products
  for select using (user_id = auth_uid());
