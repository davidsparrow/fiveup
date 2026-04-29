export const ME = {
  name: "Jordan Rivera",
  avatar: "JR",
  plan: "paid",
  planName: "Bloom",
  matchesUsed: 4,
  matchesTotal: 12,
  browseUsed: 2,
  browseTotal: 6,
  degrees: 2,
  allowSemiDupeFree: true,
  allowSemiDupe: true,
  assets: [
    { id: 1, name: "RevFlow Consulting", url: "revflow.co", type: "Service / Consulting", channels: ["Google Business Profile", "Yelp"], reviews: 8, pending: 1, img: "🚀" },
    { id: 2, name: "SaaS Growth Podcast", url: "saasgrowtpod.com/episodes", type: "Content / Podcast / Video", channels: ["Apple Podcasts", "Spotify"], reviews: 3, pending: 0, img: "🎙️" },
    { id: 3, name: "Business Advisory Skills", url: "revflow.co/advisory", type: "Advisory / Consulting Skills", channels: ["Google Business Profile", "LinkedIn"], reviews: 5, pending: 0, img: "🧠" },
  ],
};

export const MATCHES = [
  { id: 1, person: "Alex Chen", avatar: "AC", asset: "UX Design Studio", type: "Service / Consulting", status: "feedback_pending", due: "Mar 8", channels: ["Google Business Profile"], color: "#FF6B35" },
  { id: 2, person: "Maya Patel", avatar: "MP", asset: "E-com Growth Newsletter", type: "Content / Podcast / Video", status: "awaiting_post", due: "Mar 5", channels: ["Substack", "LinkedIn"], color: "#1A9E8F" },
  { id: 3, person: "Sam Torres", avatar: "ST", asset: "Shopify Plugin", type: "Digital Product / SaaS", status: "posted", due: "Feb 28", channels: ["Shopify App Store"], color: "#F4A832", postedCh: "Shopify App Store", myFbRating: 4 },
  { id: 4, person: "Priya Nair", avatar: "PN", asset: "Brand Strategy Session", type: "Advisory / Consulting Skills", status: "posted", due: "Feb 20", channels: ["Google Business Profile", "Yelp"], color: "#6B4226", postedCh: "Google Business Profile", myFbRating: null },
  { id: 5, person: "Chris Wu", avatar: "CW", asset: "Freelance Dev Services", type: "Service / Consulting", status: "matched", due: "Mar 12", channels: ["Clutch.co", "Google Business Profile"], color: "#38A169" },
];

