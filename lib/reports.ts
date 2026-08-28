import {
  AdSpendEntry,
  FunnelConfig,
  InventorySnapshot,
  ProfitTimelinePoint,
  Product,
  ReportOrder,
  ReportOrderItem,
  ReportShippingAddress,
  ReportingSyncState,
  StoredReportOrder,
} from "@/lib/types";
import { writeConfig } from "@/lib/config-store";
import { isProductActiveInFunnel, parsePriceLabel, weekStartFromDate } from "@/lib/funnel";
import {
  hasReportDatabase,
  readStoredOrders,
  readSyncState,
  syncStoredOrders,
} from "@/lib/report-store";

export type ShopifyConnectionState =
  | {
      status: "missing-config";
      message: string;
    }
  | {
      status: "connected";
      message: string;
    }
  | {
      status: "error";
      message: string;
    };

type ReportSyncOptions = {
  forceRescan?: boolean;
  maxOrdersToScan?: number;
};

type ShopifyEnv = {
  domain: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
};

type ShopifyMoney = {
  amount: string;
  currencyCode: string;
};

type ShopifyOrderNode = {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFinancialStatus:
    | "AUTHORIZED"
    | "EXPIRED"
    | "PAID"
    | "PARTIALLY_PAID"
    | "PARTIALLY_REFUNDED"
    | "PENDING"
    | "REFUNDED"
    | "VOIDED";
  email: string | null;
  discountCodes: string[];
  discountApplications: {
    edges: Array<{
      node:
        | {
            __typename?: "DiscountCodeApplication";
            code: string;
          }
        | {
            __typename?: string;
          };
    }>;
  };
  shippingAddress: null | {
    name: string | null;
    company: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country: string | null;
    phone: string | null;
  };
  currentTotalPriceSet: {
    shopMoney: ShopifyMoney;
  };
  lineItems: {
    edges: Array<{
      node: {
        title: string;
        quantity: number;
        discountedTotalSet: {
          shopMoney: ShopifyMoney;
        };
        variant: null | {
          id: string;
          sku: string | null;
          availableQuantity: number | null;
        };
      };
    }>;
  };
};

type ShopifyOrdersResponse = {
  data?: {
    orders?: {
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      edges: Array<{
        node: ShopifyOrderNode;
      }>;
    };
  };
  errors?: Array<{
    message: string;
  }>;
};

type ShopifyVariantInventoryResponse = {
  data?: {
    nodes?: Array<
      | {
          __typename?: "ProductVariant";
          id: string;
          availableQuantity: number | null;
        }
      | null
    >;
  };
  errors?: Array<{
    message: string;
  }>;
};

type ShopifyAccessTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

function toCurrencyValue(value?: string) {
  if (!value) {
    return 0;
  }

  return parsePriceLabel(value);
}

function moneyToNumber(value?: ShopifyMoney | null) {
  if (!value?.amount) {
    return 0;
  }

  return Number(value.amount);
}

function productUnitCost(product?: Product | null) {
  return toCurrencyValue(product?.unitCost);
}

function productUnitCostAtUnit(product: Product, soldUnit: number) {
  const tiers = [...(product.costTiers || [])]
    .filter((tier) => Number.isInteger(tier.startAtUnit) && tier.startAtUnit > 0 && tier.unitCost)
    .sort((left, right) => left.startAtUnit - right.startAtUnit);
  const applicableTier = tiers.reduce<typeof tiers[number] | undefined>(
    (current, tier) => (tier.startAtUnit <= soldUnit ? tier : current),
    undefined,
  );
  return applicableTier ? toCurrencyValue(applicableTier.unitCost) : productUnitCost(product);
}

function productPostageCost(product?: Product | null, fallbackPostageCost = 0) {
  const productPostage = toCurrencyValue(product?.postageCost);
  return productPostage > 0 ? productPostage : fallbackPostageCost;
}

function normalizeVariantId(variantId?: string | null) {
  if (!variantId) {
    return "";
  }

  return variantId.trim();
}

function extractVariantNumericId(variantId?: string | null) {
  const normalized = normalizeVariantId(variantId);
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("gid://")) {
    return normalized.split("/").pop()?.trim() || "";
  }

  return normalized.split(":")[0]?.trim() || normalized;
}

