import { SQUIRCLE_PATH, resolveStyle, shapeCss } from "./cardStyle";

/**
 * The member's photo inside its chosen frame. Pure: everything it draws comes
 * from `resolveStyle(style)`, which maps whitelist keys to CSS. When there is
 * no photo (demo cast, or nothing uploaded yet) the initials sit inside the
 * same frame, so the card never has a hole in it.
 *
 * `size` is any CSS length (the card passes a clamp()); the arch is 4:5.
 * With `fit`, `size` becomes a ceiling and the photo takes the height of its
 * (definite-height) parent instead, so it shrinks on short phones rather
 * than pushing the words off the card.
 */
export default function FramedPhoto({ src, alt = "", initials = "?", style, size = 200, fit = false, initialsColor = "#FF6B35" }) {
  const r = resolveStyle(style);
  const shape = r.shape;
  const isArch = shape === "arch";
  const clip = shapeCss(shape);
  const sizeCss = typeof size === "number" ? `${size}px` : size;

  const dims = fit
    ? { height: "100%", maxHeight: sizeCss, width: "auto", aspectRatio: isArch ? "4 / 5" : "1 / 1" }
    : { width: size, height: isArch ? `calc(${sizeCss} * 1.25)` : size };

  const outer = {
    position: "relative",
    ...dims,
    flexShrink: 0,
    padding: r.ringWidthPx,
    background: r.ringCss ?? "transparent",
    boxShadow: r.shadowCss ?? undefined,
    filter: r.dropShadowCss ?? undefined,
    ...clip,
  };

  const inner = {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    background: r.photoBgCss,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    ...clip,
  };

  return (
    <div style={outer} aria-hidden={src ? undefined : true}>
      {shape === "squircle" ? (
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <defs>
            <clipPath id="ps-squircle" clipPathUnits="objectBoundingBox">
              <path d={SQUIRCLE_PATH} />
            </clipPath>
          </defs>
        </svg>
      ) : null}
      <div style={inner}>
        {src ? (
          // draggable=false + no pointer events: a native image drag would
          // cancel the card's swipe gesture when it starts on the photo.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none", userSelect: "none", WebkitUserDrag: "none" }} />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: initialsColor,
              color: "#fff",
              fontFamily: "'DM Sans',sans-serif",
              fontWeight: 700,
              fontSize: fit ? "clamp(28px, 9vh, 72px)" : `calc(${sizeCss} * 0.34)`,
              letterSpacing: "0.02em",
            }}
          >
            {initials}
          </div>
        )}
      </div>
    </div>
  );
}
