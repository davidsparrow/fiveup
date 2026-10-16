import { getSiteUrl } from "@/lib/fivestarz/site";

// This is app.proofsignals.net. The apex is a separate WordPress site with its
// own robots.txt.
//
// Allow crawling broadly and let each page decide whether it is indexed. The
// app's marketing routes carry a noindex meta (MARKETING_ROBOTS) because the
// WordPress site owns that copy — disallowing them here instead would stop the
// crawler ever seeing the noindex. Member surfaces are disallowed outright,
// since there is nothing there to index either way.
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
