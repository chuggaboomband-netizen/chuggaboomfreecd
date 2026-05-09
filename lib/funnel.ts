import { Discount, FunnelConfig, Product, ProductVariant, SelectedItem } from "@/lib/types";

export function sortProducts(products: Product[]): Product[] {
  return [...products].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function ensureCoreSelection(config: FunnelConfig, selectedHandles: string[]): string[] {
  const requiredHandles = config.products
    .filter((product) => product.isDefault)
    .map((product) => product.handle);
  return Array.from(new Set([...requiredHandles, ...selectedHandles]));
}

export function selectedProducts(
  config: FunnelConfig,
  selectedHandles: string[],
): Product[] {
  const selection = new Set(ensureCoreSelection(config, selectedHandles));
  return sortProducts(config.products).filter((product) => selection.has(product.handle));
}

function findSelectedItem(product: Product, handle: string): SelectedItem | null {
  if (product.handle === handle) {
    return {
      id: product.id,
      productId: product.id,
      handle: product.handle,
      name: product.name,
      variantId: product.variantId,
      priceLabel: product.priceLabel,
      compareAtPriceLabel: product.compareAtPriceLabel,
      autoDiscountCodes: product.autoDiscountCodes,
      imageSrc: product.imageSrc,
    };
  }

  const variant = product.variants?.find((item) => item.handle === handle);
  if (!variant) {
    return null;
  }

  return {
    id: variant.id,
    productId: product.id,
    handle: variant.handle,
    name: `${product.name} - ${variant.name}`,
    variantId: variant.variantId,
    priceLabel: variant.priceLabel,
    compareAtPriceLabel: variant.compareAtPriceLabel ?? product.compareAtPriceLabel,
    autoDiscountCodes: product.autoDiscountCodes,
    imageSrc: product.imageSrc,
  };
}

export function selectedItems(
  config: FunnelConfig,
  selectedHandles: string[],
): SelectedItem[] {
  const selection = ensureCoreSelection(config, selectedHandles);
  const items: SelectedItem[] = [];

  for (const handle of selection) {
    for (const product of sortProducts(config.products)) {
      const item = findSelectedItem(product, handle);
      if (item) {
        items.push(item);
        break;
      }
    }
  }

  return items;
}

export function selectedVariantIds(config: FunnelConfig, selectedHandles: string[]): string[] {
  return selectedItems(config, selectedHandles)
    .map((item) => item.variantId.trim())
    .filter(Boolean);
}

export function collectDiscountCodes(
  config: FunnelConfig,
  selectedHandles: string[],
  manualDiscountCodes: string[] = [],
): string[] {
  const fromProducts = selectedItems(config, selectedHandles).flatMap(
    (item) => item.autoDiscountCodes,
  );

  return Array.from(
    new Set(
      [...fromProducts, ...manualDiscountCodes]
        .map((code) => code.trim())
        .filter(Boolean),
    ),
  );
}

export function buildPermalink(
  storeHost: string,
  variantIds: string[],
  discountCodes: string[],
): string {
  const normalizedHost = storeHost
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

  if (!normalizedHost || variantIds.length === 0) {
    return "";
  }

  const baseUrl = `https://${normalizedHost}/cart/${variantIds.join(",")}?channel=buy_button`;
  if (discountCodes.length === 0) {
    return baseUrl;
  }

  return `${baseUrl}&discount=${discountCodes.join(",")}`;
}

export function availableDiscountsForProducts(
  discounts: Discount[],
  codes: string[],
): Discount[] {
  const codeSet = new Set(codes);
  return [...discounts]
    .filter((discount) => codeSet.has(discount.code))
    .sort((a, b) => b.priority - a.priority);
}

export function parsePriceLabel(value: string): number {
  const numeric = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

export function formatPriceLabel(value: number): string {
  return `£${value.toFixed(2).replace(/\\.00$/, "")}`;
}

export function parseHandleList(value: string): string[] {
  return value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function csvToRows(csv: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const nextCharacter = csv[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      row.push(current);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += character;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}
