"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function PublicMetaPixel() {
  const pathname = usePathname();
  const hasTrackedInitialPage = useRef(false);

  const isPortalRoute = pathname.startsWith("/portal");

  useEffect(() => {
    if (isPortalRoute) {
      return;
    }

    if (!hasTrackedInitialPage.current) {
      hasTrackedInitialPage.current = true;
      return;
    }

    window.fbq?.("track", "PageView");
  }, [isPortalRoute, pathname]);

  if (isPortalRoute) {
    return null;
  }

  return (
    <>
      <Script id="meta-pixel-base" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '860464170281075');
fbq('track', 'PageView');`}
      </Script>
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src="https://www.facebook.com/tr?id=860464170281075&ev=PageView&noscript=1"
          alt=""
        />
      </noscript>
    </>
  );
}
