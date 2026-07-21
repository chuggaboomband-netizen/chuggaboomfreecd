import { FunnelConfig, Product, ReportOrder, ReportOrderItem } from "@/lib/types";
import { parsePriceLabel, weekStartFromDate } from "@/lib/funnel";

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

type ShopifyMoney = {
  amount: string;
  currencyCode: string;
};

type ShopifyOrderNode = {
  id: string;
  name: string;
  createdAt: string;
  discountCodes: string[];
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

function productPostageCost(product?: Product | null, defaultPostageCost = 0) {
  const productPostage = toCurrencyValue(product?.postageCost);
  return productPostage > 0 ? productPostage : defaultPostageCost;
}

function normalizeVariantId(variantId?: string | null) {
  if (!variantId) {
    return "";
  }

  return variantId.trim();
}

function productByVariantId(config: FunnelConfig, variantId?: string | null) {
  const normalized = normalizeVariantId(variantId);
  if (!normalized) {
    return null;
  }

  for (const product of config.products) {
    if (normalizeVariantId(product.variantId) === normalized) {
      return product;
    }

    const variant = product.variants?.find(
      (item) => normalizeVariantId(item.variantId) === normalized,
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
  const defaults = config.products.filter((product) => product.isDefault);
  const upsells = config.products.filter((product) => !product.isDefault).slice(0, 2);
  const selected = [...defaults, ...upsells];

  return selected.map((product) => ({
    productName: product.name,
    quantity: 1,
    revenue: toCurrencyValue(product.priceLabel),
    unitCost: productUnitCost(product),
    stockOnHand: null,
  }));
}

export function buildPlaceholderOrders(config: FunnelConfig): ReportOrder[] {
  const defaultPostageCost = toCurrencyValue(config.reporting?.defaultPostageCost);
  const adSpendEntries = config.reporting?.weeklyAdSpend || [];

  return adSpendEntries.slice(0, 4).map((entry, index) => {
    const items = placeholderItems(config);
    const revenue = items.reduce((sum, item) => sum + item.revenue * item.quantity, 0);
    const unitCostTotal = items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
    const postageCost = selectedPlaceholderProducts(config).reduce(
      (sum, product) => sum + productPostageCost(product, defaultPostageCost),
      0,
    );
    const adSpendAllocated = toCurrencyValue(entry.amount);
    const purchasedAt = entry.weekStart;

    return {
      id: `placeholder-${index}`,
      orderNumber: `PLACEHOLDER-${index + 1}`,
      purchasedAt,
      weekStart: weekStartFromDate(purchasedAt),
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
  const defaults = config.products.filter((product) => product.isDefault);
  const upsells = config.products.filter((product) => !product.isDefault).slice(0, 2);
  return [...defaults, ...upsells];
}

function shopifyEnv() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();

  if (!domain) {
    return null;
  }

  return { domain, token, clientId, clientSecret };
}

async function getShopifyAccessToken() {
  const env = shopifyEnv();
  if (!env) {
    return null;
  }

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

export async function fetchShopifyOrders(config: FunnelConfig): Promise<ReportOrder[]> {
  const env = shopifyEnv();
  if (!env) {
    return [];
  }
  const accessToken = await getShopifyAccessToken();
  if (!accessToken) {
    return [];
  }

  const discountCode = config.reporting?.reportDiscountCode || "FREECD";
  const query = `
    query FunnelOrders($query: String!) {
      orders(first: 100, sortKey: CREATED_AT, reverse: true, query: $query) {
        edges {
          node {
            id
            name
            createdAt
            discountCodes
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

  const response = await fetch(`https://${env.domain}/admin/api/2026-07/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      query,
      variables: {
        query: `discount_code:${discountCode} status:any`,
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Shopify order fetch failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as ShopifyOrdersResponse;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((item) => item.message).join(", "));
  }

  const orders = payload.data?.orders?.edges.map((edge) => edge.node) || [];
  const defaultPostageCost = toCurrencyValue(config.reporting?.defaultPostageCost);

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
      return sum + productPostageCost(product, defaultPostageCost) * node.quantity;
    }, 0);
    const revenue = moneyToNumber(order.currentTotalPriceSet?.shopMoney);
    const adSpendAllocated = adSpendForWeek(config, weekStart);

    return {
      id: order.id,
      orderNumber: order.name,
      purchasedAt,
      weekStart,
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
      message: `Shopify API is responding for ${env.domain}. Orders are being filtered by the ${config.reporting?.reportDiscountCode || "FREECD"} discount code.`,
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
