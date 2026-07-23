import Link from "next/link";

import { readConfig } from "@/lib/config-store";
import {
  availableDiscountsForProducts,
  buildPermalink,
  collectDiscountCodes,
  formatPriceLabel,
  parsePriceLabel,
  selectedItems,
  selectedVariantIds,
} from "@/lib/funnel";
import { getShopifyInventorySnapshot } from "@/lib/reports";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ offers?: string }>;
}) {
  const params = await searchParams;
  const config = await readConfig();
  let inventorySnapshot = {};
  try {
    inventorySnapshot = await getShopifyInventorySnapshot(config);
  } catch (error) {
    console.error("Shopify inventory snapshot failed for checkout.", error);
  }
  const selectedHandles = (params.offers || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const items = selectedItems(config, selectedHandles, inventorySnapshot);
  const discountCodes = collectDiscountCodes(config, selectedHandles, [], inventorySnapshot);
  const discounts = availableDiscountsForProducts(config.discounts, discountCodes);
  const checkoutUrl = buildPermalink(
    config.campaign.shopifyStoreHost,
    selectedVariantIds(config, selectedHandles, inventorySnapshot),
    discountCodes,
  );
  const cartTotal = items.reduce((total, item) => total + parsePriceLabel(item.priceLabel), 0);
  const compareAtTotal = items.reduce(
    (total, item) => total + parsePriceLabel(item.compareAtPriceLabel || item.priceLabel),
    0,
  );
  const savingsTotal = Math.max(0, compareAtTotal - cartTotal);

  return (
    <main className="landing-page">
      <div className="shell">
        <section className="checkout-page">
          <div className="checkout-hero">
            <img
              src="/chuggaboom-logo-straight.png"
              alt="ChuggaBoom logo"
              className="checkout-logo"
            />
            <span className="checkout-kicker">Final step</span>
            <h1 className="checkout-title">Your bundle is ready</h1>
            <p className="checkout-subtitle">
              Give it one last look, then head straight into checkout.
            </p>
          </div>

          <div className="checkout-grid">
            <section className="checkout-card">
              <h2 className="checkout-heading">Your bundle</h2>
              <ul className="checkout-line-items">
                {items.map((item) => (
                  <li key={item.id} className="checkout-line-item">
                    <div className="checkout-item-copy">
                      <strong>{item.name}</strong>
                      <div className="checkout-item-note">Included in this order</div>
                    </div>
                    <div className="checkout-price">
                      {item.compareAtPriceLabel ? (
                        <span className="checkout-price-group">
                          <span className="checkout-compare">{item.compareAtPriceLabel}</span>
                          <span className="checkout-price-note">value</span>
                        </span>
                      ) : null}
                      <strong className="checkout-price-group">
                        <span>{item.priceLabel}</span>
                        <span className="checkout-price-note">today</span>
                      </strong>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <aside className="checkout-card checkout-summary">
              <h2 className="checkout-heading">Cart total</h2>
              <div className="checkout-total-block">
                {compareAtTotal > cartTotal ? (
                  <div className="checkout-total-old">{formatPriceLabel(compareAtTotal)}</div>
                ) : null}
                <div className="checkout-total-new">{formatPriceLabel(cartTotal)}</div>
              </div>

              {savingsTotal > 0 ? (
                <div className="checkout-savings">
                  You&apos;re saving {formatPriceLabel(savingsTotal)} on this bundle
                </div>
              ) : null}

              <div className="checkout-discounts">
                <strong>Discounts applied</strong>
                {discounts.length > 0 ? (
                  <div className="checkout-discount-list">
                    {discounts.map((discount) => (
                      <span key={discount.id} className="checkout-discount-pill">
                        {discount.code}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="microcopy">None</div>
                )}
              </div>

              {checkoutUrl ? (
                <a href={checkoutUrl} className="button checkout-button">
                  Continue to checkout
                </a>
              ) : (
                <>
                  <div className="banner warning">
                    This bundle is missing a Shopify store host or product variant IDs.
                  </div>
                  <Link href="/portal/dashboard" className="button secondary">
                    Fix products in the portal
                  </Link>
                </>
              )}
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
