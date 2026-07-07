import ErrorShell from "@/components/fivestarz/ErrorShell";

export const metadata = {
  title: "Page not found | ProofSignals",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <ErrorShell
      code="404"
      title="We couldn't find that page"
      message="The page or profile you're looking for doesn't exist, isn't public yet, or may have been removed."
      actionHref="/"
      actionLabel="Back to home"
      animation={
        <video
          src="/404-dog.mp4"
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
          style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 16 }}
        />
      }
    />
  );
}
