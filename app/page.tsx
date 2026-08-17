import Link from "next/link";
import Image from "next/image";

import { readConfig } from "@/lib/config-store";
import { sortProducts } from "@/lib/funnel";

export default async function HomePage() {
  const config = await readConfig();
  const { campaign } = config;
  const coreProduct = sortProducts(config.products).find((product) => product.isDefault) ?? config.products[0];

  return (
    <main className="landing-page">
      <div className="shell">
        <section className="bk-hero">
          <Image
            src="/chuggaboom-logo-straight.png"
            alt={`${campaign.bandName} logo`}
            className="bk-logo-image"
            width={750}
            height={256}
            sizes="(max-width: 700px) 280px, 420px"
            priority
          />
          <h1 className="bk-title">Claim your FREE CD from {campaign.bandName}!</h1>
          <p className="bk-subtitle">Just help us out with the shipping, and it&apos;s yours for free.</p>
          <div className="bk-cta">
            <Link href="/upsell" className="button">
              GET YOURS NOW
            </Link>
          </div>
        </section>

        <section className="bk-offer-grid">
          <div className="bk-product-shot">
            <div className="bk-photo-frame">
              <Image
                src="/cd-mockup.png"
                alt={`${coreProduct?.name ?? "ChuggaBoom CD"} mockup`}
                className="bk-promo-image"
                width={1000}
                height={696}
                sizes="(max-width: 700px) 90vw, 500px"
              />
              <div className="bk-photo-badge">
                <strong>{coreProduct?.name ?? "Free CD"}</strong>
                <span>Free with shipping</span>
              </div>
            </div>
          </div>
          <div className="bk-copy-column">
            <p className="bk-lead">
              Hello. We&apos;re {campaign.bandName}, and we&apos;re very pleased you&apos;re here.
            </p>
            <p className="bk-body">
              If this is your first time landing here, we want to make it as easy as possible for you to get up to speed with what we do. So we&apos;re giving away a physical CD completely free. The only thing we ask is that you cover the cost of the shipping.
            </p>
            <div className="bk-price-line">
              <span className="bk-old-price">Total: £10</span>
              <span className="bk-new-price">£0</span>
            </div>
            <div className="bk-shipping-chip">{campaign.shippingLabel} {campaign.shippingPrice}</div>
            <div className="bk-cta">
              <Link href="/upsell" className="button">
                GET YOURS NOW
              </Link>
            </div>
          </div>
        </section>
        <section className="bk-copy-section">
          <div className="bk-scroll-image">
            <Image src="/john-and-levi.jpg" alt="ChuggaBoom promo" className="bk-promo-wide-image" width={1200} height={800} sizes="(max-width: 700px) 100vw, 960px" />
          </div>
          <p className="bk-body">
            You still here? Lovely. It probably makes sense for us to introduce ourselves a bit, since we&apos;re presently randoms on the internet that you&apos;ve never met before. It&apos;s also good to let you know exactly what you&apos;ll be getting from us.
          </p>
        </section>

        <section className="bk-copy-section">
          <div className="bk-cta">
            <Link href="/upsell" className="button">
              NO WORRIES, I&apos;LL TAKE THE CD NOW
            </Link>
          </div>
          <h2 className="bk-section-title">If we&apos;re not on first-name terms yet, let&apos;s fix that</h2>
          <p className="bk-body">
            {campaign.bandName} make catchy, fun, heavy metalcore for people that don&apos;t take themselves too seriously. Think Deadpool... but metalcore.
          </p>
          <p className="bk-body">
            We&apos;ve been around since 2014, and we&apos;ve got no plans of slowing down.
          </p>
          <p className="bk-body">
            The free CD is the easiest way to jump in. It gets the music into your hands, lets you decide if you want anything extra, and gives you a proper first impression of the band instead of just another forgettable scroll-past.
          </p>
          <div className="bk-cta">
            <Link href="/upsell" className="button">
              YOU SEEM VERY COOL. CD, PLEASE
            </Link>
          </div>
        </section>

        <section className="bk-copy-section">
          <h2 className="bk-section-title">What happens when you order a free CD?</h2>
          <p className="bk-body">
            We get it, sending money on the internet to random people can be a bit daunting, so here&apos;s what you&apos;ll get and how it&apos;ll happen.
          </p>
          <p className="bk-body">
            You&apos;ll get <strong>{coreProduct?.name ?? "the CD"}</strong> itself, sent directly out once the shipping is covered.
          </p>
          <p className="bk-body">
            It&apos;s just <strong>{campaign.shippingPrice}</strong> to ship. You can add more if you want, but it&apos;ll literally just be that shipping amount to get the CD sent to you.
          </p>
          <div className="bk-bottom-split">
            <div className="bk-bottom-photo">
              <Image src="/chuggaboom-live.jpg" alt="ChuggaBoom live crowd photo" className="bk-bottom-photo-image" width={1600} height={1200} sizes="(max-width: 700px) 90vw, 600px" />
            </div>
            <div className="bk-bottom-copy">
              <p className="bk-body">
                And if you get the CD, listen to it, and hate it, get in touch with us within 30 days and we&apos;ll refund your shipping, no questions asked.
              </p>
              <div className="bk-cta bk-bottom-cta">
                <Link href="/upsell" className="button">
                  YOU GOT ME, I&apos;LL TAKE ONE
                </Link>
              </div>
            </div>
          </div>
          <p className="bk-body">
            And that&apos;s it. Thanks for making it to the bottom of the page. We can&apos;t wait to send one of these CDs out and have you along for the ride.
          </p>
          <p className="bk-signoff">
            Lots of love,
            <br />
            {campaign.bandName}
          </p>
        </section>
      </div>
    </main>
  );
}