function toVariantGid(variantId?: string | null) {
  const normalized = normalizeVariantId(variantId);
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("gid://")) {
    return normalized;
  }

  const numericId = extractVariantNumericId(normalized);
  return numericId ? `gid://shopify/ProductVariant/${numericId}` : "";
}

function productByVariantId(config: FunnelConfig, variantId?: string | null) {
  const normalized = normalizeVariantId(variantId);
  const numericId = extractVariantNumericId(variantId);
  if (!normalized) {
    return null;
  }

  for (const product of config.products) {
    const productVariantId = normalizeVariantId(product.variantId);
    if (
      productVariantId === normalized ||
      extractVariantNumericId(productVariantId) === numericId
    ) {
      return product;
    }

    const variant = product.variants?.find(
      (item) => {
        const itemVariantId = normalizeVariantId(item.variantId);
        return itemVariantId === normalized || extractVariantNumericId(itemVariantId) === numericId;
      },
    );
    if (variant) {
      return product;
    }
  }

  return null;
}

function productForReportItem(config: FunnelConfig, item: ReportOrderItem) {
  if (item.productId) {
    const product = config.products.find((candidate) => candidate.id === item.productId);
    if (product) return product;
  }

  return productByVariantId(config, item.variantId) ||
    config.products.find((product) => product.name === item.productName) ||
    null;
}

const REPORT_START_DATE = "2026-07-01";
const REPORT_START_TIMESTAMP = "2026-07-01T00:00:00.000Z";
const REPORT_SYNC_FRESHNESS_MS = 5 * 60 * 1000;

function isOnOrAfterReportStart(purchasedAt: string) {
  return purchasedAt >= REPORT_START_DATE;
}

export function getAdSpendEntries(config: FunnelConfig): AdSpendEntry[] {
  const recordedEntries = [...(config.reporting?.adSpendEntries || [])]
    .filter((entry) => entry.recordedAt && entry.totalAmount)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  if (recordedEntries.length > 0) {
    return recordedEntries;
  }

  const directTotal = config.reporting?.totalAdSpend?.trim();
  if (directTotal) {
    return [
      {
        id: "legacy-total-ad-spend",
        recordedAt: new Date().toISOString(),
        totalAmount: directTotal,
        notes: "Migrated from legacy total ad spend",
      },
    ];
  }

  const weeklyEntries = (config.reporting?.weeklyAdSpend || [])
    .filter((entry) => entry.weekStart && entry.amount)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  if (weeklyEntries.length === 0) {
    return [];
  }

  let runningTotal = 0;
  return weeklyEntries.map((entry) => {
    runningTotal += toCurrencyValue(entry.amount);

    return {
      id: entry.id,
      recordedAt: `${entry.weekStart}T00:00:00.000Z`,
      totalAmount: String(runningTotal),
      notes: entry.notes,
    };
  });
}

function latestTotalAdSpend(config: FunnelConfig) {
  const entries = getAdSpendEntries(config);
  const latestEntry = entries[entries.length - 1];
  return latestEntry ? toCurrencyValue(latestEntry.totalAmount) : 0;
}

function withAllocatedWeeklyAdSpend(
  config: FunnelConfig,
  orders: Array<
    Omit<ReportOrder, "adSpendAllocated" | "profitLoss"> & {
      adSpendAllocated?: number;
      profitLoss?: number;
    }
  >,
): ReportOrder[] {
  const campaignTotalAdSpend = latestTotalAdSpend(config);
  const orderCount = orders.length || 1;

  return orders.map((order) => {
    const adSpendAllocated = campaignTotalAdSpend / orderCount;
    const profitLoss = order.revenue - order.unitCostTotal - order.postageCost - adSpendAllocated;

    return {
      ...order,
      adSpendAllocated,
      profitLoss,
    };
  });
}

function placeholderItems(config: FunnelConfig): ReportOrderItem[] {
  const defaults = config.products.filter(
    (product) => product.isDefault && isProductActiveInFunnel(product),
  );
  const upsells = config.products
    .filter((product) => !product.isDefault && isProductActiveInFunnel(product))
    .slice(0, 2);
  const selected = [...defaults, ...upsells];

  return selected.map((product) => ({
    productId: product.id,
    variantId: product.variantId,
    productName: product.name,
    quantity: 1,
    revenue: toCurrencyValue(product.priceLabel),
    unitCost: productUnitCost(product),
    availableStock: null,
  }));
}

