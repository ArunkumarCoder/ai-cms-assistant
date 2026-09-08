"use client";

// Last-resort fallback for a crash in the root layout itself (e.g. font
// loading). Replaces the whole document, so it must define its own <html>/
// <body> and can't rely on globals.css or app-level dark-mode wiring — the
// inline styles here are deliberate, not an oversight.
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          background: "#fafafa",
          color: "#18181b",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 384, padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#52525b" }}>
            The app failed to load. Please try again.
          </p>
          <button
            onClick={() => retry()}
            style={{
              marginTop: 16,
              borderRadius: 8,
              background: "#18181b",
              color: "#fff",
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
