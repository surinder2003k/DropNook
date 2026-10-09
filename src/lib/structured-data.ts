import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, SITE_TAGLINE, SITE_CATEGORY } from "./site";

/**
 * JSON-LD structured data. Emitted server-side in <script type="application/ld+json">
 * blocks. This is what powers rich results (SEO), knowledge-graph/entity
 * signals (GEO — Generative Engine Optimization for AI answers), and gives
 * crawlers machine-readable proof the site is a real product with real content
 * (a factor AdSense reviewers look for).
 */

type Json = Record<string, unknown>;

/** Organization — the publisher entity. */
export function organizationLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    slogan: SITE_TAGLINE,
    description: SITE_DESCRIPTION,
    logo: `${SITE_URL}/icon.svg`,
  };
}

/** WebSite — enables the sitelinks search box + establishes the entity. */
export function websiteLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

/** SoftwareApplication — describes the tool itself (ratings optional). */
export function softwareLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    description: SITE_DESCRIPTION,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Share files up to 5 GB",
      "Single-use, self-destructing links",
      "Optional password protection",
      "Expiring links",
      "Download limits",
      "No account required",
    ],
  };
}

/** FAQPage — directly answers common queries for rich results + AI engines. */
export function faqLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Do I need an account to share files?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. Dropzone is completely free and requires no sign-up, email, or account. Just upload a file and share the link.",
        },
      },
      {
        "@type": "Question",
        name: "What is the maximum file size?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "You can share files up to 5 GB each. There is no limit on the number of files you can upload.",
        },
      },
      {
        "@type": "Question",
        name: "How do single-use links work?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Each upload generates a unique share link. You can optionally set the link to expire after a time or after a set number of downloads, and protect it with a password.",
        },
      },
      {
        "@type": "Question",
        name: "Where are my files stored?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Files are stored on Backblaze B2 cloud storage. They can be deleted at any time from your list of uploads.",
        },
      },
      {
        "@type": "Question",
        name: "Is Dropzone free to use?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Dropzone is free to use with no hidden fees, and no account is required.",
        },
      },
    ],
  };
}

/** BreadcrumbList for the home page. */
export function breadcrumbLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: SITE_URL,
      },
    ],
  };
}
