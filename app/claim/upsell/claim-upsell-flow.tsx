"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { InventorySnapshot, Product } from "@/lib/types";

function price(value: string) {
  const amount = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) ? `£${amount.toFixed(2).replace(/\.00$/, "")}` : value;
}

function available(inventory: InventorySnapshot, variantId: string) {
  const stock = inventory[variantId];
  return stock == null || stock > 0;
}

export function ClaimUpsellFlow({ products, inventorySnapshot }: { products: Product[]; inventorySnapshot: InventorySnapshot }) {
  const baseProduct = products.find((product) => product.isDefault) ?? products[0];
  const upsells = products.filter((product) => !product.isDefault);
  const [selected, setSelected] = useState<string[]>(baseProduct ? [baseProduct.handle] : []);
  const [variants, setVariants] = useState<Record<string, string>>(() => Object.fromEntries(
    upsells.filter((product) => product.variants?.length).map((product) => [product.handle, product.variants?.find((variant) => available(inventorySnapshot, variant.variantId))?.handle || ""]),
  ));
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const selectedHandles = useMemo(() => selected.filter((handle) => handle !== baseProduct?.handle), [selected, baseProduct?.handle]);
  const quantityFor = (handle: string) => Math.max(1, quantities[handle] || 1);
  const selectedLineHandles = useMemo(() => selectedHandles.map((handle) => {
    const product = upsells.find((item) => item.handle === handle);
    return product?.variants?.length ? variants[product.handle] : handle;
  }).filter(Boolean), [selectedHandles, upsells, variants]);
  const total = upsells.reduce((sum, product) => {
    const handle = product.variants?.length ? variants[product.handle] : product.handle;
    return selectedHandles.includes(product.handle) || selectedHandles.includes(handle)
      ? sum + Number(product.priceLabel.replace(/[^0-9.]/g, "")) * quantityFor(product.handle)
      : sum;
  }, 0);
  const offers = [baseProduct?.handle, ...selectedLineHandles].filter(Boolean).join(",");
  const quantitiesParam = [
    baseProduct ? `${baseProduct.handle}:1` : "",
    ...selectedHandles.map((handle, index) => `${selectedLineHandles[index]}:${quantityFor(handle)}`),
  ].filter(Boolean).join(",");
  const baseCheckoutHref = `/claim/checkout?offers=${encodeURIComponent(baseProduct?.handle || "free-cd")}&quantities=${encodeURIComponent(baseProduct ? `${baseProduct.handle}:1` : "")}`;
  const checkoutHref = `/claim/checkout?offers=${encodeURIComponent(offers)}&quantities=${encodeURIComponent(quantitiesParam)}`;
  const extraUnits = selectedHandles.reduce((sum, handle) => sum + quantityFor(handle), 0);

  function toggleProduct(product: Product) {
    const handle = product.variants?.length ? variants[product.handle] : product.handle;
    if (!handle) return;
    setSelected((current) => current.includes(product.handle) ? current.filter((item) => item !== product.handle) : [...current, product.handle]);
  }

  function chooseVariant(product: Product, handle: string) {
    setVariants((current) => ({ ...current, [product.handle]: handle }));
    setSelected((current) => current.includes(product.handle) ? current : [...current, product.handle]);
  }

  function changeQuantity(handle: string, delta: number) {
    setQuantities((current) => ({ ...current, [handle]: Math.max(1, (current[handle] || 1) + delta) }));
  }

  return (
    <main className="claim-page">
      <div className="claim-store-shell claim-upsell-shell">
        <div className="claim-announcement">FREE CD · OPTIONAL EXTRAS</div>
        <header className="claim-store-header"><Link href="/claim" className="claim-logo-link"><Image src="/chuggaboom-logo-straight.png" alt="ChuggaBoom" width={500} height={171} /></Link><span className="claim-upsell-step">STEP 2 OF 2</span><a className="claim-cart-link" href={baseCheckoutHref}>Just the CD <span>→</span></a></header>
        <section className="claim-upsell-intro"><p className="claim-store-kicker">OPTIONAL EXTRAS</p><h1>Fancy adding<br /><span>something extra?</span></h1><p>Choose anything you&apos;d like to add to your signed CD, or carry on with the CD on its own.</p></section>
        <section className="claim-upsell-grid">{upsells.map((product) => { const chosen = selected.includes(product.handle); const chosenVariant = variants[product.handle]; return <article key={product.handle} className={`claim-upsell-card ${chosen ? "is-selected" : ""}`}><div className="claim-upsell-image"><Image src={product.imageSrc || "/cd-mockup.png"} alt={product.name} width={900} height={900} sizes="(max-width: 760px) 90vw, 360px" /></div><div className="claim-upsell-card-body"><h2>{product.name}</h2>{product.upsellHeadline ? <p className="claim-upsell-headline">{product.upsellHeadline}</p> : null}{product.upsellSubheadline ? <p className="claim-upsell-subheadline">{product.upsellSubheadline}</p> : null}<p className="claim-upsell-description">{product.upsellBody || product.description}</p><div className="claim-upsell-price"><span className="claim-one-time-offer">ONE-TIME OFFER</span><div><strong>{price(product.priceLabel)}</strong>{product.compareAtPriceLabel ? <del>{price(product.compareAtPriceLabel)}</del> : null}</div></div>{product.variants?.length ? <div className="claim-size-picker"><span>Choose a size</span><div>{product.variants.map((variant) => <button key={variant.handle} type="button" className={chosenVariant === variant.handle ? "is-active" : ""} disabled={!available(inventorySnapshot, variant.variantId)} onClick={() => chooseVariant(product, variant.handle)}>{variant.name}</button>)}</div></div> : null}{chosen ? <div className="claim-quantity-picker"><span>Quantity</span><div><button type="button" onClick={() => changeQuantity(product.handle, -1)} aria-label={`Decrease ${product.name} quantity`}>−</button><strong>{quantityFor(product.handle)}</strong><button type="button" onClick={() => changeQuantity(product.handle, 1)} aria-label={`Increase ${product.name} quantity`}>+</button></div></div> : null}<button type="button" className={`claim-add-button ${chosen ? "is-added" : ""}`} onClick={() => toggleProduct(product)}>{chosen ? "REMOVE FROM ORDER" : "ADD TO ORDER"}</button></div></article>; })}</section>
        <section className="claim-upsell-summary"><div><p className="claim-store-kicker">YOUR ORDER</p><h2>Signed CD + {extraUnits} extra{extraUnits === 1 ? "" : "s"}</h2><p>CD postage: £4.99 · Extras are added to the same Shopify checkout.</p></div><div className="claim-upsell-summary-action"><strong>{total ? `£${total.toFixed(2)}` : "£0"}</strong><a className="claim-store-button claim-store-button-dark" href={checkoutHref}>CONTINUE TO CHECKOUT <span>↗</span></a></div></section>
      </div>
    </main>
  );
}
