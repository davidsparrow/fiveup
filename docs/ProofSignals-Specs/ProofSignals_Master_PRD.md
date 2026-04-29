# ProofSignals — Master PRD

## 1. Product Summary

**ProofSignals** is a web application for founders, marketers, creators, consultants, agencies, course builders, coaches, and other business operators who want **honest human feedback** on digital and service-related assets.

Users can post an asset, request structured feedback, get matched with relevant reviewers, provide feedback to others, build internal reputation, and optionally publish selected proof of helpfulness publicly.

The product is designed to support:
- meaningful founder-to-founder feedback
- reviewer reputation based on usefulness, not vanity
- AI-assisted listing creation, but **not AI-authored feedback**
- optional public profile pages later, with privacy controls
- a paid marketplace where members can list products or services for founder-focused buyers

The platform is **not** positioned as a review-swapping engine, vote-trading network, or public-review manipulation product.

---

## 2. Vision

Create the most trusted place on the internet for founders and marketers to receive **credible, human, high-signal feedback** on what they are building and selling.

---

## 3. Product Positioning

### Core positioning
ProofSignals is a **trusted founder feedback network**.

### Not our positioning
ProofSignals is **not**:
- a fake review tool
- a vote exchange system
- an engagement pod
- a review farm
- an AI praise generator

### Key promise
**AI helps users present their asset better. Humans provide the actual feedback.**

---

## 4. Target Users

### Primary users
- startup founders
- indie hackers
- B2B marketers
- agencies
- consultants and coaches
- course creators
- SaaS operators
- ecommerce founders
- landing page / funnel builders
- branding and creative service providers

### Secondary users
- growth operators
- copywriters
- designers
- early-stage product teams
- sales/demo specialists
- community-led builders

---

## 5. Primary Use Cases

1. A founder uploads a landing page and asks for clarity and conversion feedback.
2. A coach posts an offer page and asks for trust/positioning feedback.
3. A course creator uploads screenshots and wants pricing/perceived value feedback.
4. A marketer posts ad creative and wants message-market fit feedback.
5. An agency lists its service in the member marketplace at a founder discount.
6. A reviewer provides written, video, or live-call feedback and earns internal reputation.
7. A user later chooses to publish selected internal feedback to a public profile page.

---

## 6. Product Principles

1. **Human over artificial** — feedback must come from humans.
2. **Signal over vanity** — usefulness matters more than stars.
3. **Trust first** — platform design must discourage manipulation.
4. **Privacy by default** — users decide what becomes public.
5. **Structure improves quality** — good prompts produce better feedback.
6. **Professional but friendly** — brand tone should feel social, warm, and credible.

---

## 7. Core Product Modules

### 7.1 AI Asset Builder
AI helps users create a strong asset listing during onboarding and post creation.

#### Inputs
- uploaded screenshots
- uploaded files/images
- website URL
- short user answers
- chosen asset category
- requested feedback goals

#### Outputs
- listing title
- summary/description
- asset category
- target audience framing
- stage framing (idea, MVP, live, redesign, relaunch, etc.)
- suggested feedback angles
- suggested questions for reviewers
- readiness warnings if the listing is too vague

#### Important boundary
AI may assist with:
- summarizing the asset
- improving the listing
- clarifying what feedback is wanted
- organizing feedback themes later

AI may **not**:
- write the feedback on behalf of reviewers
- suggest praise language for external platforms
- generate fake testimonials or public reviews
- optimize manipulation flows

### 7.2 Asset Listings
Users create listings requesting feedback on:
- websites
- landing pages
- demos
- graphics
- post content
- course pages
- coaching offers
- SaaS products
- email sequences
- branding assets
- marketplace offers

#### Listing properties
- title
- summary
- asset type
- category tags
- target audience
- stage
- requested feedback lenses
- brand visibility setting
- asset visibility setting
- images/screenshots/files/URL
- optional public links
- optional profile/review-platform icons (neutral only)

### 7.3 Feedback Request Modes
Supported request modes:
- general feedback
- structured written feedback
- scorecard + comments
- video feedback
- live consult / call

### 7.4 Matching Engine
The system matches users to reduce repeat pairings and improve relevance.

#### Matching inputs
- asset category
- reviewer specialty
- niche overlap
- audience familiarity
- prior helpfulness rating
- availability
- recency of prior interactions
- degrees of separation rules
- competitor avoidance settings

#### Premium matching features
- avoid prior reviewers
- avoid close network overlap
- avoid reviewers connected to prior reviewers
- only match outside chosen graph depth
- exclude competitor categories
- freshness filters

### 7.5 Feedback Delivery
Feedback may be delivered through:
- on-platform written response
- optional recorded video feedback
- optional off-platform live call or video meeting
- optional direct chat initiation after a match opens

