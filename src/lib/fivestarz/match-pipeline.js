// Pure derivation of the per-match feedback pipeline from the shape
// listMyMatches returns. No new state is stored — every stage is derived from
// rows that already exist (match status and the two feedback_submissions).
//
// The pipeline ends when both members have given feedback. It used to carry
// two further stages, "Post requested" and "Posted", which told members a
// match was unfinished until a public review existed somewhere. The platform
// does not raise online reviews, so those stages are gone.
//
// Stage states: 'done' | 'current' | 'pending' | 'blocked'
// ('blocked' = the pipeline ends here: a match cancelled mid-flight.)

export const PIPELINE_STAGES = [
  { key: "matched", label: "Matched" },
  { key: "my_feedback", label: "Your feedback" },
  { key: "their_feedback", label: "Their feedback" },
  { key: "complete", label: "Complete" },
];

// Returns null for matches that have no pipeline (queued for next month, or
// cancelled before anything happened) — the card's status pill already says
// everything there is to say.
export function matchPipelineStages(match) {
  if (match.status === "queued_next_month") return null;

  const myDone = Boolean(match.myFeedback);
  const theirDone = Boolean(match.theirFeedback);
  const cancelled = match.status === "cancelled";

  if (cancelled && !myDone && !theirDone) return null;

  const doneByKey = {
    matched: true,
    my_feedback: myDone,
    their_feedback: theirDone,
    complete: myDone && theirDone,
  };

  let currentAssigned = false;
  return PIPELINE_STAGES.map(({ key, label }) => {
    if (doneByKey[key]) return { key, label, state: "done" };
    if (cancelled) return { key, label, state: "blocked" };
    if (!currentAssigned) {
      currentAssigned = true;
      return { key, label, state: "current" };
    }
    return { key, label, state: "pending" };
  });
}
