"use client";

// ARCHIVED: web matching surface — see docs/archive/web-matching.md.
//
// The match-initiating pieces of the dashboard Matches tab, extracted so the
// dashboard itself keeps working (read-only match history, feedback, star
// ratings, post requests) whichever surface is active. Only rendered by
// src/app/dashboard/page.jsx when match_surface() = 'web'.
//
// Note for the restore: the dashboard never had "accept" actions — matches
// are created directly by create_match from the Browse page — so the only
// thing that moves here is the Browse entry point and its empty-state copy.

import { useRouter } from "next/navigation";

import { Btn } from "@/components/fivestarz/ui";

export const WEB_MATCH_EMPTY_STATE = "No matches yet. Browse members to request your first one.";

export default function MatchActions({ isMobile = false }) {
  const router = useRouter();
  return (
    <Btn sz="sm" v="teal" onClick={() => router.push("/browse")} sx={isMobile ? { width: "100%", justifyContent: "center" } : {}}>
      + Browse Members
    </Btn>
  );
}
