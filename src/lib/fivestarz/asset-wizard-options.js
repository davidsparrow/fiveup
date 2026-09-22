// The asset wizard's option lists, shared between the wizard UI (AssetPage)
// and the AI asset builder route so the model's suggestions are constrained
// to exactly the labels the wizard renders.

export const WIZARD_ASSET_TYPES = [
  "Service / Consulting",
  "Advisory / Consulting Skills",
  "Physical Product",
  "Digital Product / SaaS",
  "Content / Podcast / Video",
  "E-commerce Store",
  "Free Session / Consultation",
  "Client Asset",
];

export const WIZARD_CHANNELS = [
  "Google Business Profile",
  "Yelp",
  "Tripadvisor",
  "Amazon",
  "Shopify App Store",
  "Clutch.co",
  "Trustpilot",
  "Apple Podcasts",
  "Spotify",
  "Substack",
  "LinkedIn",
  "G2",
  "Capterra",
  "Gumroad",
  "Teachable",
];

export const WIZARD_FEEDBACK_FORMATS = [
  "Star Rating (1–5)",
  "Written Review",
  "Structured Categories",
  "Video / Audio Upload",
];

// Types the AI builder may suggest: ownership ("Client Asset") and offering a
// free session are the member's call, not something a webpage reveals.
export const AI_SUGGESTIBLE_ASSET_TYPES = WIZARD_ASSET_TYPES.filter(
  (t) => t !== "Client Asset" && t !== "Free Session / Consultation",
);
