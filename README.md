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
- File-backed config in [data/funnel-config.json](/Users/jakebarnes/Documents/New project 2/data/funnel-config.json)
- Shopify-style permalink builder without spreadsheets

## Data model

- `campaign.shopifyStoreHost`: the store host, for example `shop.chuggaboom.com`
- `products[]`: upsells/core products with `variantId` values like `55749148705148:1`
- `discounts[]`: available discount codes
- `products[].autoDiscountCodes`: discount codes that should be applied automatically when that product is selected

The generated permalink follows the same pattern as the Bitter Kisses workbook:

```text
https://{shopifyStoreHost}/cart/{variantId},{variantId}?channel=buy_button&discount={code},{code}
```

## Local setup

1. Copy `.env.example` to `.env.local`
2. Set `ADMIN_PASSWORD`
3. Install dependencies with `npm install`
4. Run `npm run dev`

## Notes

- This version uses a JSON file as its backend store so changes persist in a stateful Node environment.
- If you want to deploy this to a serverless platform later, the next step should be moving the config into a real database or hosted storage.
