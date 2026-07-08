import { getSiteUrl } from "@/lib/fivestarz/site";

// Allow crawling of public marketing + public profile pages; keep member/app
// surfaces out. Only search-indexable profiles are actually indexed (each page
// sets its own robots meta); this just keeps crawlers off private routes.
export default function robots() {
  const base = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/account", "/dashboard", "/assets", "/browse", "/admin", "/login", "/signup", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
