"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { NAV_HEIGHT } from "@/lib/fivestarz/theme";

import { resolveStyle } from "./cardStyle";
import TabStrip from "./TabStrip";
import { useSwipe } from "./useSwipe";
import AboutLayer from "./layers/AboutLayer";
import CardLayer from "./layers/CardLayer";
import LinksLayer from "./layers/LinksLayer";
import ReviewsLayer from "./layers/ReviewsLayer";

const LAYER_IDS = ["card", "reviews", "about", "links"];

function readHash() {
  if (typeof window === "undefined") return null;
  const h = window.location.hash.replace(/^#/, "");
  return LAYER_IDS.includes(h) ? h : null;
}
const subscribeHash = (cb) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const noHash = () => null;

/**
 * The public profile as a single viewport: no page scroll, four layers, a
 * tab strip. Everything it draws comes from the public RPC projections it is
 * handed; it never talks to Supabase itself (verify-phase23 greps for that).
 *
 * `embedded` is the editor preview: the card fills its parent instead of the
 * viewport. `topSlot` is the demo banner — rendered inside the grid so it
 * never pushes the card past the viewport.
 */
export default function ProfileCard({ profile, feedback = [], links = [], assets = [], offers = [], topSlot = null, embedded = false, initialLayer = "card" }) {
  const reducedMotion = useReducedMotion();
  const resolved = useMemo(() => resolveStyle(profile.profile_style), [profile.profile_style]);

  const reviewItems = useMemo(() => {
    const excerpts = feedback.filter((f) => f.kind === "excerpt");
    const clips = feedback.filter((f) => f.kind === "clip");
    return [...excerpts, ...clips];
  }, [feedback]);

  const tabs = useMemo(() => {
    const t = [{ id: "card", label: "Card" }];
    if (reviewItems.length > 0) t.push({ id: "reviews", label: "Reviews" });
    t.push({ id: "about", label: "About" });
    if (links.length + assets.length + offers.length > 0) t.push({ id: "links", label: "Links" });
    return t;
  }, [reviewItems.length, links.length, assets.length, offers.length]);

  // Deep links: /u/handle#reviews opens on that layer. The hash is an external
  // store (null on the server and during hydration) and the source of truth
  // on the live page; a tap writes it. `chosen` covers the card layer (no
  // hash) and the editor preview, which never touches the URL.
  const hashLayer = useSyncExternalStore(subscribeHash, readHash, noHash);
  const [chosen, setChosen] = useState(null);
  const active = (!embedded && hashLayer) || chosen || initialLayer;

  function change(id) {
    setChosen(id);
    if (!embedded && typeof window !== "undefined" && window.history?.replaceState) {
      window.history.replaceState(null, "", id === "card" ? window.location.pathname : `#${id}`);
    }
  }

  // Reviews pages its own items; everywhere else a horizontal swipe moves tabs.
  const swipe = useSwipe((dir) => {
    const idx = tabs.findIndex((t) => t.id === active);
    const next = dir === "left" ? tabs[idx + 1] : tabs[idx - 1];
    if (next) change(next.id);
  }, { enabled: active !== "reviews" });

  const activeTab = tabs.some((t) => t.id === active) ? active : "card";
  const navVar = embedded ? "0px" : `${NAV_HEIGHT}px`;

  return (
    <div
      className="ps-card-bg"
      style={{
        background: resolved.backgroundCss,
        "--ps-nav": navVar,
        ...(embedded ? { height: "100%" } : {}),
      }}
    >
      <style>{`
        .ps-card-bg{min-height:calc(100vh - var(--ps-nav));min-height:calc(100dvh - var(--ps-nav));display:flex;justify-content:center;overscroll-behavior:none;}
        .ps-card{width:100%;max-width:480px;height:calc(100vh - var(--ps-nav));height:calc(100dvh - var(--ps-nav));display:grid;grid-template-rows:auto 1fr auto;overflow:hidden;position:relative;}
        .ps-card.embedded{height:100%;max-width:none;}
        .ps-layer{position:absolute;inset:0;min-height:0;animation:ps-in 0.22s ease-out both;}
        .ps-review{animation:ps-in 0.22s ease-out both;}
        @keyframes ps-in{from{opacity:0;transform:translateX(12px);}to{opacity:1;transform:none;}}
        @media (prefers-reduced-motion: reduce){.ps-layer,.ps-review{animation:none;}}
        @media (max-height: 640px){.ps-hint{display:none;}}
        @media (max-height: 600px){.ps-headline{display:none;}}
        @media (min-width: 768px){.ps-card:not(.embedded){margin:0 auto;}}
      `}</style>

      <div className={`ps-card${embedded ? " embedded" : ""}`}>
        <div>{topSlot}</div>

        <div
          {...swipe}
          style={{ position: "relative", minHeight: 0, touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none" }}
        >
          {tabs.map((t) => {
            const isActive = t.id === activeTab;
            return (
              <section
                key={t.id}
                role="tabpanel"
                id={`ps-panel-${t.id}`}
                aria-labelledby={`ps-tab-${t.id}`}
                hidden={!isActive}
                className={isActive && !reducedMotion ? "ps-layer" : undefined}
                style={isActive ? { position: "absolute", inset: 0, minHeight: 0 } : undefined}
              >
                {isActive && t.id === "card" ? <CardLayer profile={profile} resolved={resolved} hasReviews={reviewItems.length > 0} /> : null}
                {isActive && t.id === "reviews" ? <ReviewsLayer key={reviewItems.length} items={reviewItems} resolved={resolved} reducedMotion={reducedMotion} /> : null}
                {isActive && t.id === "about" ? <AboutLayer profile={profile} resolved={resolved} /> : null}
                {isActive && t.id === "links" ? <LinksLayer links={links} assets={assets} offers={offers} resolved={resolved} /> : null}
              </section>
            );
          })}
        </div>

        <TabStrip tabs={tabs} active={activeTab} onChange={change} onDark={resolved.onDark} embedded={embedded} />
      </div>
    </div>
  );
}