function normalizeShippingAddress(
  address?: ShopifyOrderNode["shippingAddress"],
): ReportShippingAddress | null {
  if (!address) {
    return null;
  }

  return {
    name: address.name || undefined,
    company: address.company || undefined,
    address1: address.address1 || undefined,
    address2: address.address2 || undefined,
    city: address.city || undefined,
    province: address.province || undefined,
    zip: address.zip || undefined,
    country: address.country || undefined,
    phone: address.phone || undefined,
  };
}

function trackingKey(config: FunnelConfig) {
  const trackedDiscountCode = (config.reporting?.reportDiscountCode || "FREECD").trim().toLowerCase();
  const trackedProductSku = (config.reporting?.trackedProductSku || "").trim().toLowerCase();
  return `${REPORT_START_DATE}::${trackedDiscountCode}::${trackedProductSku}`;
}

function getCachedOrders(config: FunnelConfig) {
  return [...(config.reporting?.cachedOrders || [])]
    .filter((order) => order.source === "shopify")
    .filter((order) => isOnOrAfterReportStart(order.purchasedAt))
    .sort((a, b) =>
      (b.purchasedAtTimestamp || `${b.purchasedAt}T12:00:00.000Z`).localeCompare(
        a.purchasedAtTimestamp || `${a.purchasedAt}T12:00:00.000Z`,
      ),
    );
}

async function getPersistedOrders(config: FunnelConfig, activeTrackingKey: string) {
  if (hasReportDatabase()) {
    const storedOrders = await readStoredOrders(activeTrackingKey);
    return storedOrders
      .filter((order) => order.source === "shopify")
      .filter((order) => isOnOrAfterReportStart(order.purchasedAt))
      .sort((a, b) =>
        (b.purchasedAtTimestamp || `${b.purchasedAt}T12:00:00.000Z`).localeCompare(
          a.purchasedAtTimestamp || `${a.purchasedAt}T12:00:00.000Z`,
        ),
      );
  }

  return getCachedOrders(config);
}

function newestCachedTimestamp(cachedOrders: StoredReportOrder[]) {
  return cachedOrders.reduce((latest, order) => {
    const timestamp = order.purchasedAtTimestamp || `${order.purchasedAt}T12:00:00.000Z`;
    return timestamp > latest ? timestamp : latest;
  }, "");
}

function applyProductCostHistory(config: FunnelConfig, storedOrders: StoredReportOrder[]): StoredReportOrder[] {
  const soldUnitsByProduct = new Map<string, number>();
  const oldestFirst = [...storedOrders].sort((left, right) => {
    const leftTimestamp = left.purchasedAtTimestamp || `${left.purchasedAt}T12:00:00.000Z`;
    const rightTimestamp = right.purchasedAtTimestamp || `${right.purchasedAt}T12:00:00.000Z`;
    return leftTimestamp.localeCompare(rightTimestamp) || left.id.localeCompare(right.id);
  });

  const processedById = new Map(oldestFirst.map((order) => {
    let unitCostTotal = 0;
    const items = order.items.map((item) => {
      const product = productForReportItem(config, item);
      if (!product) {
        unitCostTotal += item.unitCost * item.quantity;
        return item;
      }

      const soldBefore = soldUnitsByProduct.get(product.id) || 0;
      const itemCostTotal = Array.from({ length: item.quantity }, (_, index) =>
        productUnitCostAtUnit(product, soldBefore + index + 1),
      ).reduce((sum, unitCost) => sum + unitCost, 0);
      soldUnitsByProduct.set(product.id, soldBefore + item.quantity);
      unitCostTotal += itemCostTotal;

      return {
        ...item,
        productId: product.id,
        unitCost: item.quantity ? itemCostTotal / item.quantity : 0,
      };
    });

    return [order.id, { ...order, items, unitCostTotal }] as const;
  }));

  return storedOrders.map((order) => processedById.get(order.id) || order);
}

function hydrateStoredOrders(config: FunnelConfig, storedOrders: StoredReportOrder[]) {
  return withAllocatedWeeklyAdSpend(config, applyProductCostHistory(config, storedOrders));
}

function escapeCsvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