export const MEMBERS = [
  { id: 101, name: "Tariq Osman", avatar: "TO", plan: "paid", planName: "Bloom", loc: "Austin, TX", since: "Jan 2025", assets: [{ name: "Growth Copywriting Studio", type: "Advisory / Consulting Skills", channels: ["Google Business Profile", "Clutch.co"], url: "tariqwrites.com" }, { name: "Email Mastery Course", type: "Digital Product / SaaS", channels: ["Trustpilot", "G2"], url: "tariqwrites.com/course" }], formats: ["Star Rating", "Written Review", "Structured Categories"], rating: 4.9, exchanges: 12, credits: 4, creditsTotal: 12, prev: null, color: "#7C3AED", bio: "Copywriter & growth consultant helping SaaS founders double their conversion rates." },
  { id: 102, name: "Lena Fischer", avatar: "LF", plan: "paid", planName: "Flourish", loc: "Berlin, DE", since: "Nov 2024", assets: [{ name: "UX Audit Service", type: "Service / Consulting", channels: ["Google Business Profile", "Clutch.co", "LinkedIn"], url: "lenauxdesign.de" }], formats: ["Star Rating", "Written Review", "Video / Audio"], rating: 5.0, exchanges: 21, credits: 0, creditsTotal: 12, prev: null, color: "#1A9E8F", bio: "UX designer with 8 years experience. I audit digital products and help founders reduce churn." },
  { id: 103, name: "Devon Park", avatar: "DP", plan: "free", planName: "Sprout", loc: "Chicago, IL", since: "Feb 2025", assets: [{ name: "Handmade Leather Goods", type: "E-commerce Store", channels: ["Google Business Profile", "Yelp"], url: "devonleather.com" }], formats: ["Star Rating", "Written Review"], rating: 4.7, exchanges: 6, credits: 2, creditsTotal: 4, prev: null, color: "#F4A832", bio: "Artisan leather goods maker. Every piece is handmade and built to last a lifetime." },
  { id: 104, name: "Simone Adler", avatar: "SA", plan: "paid", planName: "Bloom", loc: "Miami, FL", since: "Dec 2024", assets: [{ name: "Founders Podcast", type: "Content / Podcast / Video", channels: ["Apple Podcasts", "Spotify", "LinkedIn"], url: "founderspodcast.fm" }, { name: "Pitch Deck Advisory", type: "Advisory / Consulting Skills", channels: ["Google Business Profile"], url: "simoneadler.com/advisory" }], formats: ["Star Rating", "Written Review", "Structured Categories"], rating: 4.8, exchanges: 18, credits: 3, creditsTotal: 12, prev: { date: "Jan 15", channel: "Google Business Profile", asset: "Pitch Deck Advisory", semiOk: true, blocked: ["Google Business Profile"] }, color: "#FF6B35", bio: "Podcast host & startup advisor. I've helped 40+ founders close their seed rounds." },
  { id: 105, name: "Kofi Mensah", avatar: "KM", plan: "free", planName: "Sprout", loc: "London, UK", since: "Mar 2025", assets: [{ name: "Notion Templates Shop", type: "Digital Product / SaaS", channels: ["Gumroad", "Trustpilot"], url: "kofinotion.gumroad.com" }], formats: ["Star Rating", "Written Review"], rating: 4.6, exchanges: 4, credits: 0, creditsTotal: 4, prev: null, color: "#38A169", bio: "Productivity nerd building Notion templates for solopreneurs and small teams." },
  { id: 106, name: "Ravi Sharma", avatar: "RS", plan: "paid", planName: "Bloom", loc: "San Francisco, CA", since: "Oct 2024", assets: [{ name: "SEO Growth Agency", type: "Service / Consulting", channels: ["Google Business Profile", "Clutch.co"], url: "ravigrowth.com" }, { name: "SEO Masterclass", type: "Digital Product / SaaS", channels: ["Teachable", "Trustpilot"], url: "ravigrowth.com/masterclass" }], formats: ["Star Rating", "Written Review", "Structured Categories", "Video / Audio"], rating: 4.9, exchanges: 29, credits: 6, creditsTotal: 12, prev: { date: "Feb 3", channel: "Clutch.co", asset: "SEO Growth Agency", semiOk: true, blocked: ["Clutch.co", "Google Business Profile"] }, color: "#6B4226", bio: "SEO strategist helping B2B SaaS companies rank on page one. 10+ years in the trenches." },
  { id: 107, name: "Chloe Benton", avatar: "CB", plan: "paid", planName: "Flourish", loc: "Toronto, CA", since: "Sep 2024", assets: [{ name: "Brand Identity Studio", type: "Service / Consulting", channels: ["Google Business Profile", "Yelp", "Clutch.co"], url: "chloebrandstudio.ca" }, { name: "Brand Sprint Workshop", type: "Advisory / Consulting Skills", channels: ["Google Business Profile", "LinkedIn"], url: "chloebrandstudio.ca/workshop" }], formats: ["Star Rating", "Written Review", "Video / Audio"], rating: 5.0, exchanges: 35, credits: 8, creditsTotal: 12, prev: null, color: "#A0644A", bio: "Brand strategist & designer. I turn fuzzy brand ideas into clear, compelling identities." },
  { id: 108, name: "Marcus Webb", avatar: "MW", plan: "free", planName: "Sprout", loc: "Atlanta, GA", since: "Feb 2025", assets: [{ name: "Photography Portfolio", type: "Service / Consulting", channels: ["Google Business Profile", "Yelp"], url: "marcuswebb.photo" }], formats: ["Star Rating", "Written Review"], rating: 4.5, exchanges: 3, credits: 4, creditsTotal: 4, prev: null, color: "#4A5568", bio: "Commercial photographer specializing in brand photography for product-based businesses." },
];

