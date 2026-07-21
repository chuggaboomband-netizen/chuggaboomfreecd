"use server";

import crypto from "node:crypto";
import path from "node:path";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createSession, clearSession, passwordMatches } from "@/lib/auth";
import { readConfig, savePublicUpload, writeConfig } from "@/lib/config-store";
import { parseHandleList, parseWeeklyAdSpend } from "@/lib/funnel";
import type { Discount, Product, ProductVariant } from "@/lib/types";

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) || "").trim();
}

function sanitizeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function saveUploadedImage(file: File): Promise<string | undefined> {
  if (!(file instanceof File) || file.size === 0) {
    return undefined;
  }

  const extension = path.extname(file.name) || ".png";
  const baseName = path.basename(file.name, extension) || "product-image";
  const safeName = `${sanitizeFilename(baseName)}-${crypto.randomUUID()}${extension.toLowerCase()}`;
  return savePublicUpload(file, safeName);
}

function parseVariants(value: string): ProductVariant[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [handle, name, variantId, priceLabel, compareAtPriceLabel] = line
        .split("|")
        .map((item) => item.trim());

      return {
        id: crypto.randomUUID(),
        handle,
        name,
        variantId,
        priceLabel,
        compareAtPriceLabel: compareAtPriceLabel || undefined,
      };
    })
    .filter((variant) => variant.handle && variant.name && variant.variantId && variant.priceLabel);
}

function revalidateFunnelPaths() {
  revalidatePath("/");
  revalidatePath("/upsell");
  revalidatePath("/checkout");
  revalidatePath("/portal/dashboard");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to save changes.";
}

async function finalizePortalMutation(work: () => Promise<void>) {
  try {
    await work();
  } catch (error) {
    redirect(`/portal/dashboard?error=${encodeURIComponent(getErrorMessage(error))}`);
  }

  revalidateFunnelPaths();
  redirect("/portal/dashboard?saved=1");
}

export async function loginAction(formData: FormData) {
  const password = getString(formData, "password");

  if (!passwordMatches(password)) {
    redirect("/portal?error=1");
  }

  await createSession();
  redirect("/portal/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/portal");
}

export async function saveCampaignAction(formData: FormData) {
  await finalizePortalMutation(async () => {
    const config = await readConfig();

    config.campaign = {
      bandName: getString(formData, "bandName"),
      headline: getString(formData, "headline"),
      subheadline: getString(formData, "subheadline"),
      heroNote: getString(formData, "heroNote"),
      shippingLabel: getString(formData, "shippingLabel"),
      shippingPrice: getString(formData, "shippingPrice"),
      startButtonLabel: getString(formData, "startButtonLabel"),
      shopifyStoreHost: getString(formData, "shopifyStoreHost"),
    };

    await writeConfig(config);
  });
}

export async function saveReportingAction(formData: FormData) {
  await finalizePortalMutation(async () => {
    const config = await readConfig();

    config.reporting = {
      reportDiscountCode: getString(formData, "reportDiscountCode"),
      defaultPostageCost: getString(formData, "defaultPostageCost"),
      weeklyAdSpend: parseWeeklyAdSpend(getString(formData, "weeklyAdSpend")),
    };

    await writeConfig(config);
  });
}

export async function addProductAction(formData: FormData) {
  await finalizePortalMutation(async () => {
    const config = await readConfig();
    const uploadedImageSrc = await saveUploadedImage(formData.get("imageFile") as File);
    const nextProduct: Product = {
      id: crypto.randomUUID(),
      handle: getString(formData, "handle"),
      name: getString(formData, "name"),
      description: getString(formData, "description"),
      variantId: getString(formData, "variantId"),
      priceLabel: getString(formData, "priceLabel"),
      compareAtPriceLabel: getString(formData, "compareAtPriceLabel") || undefined,
      type: getString(formData, "type") === "core" ? "core" : "upsell",
      isDefault: formData.get("isDefault") === "on",
      sortOrder: Number(getString(formData, "sortOrder") || "0"),
      autoDiscountCodes: parseHandleList(getString(formData, "autoDiscountCodes")),
      unitCost: getString(formData, "unitCost") || undefined,
      imageSrc: uploadedImageSrc || getString(formData, "imageSrc") || undefined,
      upsellHeadline: getString(formData, "upsellHeadline") || undefined,
      upsellSubheadline: getString(formData, "upsellSubheadline") || undefined,
      upsellBody: getString(formData, "upsellBody") || undefined,
      upsellYesLabel: getString(formData, "upsellYesLabel") || undefined,
      upsellNoLabel: getString(formData, "upsellNoLabel") || undefined,
      variants: parseVariants(getString(formData, "variantsText")),
    };

    config.products.push(nextProduct);
    await writeConfig(config);
  });
}

