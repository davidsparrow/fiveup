"use client";

import ErrorShell from "@/components/fivestarz/ErrorShell";

/**
 * App-wide error boundary. Next.js requires this to be a client component and
 * passes `error` + `reset`. We surface a friendly message, never the raw error.
 */
export default function Error() {
  return (
    <ErrorShell
      code="Something broke"
      title="That didn't go as planned"
      message="An unexpected error occurred on our end. Try again in a moment — if it keeps happening, let us know."
      actionHref="/"
      actionLabel="Back to home"
      // animation={<YourLottieOrGif />}  ← drop the provided asset here
    />
  );
}
