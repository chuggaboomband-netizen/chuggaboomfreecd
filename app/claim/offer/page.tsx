import { readConfig } from "@/lib/config-store";
import { isProductActiveInFunnel, isProductOfferAvailable, sortProducts } from "@/lib/funnel";
import { getShopifyInventorySnapshot } from "@/lib/reports";

import { ClaimUpsellFlow } from "../upsell/claim-upsell-flow";

export default async function ClaimOfferPage() {
  const config = await readConfig();
  let inventorySnapshot = {};
  try {
    inventorySnapshot = await getShopifyInventorySnapshot(config);
  } catch (error) {
    console.error("Shopify inventory snapshot failed for claim offers.", error);
  }
  const products = sortProducts(config.products).filter(
    (product) => isProductActiveInFunnel(product) && isProductOfferAvailable(product, inventorySnapshot),
  );

  return <ClaimUpsellFlow products={products} inventorySnapshot={inventorySnapshot} />;
}