export async function updateProductAction(formData: FormData) {
  await finalizePortalMutation(async () => {
    const config = await readConfig();
    const id = getString(formData, "id");
    const uploadedImageSrc = await saveUploadedImage(formData.get("imageFile") as File);

    config.products = config.products.map((product) =>
      product.id === id
        ? {
            ...product,
            handle: getString(formData, "handle"),
            name: getString(formData, "name"),
            description: getString(formData, "description"),
            variantId: getString(formData, "variantId"),
            priceLabel: getString(formData, "priceLabel"),
            compareAtPriceLabel: getString(formData, "compareAtPriceLabel") || undefined,
            type: getString(formData, "type") === "core" ? "core" : "upsell",
            isDefault: formData.get("isDefault") === "on",
            sortOrder: Number(getString(formData, "sortOrder") || "0"),
            autoDiscountCodes: parseHandleList(getString(formData, "autoDiscountCodes")),
            unitCost: getString(formData, "unitCost") || undefined,
            imageSrc: uploadedImageSrc || getString(formData, "imageSrc") || undefined,
            upsellHeadline: getString(formData, "upsellHeadline") || undefined,
            upsellSubheadline: getString(formData, "upsellSubheadline") || undefined,
            upsellBody: getString(formData, "upsellBody") || undefined,
            upsellYesLabel: getString(formData, "upsellYesLabel") || undefined,
            upsellNoLabel: getString(formData, "upsellNoLabel") || undefined,
            variants: parseVariants(getString(formData, "variantsText")),
          }
        : product,
    );

    await writeConfig(config);
  });
}

export async function deleteProductAction(formData: FormData) {
  await finalizePortalMutation(async () => {
    const config = await readConfig();
    const id = getString(formData, "id");

    config.products = config.products.filter((product) => product.id !== id);
    await writeConfig(config);
  });
}

export async function addDiscountAction(formData: FormData) {
  await finalizePortalMutation(async () => {
    const config = await readConfig();
    const discount: Discount = {
      id: crypto.randomUUID(),
      name: getString(formData, "name"),
      code: getString(formData, "code"),
      priority: Number(getString(formData, "priority") || "0"),
    };

    config.discounts.push(discount);
    await writeConfig(config);
  });
}

export async function updateDiscountAction(formData: FormData) {
  await finalizePortalMutation(async () => {
    const config = await readConfig();
    const id = getString(formData, "id");
    const previous = config.discounts.find((discount) => discount.id === id);

    const nextName = getString(formData, "name");
    const nextCode = getString(formData, "code");
    const nextPriority = Number(getString(formData, "priority") || "0");

    config.discounts = config.discounts.map((discount) =>
      discount.id === id
        ? {
            ...discount,
            name: nextName,
            code: nextCode,
            priority: nextPriority,
          }
        : discount,
    );

    if (previous && previous.code !== nextCode) {
      config.products = config.products.map((product) => ({
        ...product,
        autoDiscountCodes: product.autoDiscountCodes.map((code) =>
          code === previous.code ? nextCode : code,
        ),
      }));
    }

    await writeConfig(config);
  });
}

export async function deleteDiscountAction(formData: FormData) {
  await finalizePortalMutation(async () => {
    const config = await readConfig();
    const id = getString(formData, "id");

    const discount = config.discounts.find((item) => item.id === id);
    config.discounts = config.discounts.filter((item) => item.id !== id);

    if (discount) {
      config.products = config.products.map((product) => ({
        ...product,
        autoDiscountCodes: product.autoDiscountCodes.filter((code) => code !== discount.code),
      }));
    }

    await writeConfig(config);
  });
}
