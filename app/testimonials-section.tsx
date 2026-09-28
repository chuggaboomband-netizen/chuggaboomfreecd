import Image from "next/image";

import type { Testimonial } from "@/lib/types";

export function TestimonialsSection({ testimonials, ctaHref, theme = "light" }: { testimonials: Testimonial[]; ctaHref: string; theme?: "light" | "dark" }) {
  if (testimonials.length === 0) return null;

  return (
    <section className={`claim-testimonials ${theme === "dark" ? "is-dark" : ""}`}>
      <div className="claim-testimonials-heading">
        <p className="claim-store-kicker">FROM THE CHUGGALO COMMUNITY</p>
        <h2>What people are saying about the free CD!</h2>
      </div>
      <div className="claim-testimonials-grid">
        {testimonials.map((testimonial) => (
          <figure key={testimonial.id}>
            <Image
              src={testimonial.imageSrc}
              alt={testimonial.altText || "Facebook comment about ChuggaBoom"}
              width={900}
              height={700}
            />
            {testimonial.caption ? <figcaption>{testimonial.caption}</figcaption> : null}
          </figure>
        ))}
      </div>
      <div className="claim-testimonials-cta">
        <a className="claim-store-button claim-store-button-dark" href={ctaHref}>
          CLAIM YOUR FREE CD <span>↗</span>
        </a>
      </div>
    </section>
  );
}
