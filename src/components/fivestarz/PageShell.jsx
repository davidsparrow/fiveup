"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { T } from "@/lib/fivestarz/theme";
import { getMatchSurface } from "@/lib/fivestarz/data";
import { createClient } from "@/lib/supabase/client";

import BetaModal from "./BetaModal";
import Footer from "./Footer";
import SiteNav from "./SiteNav";

const BetaModalContext = createContext({
  openBeta: () => {},
});

export function useBetaModal() {
  return useContext(BetaModalContext);
}

// Phase A match-surface gate, resolved once per shell so nav and footer can
// hide the archived "Browse Members" link. null = not yet known (links to the
// archived surface stay hidden until the RPC answers 'web').
const MatchSurfaceContext = createContext(null);

export function useMatchSurface() {
  return useContext(MatchSurfaceContext);
}

function GlobalStyles() {
  return (
    <style>{`
      *{box-sizing:border-box;margin:0;padding:0;}
      body{background:${T.cream};}
      ::-webkit-scrollbar{width:6px;}
      ::-webkit-scrollbar-thumb{background:${T.orangeP};border-radius:10px;}
      input:focus,textarea:focus,select:focus{border-color:${T.orange}!important;box-shadow:0 0 0 3px ${T.orange}22;outline:none;}
      select option{background:${T.brown};color:#fff;}
    `}</style>
  );
}

export default function PageShell({ children }) {
  const [showBeta, setShowBeta] = useState(false);
  const [matchSurface, setMatchSurface] = useState(null);
  const value = useMemo(() => ({ openBeta: () => setShowBeta(true) }), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const surface = await getMatchSurface(createClient());
        if (!cancelled) setMatchSurface(surface === "discord" ? "discord" : "web");
      } catch {
        // Fail open to web, matching the RPC's own default; a missing gate
        // must never hide the flow that exists today.
        if (!cancelled) setMatchSurface("web");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <BetaModalContext.Provider value={value}>
      <MatchSurfaceContext.Provider value={matchSurface}>
        <GlobalStyles />
        <SiteNav />
        <main>{children}</main>
        <Footer />
        <BetaModal show={showBeta} onClose={() => setShowBeta(false)} />
      </MatchSurfaceContext.Provider>
    </BetaModalContext.Provider>
  );
}
