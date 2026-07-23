import Link from "next/link";
import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/auth";
import { readConfig } from "@/lib/config-store";
import { isProductActiveInFunnel, sortProducts } from "@/lib/funnel";
import { getShopifyConnectionState, getShopifyInventorySnapshot } from "@/lib/reports";

import {
  addProductAction,
  deleteProductAction,
  logoutAction,
  saveFunnelSelectionAction,
  updateProductAction,
} from "../actions";

export default async function UpsellsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; saved?: string; picker?: string }>;
}) {
  if (!(await isAuthenticated())) {
    redirect("/portal");
  }

  const config = await readConfig();
  const shopifyState = await getShopifyConnectionState(config);
  let inventorySnapshot: Record<string, number | null> = {};
  try {
    inventorySnapshot = await getShopifyInventorySnapshot(config);
  } catch (error) {
    console.error("Shopify inventory snapshot failed for upsell portal.", error);
  }
  const products = sortProducts(config.products);
  const activeProducts = products.filter(isProductActiveInFunnel);
  const coreProducts = products.filter((product) => product.type === "core");
  const upsellProducts = products.filter((product) => product.type === "upsell");
  const params = searchParams ? await searchParams : undefined;
  const pickerOpen = params?.picker === "1";

  return (
    <main className="section hero portal-surface">
      <div className="shell stack">
        <header className="site-header">
          <div>
            <span className="eyebrow">Upsells</span>
            <h1 className="section-heading">Funnel Products</h1>
            <p className="microcopy">
              Keep all of your product setup stored here, then choose which offers are actually live in the funnel.
            </p>
          </div>
          <div className="portal-header-actions">
            <Link href="/portal/dashboard" className="button secondary">
              Back to dashboard
            </Link>
            <Link href="/portal/upsells?picker=1" className="button">
              Choose funnel products
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="button secondary">
                Log out
              </button>
            </form>
          </div>
        </header>

        {params?.saved ? <div className="banner">Changes saved.</div> : null}
        {params?.error ? <div className="banner warning">{params.error}</div> : null}

        <section className="portal-quick-grid">
          <article className="summary-card portal-quick-card">
            <span className="portal-quick-label">Live funnel offers</span>
            <strong className="portal-quick-value">{activeProducts.filter((product) => product.type === "upsell").length}</strong>
            <p className="microcopy">Upsells currently active in the journey.</p>
          </article>
          <article className="summary-card portal-quick-card">
            <span className="portal-quick-label">Stored products</span>
            <strong className="portal-quick-value">{products.length}</strong>
            <p className="microcopy">Nothing is lost when you switch an offer off.</p>
          </article>
          <article className="summary-card portal-quick-card">
            <span className="portal-quick-label">Core products</span>
            <strong className="portal-quick-value">{coreProducts.length}</strong>
            <p className="microcopy">These stay anchored into the funnel as base items.</p>
          </article>
          <article className="summary-card portal-quick-card">
            <span className="portal-quick-label">Shopify status</span>
            <strong className="portal-quick-value">
              {shopifyState.status === "connected" ? "Connected" : "Attention needed"}
            </strong>
            <p className="microcopy">{shopifyState.message}</p>
          </article>
        </section>

        <section className="admin-card stack">
          <div className="report-header-row">
            <div>
              <h2>Live funnel setup</h2>
              <p className="microcopy">
                Use the chooser to switch offers in and out of the funnel without deleting any of their copy, images, pricing, or Shopify mapping.
              </p>
            </div>
            <Link href="/portal/upsells?picker=1" className="button">
              Manage live products
            </Link>
          </div>
          <div className="portal-live-list">
            {activeProducts.length > 0 ? (
              activeProducts.map((product) => (
                <div key={product.id} className="reports-list-row">
                  <span className="portal-list-item-stack">
                    <strong>{product.name}</strong>
                    <span className="microcopy">
                      {product.handle} · {product.type === "core" ? "Core" : "Upsell"}
                    </span>
                  </span>
                  <strong>{formatStockLabel(getProductStock(inventorySnapshot, product.variantId))}</strong>
                </div>
              ))
            ) : (
              <p className="microcopy">No active funnel products yet.</p>
            )}
          </div>
        </section>

        <section className="admin-card stack">
          <div>
            <h2>Core products</h2>
            <p className="microcopy">
              These are your base products. They stay stored here even if you revise the rest of the funnel.
            </p>
          </div>
          <div className="stack">
            {coreProducts.map((product) => (
              <ProductEditor
                key={product.id}
                product={product}
                returnTo="/portal/upsells"
                inventorySnapshot={inventorySnapshot}
              />
            ))}
          </div>
        </section>

        <section className="admin-card stack">
          <div>
            <h2>Upsell library</h2>
            <p className="microcopy">
              This is your stored upsell library. Toggle live status in the chooser, and edit each product here whenever you need.
            </p>
          </div>
          <div className="stack">
            {upsellProducts.map((product) => (
              <ProductEditor
                key={product.id}
                product={product}
                returnTo="/portal/upsells"
                inventorySnapshot={inventorySnapshot}
              />
            ))}
          </div>
        </section>

        <section className="admin-card stack">
          <div>
            <h2>Add product</h2>
            <p className="microcopy">
              Add a new core product or upsell to your library. It can stay stored here even before you switch it live.
            </p>
          </div>

          <form action={addProductAction} className="stack">
            <input type="hidden" name="returnTo" value="/portal/upsells" />
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
                <span>Unit cost</span>
                <input name="unitCost" placeholder="£2.50" />
              </label>
              <label className="field">
                <span>Postage cost</span>
                <input name="postageCost" placeholder="£1.85" />
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
              <label className="field">
                <span>Live in funnel?</span>
                <input name="activeInFunnel" type="checkbox" defaultChecked />
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
        </section>

        {pickerOpen ? (
          <div className="portal-modal-overlay">
            <div className="portal-modal-card">
              <div className="report-header-row">
                <div>
                  <h2>Choose products in funnel</h2>
                  <p className="microcopy">
                    Switch upsells on or off here. Turning a product off removes it from the live funnel but keeps all of its setup saved.
                  </p>
                </div>
                <Link href="/portal/upsells" className="button secondary">
                  Close
                </Link>
              </div>

              <form action={saveFunnelSelectionAction} className="stack">
                <div className="portal-modal-grid">
                  {upsellProducts.map((product) => (
                    <label key={product.id} className="portal-toggle-card">
                      <input
                        type="checkbox"
                        name="activeProductIds"
                        value={product.id}
                        defaultChecked={isProductActiveInFunnel(product)}
                      />
                      <div>
                        <strong>{product.name}</strong>
                        <p className="microcopy">
                          {product.handle} · {product.priceLabel} · {formatStockLabel(getProductStock(inventorySnapshot, product.variantId))}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="portal-header-actions">
                  <Link href="/portal/upsells" className="button secondary">
                    Cancel
                  </Link>
                  <button type="submit" className="button">
                    Save funnel selection
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function ProductEditor({
  product,
  returnTo,
  inventorySnapshot,
}: {
  product: Awaited<ReturnType<typeof readConfig>>["products"][number];
  returnTo: string;
  inventorySnapshot: Record<string, number | null>;
}) {
  const mainVariantStock = getProductStock(inventorySnapshot, product.variantId);

  return (
    <div className="summary-card">
      <div className="portal-product-card-header">
        <div>
          <h3>{product.name}</h3>
          <p className="microcopy">
            {product.handle} · {product.type === "core" ? "Core product" : "Upsell product"}
          </p>
        </div>
        <div className="portal-stock-badges">
          <span className={`portal-stock-pill ${stockTone(mainVariantStock)}`}>
            Shopify stock: {formatStockLabel(mainVariantStock)}
          </span>
          {product.variants?.length ? (
            <span className="portal-stock-pill is-neutral">{product.variants.length} variants saved</span>
          ) : null}
        </div>
      </div>
      <form action={updateProductAction} className="stack">
        <input type="hidden" name="id" value={product.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
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
            <span>Unit cost</span>
            <input name="unitCost" defaultValue={product.unitCost || ""} placeholder="£2.50" />
          </label>
          <label className="field">
            <span>Postage cost</span>
            <input name="postageCost" defaultValue={product.postageCost || ""} placeholder="£1.85" />
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
          <label className="field">
            <span>Live in funnel?</span>
            <input name="activeInFunnel" type="checkbox" defaultChecked={isProductActiveInFunnel(product)} />
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
        {product.variants?.length ? (
          <div className="portal-variant-stock-list">
            {product.variants.map((variant) => {
              const variantStock = getProductStock(inventorySnapshot, variant.variantId);

              return (
                <div key={variant.id} className="reports-list-row">
                  <span className="portal-list-item-stack">
                    <strong>{variant.name}</strong>
                    <span className="microcopy">
                      {variant.handle} · {variant.priceLabel}
                    </span>
                  </span>
                  <strong>{formatStockLabel(variantStock)}</strong>
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="cta-row">
          <button type="submit" className="button">
            Save product
          </button>
        </div>
      </form>
      <form action={deleteProductAction}>
        <input type="hidden" name="id" value={product.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button type="submit" className="button secondary">
          Remove product
        </button>
      </form>
    </div>
  );
}

function getProductStock(snapshot: Record<string, number | null>, variantId?: string) {
  if (!variantId) {
    return null;
  }

  return snapshot[variantId] ?? null;
}

function formatStockLabel(stock: number | null) {
  if (stock == null) {
    return "Stock unavailable";
  }

  if (stock <= 0) {
    return "Out of stock";
  }

  return `${stock} in stock`;
}

function stockTone(stock: number | null) {
  if (stock == null) {
    return "is-neutral";
  }

  if (stock <= 0) {
    return "is-out";
  }

  if (stock <= 5) {
    return "is-low";
  }

  return "is-good";
}
