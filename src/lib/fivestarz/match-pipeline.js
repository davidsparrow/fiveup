// Pure derivation of the per-match feedback pipeline from the shape
// listMyMatches returns. No new state is stored — every stage is derived
// from rows that already exist (match status, the two feedback_submissions,
// and the review_post_requests row on their feedback).
//
// Stage states: 'done' | 'current' | 'pending' | 'blocked'
// ('blocked' = the pipeline ends here: declined post request, or a match
// that was cancelled mid-flight).

export const PIPELINE_STAGES = [
  { key: "matched", label: "Matched" },
  { key: "my_feedback", label: "Your feedback" },
  { key: "their_feedback", label: "Their feedback" },
  { key: "post_requested", label: "Post requested" },
  { key: "posted", label: "Posted" },
];

// Returns null for matches that have no pipeline (queued for next month, or
// cancelled before anything happened) — the card's status pill already says
// everything there is to say.
export function matchPipelineStages(match) {
  if (match.status === "queued_next_month") return null;

  const myDone = Boolean(match.myFeedback);
  const theirDone = Boolean(match.theirFeedback);
  const post = match.theirFeedbackPostRequest ?? null;
  const cancelled = match.status === "cancelled";

  if (cancelled && !myDone && !theirDone) return null;

  const doneByKey = {
    matched: true,
    my_feedback: myDone,
    their_feedback: theirDone,
    post_requested: Boolean(post),
    posted: post?.status === "posted",
  };

  // The pipeline ends early when a post request was declined, or the match
  // was cancelled after some progress.
  const declined = post?.status === "declined";

  let currentAssigned = false;
  return PIPELINE_STAGES.map(({ key, label }) => {
    if (doneByKey[key]) {
      if (key === "post_requested" && declined) {
        return { key, label: "Post declined", state: "blocked" };
      }
      if (key === "post_requested" && post?.status === "accepted") {
        return { key, label: "Post accepted", state: "done" };
      }
      return { key, label, state: "done" };
    }
    if (declined || cancelled) {
      return { key, label, state: "blocked" };
    }
    if (!currentAssigned) {
      currentAssigned = true;
      return { key, label, state: "current" };
    }
    return { key, label, state: "pending" };
  });
}
