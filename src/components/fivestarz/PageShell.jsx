"use client";

import { createContext, useContext, useMemo, useState } from "react";

import { T } from "@/lib/fivestarz/theme";

import BetaModal from "./BetaModal";
import Footer from "./Footer";
import SiteNav from "./SiteNav";

const BetaModalContext = createContext({
  openBeta: () => {},
});

export function useBetaModal() {
  return useContext(BetaModalContext);
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
  const value = useMemo(() => ({ openBeta: () => setShowBeta(true) }), []);

  return (
    <BetaModalContext.Provider value={value}>
      <GlobalStyles />
      <SiteNav />
      <main>{children}</main>
      <Footer />
      <BetaModal show={showBeta} onClose={() => setShowBeta(false)} />
    </BetaModalContext.Provider>
  );
}