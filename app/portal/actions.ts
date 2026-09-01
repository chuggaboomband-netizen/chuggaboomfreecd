"use server";

import crypto from "node:crypto";
import path from "node:path";
import sharp from "sharp";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  assertLoginAllowed,
  clearFailedLogins,
  createSession,
  clearSession,
  isTotpEnabled,
  otpMatches,
  passwordMatches,
  recordFailedLogin,
  usernameMatches,
} from "@/lib/auth";
import { readConfig, savePublicUpload, writeConfig } from "@/lib/config-store";
import { parseHandleList, parseWeeklyAdSpend } from "@/lib/funnel";
import type { AdSpendEntry, Discount, Product, ProductCostTier, ProductVariant } from "@/lib/types";

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

  const extension = (path.extname(file.name) || ".png").toLowerCase();
  const baseName = path.basename(file.name, extension) || "product-image";
  const safeName = `${sanitizeFilename(baseName)}-${crypto.randomUUID()}`;

  // Keep GIFs intact so an animated product image does not become a static WebP.
  if (extension === ".gif" || file.type === "image/gif") {
    return savePublicUpload(file, `${safeName}.gif`);
  }

  const compressedImage = await sharp(Buffer.from(await file.arrayBuffer()))
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  return savePublicUpload(compressedImage, `${safeName}.webp`);
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

function parseCostTiers(value: string): ProductCostTier[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [startAtUnit, unitCost, note] = line.split("|").map((item) => item.trim());
      return {
        id: crypto.randomUUID(),
        startAtUnit: Number(startAtUnit),
        unitCost,
        note: note || undefined,
      };
    })
    .filter((tier) => Number.isInteger(tier.startAtUnit) && tier.startAtUnit > 0 && Boolean(tier.unitCost))
    .sort((left, right) => left.startAtUnit - right.startAtUnit)
    .filter((tier, index, tiers) => index === 0 || tier.startAtUnit !== tiers[index - 1].startAtUnit);
}

function revalidateFunnelPaths() {
  revalidatePath("/");
  revalidatePath("/upsell");
  revalidatePath("/checkout");
  revalidatePath("/portal/dashboard");
  revalidatePath("/portal/upsells");
  revalidatePath("/portal/upsells", "page");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to save changes.";
}

async function finalizePortalMutation(
  work: () => Promise<void>,
  redirectPath = "/portal/dashboard",
) {
  try {
    await work();
  } catch (error) {
    redirect(`${redirectPath}?error=${encodeURIComponent(getErrorMessage(error))}` as never);
  }

  revalidateFunnelPaths();
  redirect(`${redirectPath}?saved=1` as never);
}

export async function loginAction(formData: FormData) {
  const username = getString(formData, "username");
  const password = getString(formData, "password");
  const otp = getString(formData, "otp");
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for");
  const clientIp = forwardedFor?.split(",")[0]?.trim() || "local";

  try {
    assertLoginAllowed(clientIp);
  } catch (error) {
    redirect(`/portal?error=${encodeURIComponent(getErrorMessage(error))}`);
  }

  if (!usernameMatches(username) || !passwordMatches(password) || (isTotpEnabled() && !otpMatches(otp))) {
    recordFailedLogin(clientIp);
    redirect(
      `/portal?error=${encodeURIComponent(
        isTotpEnabled()
          ? "Incorrect username, password, or authenticator code."
          : "Incorrect username or password.",
      )}`,
    );
  }

  clearFailedLogins(clientIp);
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
      ...config.reporting,
      reportDiscountCode: getString(formData, "reportDiscountCode"),
      trackedProductSku: getString(formData, "trackedProductSku") || undefined,
      defaultPostageCost: getString(formData, "defaultPostageCost"),
      totalAdSpend: config.reporting?.totalAdSpend,
      adSpendEntries: config.reporting?.adSpendEntries || [],
      weeklyAdSpend: parseWeeklyAdSpend(getString(formData, "weeklyAdSpend")),
    };

    await writeConfig(config);
  });
}

export async function addAdSpendEntryAction(formData: FormData) {
  await finalizePortalMutation(async () => {
    const config = await readConfig();
    const totalAmount = getString(formData, "totalAmount");
    const notes = getString(formData, "notes") || undefined;

    if (!totalAmount) {
      throw new Error("Enter the total ad spend amount before saving.");
    }

    const nextEntry: AdSpendEntry = {
      id: crypto.randomUUID(),
      recordedAt: new Date().toISOString(),
      totalAmount,
      notes,
    };

    config.reporting = {
      ...config.reporting,
      totalAdSpend: totalAmount,
      adSpendEntries: [...(config.reporting?.adSpendEntries || []), nextEntry],
      weeklyAdSpend: config.reporting?.weeklyAdSpend || [],
      reportDiscountCode: config.reporting?.reportDiscountCode || "FREECD",
      defaultPostageCost: config.reporting?.defaultPostageCost || "",
    };

    await writeConfig(config);
  });
}

export async function deleteAdSpendEntryAction(formData: FormData) {
  await finalizePortalMutation(async () => {
    const config = await readConfig();
    const id = getString(formData, "id");
    const nextEntries = (config.reporting?.adSpendEntries || []).filter((entry) => entry.id !== id);
    const latestEntry = nextEntries[nextEntries.length - 1];

    config.reporting = {
      ...config.reporting,
      totalAdSpend: latestEntry?.totalAmount,
      adSpendEntries: nextEntries,
      weeklyAdSpend: config.reporting?.weeklyAdSpend || [],
      reportDiscountCode: config.reporting?.reportDiscountCode || "FREECD",
      defaultPostageCost: config.reporting?.defaultPostageCost || "",
    };

    await writeConfig(config);
  });
}

export async function addProductAction(formData: FormData) {
  const redirectPath = getString(formData, "returnTo") || "/portal/dashboard";

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
      activeInFunnel: formData.get("activeInFunnel") === "on",
      sortOrder: Number(getString(formData, "sortOrder") || "0"),
      autoDiscountCodes: parseHandleList(getString(formData, "autoDiscountCodes")),
      unitCost: getString(formData, "unitCost") || undefined,
      costTiers: parseCostTiers(getString(formData, "costTiersText")),
      postageCost: getString(formData, "postageCost") || undefined,
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
  }, redirectPath);
}

export async function updateProductAction(formData: FormData) {
  const redirectPath = getString(formData, "returnTo") || "/portal/dashboard";

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
            activeInFunnel: formData.get("activeInFunnel") === "on",
            sortOrder: Number(getString(formData, "sortOrder") || "0"),
            autoDiscountCodes: parseHandleList(getString(formData, "autoDiscountCodes")),
            unitCost: getString(formData, "unitCost") || undefined,
            costTiers: parseCostTiers(getString(formData, "costTiersText")),
            postageCost: getString(formData, "postageCost") || undefined,
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
  }, redirectPath);
}

export async function deleteProductAction(formData: FormData) {
  const redirectPath = getString(formData, "returnTo") || "/portal/dashboard";

  await finalizePortalMutation(async () => {
    const config = await readConfig();
    const id = getString(formData, "id");

    config.products = config.products.filter((product) => product.id !== id);
    await writeConfig(config);
  }, redirectPath);
}

export async function saveFunnelSelectionAction(formData: FormData) {
  await finalizePortalMutation(async () => {
    const config = await readConfig();
    const activeIds = new Set(formData.getAll("activeProductIds").map((value) => String(value)));

    config.products = config.products.map((product) => ({
      ...product,
      activeInFunnel: product.isDefault ? true : activeIds.has(product.id),
    }));

    await writeConfig(config);
  }, "/portal/upsells");
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
