# ChuggaBoom Free CD Funnel

This is a starter funnel app for a free CD campaign:

1. Meta ad
2. Landing page
3. Upsell selection
4. Shopify permalink generation

## What it includes

- Public landing page at `/`
- Upsell selection page at `/upsell`
- Checkout resolver page at `/checkout`
- Password-protected admin portal at `/portal`
- Reporting dashboard at `/portal/reports`
- File-backed config in [data/funnel-config.json](/Users/jakebarnes/Documents/New project 2/data/funnel-config.json)
- Shopify-style permalink builder without spreadsheets

## Data model

- `campaign.shopifyStoreHost`: the store host, for example `shop.chuggaboom.com`
- `products[]`: upsells/core products with `variantId` values like `55749148705148:1`
- `discounts[]`: available discount codes
- `products[].autoDiscountCodes`: discount codes that should be applied automatically when that product is selected
- `products[].unitCost`: internal cost per product for reporting
- `reporting.defaultPostageCost`: default postage cost used in P/L calculations
- `reporting.weeklyAdSpend[]`: weekly ad spend entries for reporting
- `reporting.reportDiscountCode`: the discount code used to identify funnel orders in Shopify

The generated permalink follows the same pattern as the Bitter Kisses workbook:

```text
https://{shopifyStoreHost}/cart/{variantId},{variantId}?channel=buy_button&discount={code},{code}
```

## Local setup

1. Copy `.env.example` to `.env.local`
2. Set `ADMIN_USERNAME` and `ADMIN_PASSWORD`
3. Set `ADMIN_SESSION_SECRET` to a long random string for signed portal sessions
4. Optional but recommended: run `npm run auth:setup`, scan the QR code in your authenticator app, then set `ADMIN_TOTP_SECRET`
5. Optional: set `GITHUB_STORAGE_TOKEN`, `GITHUB_STORAGE_REPO`, and `GITHUB_STORAGE_BRANCH` if you want local saves to write back to GitHub instead of the local JSON file
6. Optional: set `SHOPIFY_STORE_DOMAIN` and either `SHOPIFY_ADMIN_ACCESS_TOKEN` or both `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` to enable live reports from Shopify
7. Install dependencies with `npm install`
8. Run `npm run dev`

## Notes

- This version uses a JSON file as its backend store so changes persist in a stateful Node environment.
- Portal auth now supports username + password + optional authenticator app code (`ADMIN_TOTP_SECRET`).
- Login attempts are throttled in-app to slow down password guessing.
- Customer order cache is no longer persisted into the repo-backed config store. Live reports pull from Shopify directly until a dedicated private data store is added.
- In production on Vercel, filesystem writes do not persist. To make the portal work there, set:
  - `GITHUB_STORAGE_TOKEN`: a GitHub token with contents write access to the repo
  - `GITHUB_STORAGE_REPO`: for example `chuggaboomband-netizen/chuggaboomfreecd`
  - `GITHUB_STORAGE_BRANCH`: usually `main`
- When those env vars are present, product edits, discount edits, config changes, and uploaded product images are written back into the GitHub repo instead of the local filesystem.
- When `SHOPIFY_STORE_DOMAIN` is present and either a static `SHOPIFY_ADMIN_ACCESS_TOKEN` or client credentials (`SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`) are configured, `/portal/reports` pulls live Shopify orders filtered by the configured report discount code.
