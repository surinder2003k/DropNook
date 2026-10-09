import Script from "next/script";
import { ADSENSE_CLIENT } from "@/lib/site";

/**
 * Loads the Google AdSense script once, only when a real publisher client id
 * is configured (NEXT_PUBLIC_ADSENSE_CLIENT). Renders nothing otherwise, so
 * dev/pre-approval builds stay clean. Using next/script with afterInteractive
 * keeps it off the critical rendering path.
 */
export default function AdSense() {
  if (!ADSENSE_CLIENT) return null;
  return (
    <Script
      id="adsbygoogle-init"
      async
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
    />
  );
}
