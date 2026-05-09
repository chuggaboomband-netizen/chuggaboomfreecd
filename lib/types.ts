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
  sortOrder: number;
  autoDiscountCodes: string[];
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
};
