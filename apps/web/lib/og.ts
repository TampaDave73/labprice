// The one place the social card is described.
//
// The card itself is a route handler (app/opengraph-image.png/route.tsx) rather than Next's
// `opengraph-image` file convention, because the convention serves it at an extensionless URL that
// validators reject as "not a valid image". Nothing is auto-injected as a result, so every route
// that declares its own `openGraph` block — which REPLACES the root layout's wholesale — has to pass
// this object. Importing it beats retyping a path: a route that forgets the image ships without one,
// which has already happened here once across four routes.

/** og:image / twitter:image for any page with no image of its own. */
export const OG_IMAGE = {
  url: '/opengraph-image.png',
  width: 1200,
  height: 630,
  alt: 'LabTestCompare — compare self-pay blood test prices',
} as const;