export const ASSET_TYPES = ["All Types", "Service / Consulting", "Advisory / Consulting Skills", "Digital Product / SaaS", "E-commerce Store", "Content / Podcast / Video", "Physical Product", "Client Asset"];
export const CHANNELS = ["Any Channel", "Google Business Profile", "Yelp", "Tripadvisor", "Amazon", "Shopify App Store", "Clutch.co", "Trustpilot", "Apple Podcasts", "Spotify", "LinkedIn", "G2", "Gumroad", "Teachable"];
export const FB_FORMATS = ["Any Format", "Star Rating", "Written Review", "Structured Categories", "Video / Audio"];
export const PLAN_OPTS = ["All Plans", "Paid Only", "Free Only"];
export const CREDIT_OPTS = ["Any Credits", "Has Credits Now"];

export const HOW_STEPS = [
  { n: "01", icon: "🏗️", title: "Setup Your Profile & Assets", desc: "Create your profile and add the asset(s) you want feedback on. Assets can be private — for matched feedback only — or publicly browsable and available for Paid-member match-requests." },
  { n: "02", icon: "🤝", title: "Get Matched", desc: "Paired with another member whose work you'll genuinely experience. Free: 4 auto-matches/month. Paid: 6 auto + 6 browse." },
  { n: "03", icon: "👀", title: "Experience Their Work", desc: "Interact with their asset — service, product, content, consultation, or advisory session. Give it a real try." },
  { n: "04", icon: "✍️", title: "Give Honest Feedback", desc: "Submit your feedback privately inside ProofSignals using any format: written, structured categories, or video/audio. This is the core of what we do." },
  { n: "05", icon: "🌐", title: "Optionally Share Publicly", desc: "Optionally request a real online review — the choice is 100% that of the other person. Never expect one, never pressure one." },
];

export const PLANS = [
  { name: "Sprout", price: "Free", sub: "forever", color: "#1A9E8F", features: ["4 auto-matches / month", "1 asset", "1 review channel per asset", "Text + star feedback", "Default 1° separation", "1 Proof Lab Marketplace Listing"] },
  { name: "Bloom", price: "$29", sub: "/ month", color: "#FF6B35", badge: "Most Popular", features: ["6 auto + 6 browse matches", "Up to 5 assets", "Multiple channels per asset", "All feedback formats incl. Advisory Skills", "Set 1–3 degrees of separation", "3 Proof Lab Listings", "Require specific feedback types", "Control semi-duplicate match settings"] },
  { name: "Flourish", price: "$79", sub: "/ month", color: "#F4A832", features: ["Everything in Bloom", "Unlimited assets", "Priority matching", "Manage client assets", "White-label feedback forms", "Team seats (3 users)", "Dedicated support"] },
];

export const RULES = [
  { t: "do", icon: "✅", text: "Give honest, thoughtful feedback based on real experience" },
  { t: "do", icon: "✅", text: "Be respectful, constructive, and kind" },
  { t: "do", icon: "✅", text: "Only post a review if your feedback is genuinely positive" },
  { t: "do", icon: "✅", text: "Complete feedback within the agreed timeframe" },
  { t: "dont", icon: "🚫", text: "Leave fake positive feedback inside then negative reviews online" },
  { t: "dont", icon: "🚫", text: "Be mean, dismissive, or disrespectful to other members" },
  { t: "dont", icon: "🚫", text: "Create multiple accounts to game the system" },
  { t: "dont", icon: "🚫", text: "Pressure or incentivize other members to post positive reviews" },
];

export const HISTORY_ITEMS = [
  { person: "Sam Torres", asset: "Shopify Plugin", ch: "Shopify App Store", date: "Feb 28", stars: 5, snippet: "Sam's plugin saved me hours every week. Onboarding intuitive, support stellar." },
  { person: "Priya Nair", asset: "Brand Strategy Session", ch: "Google Business Profile", date: "Feb 20", stars: 5, snippet: "Priya completely transformed how I think about positioning. Incredibly thoughtful." },
  { person: "Derek Walsh", asset: "Email Marketing Course", ch: "Trustpilot", date: "Feb 12", stars: 4, snippet: "Solid frameworks and actionable templates. A few sections felt a bit rushed." },
];

