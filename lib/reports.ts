import {
  FunnelConfig,
  InventorySnapshot,
  Product,
  ReportOrder,
  ReportOrderItem,
  ReportShippingAddress,
} from "@/lib/types";
import { isProductActiveInFunnel, parsePriceLabel, weekStartFromDate } from "@/lib/funnel";

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
  email: string | null;
  discountCodes: string[];
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
          inventoryQuantity: number | null;
        };
      };
    }>;
  };
};

type ShopifyOrdersResponse = {
  data?: {
    orders?: {
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
          inventoryQuantity: number | null;
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

function adSpendForWeek(config: FunnelConfig, weekStart: string) {
  const entry = config.reporting?.weeklyAdSpend?.find((item) => item.weekStart === weekStart);
  return toCurrencyValue(entry?.amount);
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
    productName: product.name,
    quantity: 1,
    revenue: toCurrencyValue(product.priceLabel),
    unitCost: productUnitCost(product),
    stockOnHand: null,
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
  const adSpendEntries = config.reporting?.weeklyAdSpend || [];

  return adSpendEntries.slice(0, 4).map((entry, index) => {
    const items = placeholderItems(config);
    const revenue = items.reduce((sum, item) => sum + item.revenue * item.quantity, 0);
    const unitCostTotal = items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
    const postageCost = selectedPlaceholderProducts(config).reduce(
      (sum, product) => sum + productPostageCost(product, fallbackPostageCost),
      0,
    );
    const adSpendAllocated = toCurrencyValue(entry.amount);
    const purchasedAt = entry.weekStart;

    return {
      id: `placeholder-${index}`,
      orderNumber: `PLACEHOLDER-${index + 1}`,
      purchasedAt,
      weekStart: weekStartFromDate(purchasedAt),
      email: null,
      shippingAddress: null,
      discountCodes: [config.reporting?.reportDiscountCode || "FREECD"],
      postageCost,
      adSpendAllocated,
      revenue,
      unitCostTotal,
      profitLoss: revenue - unitCostTotal - postageCost - adSpendAllocated,
      items,
      source: "placeholder",
    };
  });
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

function getTrackedDiscountCodes(config: FunnelConfig) {
  const codes = new Set<string>();

  const reportCode = config.reporting?.reportDiscountCode?.trim();
  if (reportCode) {
    codes.add(reportCode);
  }

  for (const discount of config.discounts || []) {
    const code = discount.code?.trim();
    if (code) {
      codes.add(code);
    }
  }

  for (const product of config.products || []) {
    for (const code of product.autoDiscountCodes || []) {
      const trimmed = code.trim();
      if (trimmed) {
        codes.add(trimmed);
      }
    }
  }

  return [...codes];
}

function orderMatchesFunnel(
  config: FunnelConfig,
  order: ShopifyOrderNode,
  trackedDiscountCodes: Set<string>,
) {
  const orderDiscountMatch = order.discountCodes.some((code) => trackedDiscountCodes.has(code.trim()));
  if (orderDiscountMatch) {
    return true;
  }

  return order.lineItems.edges.some(({ node }) => Boolean(productByVariantId(config, node.variant?.id || null)));
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
                inventoryQuantity
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

    byNumericId.set(numericId, node.inventoryQuantity ?? null);
  }

  const snapshot: InventorySnapshot = {};
  for (const configuredId of configuredVariantIds) {
    const numericId = extractVariantNumericId(configuredId);
    snapshot[configuredId] = numericId && byNumericId.has(numericId) ? byNumericId.get(numericId)! : null;
  }

  return snapshot;
}

export async function fetchShopifyOrders(config: FunnelConfig): Promise<ReportOrder[]> {
  const env = shopifyEnv();
  if (!env) {
    return [];
  }
  let accessToken: string | null = null;
  try {
    accessToken = await getShopifyAccessToken(env);
  } catch (error) {
    throw new Error(
      `Token fetch failed for ${env.domain} using ${shopifyAuthMode(env)}: ${describeError(error)}`,
    );
  }
  if (!accessToken) {
    return [];
  }

  const trackedDiscountCodes = getTrackedDiscountCodes(config);
  const query = `
    query FunnelOrders {
      orders(first: 100, sortKey: CREATED_AT, reverse: true, query: "status:any") {
        edges {
          node {
            id
            name
            createdAt
            email
            discountCodes
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
                    inventoryQuantity
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

  const orders =
    payload.data?.orders?.edges
      .map((edge) => edge.node)
      .filter((order) => orderMatchesFunnel(config, order, new Set(trackedDiscountCodes))) || [];
  const fallbackPostageCost = toCurrencyValue(config.reporting?.defaultPostageCost);

  const reportOrders = orders.map((order) => {
    const items: ReportOrderItem[] = order.lineItems.edges.map(({ node }) => {
      const product = productByVariantId(config, node.variant?.id || null);
      return {
        productName: product?.name || node.title,
        quantity: node.quantity,
        revenue: moneyToNumber(node.discountedTotalSet?.shopMoney),
        unitCost: productUnitCost(product),
        stockOnHand: node.variant?.inventoryQuantity ?? null,
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
    const adSpendAllocated = adSpendForWeek(config, weekStart);

    return {
      id: order.id,
      orderNumber: order.name,
      purchasedAt,
      weekStart,
      email: order.email,
      shippingAddress: normalizeShippingAddress(order.shippingAddress),
      discountCodes: order.discountCodes,
      postageCost,
      adSpendAllocated,
      revenue,
      unitCostTotal,
      profitLoss: revenue - unitCostTotal - postageCost - adSpendAllocated,
      items,
      source: "shopify" as const,
    };
  });

  return reportOrders;
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

  try {
    await fetchShopifyOrders(config);
    return {
      status: "connected",
      message: `Shopify API is responding for ${env.domain} using ${shopifyAuthMode(env)}. Orders are being filtered by the ${config.reporting?.reportDiscountCode || "FREECD"} discount code.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Shopify reporting fetch failed.",
    };
  }
}

export async function getReportOrders(config: FunnelConfig) {
  try {
    const liveOrders = await fetchShopifyOrders(config);
    if (liveOrders.length > 0) {
      return liveOrders;
    }
  } catch (error) {
    console.error("Shopify reporting fetch failed. Falling back to placeholder report data.", error);
  }

  return buildPlaceholderOrders(config);
}

export function summarizeProductSales(orders: ReportOrder[]) {
  const counts = new Map<string, number>();

  for (const order of orders) {
    for (const item of order.items) {
      counts.set(item.productName, (counts.get(item.productName) || 0) + item.quantity);
    }
  }

  return [...counts.entries()]
    .map(([productName, quantity]) => ({ productName, quantity }))
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

export function hasShopifyReportingConfig() {
  return Boolean(shopifyEnv());
}