### 7.6 Internal Reputation System
Users rate the helpfulness and professionalism of feedback.

#### Suggested reputation dimensions
- clarity
- honesty
- specificity
- actionability
- professionalism
- kindness
- relevance
- expertise fit
- follow-through

#### Avoid over-reliance on stars
Public/internal views should emphasize qualitative usefulness, not only star counts.

### 7.7 Public Profile System (Phase 2+)
Users may later choose to publish selected profile content.

#### Public profile default
- off by default

#### Public profile may include
- name / brand / bio
- logo
- niche tags
- approved internal feedback excerpts
- approved public videos
- expertise lanes
- marketplace listings
- selected stats

#### Public profile may not include by default
- private feedback
- private videos
- hidden assets
- internal moderation notes
- full raw interaction history

### 7.8 Marketplace
Paid users can list products or services for founder/marketer buyers.

#### Marketplace examples
- agency services
- templates
- audits
- coaching offers
- beta access
- discounted software access
- founder-only bundles

#### Marketplace goals
- create business value beyond feedback
- create legitimate real-use relationships
- allow members to discover useful tools/services

#### Important compliance design
Marketplace participation must not tie platform rewards to external public review behavior.

---

## 8. User Roles

### Guest
- can see marketing site
- may later see selected public profiles
- cannot create listings or feedback

### Free Member
- can onboard
- can use AI Asset Builder
- can create limited listings
- can receive and provide feedback
- has lower match limits
- cannot list in marketplace
- cannot use blind/hidden identity features
- may have limited or no public profile publishing

### Paid Member
- higher match limits
- browse and choose from public/member-visible listings
- list products/services in marketplace
- use blind-first / identity-hide features
- use advanced matching filters
- use public profile publishing
- feature approved public video feedback

### Admin / Moderator
- manage abuse reports
- moderate flagged listings
- review suspicious external-link wording
- warn or suspend users

---

## 9. Pricing / Tier Logic

### Free plan
- AI onboarding and AI Asset Builder
- create asset listings
- limited active matches
- written feedback access
- limited video/private media support
- internal profile only
- no marketplace listing
- no advanced anonymity controls

### Paid plan
- increased or unlimited matches
- browse and select up to X listings to respond to
- marketplace listing access
- advanced filters and separation logic
- profile/public page controls
- public video showcase controls
- hidden identity / blind-first options
- deeper analytics and theme summaries

---

## 10. Feedback Quality Design

### Structured feedback format
To reduce low-effort replies, responses should encourage or require sections such as:
- what works
- what is unclear
- biggest opportunity
- intended audience fit
- what to test next

### Helpful feedback signals
- owner saves feedback
- owner marks advice as implemented
- reviewer is requested again
- feedback is long enough and specific enough
- recipient rates relevance highly

---

## 11. Video Feedback Feature

### Goal
Allow users to record or upload private or public video feedback.

### Preferred implementation
- browser-based recording inside app
- direct upload to a video service such as Mux
- private by default
- optional public publishing later

### Video visibility states
- private: visible only to reviewer + recipient
- public: visible on public profile after approval

### Recommended publication rule
Require explicit approval before making any feedback video public.

### v1 video options
- record in-app
- upload pre-recorded file
- private by default
- public clip or excerpt later

---

## 12. Public vs Member-Side Strategy

### Recommended launch approach
Start as a **member-first platform** with optional public profile publishing later.

### Why
- more honest early feedback
- lower moderation burden
- stronger privacy
- better quality control
- public reputation can be layered in once trust systems are proven

### Public content model
Users choose whether to make the following public:
- profile page
- selected feedback excerpts
- selected assets
- selected public videos
- selected marketplace offers

---

## 13. Trust & Safety Requirements

### High-level rule
The platform may facilitate feedback and business relationships, but it may not be used to coordinate:
- votes
- likes
- reposts
- reciprocal engagement
- review swaps
- artificial public-review generation

### Community Rules summary
Users may share neutral links to public pages, but may not use the platform to solicit or coordinate votes, likes, comments, reposts, reviews, or reciprocal engagement of any kind.

### Enforcement policy
Users found in violation receive **one warning**. A second violation results in **permanent suspension or removal** from the platform.

### Automatic moderation targets
Hard-block language such as:
- please upvote us
- vote for us
- support swap
- review swap
- like for like
- comment for comment
- trade reviews
- trade upvotes

Soft-flag ambiguous phrases such as:
- support our launch
- show some love
- help us out
- any support appreciated

Neutral links are allowed when phrased informationally.

---

## 14. AI Boundaries and Safety

### AI allowed
- listing generation
- category detection
- audience framing
- feedback lens suggestions
- listing quality checks
- clustering themes across human feedback
- contradiction detection
- action-item extraction from human feedback