export const PROOF_LISTINGS = [
  { id: 1, seller: "Tariq Osman", avatar: "TO", color: "#7C3AED", category: "Copywriting", title: "Sales Page Copywriting", desc: "Full sales page copy — hook, story, offer, CTA. Conversion-focused for SaaS or services.", retail: "$1,200", members: "$149", unit: "per page", badge: "🔥 Hot Deal" },
  { id: 2, seller: "Lena Fischer", avatar: "LF", color: "#1A9E8F", category: "UX Design", title: "UX Audit + Report", desc: "I'll audit your product or site and deliver a prioritised, annotated report with quick wins and deep fixes.", retail: "$800", members: "$89", unit: "per audit", badge: "⭐ Top Rated" },
  { id: 3, seller: "Chloe Benton", avatar: "CB", color: "#A0644A", category: "Branding", title: "Logo + Brand Identity Kit", desc: "Primary logo, alternate marks, color palette, typography guide, and usage doc. Figma source files included.", retail: "$650", members: "$97", unit: "per project", badge: "🎨 Creative Pick" },
  { id: 4, seller: "Ravi Sharma", avatar: "RS", color: "#6B4226", category: "SEO", title: "SEO Keyword Strategy", desc: "30-day deep-dive: competitor analysis, keyword map, content calendar, and quick-win recommendations.", retail: "$500", members: "$59", unit: "per month", badge: "📈 Results-Driven" },
  { id: 5, seller: "Simone Adler", avatar: "SA", color: "#FF6B35", category: "Pitch Coaching", title: "Pitch Deck Coaching Session", desc: "60-min 1:1 session. We'll sharpen your narrative, financials slide, and investor Q&A prep.", retail: "$350", members: "$49", unit: "per session", badge: "🚀 Founder Fave" },
  { id: 6, seller: "Marcus Webb", avatar: "MW", color: "#4A5568", category: "Photography", title: "Brand Photography Package", desc: "Half-day shoot — headshots, lifestyle, product. 40+ edited images in web + print resolution.", retail: "$750", members: "$199", unit: "per shoot", badge: "" },
  { id: 7, seller: "Devon Park", avatar: "DP", color: "#F4A832", category: "Video Production", title: "Founder Story Video (60 sec)", desc: "Script, shoot, edit. Vertical + horizontal cuts. Perfect for LinkedIn, homepage hero, or IG.", retail: "$900", members: "$125", unit: "per video", badge: "🎦 Fan Favorite" },
  { id: 8, seller: "Kofi Mensah", avatar: "KM", color: "#38A169", category: "Automation", title: "AI Workflow Automation Setup", desc: "I'll build 3 custom n8n or Make.com workflows to automate your CRM, email, or onboarding flows.", retail: "$600", members: "$75", unit: "per build", badge: "🤖 AI-Powered" },
  { id: 9, seller: "Tariq Osman", avatar: "TO", color: "#7C3AED", category: "Email Marketing", title: "Email Welcome Sequence (5 emails)", desc: "Research-backed, 5-email onboarding sequence. Copywriting + strategy included.", retail: "$800", members: "$99", unit: "per sequence", badge: "✉️ Inbox Gold" },
  { id: 10, seller: "Ravi Sharma", avatar: "RS", color: "#6B4226", category: "Google Ads", title: "Google Ads Management", desc: "Full campaign setup or audit + 30 days of active management. Ad copy, bidding, weekly reports.", retail: "$500", members: "$150", unit: "per month", badge: "📊 Data-Driven" },
  { id: 11, seller: "Lena Fischer", avatar: "LF", color: "#1A9E8F", category: "Web Design", title: "Landing Page Design", desc: "High-converting Figma design for your next product launch, waitlist, or lead gen campaign.", retail: "$550", members: "$79", unit: "per page", badge: "" },
  { id: 12, seller: "Chloe Benton", avatar: "CB", color: "#A0644A", category: "LinkedIn Ads", title: "LinkedIn Ad Creative Package", desc: "5 ad creatives (static + carousel) with hooks for your ICP. Designed for lead gen campaigns.", retail: "$400", members: "$59", unit: "per package", badge: "💼 B2B Specialist" },
  { id: 13, seller: "Devon Park", avatar: "DP", color: "#F4A832", category: "Video Shorts", title: "Video Shorts Repurposing (10 clips)", desc: "Send me your long-form video. I extract 10 high-impact shorts with captions for TikTok, Reels, Shorts.", retail: "$300", members: "$49", unit: "per 10 clips", badge: "✂️ Viral-Ready" },
  { id: 14, seller: "Marcus Webb", avatar: "MW", color: "#4A5568", category: "Photography", title: "Product Photography (10 shots)", desc: "Clean white backdrop or lifestyle context. Up to 10 hero shots, retouched, web-optimized.", retail: "$400", members: "$89", unit: "per shoot", badge: "" },
  { id: 15, seller: "Kofi Mensah", avatar: "KM", color: "#38A169", category: "Notion / Tools", title: "Custom Notion Dashboard Build", desc: "Fully custom Notion workspace for your team — CRM, tasks, SOPs, content calendar.", retail: "$250", members: "$39", unit: "per dashboard", badge: "🗂️ Productivity" },
  { id: 16, seller: "Simone Adler", avatar: "SA", color: "#FF6B35", category: "Branding", title: "Brand Voice & Messaging Guide", desc: "Tone of voice, key messages, audience personas, and power phrases. 20-page Notion doc delivered.", retail: "$450", members: "$65", unit: "per guide", badge: "🎯 Strategy" },
  { id: 17, seller: "Tariq Osman", avatar: "TO", color: "#7C3AED", category: "Copywriting", title: "30-Day LinkedIn Content Plan", desc: "30 posts planned and written for your personal brand. Hooks, stories, CTAs — ready to schedule.", retail: "$600", members: "$79", unit: "per month", badge: "🔥 Hot Deal" },
  { id: 18, seller: "Ravi Sharma", avatar: "RS", color: "#6B4226", category: "SEO", title: "Blog Content (4 posts/month)", desc: "4 SEO-optimised posts per month. Keyword research, outline, writing, internal links, meta copy.", retail: "$400", members: "$120", unit: "per month / 3-mo min", badge: "✍️ Long-form" },
  { id: 19, seller: "Lena Fischer", avatar: "LF", color: "#1A9E8F", category: "UX Design", title: "Funnel Design + Wireframes", desc: "Full wireframe kit for your marketing funnel: landing page, upsell, thank-you, email opt-in.", retail: "$700", members: "$99", unit: "per funnel", badge: "" },
  { id: 20, seller: "Chloe Benton", avatar: "CB", color: "#A0644A", category: "Facebook Ads", title: "Facebook/Instagram Ad Campaign", desc: "Campaign strategy, 6 ad creatives, copy for 3 audiences, A/B test framework. Pixel setup included.", retail: "$650", members: "$199", unit: "per month / 2-mo min", badge: "📣 Paid Social" },
  { id: 21, seller: "Devon Park", avatar: "DP", color: "#F4A832", category: "Video Production", title: "Explainer Video Animation (60 sec)", desc: "Script + motion design. Ideal for product demos, onboarding, or pitching investors.", retail: "$1,100", members: "$175", unit: "per video", badge: "🎦 Fan Favorite" },
  { id: 22, seller: "Kofi Mensah", avatar: "KM", color: "#38A169", category: "Automation", title: "AI Chatbot Setup (Website)", desc: "Custom GPT-powered chatbot trained on your docs. Deployed to your site same week.", retail: "$500", members: "$89", unit: "per build", badge: "🤖 AI-Powered" },
];

export const PROOF_CATS = ["All", "Copywriting", "UX Design", "Branding", "SEO", "Pitch Coaching", "Photography", "Video Production", "Video Shorts", "LinkedIn Ads", "Facebook Ads", "Google Ads", "Web Design", "Automation", "Email Marketing", "Notion / Tools"];
