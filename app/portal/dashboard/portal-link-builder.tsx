"use client";

import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";

import { buildPermalink, sortProducts } from "@/lib/funnel";
import type { Discount, Product } from "@/lib/types";

type PortalLinkBuilderProps = {
  storeHost: string;
  products: Product[];
  discounts: Discount[];
};

export function PortalLinkBuilder({
  storeHost,
  products,
  discounts,
}: PortalLinkBuilderProps) {
  const sortedProducts = useMemo(() => sortProducts(products), [products]);
  const sortedDiscounts = useMemo(
    () => [...discounts].sort((a, b) => b.priority - a.priority),
    [discounts],
  );

  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedDiscountIds, setSelectedDiscountIds] = useState<string[]>([]);

  const selectedProducts = useMemo(
    () => sortedProducts.filter((product) => selectedProductIds.includes(product.id)),
    [selectedProductIds, sortedProducts],
  );
  const selectedDiscounts = useMemo(
    () => sortedDiscounts.filter((discount) => selectedDiscountIds.includes(discount.id)),
    [selectedDiscountIds, sortedDiscounts],
  );

  const permalink = useMemo(
    () =>
      buildPermalink(
        storeHost,
        selectedProducts.map((product) => product.variantId),
        selectedDiscounts.map((discount) => discount.code),
      ),
    [selectedDiscounts, selectedProducts, storeHost],
  );

  const toggle = (
    id: string,
    setCurrent: Dispatch<SetStateAction<string[]>>,
  ) => {
    setCurrent((value) =>
      value.includes(id) ? value.filter((item) => item !== id) : [...value, id],
    );
  };

  return (
    <section className="admin-card stack">
      <div>
        <h2>Permalink builder</h2>
        <p className="microcopy">
          This mirrors the spreadsheet workflow: choose products, choose discount codes, and the Shopify permalink is generated instantly.
        </p>
      </div>

      <div className="admin-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="summary-card stack">
          <strong>Products</strong>
          {sortedProducts.map((product) => (
            <label key={product.id} className="inline-form">
              <input
                type="checkbox"
                checked={selectedProductIds.includes(product.id)}
                onChange={() => toggle(product.id, setSelectedProductIds)}
              />
              <span>
                {product.name} <span className="microcopy">({product.variantId})</span>
              </span>
            </label>
          ))}
        </div>

        <div className="summary-card stack">
          <strong>Discounts</strong>
          {sortedDiscounts.map((discount) => (
            <label key={discount.id} className="inline-form">
              <input
                type="checkbox"
                checked={selectedDiscountIds.includes(discount.id)}
                onChange={() => toggle(discount.id, setSelectedDiscountIds)}
              />
              <span>
                {discount.name} <span className="microcopy">({discount.code})</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="summary-card stack">
        <strong>Your link</strong>
        <div className="rule-code">{permalink || "Select at least one product to generate a link."}</div>
      </div>
    </section>
  );
}
