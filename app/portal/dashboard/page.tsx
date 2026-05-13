import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/auth";
import { readConfig } from "@/lib/config-store";
import { sortProducts } from "@/lib/funnel";

import {
  addDiscountAction,
  addProductAction,
  deleteDiscountAction,
  deleteProductAction,
  logoutAction,
  saveCampaignAction,
  updateDiscountAction,
  updateProductAction,
} from "../actions";
import { PortalLinkBuilder } from "./portal-link-builder";

export default async function DashboardPage() {
  if (!(await isAuthenticated())) {
    redirect("/portal");
  }

  const config = await readConfig();
  const products = sortProducts(config.products);
  const discounts = [...config.discounts].sort((a, b) => b.priority - a.priority);

  return (
    <main className="section hero">
      <div className="shell stack">
        <header className="site-header">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="section-heading">Campaign Control Room</h1>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="button secondary">
              Log out
            </button>
          </form>
        </header>

        <section className="admin-card stack">
          <div>
            <h2>Campaign settings</h2>
            <p className="microcopy">
              These values drive the public landing page copy.
            </p>
          </div>

          <form action={saveCampaignAction} className="stack">
            <div className="field-grid">
              <label className="field">
                <span>Band name</span>
                <input name="bandName" defaultValue={config.campaign.bandName} required />
              </label>
              <label className="field">
                <span>Headline</span>
                <input name="headline" defaultValue={config.campaign.headline} required />
              </label>
              <label className="field">
                <span>Hero note</span>
                <input name="heroNote" defaultValue={config.campaign.heroNote} required />
              </label>
              <label className="field">
                <span>Shipping label</span>
                <input name="shippingLabel" defaultValue={config.campaign.shippingLabel} required />
              </label>
              <label className="field">
                <span>Shipping price</span>
                <input name="shippingPrice" defaultValue={config.campaign.shippingPrice} required />
              </label>
              <label className="field">
                <span>CTA label</span>
                <input name="startButtonLabel" defaultValue={config.campaign.startButtonLabel} required />
              </label>
              <label className="field">
                <span>Shopify store host</span>
                <input
                  name="shopifyStoreHost"
                  defaultValue={config.campaign.shopifyStoreHost}
                  placeholder="shop.chuggaboom.com"
                  required
                />
              </label>
            </div>

            <label className="field">
              <span>Subheadline</span>
              <textarea name="subheadline" defaultValue={config.campaign.subheadline} required />
            </label>

            <button type="submit" className="button">
              Save campaign copy
            </button>
          </form>
        </section>

        <section className="admin-grid portal-admin-grid">
          <div className="admin-card stack">
            <div>
              <h2>Products</h2>
              <p className="microcopy">
                This replaces the spreadsheet product directory. Handles power the funnel, variant IDs power the generated Shopify permalinks, and the price fields let you show both what an item is worth and what the customer will actually pay.
              </p>
            </div>

            <div className="stack">
              {products.map((product) => (
                <div key={product.id} className="summary-card">
                  <form action={updateProductAction} className="stack">
                    <input type="hidden" name="id" value={product.id} />
                    {product.imageSrc ? (
                      <img
                        src={product.imageSrc}
                        alt={product.name}
                        className="portal-product-preview"
                      />
                    ) : null}
                    <div className="field-grid">
                      <label className="field">
                        <span>Name</span>
                        <input name="name" defaultValue={product.name} required />
                      </label>
                      <label className="field">
                        <span>Handle</span>
                        <input name="handle" defaultValue={product.handle} required />
                      </label>
                      <label className="field">
                        <span>Discounted price</span>
                        <input name="priceLabel" defaultValue={product.priceLabel} required />
                      </label>
                      <label className="field">
                        <span>Value price</span>
                        <input name="compareAtPriceLabel" defaultValue={product.compareAtPriceLabel || ""} />
                      </label>
                      <label className="field">
                        <span>Variant ID</span>
                        <input name="variantId" defaultValue={product.variantId} required />
                      </label>
                      <label className="field">
                        <span>Sort order</span>
                        <input name="sortOrder" type="number" defaultValue={String(product.sortOrder)} required />
                      </label>
                      <label className="field">
                        <span>Type</span>
                        <input name="type" defaultValue={product.type} required />
                      </label>
                      <label className="field">
                        <span>Default?</span>
                        <input name="isDefault" type="checkbox" defaultChecked={product.isDefault} />
                      </label>
                    </div>
                    <label className="field">
                      <span>Description</span>
                      <textarea name="description" defaultValue={product.description} required />
                    </label>
                    <label className="field">
                      <span>Image src</span>
                      <input name="imageSrc" defaultValue={product.imageSrc || ""} placeholder="/vinyl-offer.png" />
                    </label>
                    <label className="field">
                      <span>Upload image</span>
                      <input name="imageFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
                    </label>
                    <label className="field">
                      <span>Upsell headline</span>
                      <input name="upsellHeadline" defaultValue={product.upsellHeadline || ""} />
                    </label>
                    <label className="field">
                      <span>Upsell subheadline</span>
                      <textarea name="upsellSubheadline" defaultValue={product.upsellSubheadline || ""} />
                    </label>
                    <label className="field">
                      <span>Upsell body</span>
                      <textarea name="upsellBody" defaultValue={product.upsellBody || ""} />
                    </label>
                    <label className="field">
                      <span>Auto discount codes</span>
                      <input
                        name="autoDiscountCodes"
                        defaultValue={product.autoDiscountCodes.join("|")}
                        placeholder="FREECD|VIP20"
                      />
                    </label>
                    <label className="field">
                      <span>Yes button label</span>
                      <input name="upsellYesLabel" defaultValue={product.upsellYesLabel || ""} />
                    </label>
                    <label className="field">
                      <span>No button label</span>
                      <input name="upsellNoLabel" defaultValue={product.upsellNoLabel || ""} />
                    </label>
                    <label className="field">
                      <span>Variants</span>
                      <textarea
                        name="variantsText"
                        defaultValue={(product.variants || [])
                          .map((variant) =>
                            [
                              variant.handle,
                              variant.name,
                              variant.variantId,
                              variant.priceLabel,
                              variant.compareAtPriceLabel || "",
                            ].join("|"),
                          )
                          .join("\n")}
                        placeholder={"tee-s|Small|55749148705148:1|£15|£20\ntee-m|Medium|55749148737916:1|£15|£20"}
                      />
                    </label>
                    <p className="microcopy">
                      Variants format: <code>handle|label|variantId|discounted price|value price</code>
                    </p>
                    <div className="cta-row">
                      <button type="submit" className="button">
                        Save product
                      </button>
                    </div>
                  </form>
                  <form action={deleteProductAction}>
                    <input type="hidden" name="id" value={product.id} />
                    <button type="submit" className="button secondary">
                      Remove product
                    </button>
                  </form>
                </div>
              ))}
            </div>

            <form action={addProductAction} className="stack">
              <div className="field-grid">
                <label className="field">
                  <span>Name</span>
                  <input name="name" required />
                </label>
                <label className="field">
                  <span>Handle</span>
                  <input name="handle" placeholder="signed-cd" required />
                </label>
                <label className="field">
                  <span>Discounted price</span>
                  <input name="priceLabel" placeholder="£14.99" required />
                </label>
                <label className="field">
                  <span>Value price</span>
                  <input name="compareAtPriceLabel" placeholder="£19.99" />
                </label>
                <label className="field">
                  <span>Variant ID</span>
                  <input name="variantId" placeholder="55749148705148:1" required />
                </label>
                <label className="field">
                  <span>Sort order</span>
                  <input name="sortOrder" type="number" defaultValue="10" required />
                </label>
                <label className="field">
                  <span>Type</span>
                  <input name="type" defaultValue="upsell" required />
                </label>
                <label className="field">
                  <span>Default?</span>
                  <input name="isDefault" type="checkbox" />
                </label>
              </div>

              <label className="field">
                <span>Description</span>
                <textarea name="description" required />
              </label>
              <label className="field">
                <span>Image src</span>
                <input name="imageSrc" placeholder="/vinyl-offer.png" />
              </label>
              <label className="field">
                <span>Upload image</span>
                <input name="imageFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
              </label>
              <label className="field">
                <span>Upsell headline</span>
                <input name="upsellHeadline" placeholder="Want even more music while you're here?" />
              </label>
              <label className="field">
                <span>Upsell subheadline</span>
                <textarea name="upsellSubheadline" />
              </label>
              <label className="field">
                <span>Upsell body</span>
                <textarea name="upsellBody" />
              </label>
              <label className="field">
                <span>Auto discount codes</span>
                <input name="autoDiscountCodes" placeholder="FREECD100|VIP20" />
              </label>
              <label className="field">
                <span>Yes button label</span>
                <input name="upsellYesLabel" placeholder="HELL YEAH, I'LL TAKE BOTH" />
              </label>
              <label className="field">
                <span>No button label</span>
                <input name="upsellNoLabel" placeholder="JUST THE MIXTAPE, THANKS" />
              </label>
              <label className="field">
                <span>Variants</span>
                <textarea
                  name="variantsText"
                  placeholder={"tee-s|Small|55749148705148:1|£15|£20\ntee-m|Medium|55749148737916:1|£15|£20"}
                />
              </label>
              <p className="microcopy">
                Variants format: <code>handle|label|variantId|discounted price|value price</code>
              </p>

              <button type="submit" className="button">
                Add product
              </button>
            </form>
          </div>

          <div className="admin-card stack discounts-panel">
            <div>
              <h2>Discounts</h2>
              <p className="microcopy">
                Codes can now be edited in place. If you rename a discount code here, linked product auto-discount references will update with it.
              </p>
            </div>

            <div className="stack">
              {discounts.map((discount) => (
                <div key={discount.id} className="summary-card stack discount-card">
                  <form action={updateDiscountAction} className="stack">
                    <input type="hidden" name="id" value={discount.id} />
                    <label className="field">
                      <span>Discount name</span>
                      <input name="name" defaultValue={discount.name} required />
                    </label>
                    <label className="field">
                      <span>Discount code</span>
                      <input name="code" defaultValue={discount.code} required />
                    </label>
                    <label className="field">
                      <span>Priority</span>
                      <input name="priority" type="number" defaultValue={String(discount.priority)} required />
                    </label>
                    <div className="discount-actions">
                      <button type="submit" className="button">
                        Save discount
                      </button>
                    </div>
                  </form>
                  <form action={deleteDiscountAction}>
                    <input type="hidden" name="id" value={discount.id} />
                    <button type="submit" className="button secondary">
                      Remove discount
                    </button>
                  </form>
                </div>
              ))}
            </div>

            <form action={addDiscountAction} className="stack discount-create-form">
              <label className="field">
                <span>Discount name</span>
                <input name="name" required />
              </label>
              <label className="field">
                <span>Discount code</span>
                <input name="code" placeholder="FREECD100" required />
              </label>
              <label className="field">
                <span>Priority</span>
                <input name="priority" type="number" defaultValue="10" required />
              </label>
              <div className="discount-actions">
                <button type="submit" className="button">
                  Add discount
                </button>
              </div>
            </form>
          </div>
        </section>

        <PortalLinkBuilder
          storeHost={config.campaign.shopifyStoreHost}
          products={products}
          discounts={discounts}
        />
      </div>
    </main>
  );
}
