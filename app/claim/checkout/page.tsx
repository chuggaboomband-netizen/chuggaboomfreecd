import { redirect } from "next/navigation";

import { readConfig } from "@/lib/config-store";
import { buildPermalink, collectDiscountCodes, selectedItems } from "@/lib/funnel";
import { getShopifyInventorySnapshot } from "@/lib/reports";

export default async function ClaimCheckoutPage({ searchParams }: { searchParams: Promise<{ offers?: string; quantities?: string }> }) {
  const params = await searchParams;
  const config = await readConfig();
  let inventorySnapshot = {};
  try {
    inventorySnapshot = await getShopifyInventorySnapshot(config);
  } catch (error) {
    console.error("Shopify inventory snapshot failed for claim checkout.", error);
  }
  const handles = (params.offers || "").split(",").map((value) => value.trim()).filter(Boolean);
  const quantities = new Map(
    (params.quantities || "")
      .split(",")
      .map((entry) => entry.trim().split(":"))
      .filter(([handle, quantity]) => handle && quantity)
      .map(([handle, quantity]) => [handle, Math.max(1, Number(quantity) || 1)] as const),
  );
  const items = selectedItems(config, handles, inventorySnapshot);
  const variantIds = items.flatMap((item) => Array.from({ length: quantities.get(item.handle) || 1 }, () => item.variantId.trim()).filter(Boolean));
  const checkoutUrl = buildPermalink(config.campaign.shopifyStoreHost, variantIds, collectDiscountCodes(config, handles, [], inventorySnapshot));
  const destination = checkoutUrl || "/claim/offer";
  redirect(destination as never);
}
