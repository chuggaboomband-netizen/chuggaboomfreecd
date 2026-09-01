"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import type { InventorySnapshot, Product, SelectedItem } from "@/lib/types";

function parsePrice(value: string): number {
  const numeric = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatPrice(value: number): string {
  return `£${value.toFixed(2).replace(/\\.00$/, "")}`;
}

function resolveSelectedItems(products: Product[], handles: string[]): SelectedItem[] {
  const items: SelectedItem[] = [];

  for (const handle of handles) {
    for (const product of products) {
      if (product.handle === handle) {
        items.push({
          id: product.id,
          productId: product.id,
          handle: product.handle,
          name: product.name,
          variantId: product.variantId,
          priceLabel: product.priceLabel,
          compareAtPriceLabel: product.compareAtPriceLabel,
          autoDiscountCodes: product.autoDiscountCodes,
          imageSrc: product.imageSrc,
        });
        break;
      }

      const variant = product.variants?.find((item) => item.handle === handle);
      if (!variant) {
        continue;
      }

      items.push({
        id: variant.id,
        productId: product.id,
        handle: variant.handle,
        name: `${product.name}: ${variant.name}`,
        variantId: variant.variantId,
        priceLabel: variant.priceLabel,
        compareAtPriceLabel: variant.compareAtPriceLabel ?? product.compareAtPriceLabel,
        autoDiscountCodes: product.autoDiscountCodes,
        imageSrc: product.imageSrc,
      });
      break;
    }
  }

  return items;
}

function itemPriceDisplay(item: SelectedItem) {
  return {
    current: item.priceLabel.startsWith("£") ? item.priceLabel : formatPrice(parsePrice(item.priceLabel)),
    compareAt: item.compareAtPriceLabel
      ? item.compareAtPriceLabel.startsWith("£")
        ? item.compareAtPriceLabel
        : formatPrice(parsePrice(item.compareAtPriceLabel))
      : undefined,
  };
}

function isVariantAvailable(inventorySnapshot: InventorySnapshot, variantId: string) {
  const stock = inventorySnapshot[variantId];
  return stock == null || stock > 0;
}

function isHandleAvailable(products: Product[], handle: string, inventorySnapshot: InventorySnapshot) {
  for (const product of products) {
    if (product.handle === handle) {
      return isVariantAvailable(inventorySnapshot, product.variantId);
    }

    const variant = product.variants?.find((item) => item.handle === handle);
    if (variant) return isVariantAvailable(inventorySnapshot, variant.variantId);
  }

  return false;
}

export function UpsellSelector({
  products,
  initialSelected,
  initialStep,
  inventorySnapshot,
}: {
  products: Product[];
  initialSelected: string[];
  initialStep: number;
  inventorySnapshot: InventorySnapshot;
}) {
  const router = useRouter();
  const defaultSelection = products
    .filter((product) => product.isDefault)
    .map((product) => product.handle);
  const baseProduct = products.find((product) => product.isDefault) ?? products[0];
  const upsells = products.filter((product) => !product.isDefault);
  const selected = useMemo(
    () => Array.from(new Set([...defaultSelection, ...initialSelected])).filter(
      (handle) => isHandleAvailable(products, handle, inventorySnapshot),
    ),
    [defaultSelection, initialSelected, inventorySnapshot, products],
  );
  const currentStep = Math.max(0, Math.min(initialStep, Math.max(upsells.length - 1, 0)));
  const featuredUpsell = upsells[currentStep] ?? null;
  const availableVariantHandles = useMemo(
    () => featuredUpsell?.variants
      ?.filter((variant) => isVariantAvailable(inventorySnapshot, variant.variantId))
      .map((variant) => variant.handle) || [],
    [featuredUpsell, inventorySnapshot],
  );
  const [selectedVariantHandle, setSelectedVariantHandle] = useState<string>(
    availableVariantHandles[0] || "",
  );

  useEffect(() => {
    setSelectedVariantHandle(availableVariantHandles[0] || "");
  }, [featuredUpsell?.handle, availableVariantHandles]);

  const selectedItems = useMemo(() => resolveSelectedItems(products, selected), [products, selected]);

  const prospectiveHandles = useMemo(() => {
    if (!featuredUpsell) {
      return selected;
    }

    const offeredHandle = featuredUpsell.variants?.length
      ? selectedVariantHandle || availableVariantHandles[0] || featuredUpsell.handle
      : featuredUpsell.handle;

    return Array.from(new Set([...selected, offeredHandle]));
  }, [availableVariantHandles, featuredUpsell, selected, selectedVariantHandle]);

  const prospectiveItems = useMemo(
    () => resolveSelectedItems(products, prospectiveHandles),
    [products, prospectiveHandles],
  );

  const currentCartTotal = selectedItems.reduce(
    (total, item) => total + parsePrice(item.priceLabel),
    0,
  );
  const currentCartCompareAtTotal = selectedItems.reduce(
    (total, item) => total + parsePrice(item.compareAtPriceLabel ?? item.priceLabel),
    0,
  );
  const prospectiveTotal = prospectiveItems.reduce(
    (total, item) => total + parsePrice(item.priceLabel),
    0,
  );
  const prospectiveCompareAtTotal = prospectiveItems.reduce(
    (total, item) => total + parsePrice(item.compareAtPriceLabel ?? item.priceLabel),
    0,
  );

  const routeToStepOrCheckout = (handles: string[], step: number) => {
    if (step >= upsells.length) {
      const checkoutParams = new URLSearchParams();
      checkoutParams.set("offers", handles.join(","));
      router.push(`/checkout?${checkoutParams.toString()}`);
      return;
    }

    const params = new URLSearchParams();
    params.set("offers", handles.join(","));
    params.set("step", String(step));
    router.push(`/upsell?${params.toString()}`);
  };

  const continueToCheckout = () => {
    routeToStepOrCheckout(selected, upsells.length);
  };

  const declineFeaturedUpsell = () => {
    routeToStepOrCheckout(selected, currentStep + 1);
  };

  const acceptCurrentUpsell = () => {
    if (!featuredUpsell) {
      continueToCheckout();
      return;
    }

    const acceptedHandle = featuredUpsell.variants?.length
      ? selectedVariantHandle || availableVariantHandles[0] || featuredUpsell.handle
      : featuredUpsell.handle;
    const acceptedHandles = Array.from(new Set([...selected, acceptedHandle]));
    routeToStepOrCheckout(acceptedHandles, currentStep + 1);
  };

  if (!featuredUpsell) {
    return (
      <div className="upsell-page">
        <section className="upsell-hero">
          <Image
            src="/chuggaboom-logo-straight.png"
            alt="ChuggaBoom logo"
            className="upsell-logo"
            width={750}
            height={256}
            sizes="(max-width: 700px) 220px, 320px"
          />
          <h1 className="upsell-title">Your bundle is ready</h1>
          <p className="upsell-subtitle">
            You&apos;ve reached the end of the upsell flow. Head to checkout whenever you&apos;re ready.
          </p>
        </section>

        <section className="upsell-offer-grid">
          <div className="upsell-copy-panel">
            <div className="upsell-what-you-get">
              <h2>What you&apos;ll get:</h2>
              <ul>
                {selectedItems.map((item) => (
                  <li key={item.id}>
                    <span className="upsell-line-name">• {item.name}</span>
                    <span className="upsell-line-price">
                      {itemPriceDisplay(item).compareAt ? (
                        <span className="upsell-line-price-group">
                          <span className="upsell-line-compare">{itemPriceDisplay(item).compareAt}</span>
                          <span className="upsell-line-price-note">value</span>
                        </span>
                      ) : null}
                      <span className="upsell-line-price-group">
                        <span>{itemPriceDisplay(item).current}</span>
                        <span className="upsell-line-price-note">today</span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="upsell-total">
              <span>Total:</span>
              <strong>
                {currentCartCompareAtTotal > currentCartTotal ? (
                  <span className="upsell-total-old">{formatPrice(currentCartCompareAtTotal)}</span>
                ) : null}{" "}
                {formatPrice(currentCartTotal)}
              </strong>
            </div>
            <div className="upsell-cta-stack">
              <button type="button" className="button upsell-yes" onClick={continueToCheckout}>
                CONTINUE TO CHECKOUT
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="upsell-page">
      <section className="upsell-hero">
        <Image
          src="/chuggaboom-logo-straight.png"
          alt="ChuggaBoom logo"
          className="upsell-logo"
          width={750}
          height={256}
          sizes="(max-width: 700px) 220px, 320px"
        />
        <h1 className="upsell-title">
          {featuredUpsell?.upsellHeadline || "Want even more music while you&apos;re here?"}
        </h1>
        <p className="upsell-subtitle">
          {featuredUpsell?.upsellSubheadline || (
            <>
              You&apos;ve already got <strong>{baseProduct?.name ?? "the free CD"}</strong> in your basket.
            </>
          )}
        </p>
      </section>

      <section className="upsell-offer-grid">
        <div className="upsell-product-panel">
          <div className="upsell-product-frame">
            <Image
              src={featuredUpsell.imageSrc || "/cd-mockup.png"}
              alt={featuredUpsell.name}
              className="upsell-product-image"
              width={1000}
              height={1000}
              sizes="(max-width: 700px) 90vw, 500px"
            />
          </div>
        </div>

        <div className="upsell-copy-panel">
          <p className="upsell-body">
            {featuredUpsell.upsellBody
              ? featuredUpsell.upsellBody
              : <>We thought you might like to add <strong>{featuredUpsell.name}</strong> while you&apos;re here.</>}
          </p>

          {featuredUpsell.variants?.length ? (
            <div className="upsell-variant-block">
              <h3 className="upsell-variant-title">Choose your size</h3>
              <div className="upsell-variant-grid">
                {featuredUpsell.variants.map((variant) => {
                  const available = isVariantAvailable(inventorySnapshot, variant.variantId);
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      disabled={!available}
                      className={`upsell-variant-button ${selectedVariantHandle === variant.handle ? "selected" : ""} ${!available ? "is-sold-out" : ""}`}
                      onClick={() => setSelectedVariantHandle(variant.handle)}
                    >
                      {variant.name}{!available ? " — Out of stock" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="upsell-what-you-get">
            <h2>What you&apos;ll get:</h2>
            <ul>
              {prospectiveItems.map((item) => (
                <li key={item.id}>
                  <span className="upsell-line-name">• {item.name}</span>
                  <span className="upsell-line-price">
                    {itemPriceDisplay(item).compareAt ? (
                      <span className="upsell-line-price-group">
                        <span className="upsell-line-compare">{itemPriceDisplay(item).compareAt}</span>
                        <span className="upsell-line-price-note">value</span>
                      </span>
                    ) : null}
                    <span className="upsell-line-price-group">
                      <span>{itemPriceDisplay(item).current}</span>
                      <span className="upsell-line-price-note">today</span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="upsell-total">
            <span>Total:</span>
            <strong>
              {prospectiveCompareAtTotal > prospectiveTotal ? (
                <span className="upsell-total-old">{formatPrice(prospectiveCompareAtTotal)}</span>
              ) : null}{" "}
              {formatPrice(prospectiveTotal)}
            </strong>
          </div>

          <div className="upsell-cta-stack">
            <button type="button" className="button upsell-yes" onClick={acceptCurrentUpsell}>
              {featuredUpsell.upsellYesLabel || `YES PLEASE, ADD ${featuredUpsell.name.toUpperCase()}`}
            </button>
            <button type="button" className="upsell-no" onClick={declineFeaturedUpsell}>
              {featuredUpsell.upsellNoLabel || "JUST THE FREE CD, THANKS"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
