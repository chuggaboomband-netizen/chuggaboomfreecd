import { redirect } from "next/navigation";

import { readConfig } from "@/lib/config-store";
import { buildPermalink, collectDiscountCodes, selectedVariantIds } from "@/lib/funnel";
import { getShopifyInventorySnapshot } from "@/lib/reports";

export default async function ClaimCheckoutPage({ searchParams }: { searchParams: Promise<{ offers?: string }> }) {
  const params = await searchParams;
  const config = await readConfig();
  let inventorySnapshot = {};
  try {
    inventorySnapshot = await getShopifyInventorySnapshot(config);
  } catch (error) {
    console.error("Shopify inventory snapshot failed for claim checkout.", error);
  }
  const handles = (params.offers || "").split(",").map((value) => value.trim()).filter(Boolean);
  const checkoutUrl = buildPermalink(config.campaign.shopifyStoreHost, selectedVariantIds(config, handles, inventorySnapshot), collectDiscountCodes(config, handles, [], inventorySnapshot));
  const destination = checkoutUrl || "/claim/offer";
  redirect(destination as never);
}