export function buildOrdersCsv(orders: ReportOrder[]) {
  const headers = [
    "order_number",
    "order_date",
    "email",
    "shipping_name",
    "shipping_company",
    "address_1",
    "address_2",
    "city",
    "province",
    "postcode",
    "country",
    "phone",
    "items",
    "revenue",
    "unit_cost",
    "postage_cost",
    "weekly_ad_spend",
    "profit_loss",
  ];

  const rows = orders.map((order) => {
    const shipping = order.shippingAddress;
    const items = order.items.map((item) => `${item.productName} x${item.quantity}`).join(" | ");

    return [
      order.orderNumber,
      order.purchasedAt,
      order.email || "",
      shipping?.name || "",
      shipping?.company || "",
      shipping?.address1 || "",
      shipping?.address2 || "",
      shipping?.city || "",
      shipping?.province || "",
      shipping?.zip || "",
      shipping?.country || "",
      shipping?.phone || "",
      items,
      order.revenue.toFixed(2),
      order.unitCostTotal.toFixed(2),
      order.postageCost.toFixed(2),
      order.adSpendAllocated.toFixed(2),
      order.profitLoss.toFixed(2),
    ]
      .map(escapeCsvCell)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

export function buildPlaceholderOrders(config: FunnelConfig): ReportOrder[] {
  const fallbackPostageCost = toCurrencyValue(config.reporting?.defaultPostageCost);
  const placeholderOrderCount = latestTotalAdSpend(config) > 0 ? 1 : 0;

  const placeholderOrders = Array.from({ length: placeholderOrderCount }, (_, index) => {
    const items = placeholderItems(config);
    const revenue = items.reduce((sum, item) => sum + item.revenue * item.quantity, 0);
    const unitCostTotal = items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
    const postageCost = selectedPlaceholderProducts(config).reduce(
      (sum, product) => sum + productPostageCost(product, fallbackPostageCost),
      0,
    );
    const purchasedAt = "2026-07-01";

    return {
      id: `placeholder-${index}`,
      orderNumber: `PLACEHOLDER-${index + 1}`,
      purchasedAt,
      purchasedAtTimestamp: REPORT_START_TIMESTAMP,
      weekStart: weekStartFromDate(purchasedAt),
      email: null,
      shippingAddress: null,
      discountCodes: [config.reporting?.reportDiscountCode || "FREECD"],
      postageCost,
      revenue,
      unitCostTotal,
      items,
      source: "placeholder" as const,
    };
  });

  return withAllocatedWeeklyAdSpend(config, placeholderOrders);
}

function selectedPlaceholderProducts(config: FunnelConfig) {
  const defaults = config.products.filter(
    (product) => product.isDefault && isProductActiveInFunnel(product),
  );
  const upsells = config.products
    .filter((product) => !product.isDefault && isProductActiveInFunnel(product))
    .slice(0, 2);
  return [...defaults, ...upsells];
}

function shopifyEnv(): ShopifyEnv | null {
  const rawDomain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  const domain = rawDomain?.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  if (!domain) {
    return null;
  }

  return { domain, token, clientId, clientSecret };
}

function shopifyAuthMode(env: ShopifyEnv) {
  if (env.token) {
    return "static admin token";
  }

  if (env.clientId && env.clientSecret) {
    return "client credentials";
  }

  return "incomplete credentials";
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    const causeMessage =
      error.cause instanceof Error
        ? error.cause.message
        : typeof error.cause === "string"
          ? error.cause
          : "";
    return causeMessage ? `${error.message} (${causeMessage})` : error.message;
  }

  return String(error);
}

async function getShopifyAccessToken(env: ShopifyEnv) {
  if (env.token) {
    return env.token;
  }

  if (!env.clientId || !env.clientSecret) {
    throw new Error(
      "Missing Shopify credentials. Add SHOPIFY_ADMIN_ACCESS_TOKEN or both SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.",
    );
  }

  const response = await fetch(`https://${env.domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      grant_type: "client_credentials",
    }).toString(),
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const body = await response.text();
    throw new Error(
      `Shopify token request returned ${response.status} ${response.statusText} instead of JSON. ${body.slice(0, 160)}`,
    );
  }

  const payload = (await response.json()) as ShopifyAccessTokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        `Shopify token request failed: ${response.status} ${response.statusText}`,
    );
  }

  return payload.access_token;
}

function getConfiguredVariantIds(config: FunnelConfig) {
  const ids = new Set<string>();

  for (const product of config.products) {
    if (product.variantId) {
      ids.add(product.variantId);
    }

    for (const variant of product.variants || []) {
      if (variant.variantId) {
        ids.add(variant.variantId);
      }
    }
  }

  return [...ids];
}

function orderMatchesFunnel(
  order: ShopifyOrderNode,
  trackedDiscountCode: string,
  trackedProductSku?: string,
) {
  if (order.cancelledAt) {
    return false;
  }

  if (order.displayFinancialStatus === "REFUNDED" || order.displayFinancialStatus === "VOIDED") {
    return false;
  }

  const normalizedTrackedSku = trackedProductSku?.trim().toLowerCase();

  if (normalizedTrackedSku) {
    return order.lineItems.edges.some(({ node }) => node.variant?.sku?.trim().toLowerCase() === normalizedTrackedSku);
  }

  const normalizedTrackedCode = trackedDiscountCode.trim().toLowerCase();

  const directDiscountCodeMatch = order.discountCodes.some(
    (code) => code.trim().toLowerCase() === normalizedTrackedCode,
  );

  if (directDiscountCodeMatch) {
    return true;
  }

  return order.discountApplications.edges.some(({ node }) => {
    if (node.__typename !== "DiscountCodeApplication" || !("code" in node)) {
      return false;
    }

    return node.code.trim().toLowerCase() === normalizedTrackedCode;
  });
}

export async function getShopifyInventorySnapshot(
  config: FunnelConfig,
): Promise<InventorySnapshot> {
  const env = shopifyEnv();
  if (!env) {
    return {};
  }

  let accessToken: string;
  try {
    accessToken = await getShopifyAccessToken(env);
  } catch (error) {
    throw new Error(
      `Token fetch failed for ${env.domain} using ${shopifyAuthMode(env)}: ${describeError(error)}`,
    );
  }

  const configuredVariantIds = getConfiguredVariantIds(config);
  const variantGids = [...new Set(configuredVariantIds.map((id) => toVariantGid(id)).filter(Boolean))];

  if (variantGids.length === 0) {
    return {};
  }

  let response: Response;
  try {
    response = await fetch(`https://${env.domain}/admin/api/2026-07/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: `
          query VariantInventorySnapshot($ids: [ID!]!) {
            nodes(ids: $ids) {
              __typename
              ... on ProductVariant {
                id
                availableQuantity: inventoryQuantity
              }
            }
          }
        `,
        variables: {
          ids: variantGids,
        },
      }),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      `Inventory fetch failed for ${env.domain} using ${shopifyAuthMode(env)}: ${describeError(error)}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Shopify inventory fetch failed for ${env.domain} using ${shopifyAuthMode(env)}: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as ShopifyVariantInventoryResponse;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((item) => item.message).join(", "));
  }

  const byNumericId = new Map<string, number | null>();

  for (const node of payload.data?.nodes || []) {
    if (!node || node.__typename !== "ProductVariant") {
      continue;
    }

    const numericId = extractVariantNumericId(node.id);
    if (!numericId) {
      continue;
    }

    byNumericId.set(numericId, node.availableQuantity ?? null);
  }

  const snapshot: InventorySnapshot = {};
  for (const configuredId of configuredVariantIds) {
    const numericId = extractVariantNumericId(configuredId);
    snapshot[configuredId] = numericId && byNumericId.has(numericId) ? byNumericId.get(numericId)! : null;
  }

  return snapshot;
}

async function fetchShopifyOrderPage(
  env: ShopifyEnv,
  accessToken: string,
  afterCursor?: string,
) {
  const query = `
    query FunnelOrdersPage($after: String) {
      orders(first: 100, after: $after, sortKey: CREATED_AT, reverse: true, query: "status:any") {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            name
            createdAt
            cancelledAt
            displayFinancialStatus
            email
            discountCodes
            discountApplications(first: 20) {
              edges {
                node {
                  __typename
                  ... on DiscountCodeApplication {
                    code
                  }
                }
              }
            }
            shippingAddress {
              name
              company
              address1
              address2
              city
              province
              zip
              country
              phone
            }
            currentTotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            lineItems(first: 50) {
              edges {
                node {
                  title
                  quantity
                  discountedTotalSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  variant {
                    id
                    sku
                    availableQuantity: inventoryQuantity
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  let response: Response;
  try {
    response = await fetch(`https://${env.domain}/admin/api/2026-07/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query,
        variables: {
          after: afterCursor || null,
        },
      }),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      `Orders query fetch failed for ${env.domain} using ${shopifyAuthMode(env)}: ${describeError(error)}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Shopify order fetch failed for ${env.domain} using ${shopifyAuthMode(env)}: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as ShopifyOrdersResponse;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((item) => item.message).join(", "));
  }

  return payload.data?.orders || { edges: [], pageInfo: { hasNextPage: false, endCursor: null } };
}

function mapShopifyOrderToStoredOrder(
  config: FunnelConfig,
  order: ShopifyOrderNode,
): StoredReportOrder {
  const items: ReportOrderItem[] = order.lineItems.edges.map(({ node }) => {
    const product = productByVariantId(config, node.variant?.id || null);
    return {
      productId: product?.id,
      variantId: node.variant?.id || undefined,
      productName: product?.name || node.title,
      quantity: node.quantity,
      revenue: moneyToNumber(node.discountedTotalSet?.shopMoney),
      unitCost: productUnitCost(product),
      availableStock: node.variant?.availableQuantity ?? null,
    };
  });

  const purchasedAt = order.createdAt.slice(0, 10);
  const weekStart = weekStartFromDate(purchasedAt);
  const unitCostTotal = items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
  const postageCost = order.lineItems.edges.reduce((sum, { node }) => {
    const product = productByVariantId(config, node.variant?.id || null);
    return sum + productPostageCost(product, 0) * node.quantity;
  }, 0);
  const revenue = moneyToNumber(order.currentTotalPriceSet?.shopMoney);

  return {
    id: order.id,
    orderNumber: order.name,
    purchasedAt,
    purchasedAtTimestamp: order.createdAt,
    weekStart,
    email: order.email,
    shippingAddress: normalizeShippingAddress(order.shippingAddress),
    discountCodes: order.discountCodes,
    postageCost,
    revenue,
    unitCostTotal,
    items,
    source: "shopify",
  };
}

async function getShopifyAccessTokenForEnv(env: ShopifyEnv) {
  try {
    return await getShopifyAccessToken(env);
  } catch (error) {
    throw new Error(
      `Token fetch failed for ${env.domain} using ${shopifyAuthMode(env)}: ${describeError(error)}`,
    );
  }
}

async function syncCachedShopifyOrders(
  config: FunnelConfig,
  options: ReportSyncOptions = {},
): Promise<StoredReportOrder[]> {
  const env = shopifyEnv();
  if (!env) {
    return getCachedOrders(config);
  }

  const trackedDiscountCode = config.reporting?.reportDiscountCode || "FREECD";
  const trackedProductSku = config.reporting?.trackedProductSku?.trim();
  const activeTrackingKey = trackingKey(config);
  const previousSync: ReportingSyncState | undefined = hasReportDatabase()
    ? await readSyncState(activeTrackingKey)
    : config.reporting?.sync;
  const shouldResetCache = previousSync?.trackingKey !== activeTrackingKey;
  const baseCachedOrders = shouldResetCache ? [] : await getPersistedOrders(config, activeTrackingKey);
  const cachedById = new Map(baseCachedOrders.map((order) => [order.id, order]));
  const newestKnownTimestamp = shouldResetCache ? "" : previousSync?.newestOrderCreatedAt || newestCachedTimestamp(baseCachedOrders);
  const maxOrdersToScan = options.maxOrdersToScan && options.maxOrdersToScan > 0 ? options.maxOrdersToScan : Infinity;

  const lastSyncedAt = previousSync?.lastSyncedAt ? Date.parse(previousSync.lastSyncedAt) : 0;
  if (
    !options.forceRescan &&
    baseCachedOrders.length > 0 &&
    lastSyncedAt > 0 &&
    Date.now() - lastSyncedAt < REPORT_SYNC_FRESHNESS_MS
  ) {
    return baseCachedOrders;
  }

  const accessToken = await getShopifyAccessTokenForEnv(env);
  const changedOrders = new Map<string, StoredReportOrder>();
  const removedOrderIds = new Set<string>();

  let afterCursor: string | undefined;
  let hasNextPage = true;
  let reachedKnownHistory = false;
  let scannedOrders = 0;

  while (hasNextPage && !reachedKnownHistory && scannedOrders < maxOrdersToScan) {
    const page = await fetchShopifyOrderPage(env, accessToken, afterCursor);
    const pageOrders = page.edges.map((edge) => edge.node);

    if (pageOrders.length === 0) {
      break;
    }

    scannedOrders += pageOrders.length;

    for (const order of pageOrders) {
      const purchasedAt = order.createdAt.slice(0, 10);
      if (!isOnOrAfterReportStart(purchasedAt)) {
        reachedKnownHistory = true;
        continue;
      }

      const existingOrder = cachedById.get(order.id);
      const matchesFunnel = orderMatchesFunnel(order, trackedDiscountCode, trackedProductSku);

      if (matchesFunnel) {
        const mappedOrder = mapShopifyOrderToStoredOrder(config, order);
        cachedById.set(order.id, mappedOrder);
        if (!existingOrder || JSON.stringify(existingOrder) !== JSON.stringify(mappedOrder)) {
          changedOrders.set(order.id, mappedOrder);
        }
      } else if (existingOrder) {
        cachedById.delete(order.id);
        removedOrderIds.add(order.id);
      }
    }

    const oldestTimestampInPage =
      pageOrders[pageOrders.length - 1]?.createdAt || "";
    const oldestDateInPage =
      pageOrders[pageOrders.length - 1]?.createdAt.slice(0, 10) || "";

    if (oldestDateInPage && !isOnOrAfterReportStart(oldestDateInPage)) {
      reachedKnownHistory = true;
    } else if (
      !options.forceRescan &&
      newestKnownTimestamp &&
      oldestTimestampInPage &&
      oldestTimestampInPage <= newestKnownTimestamp
    ) {
      reachedKnownHistory = true;
    }

    hasNextPage = page.pageInfo.hasNextPage;
    afterCursor = page.pageInfo.endCursor || undefined;
  }

  const mergedOrders = [...cachedById.values()].sort((a, b) =>
    (b.purchasedAtTimestamp || `${b.purchasedAt}T12:00:00.000Z`).localeCompare(
      a.purchasedAtTimestamp || `${a.purchasedAt}T12:00:00.000Z`,
    ),
  );

  const nextSyncState: ReportingSyncState = {
    lastSyncedAt: new Date().toISOString(),
    newestOrderCreatedAt: newestCachedTimestamp(mergedOrders),
    trackingKey: activeTrackingKey,
  };

  if (hasReportDatabase()) {
    await syncStoredOrders(
      activeTrackingKey,
      [...changedOrders.values()],
      [...removedOrderIds],
      nextSyncState,
      shouldResetCache,
    );
  } else {
    config.reporting.cachedOrders = mergedOrders;
    config.reporting.sync = nextSyncState;
    await writeConfig(config);
  }

  return mergedOrders;
}

export async function fetchShopifyOrders(
  config: FunnelConfig,
  options?: ReportSyncOptions,
): Promise<ReportOrder[]> {
  const storedOrders = await syncCachedShopifyOrders(config, options);
  return hydrateStoredOrders(config, storedOrders);
}

export async function getShopifyConnectionState(config: FunnelConfig): Promise<ShopifyConnectionState> {
  const env = shopifyEnv();
  if (!env) {
    return {
      status: "missing-config",
      message:
        "Add SHOPIFY_STORE_DOMAIN plus either SHOPIFY_ADMIN_ACCESS_TOKEN or SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET to enable live reporting.",
    };
  }

  return {
    status: "connected",
    message: config.reporting?.trackedProductSku
      ? `Shopify is configured for ${env.domain}; reports are filtered by SKU ${config.reporting.trackedProductSku}.`
      : `Shopify is configured for ${env.domain}; reports are filtered by the ${config.reporting?.reportDiscountCode || "FREECD"} discount code.`,
  };
}

export async function getReportOrders(config: FunnelConfig, options?: ReportSyncOptions) {
  try {
    const liveOrders = await fetchShopifyOrders(config, options);
    if (liveOrders.length > 0) {
      return liveOrders;
    }
  } catch (error) {
    console.error("Shopify reporting sync failed. Falling back to cached or placeholder report data.", error);
  }

  const cachedOrders = await getPersistedOrders(config, trackingKey(config));
  if (cachedOrders.length > 0) {
    return hydrateStoredOrders(config, cachedOrders);
  }

  return buildPlaceholderOrders(config);
}

export function summarizeProductSales(orders: ReportOrder[]) {
  const counts = new Map<string, { quantity: number; availableStock: number | null }>();

  for (const order of orders) {
    for (const item of order.items) {
      const existing = counts.get(item.productName);
      counts.set(item.productName, {
        quantity: (existing?.quantity || 0) + item.quantity,
        availableStock:
          item.availableStock != null
            ? item.availableStock
            : (existing?.availableStock ?? null),
      });
    }
  }

  return [...counts.entries()]
    .map(([productName, summary]) => ({
      productName,
      quantity: summary.quantity,
      availableStock: summary.availableStock,
    }))
    .sort((a, b) => b.quantity - a.quantity || a.productName.localeCompare(b.productName));
}

export function summarizeWeeklyProfitLoss(orders: ReportOrder[]) {
  const totals = new Map<string, number>();

  for (const order of orders) {
    totals.set(order.weekStart, (totals.get(order.weekStart) || 0) + order.profitLoss);
  }

  return [...totals.entries()]
    .map(([weekStart, profitLoss]) => ({ weekStart, profitLoss }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export function totalProfitLoss(orders: ReportOrder[]) {
  return orders.reduce((sum, order) => sum + order.profitLoss, 0);
}

export function buildProfitTimeline(
  config: FunnelConfig,
  orders: ReportOrder[],
): ProfitTimelinePoint[] {
  const orderedOrders = [...orders]
    .filter((order) => order.purchasedAtTimestamp)
    .sort((a, b) =>
      (a.purchasedAtTimestamp || `${a.purchasedAt}T12:00:00.000Z`).localeCompare(
        b.purchasedAtTimestamp || `${b.purchasedAt}T12:00:00.000Z`,
      ),
    );

  const adSpendEvents = getAdSpendEntries(config)
    .filter((entry) => entry.recordedAt >= REPORT_START_TIMESTAMP)
    .map((entry) => ({
      timestamp: entry.recordedAt,
      kind: "ad-spend" as const,
      label: entry.notes ? `Ad spend: ${entry.notes}` : "Ad spend update",
      totalAmount: toCurrencyValue(entry.totalAmount),
    }));
  const orderEvents = orderedOrders.map((order) => ({
    timestamp: order.purchasedAtTimestamp || `${order.purchasedAt}T12:00:00.000Z`,
    kind: "order" as const,
    label: order.orderNumber,
    order,
  }));
  const events = [...adSpendEvents, ...orderEvents].sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp) || a.kind.localeCompare(b.kind),
  );

  let cumulativeGrossProfit = 0;
  let cumulativeAdSpend = 0;
  let cumulativeCosts = 0;
  let cumulativeRevenue = 0;

  const points: ProfitTimelinePoint[] = [
    {
      timestamp: REPORT_START_TIMESTAMP,
      label: "Campaign start",
      netProfit: 0,
      cumulativeGrossProfit: 0,
      cumulativeAdSpend: 0,
      cumulativeCosts: 0,
      cumulativeRevenue: 0,
      kind: "ad-spend",
    },
  ];

  for (const event of events) {
    if (event.kind === "ad-spend") {
      // Each spend log entry is a total-to-date snapshot, not a new cost for every order.
      cumulativeAdSpend = event.totalAmount;
    } else {
      cumulativeRevenue += event.order.revenue;
      cumulativeCosts += event.order.unitCostTotal + event.order.postageCost;
      cumulativeGrossProfit = cumulativeRevenue - cumulativeCosts;
    }

    points.push({
      timestamp: event.timestamp,
      label: event.label,
      netProfit: cumulativeGrossProfit - cumulativeAdSpend,
      cumulativeGrossProfit,
      cumulativeAdSpend,
      cumulativeCosts,
      cumulativeRevenue,
      kind: event.kind,
    });
  }

  return points;
}

export function hasShopifyReportingConfig() {
  return Boolean(shopifyEnv());
}
