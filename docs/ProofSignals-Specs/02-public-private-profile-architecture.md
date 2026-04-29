# Public vs Private Profile Architecture

## Recommendation

ProofSignals should support **three visibility layers**:

1. **Private member profile**
2. **Optional public profile**
3. **Optional public asset pages**

This gives users the ability to build reputation without forcing public exposure too early.

---

## 1. Private Member Profile

This is the default profile every user has inside the network.

### Visible to
- logged-in members only
- internal matching and moderation systems

### Contains
- full feedback history
- internal ratings and helpfulness data
- private videos
- match history
- hidden assets
- category expertise tags
- marketplace participation
- moderation flags / trust signals

### Purpose
The private member profile is the working reputation layer of the product. It supports better matching, better context, and more honest exchanges.

---

## 2. Optional Public Profile

This should be **off by default** and enabled only when the user chooses to publish.

### Visible to
- anyone with the link
- optionally searchable/indexable later

### Should contain only user-approved items
- name / brand / logo
- short bio
- categories of expertise
- selected stats
- approved feedback excerpts
- approved public video clips
- selected offers or services
- selected public asset highlights
- neutral external brand/review platform links

### Should not expose by default
- all internal ratings
- negative or unresolved feedback
- private videos
- raw conversation history
- unfinished assets
- moderation notes
- hidden match relationships

### Good public profile sections
- About
- Known For
- Recent Signal
- Feedback Style
- Helpful In
- Public Clips
- Public Asset Highlights
- Offers / Services

### Better wording than star-based language
Use:
- Most valued feedback themes
- Trusted by
- Helpful in
- Known for
- Frequently praised for
- Feedback style

Avoid:
- five stars
- best reviewer
- top rated guru
- review count spam

---

## 3. Optional Public Asset Pages

Users should be able to choose visibility per asset.

### Asset visibility options
- Private
- Member-only
- Public/shareable

### Why this matters
A user may want:
- their profile public
- one case study public
- their newest asset private

This creates much better control and trust.

### Public asset page content
- title
- short description
- category
- desired feedback focus
- selected public commentary excerpts
- selected public video clips
- update log or “what changed” notes

### Do not expose by default
- raw internal thread
- private videos
- reviewer identities without permission
- all ratings and scores

---

## Recommended Defaults

### Account default
- profile = private/member-visible only
- assets = member-only or private
- public publishing = off

### Public profile default
- not indexed by search until user explicitly allows it
- no public video until explicitly marked public
- no public asset pages unless selected individually

---

## Publishing Controls

Each user should have a publishing control center with toggles such as:
- Make my profile public
- Allow search engine indexing
- Show approved public clips
- Show approved feedback excerpts
- Show selected asset pages
- Hide my identity until feedback is complete (paid)
- Display marketplace offers publicly
- Show review-platform / brand-profile links

## Approval Model for Public Content

Any feedback content that becomes public should use an approval model.

### Recommended rules
- written feedback can be marked public only with recipient approval
- video feedback defaults to private
- public clips require explicit user approval
- excerpting private feedback into public profile sections should require approval

This protects the product from accidental oversharing and creates trust.

## SEO Recommendation

Do not rely on SEO at launch.

### Phase 1
- no public indexing by default
- unlisted or direct-link public pages only

### Phase 2
- selective indexing for strong public profiles
- selected marketplace listings can become indexable

### Phase 3
- optimize public profiles and public asset pages for search once quality is high enough

## Bottom Line

The best model is:
- private by default
- public by choice
- granular publishing controls
- strong approval system
- search visibility introduced later
