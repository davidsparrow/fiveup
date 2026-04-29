# UI Fine-Tuning — mar-31-gemini-ui

Changes across [SiteNav.jsx](file:///Users/davidsparrow/Documents/_appDevelopment/Dev/fiveup/src/components/fivestarz/SiteNav.jsx) and [HomePage.jsx](file:///Users/davidsparrow/Documents/_appDevelopment/Dev/fiveup/src/components/fivestarz/HomePage.jsx).

## User Review Required

> [!IMPORTANT]
> **Item 9 clarification needed**: The request lists two "9)" items. The first seems to introduce "Auto Review generation" as a new stat label. I'll apply it as the *3rd stat* replacing "2,100+ Reviews Posted" → `"Auto"` value + `"Review Generation"` label, and add a 4th stat `"0"` / `"When you don't join."` — **OR** did you mean item 9 replaces the 3rd stat only? I'm proceeding as: stat 3 = `"Auto / Review Generation"`, stat 4 (new) = `"0 / When you don't join."` — please clarify if wrong.

> [!NOTE]
> `react-icons` is not currently installed. I will run `npm install react-icons` as part of this task.

---

## Proposed Changes

### Dependencies

Install `react-icons` package.

---

### SiteNav.jsx

#### [MODIFY] [SiteNav.jsx](file:///Users/davidsparrow/Documents/_appDevelopment/Dev/fiveup/src/components/fivestarz/SiteNav.jsx)

**Header (desktop + mobile bar):**
- Import `GiStarSwirl` from `react-icons/gi` and `PiPlanetFill` from `react-icons/pi`
- Replace `⭐` emoji with `<GiStarSwirl>` in two colors for a duotone effect (primary orange `T.orange`, secondary `T.orangeL`)
- **Remove** all `NAV_LINKS` text links from desktop header
- Replace `ButtonLink href="/dashboard"` with a `Btn` that calls `openBeta()` labeled **"Get Early Access"**
- Add `<PiPlanetFill>` icon button to right of that button, same left/right gutter as the star (32px)
- Planet icon toggles the slide-in nav (`setOpen`)

**Slide-in nav (full redesign — replaces existing mobile-only drawer, now universal):**
- Full height, white bg, fixed right, same slide-in animation
- Top: `×` close button (slate color), top-right
- Links stacked vertically (non-bold, large, easy-to-read): My Dashboard · Add Asset + · Browse Members · Proof Lab · How It Works · Support (`href="#"`)
- Bottom section (separated): Login button + Sign Up button
- Mock avatar block: circular avatar initials `"JR"`, name `"Jordan Rivera"`, + `"Settings"` text link (href="#")

---

### HomePage.jsx

#### [MODIFY] [HomePage.jsx](file:///Users/davidsparrow/Documents/_appDevelopment/Dev/fiveup/src/components/fivestarz/HomePage.jsx)

- **3**: Pill label `"New Match"` → `"Auto-matched"`
- **3B**: H1 remove `<br />Consult founders.` line
- **4**: Hero section grid → on mobile: `gridTemplateColumns: "1fr"`, card stacks below text. Button labels shortened to avoid multi-line wrapping: `"Get Early Access"` + `"How It Works →"` (shorter)
- **5**: Remove both `<Btn>` buttons in hero CTA row entirely
- **6**: Replace paragraph with: *"Exchange valuable feedback with other founders, find powerful wholesale services, [gather stars](/how-it-works), beef up your reputation."*
- **7**: Stat 1: `"500+"` → `"500"`, `"Beta Members"` → `"Beta Seats"`
- **8**: Stat 2: `"4.9★"` → `"90"`, `"Avg Score"` → `"Days Free Access"`
- **9**: Stat 3: value `"Auto"`, label `"Review Generation"` | Stat 4 (new): value `"0"`, label `"When you don't join."`

---

## Verification Plan

### Browser Testing
1. Run dev server: `npm run dev` (already running on port 3000)
2. Open `http://localhost:3000` — verify hero copy, stats, no CTA buttons, card pill
3. Open `http://localhost:3000` on mobile viewport (375px) — verify card stacks below text, buttons remain normal height
4. Click planet icon — verify slide-in nav opens with all 6 links + bottom auth + mock avatar
5. Click `×` — verify menu closes
6. Click "Get Early Access" in header — verify beta modal opens
