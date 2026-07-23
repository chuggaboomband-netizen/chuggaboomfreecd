export type CampaignSettings = {
  bandName: string;
  headline: string;
  subheadline: string;
  heroNote: string;
  shippingLabel: string;
  shippingPrice: string;
  startButtonLabel: string;
  shopifyStoreHost: string;
};

export type WeeklyAdSpend = {
  id: string;
  weekStart: string;
  amount: string;
  notes?: string;
};

export type ReportingSettings = {
  reportDiscountCode: string;
  defaultPostageCost: string;
  weeklyAdSpend: WeeklyAdSpend[];
};

export type ProductType = "core" | "upsell";

export type ProductVariant = {
  id: string;
  handle: string;
  name: string;
  variantId: string;
  priceLabel: string;
  compareAtPriceLabel?: string;
};

export type Product = {
  id: string;
  handle: string;
  name: string;
  description: string;
  variantId: string;
  priceLabel: string;
  compareAtPriceLabel?: string;
  type: ProductType;
  isDefault: boolean;
  activeInFunnel?: boolean;
  sortOrder: number;
  autoDiscountCodes: string[];
  unitCost?: string;
  postageCost?: string;
  imageSrc?: string;
  upsellHeadline?: string;
  upsellSubheadline?: string;
  upsellBody?: string;
  upsellYesLabel?: string;
  upsellNoLabel?: string;
  variants?: ProductVariant[];
};

export type SelectedItem = {
  id: string;
  productId: string;
  handle: string;
  name: string;
  variantId: string;
  priceLabel: string;
  compareAtPriceLabel?: string;
  autoDiscountCodes: string[];
  imageSrc?: string;
};

export type Discount = {
  id: string;
  name: string;
  code: string;
  priority: number;
};

export type FunnelConfig = {
  campaign: CampaignSettings;
  products: Product[];
  discounts: Discount[];
  reporting: ReportingSettings;
};

export type ReportOrderItem = {
  productName: string;
  quantity: number;
  revenue: number;
  unitCost: number;
  stockOnHand?: number | null;
};

export type ReportShippingAddress = {
  name?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
  phone?: string;
};

export type ReportOrder = {
  id: string;
  orderNumber: string;
  purchasedAt: string;
  weekStart: string;
  email?: string | null;
  shippingAddress?: ReportShippingAddress | null;
  discountCodes: string[];
  postageCost: number;
  adSpendAllocated: number;
  revenue: number;
  unitCostTotal: number;
  profitLoss: number;
  items: ReportOrderItem[];
  source: "shopify" | "placeholder";
};
