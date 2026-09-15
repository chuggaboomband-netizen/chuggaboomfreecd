import Link from "next/link";
import Image from "next/image";

import { readConfig } from "@/lib/config-store";
import { buildPermalink, collectDiscountCodes, selectedVariantIds, sortProducts } from "@/lib/funnel";
import { getShopifyInventorySnapshot } from "@/lib/reports";

export default async function ClaimPage() {
  const config = await readConfig();
  const { campaign } = config;
  const coreProduct = sortProducts(config.products).find((product) => product.isDefault) ?? config.products[0];
  let inventorySnapshot = {};
  try {
    inventorySnapshot = await getShopifyInventorySnapshot(config);
  } catch (error) {
    console.error("Shopify inventory snapshot failed for claim page.", error);
  }
  const selectedHandles = [coreProduct?.handle ?? "free-cd"];
  const checkoutHref = buildPermalink(
    campaign.shopifyStoreHost,
    selectedVariantIds(config, selectedHandles, inventorySnapshot),
    collectDiscountCodes(config, selectedHandles, [], inventorySnapshot),
  ) || `/checkout?offers=${encodeURIComponent(coreProduct?.handle ?? "free-cd")}`;

  return (
    <main className="claim-page">
      <div className="claim-store-shell">
        <div className="claim-announcement">FREE CD · JUST COVER SHIPPING</div>
        <header className="claim-store-header"><Link href="/" className="claim-logo-link"><Image src="/chuggaboom-logo-straight.png" alt="ChuggaBoom" width={500} height={171} /></Link><nav><a href="#about">About</a><a href="#product">The CD</a><a href="#faq">FAQ</a></nav><a className="claim-cart-link" href={checkoutHref}>Checkout <span>↗</span></a></header>

        <section className="claim-store-hero"><div><p className="claim-store-kicker">CHUGGABOOM · THE ESSENTIALS</p><h1>Claim your<br /><span>free CD.</span></h1><p className="claim-store-lede">If you&apos;re reading this, you&apos;ve probably just seen one of our ads. Thanks for checking us out! The best way for us to introduce ourselves is by giving you some music to listen to. Just help us out with the shipping.</p><a className="claim-store-button" href={checkoutHref}>GET YOUR CD <span>→</span></a></div><div className="claim-hero-image-wrap"><Image src="/chuggaboom-live.jpg" alt="ChuggaBoom performing to a live crowd" width={1600} height={1200} sizes="(max-width: 760px) 92vw, 560px" priority /></div></section>

        <section className="claim-store-product" id="product"><div className="claim-product-image"><Image src="/cd-mockup.png" alt={`${coreProduct?.name ?? "ChuggaBoom CD"} product image`} width={1000} height={696} sizes="(max-width: 760px) 92vw, 540px" /></div><div className="claim-product-details"><p className="claim-store-kicker">THE FREE CD</p><h2>{coreProduct?.name ?? "ChuggaBoom: The Essentials"}</h2><div className="claim-product-price"><strong>{campaign.shippingPrice}</strong><span>Shipping &amp; packing only</span></div><div className="claim-shipping-callout"><strong>The CD is free.</strong><span>£4.99 is for shipping and packing only.</span></div><p>Here&apos;s exactly what you&apos;ll get: our physical CD, signed by the band before it&apos;s sent directly to you. It&apos;s the easiest way to jump in, hear what we do, and decide if you want anything extra later.</p><ul><li>Free physical CD</li><li>Signed by the band</li><li>UK delivery included</li><li>No subscription or recurring payment</li></ul><a className="claim-store-button claim-store-button-dark" href={checkoutHref}>CLAIM YOUR FREE CD <span>↗</span></a><small>Secure checkout powered by Shopify</small></div></section>

        <section className="claim-store-about" id="about"><div className="claim-about-image"><Image src="/john-and-levi.jpg" alt="ChuggaBoom" width={1200} height={800} sizes="(max-width: 760px) 100vw, 760px" /></div><div><p className="claim-store-kicker">WHO ARE WE?</p><h2>Nice to meet you.</h2><p>We&apos;re {campaign.bandName}, a UK band making catchy, fun, heavy metalcore for people who don&apos;t take themselves too seriously. Think Deadpool... but metalcore.</p><p>We&apos;ve been around since 2014, and we&apos;ve got no plans of slowing down. Take the music home, give it a proper listen, and decide what you think.</p></div></section>

        <section className="claim-store-faq" id="faq"><div><p className="claim-store-kicker">A FEW QUESTIONS</p><h2>Before you go.</h2><a className="claim-store-button" href={checkoutHref}>CLAIM THE CD <span>→</span></a></div><div>{[["You’re charging £4.99, so it’s not free is it?","Fair question. The CD itself is free. The £4.99 covers part of the cost of advertising, postage and packing, but it doesn’t cover all of it. Once those costs are taken into account, we actually lose money on every order. We’re doing that because we want more people to discover ChuggaBoom and hear the music."],["When will it arrive?","We aim to pack and post orders within 3–5 working days."],["Can I add merch?","We’ll show you any available extras after your CD order is complete."]].map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>

        <footer className="claim-store-footer"><Image src="/chuggaboom-logo-straight.png" alt="ChuggaBoom" width={300} height={103} /><p>© 2026 ChuggaBoom</p></footer>
      </div>
    </main>
  );
}
