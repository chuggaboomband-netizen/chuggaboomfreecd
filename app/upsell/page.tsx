import { readConfig } from "@/lib/config-store";
import { isProductActiveInFunnel, isProductOfferAvailable, sortProducts } from "@/lib/funnel";
import { getShopifyInventorySnapshot } from "@/lib/reports";

import { UpsellSelector } from "./upsell-selector";

export default async function UpsellPage({
  searchParams,
}: {
  searchParams: Promise<{ offers?: string; step?: string }>;
}) {
  const params = await searchParams;
  const config = await readConfig();
  let inventorySnapshot = {};
  try {
    inventorySnapshot = await getShopifyInventorySnapshot(config);
  } catch (error) {
    console.error("Shopify inventory snapshot failed for upsell flow.", error);
  }

  const products = sortProducts(config.products).filter(
    (product) =>
      isProductActiveInFunnel(product) && isProductOfferAvailable(product, inventorySnapshot),
  );
  const selectedHandles = (params.offers || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const step = Number(params.step || "0");

  return (
    <main className="landing-page">
      <div className="shell">
        <UpsellSelector
          products={products}
          initialSelected={selectedHandles}
          initialStep={Number.isFinite(step) ? step : 0}
        />
      </div>
    </main>
  );
}