### AI not allowed
- auto-writing reviews
- auto-rating assets as if human
- drafting public testimonials
- generating reciprocal-review prompts
- optimizing external engagement manipulation

---

## 15. Data Model (Conceptual)

### Core entities
- users
- profiles
- plans
- assets
- asset_media
- asset_visibility_settings
- feedback_requests
- matches
- feedback_submissions
- feedback_ratings
- reviewer_specialties
- marketplace_listings
- profile_public_settings
- public_feedback_permissions
- moderation_flags
- moderation_actions
- warnings
- video_feedback
- external_links
- review_platform_links

### Example profile settings
- profile_public_enabled
- searchable_public_profile
- show_logo
- show_feedback_excerpts
- show_public_videos
- show_marketplace_offers
- show_stats

### Example asset settings
- asset_visibility = private | member_only | public
- brand_visibility = visible | hidden_until_feedback_complete

---

## 16. User Flows

### 16.1 Onboarding flow
1. User signs up.
2. User enters basic identity, niche, and goals.
3. System launches AI Asset Builder immediately.
4. User uploads screenshot(s) or enters URL.
5. AI drafts asset listing.
6. User edits/approves listing.
7. User chooses feedback goals.
8. Listing is published based on plan permissions.

### 16.2 Request feedback flow
1. User creates listing.
2. Selects feedback type and visibility.
3. Chooses lenses (clarity, trust, pricing, etc.).
4. App suggests best reviewer types.
5. Match opens.
6. Feedback delivered.
7. Both users rate helpfulness/professionalism.

### 16.3 Browse/respond flow (paid)
1. Paid user browses available listings.
2. Selects up to X listings to respond to.
3. Provides written/video/live feedback.
4. Recipient rates response.
5. Reviewer reputation updated.

### 16.4 Publish public proof flow
1. User reviews private/internal feedback received.
2. User selects excerpts or videos.
3. System prompts for public approval settings.
4. Public profile updates.

---

## 17. MVP Scope

### Include in MVP
- sign up/login
- user profile basics
- AI Asset Builder
- asset listing creation
- category/lens selection
- limited matching
- written feedback
- helpfulness ratings
- free vs paid plan gating
- moderation phrase blocking/flagging
- neutral external-link support
- internal profile reputation

### Nice-to-have for MVP or v1.5
- video feedback
- blind-first review mode
- advanced separation logic
- marketplace listings
- theme clustering across feedback
- public profile publishing

### Later-phase features
- public search/indexed profiles
- deeper analytics dashboards
- reviewer specialty badges
- contradiction mapping
- profile SEO pages
- public case studies

---

## 18. Success Metrics

### Early health metrics
- listings created per activated user
- % of listings receiving feedback
- average time to first feedback
- avg feedback depth / length
- repeat reviewer usefulness scores
- % of users who both give and receive feedback
- paid conversion rate

### Quality metrics
- recipient helpfulness rating average
- % of feedback saved by recipient
- % of feedback marked “implemented”
- abuse rate
- moderation flag rate
- warning/suspension rate

### Public proof metrics (later)
- % of users enabling public profile
- avg approved public items per profile
- traffic to public profiles
- share rate of public profiles

---

## 19. Risks

### Product risks
- low-quality feedback if structure is too loose
- too much complexity in v1
- weak match quality
- low reciprocal participation

### Trust risks
- users attempt vote or review swapping
- users push public-review solicitation behavior
- public pages could feel like manipulated review pages if not designed carefully

### Technical risks
- video storage/streaming complexity
- moderation scaling
- abuse/fraud prevention

### Brand risks
- overly review-centric branding could weaken trust
- public pages launched too early could create thin-content reputation problems

---

## 20. Recommended Launch Strategy

### Brand
Use **ProofSignals** as the core brand.

### Launch posture
Member-first platform with public profile system added later.

### Why this is best
- strong trust positioning
- privacy by default
- easier moderation
- better feedback honesty
- optional public reputation later

---

## 21. Open Product Decisions

1. Should free users be allowed any public profile publishing, or paid only?
2. What is the exact match cap on free?
3. How many browse-and-select responses can paid users initiate per month?
4. Will live call scheduling happen inside the platform or off-platform initially?
5. Will public video publishing require dual approval or recipient-only approval?
6. Should marketplace offers be member-only at first?
7. Which public links are allowed per profile by default?
8. What percentage of listings should allow hidden brand mode?

---

## 22. Recommended Next Docs

After this PRD, the most useful next artifacts are:
1. database schema / SQL planning doc
2. user stories and acceptance criteria doc
3. information architecture + sitemap
4. pricing and entitlement matrix
5. trust & safety rules for implementation
6. AI Asset Builder prompt spec
7. moderation keyword / regex spec
8. MVP build sequence for Cursor / VS Code

