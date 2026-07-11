// Slide manifest for the /demo tour slideshows. Screenshots live in
// public/demo/ and are produced by capture-demo-shots.mjs (see that file for
// the recapture recipe). One deck per auth-gated surface the tour explains.

export const SLIDES_CREATE_ASSET = [
  {
    src: "/demo/create-asset-01.jpg",
    alt: "New asset setup form with Maya's course name, URL, type, and description filled in",
    title: "Describe what you want reviewed",
    caption: "Maya adds her course: a name, a link, and what reviewers should experience. Anything works — a landing page, a course, a pitch deck, a shop.",
    notes: ["Assets stay private until you say otherwise", "Client assets and advisory skills work too"],
  },
  {
    src: "/demo/create-asset-02.jpg",
    alt: "Channel selection step with Teachable and Trustpilot selected",
    title: "Pick where reviews could live",
    caption: "She chooses the channels that matter for a course — Teachable and Trustpilot. Reviewers post there only if Maya later asks and they agree.",
    notes: ["Channels are optional targets, never obligations"],
  },
  {
    src: "/demo/create-asset-03.jpg",
    alt: "Feedback settings step with written review format selected",
    title: "Say what kind of feedback helps",
    caption: "Stars, written, structured categories, or video — Maya picks the formats she wants. Reviewers must use at least one.",
    notes: ["Paid plans can require specific formats"],
  },
];

export const SLIDES_MATCHING = [
  {
    src: "/demo/matching-01.jpg",
    alt: "Browse & Request Matches page showing demo member candidates with their assets",
    title: "Browse members who get your space",
    caption: "Every candidate shows their asset, channels, and rating history. Maya's course is in the pool the moment she publishes it to members.",
    notes: ["Filters for asset type, channel, and format", "Browse requests are quota'd per plan — no spam"],
  },
  {
    src: "/demo/matching-02.jpg",
    alt: "Maya's dashboard showing her matches with Sam, Priya, and Diego in different states",
    title: "Reciprocal matches, tracked end to end",
    caption: "Maya reviews Sam's coaching while Sam reviews her course. The dashboard tracks every exchange from new match to posted review.",
    notes: ["No prior connection — separation degree is checked", "Both sides give feedback; nobody just takes"],
  },
];

export const SLIDES_FEEDBACK = [
  {
    src: "/demo/feedback-01.jpg",
    alt: "Feedback form for Sam Okafor with 5 stars, structured category scores, and written feedback",
    title: "Honest, structured, human",
    caption: "Maya rates Sam's coaching: overall stars, category scores, and the written part — specific enough to act on, honest enough to trust.",
    notes: ["Moderation screens every submission", "At least one format is required, no drive-by ratings"],
  },
  {
    src: "/demo/feedback-02.jpg",
    alt: "Feedback submitted confirmation dialog",
    title: "Private by default",
    caption: "Feedback lands privately inside ProofSignals. Nothing goes public unless the recipient chooses to publish it later.",
  },
];

export const SLIDES_RATE_AND_REQUEST = [
  {
    src: "/demo/rate-01.jpg",
    alt: "Dashboard match cards showing the rate-their-feedback stars and request-post buttons",
    title: "Rate the feedback you receive",
    caption: "Feedback quality is itself rated, so thoughtful reviewers build a reputation — and lazy ones don't get matched with you again.",
    notes: ["Ratings feed each member's public stats"],
  },
  {
    src: "/demo/rate-02.jpg",
    alt: "Request post dialog asking the reviewer to post the review to a channel",
    title: "Ask for the public version",
    caption: "Loved the feedback? Maya asks Diego to post his review to one of her channels. He can accept or decline — reviews are earned, never farmed.",
  },
  {
    src: "/demo/rate-03.jpg",
    alt: "Publishing settings page with the handle and what's-public toggles",
    title: "You control what the world sees",
    caption: "Everything is private until Maya flips a toggle: her profile, her stats, and only the feedback excerpts she has approved.",
    notes: ["Per-item approval for every public excerpt", "Search-engine indexing is a separate opt-in"],
  },
];

export const SLIDES_PROOF_LAB = [
  {
    src: "/demo/prooflab-01.jpg",
    alt: "The Proof Lab marketplace showing member deals from Priya and Sam",
    title: "Members-only deals from people you can verify",
    caption: "Priya lists her audit at founder pricing; Sam offers a free intro session. Every seller's feedback history is one click away.",
    notes: ["Real engagement reviews after completed deals", "Optional charity pledges on every listing"],
  },
  {
    src: "/demo/prooflab-02.jpg",
    alt: "Priya's Proof Lab dashboard with her active listings",
    title: "Sell your services, earn engaged reviews",
    caption: "Priya manages listings and deal requests from her dashboard. Completed deals unlock engaged-buyer reviews — proof that compounds.",
  },
];
