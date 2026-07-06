// Bidirectional maps between UI copy and the Postgres enums defined in
// supabase/migrations/20260307123000_initial_schema.sql.

export const ASSET_TYPE_LABEL_TO_DB = {
  "Service / Consulting": "service_consulting",
  "Advisory / Consulting Skills": "advisory_skills",
  "Physical Product": "physical_product",
  "Digital Product / SaaS": "digital_product_saas",
  "Content / Podcast / Video": "content_podcast_video",
  "E-commerce Store": "ecommerce_store",
  "Free Session / Consultation": "free_session_consultation",
  "Client Asset": "client_asset",
};

export const ASSET_TYPE_DB_TO_LABEL = Object.fromEntries(
  Object.entries(ASSET_TYPE_LABEL_TO_DB).map(([label, dbValue]) => [dbValue, label]),
);

export const FEEDBACK_FORMAT_LABEL_TO_DB = {
  "Star Rating (1–5)": "stars",
  "Written Review": "written",
  "Structured Categories": "structured",
  "Video / Audio Upload": "video_audio",
};

export const FEEDBACK_FORMAT_DB_TO_LABEL = Object.fromEntries(
  Object.entries(FEEDBACK_FORMAT_LABEL_TO_DB).map(([label, dbValue]) => [dbValue, label]),
);

// Shorter labels matching the FB_FORMATS filter options in mock-data.js.
export const FEEDBACK_FORMAT_DB_TO_SHORT_LABEL = {
  stars: "Star Rating",
  written: "Written Review",
  structured: "Structured Categories",
  video_audio: "Video / Audio",
};
