import postgres from "postgres";

import type { ReportOrder, ReportingSyncState, StoredReportOrder } from "@/lib/types";

let sqlClient: postgres.Sql | null = null;
let schemaReadyPromise: Promise<void> | null = null;

function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() || "";
}

export function hasReportDatabase() {
  return Boolean(getDatabaseUrl());
}

function getSql() {
  if (!sqlClient) {
    const databaseUrl = getDatabaseUrl();
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is not configured.");
    }

    sqlClient = postgres(databaseUrl, {
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 15,
    });
  }

  return sqlClient;
}

async function ensureSchema() {
  if (!hasReportDatabase()) {
    return;
  }

  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const sql = getSql();

      await sql`
        create table if not exists report_orders (
          id text primary key,
          tracking_key text not null,
          order_number text not null,
          purchased_at date not null,
          purchased_at_timestamp timestamptz,
          week_start date not null,
          email text,
          shipping_address jsonb,
          discount_codes jsonb not null default '[]'::jsonb,
          postage_cost numeric(12, 2) not null default 0,
          revenue numeric(12, 2) not null default 0,
          unit_cost_total numeric(12, 2) not null default 0,
          items jsonb not null default '[]'::jsonb,
          source text not null default 'shopify',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;

      await sql`
        create index if not exists report_orders_tracking_key_idx
        on report_orders (tracking_key, purchased_at_timestamp desc nulls last, purchased_at desc)
      `;

      await sql`
        create table if not exists report_sync_state (
          tracking_key text primary key,
          last_synced_at timestamptz,
          newest_order_created_at timestamptz
        )
      `;
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  await schemaReadyPromise;
}

function rowToStoredOrder(row: {
  id: string;
  order_number: string;
  purchased_at: string;
  purchased_at_timestamp: string | null;
  week_start: string;
  email: string | null;
  shipping_address: StoredReportOrder["shippingAddress"] | null;
  discount_codes: string[] | null;
  postage_cost: string | number;
  revenue: string | number;
  unit_cost_total: string | number;
  items: StoredReportOrder["items"];
  source: ReportOrder["source"];
}): StoredReportOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    purchasedAt: row.purchased_at,
    purchasedAtTimestamp: row.purchased_at_timestamp || undefined,
    weekStart: row.week_start,
    email: row.email,
    shippingAddress: row.shipping_address,
    discountCodes: Array.isArray(row.discount_codes) ? row.discount_codes : [],
    postageCost: Number(row.postage_cost),
    revenue: Number(row.revenue),
    unitCostTotal: Number(row.unit_cost_total),
    items: Array.isArray(row.items) ? row.items : [],
    source: row.source || "shopify",
  };
}

export async function readStoredOrders(trackingKey: string): Promise<StoredReportOrder[]> {
  if (!hasReportDatabase()) {
    return [];
  }

  await ensureSchema();
  const sql = getSql();
  const rows = await sql<{
    id: string;
    order_number: string;
    purchased_at: string;
    purchased_at_timestamp: string | null;
    week_start: string;
    email: string | null;
    shipping_address: StoredReportOrder["shippingAddress"] | null;
    discount_codes: string[] | null;
    postage_cost: string | number;
    revenue: string | number;
    unit_cost_total: string | number;
    items: StoredReportOrder["items"];
    source: ReportOrder["source"];
  }[]>`
    select
      id,
      order_number,
      purchased_at::text,
      purchased_at_timestamp::text,
      week_start::text,
      email,
      shipping_address,
      discount_codes,
      postage_cost,
      revenue,
      unit_cost_total,
      items,
      source
    from report_orders
    where tracking_key = ${trackingKey}
    order by purchased_at_timestamp desc nulls last, purchased_at desc, order_number desc
  `;

  return rows.map(rowToStoredOrder);
}

export async function readSyncState(trackingKey: string): Promise<ReportingSyncState | undefined> {
  if (!hasReportDatabase()) {
    return undefined;
  }

  await ensureSchema();
  const sql = getSql();
  const rows = await sql<{ last_synced_at: string | null; newest_order_created_at: string | null }[]>`
    select last_synced_at::text, newest_order_created_at::text
    from report_sync_state
    where tracking_key = ${trackingKey}
    limit 1
  `;

  const row = rows[0];
  if (!row) {
    return undefined;
  }

  return {
    trackingKey,
    lastSyncedAt: row.last_synced_at || undefined,
    newestOrderCreatedAt: row.newest_order_created_at || undefined,
  };
}

export async function replaceStoredOrders(
  trackingKey: string,
  orders: StoredReportOrder[],
  sync: ReportingSyncState,
): Promise<void> {
  if (!hasReportDatabase()) {
    return;
  }

  await ensureSchema();
  const sql = getSql();

  await sql.begin(async (transaction) => {
    await transaction`delete from report_orders where tracking_key = ${trackingKey}`;

    for (const order of orders) {
      await transaction`
        insert into report_orders (
          id,
          tracking_key,
          order_number,
          purchased_at,
          purchased_at_timestamp,
          week_start,
          email,
          shipping_address,
          discount_codes,
          postage_cost,
          revenue,
          unit_cost_total,
          items,
          source
        ) values (
          ${order.id},
          ${trackingKey},
          ${order.orderNumber},
          ${order.purchasedAt},
          ${order.purchasedAtTimestamp || null},
          ${order.weekStart},
          ${order.email || null},
          ${transaction.json(order.shippingAddress || null)},
          ${transaction.json(order.discountCodes || [])},
          ${order.postageCost},
          ${order.revenue},
          ${order.unitCostTotal},
          ${transaction.json(order.items || [])},
          ${order.source}
        )
      `;
    }

    await transaction`
      insert into report_sync_state (
        tracking_key,
        last_synced_at,
        newest_order_created_at
      ) values (
        ${trackingKey},
        ${sync.lastSyncedAt || null},
        ${sync.newestOrderCreatedAt || null}
      )
      on conflict (tracking_key) do update set
        last_synced_at = excluded.last_synced_at,
        newest_order_created_at = excluded.newest_order_created_at
    `;
  });
}
