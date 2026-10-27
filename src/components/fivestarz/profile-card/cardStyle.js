// The profile-card style contract — the single source of truth for what a
// member can choose for their public card.
//
// Everything stored in `user_profiles.profile_style` is a key from one of the
// closed lists below. The renderer maps keys to CSS; a member never supplies a
// colour, a length or a CSS string, which is the whole injection defence. The
// database mirrors these lists in `profile_style_is_valid()` (migration
// 20261027120000_phase23_profile_card.sql) and `verify-phase23.mjs` asserts the
// two never drift. When you add an option, add it here first, then to the SQL.
//
// Pure module: no React, no Supabase, no `@/` imports — the verify script loads
// it straight from Node.

export const FRAME_SHAPES = ["circle", "rounded", "squircle", "arch", "none"];
export const RING_STYLES = ["solid", "gradient", "none"];
export const RING_WIDTHS = ["thin", "regular", "bold"];
export const PHOTO_BGS = ["transparent", "white"];
export const SHADOWS = ["none", "soft", "strong"];
export const PHOTO_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];
export const TEXT_SIDES = ["auto", "top", "bottom"];
export const TEXT_ALIGNS = ["auto", "left", "center", "right"];
export const BG_KINDS = ["solid", "gradient", "preset"];

// Palette keys → hex. Values are copied from src/lib/fivestarz/theme.js so this
// file stays dependency-free; keep them in step by hand.
export const PALETTE = {
  orange: "#FF6B35",
  orangeL: "#FF8C5A",
  gold: "#F4A832",
  goldL: "#FDD07A",
  brown: "#3D2B1F",
  brownM: "#6B4226",
  teal: "#1A9E8F",
  tealL: "#4DC4B6",
  cream: "#FFF8F0",
  purple: "#7C3AED",
  green: "#38A169",
  slate: "#4A5568",
  white: "#FFFFFF",
};
export const PALETTE_KEYS = Object.keys(PALETTE);

// Background presets: a CSS background plus whether text on it should be light.
export const BG_PRESETS = {
  ember: { css: "linear-gradient(160deg,#3D2B1F 0%,#6B4226 55%,#A0644A 100%)", onDark: true, label: "Ember" },
  tide: { css: "linear-gradient(160deg,#0F3F3A 0%,#1A9E8F 60%,#4DC4B6 100%)", onDark: true, label: "Tide" },
  dusk: { css: "linear-gradient(160deg,#2B1B3D 0%,#7C3AED 70%,#FF8C5A 100%)", onDark: true, label: "Dusk" },
  cream: { css: "linear-gradient(160deg,#FFF8F0 0%,#FFE8D6 100%)", onDark: false, label: "Cream" },
};
export const BG_PRESET_KEYS = Object.keys(BG_PRESETS);

export const STYLE_KEYS = [
  "shape",
  "ring",
  "ringWidth",
  "ringColor",
  "ringColor2",
  "photoBg",
  "shadow",
  "photoPos",
  "textSide",
  "textAlign",
  "bgKind",
  "bgColor",
  "bgColor2",
  "bgPreset",
];

// Allowed values per key — the exact table the SQL validator encodes.
export const ALLOWED = {
  shape: FRAME_SHAPES,
  ring: RING_STYLES,
  ringWidth: RING_WIDTHS,
  ringColor: PALETTE_KEYS,
  ringColor2: PALETTE_KEYS,
  photoBg: PHOTO_BGS,
  shadow: SHADOWS,
  photoPos: PHOTO_POSITIONS,
  textSide: TEXT_SIDES,
  textAlign: TEXT_ALIGNS,
  bgKind: BG_KINDS,
  bgColor: PALETTE_KEYS,
  bgColor2: PALETTE_KEYS,
  bgPreset: BG_PRESET_KEYS,
};

export const DEFAULT_STYLE = Object.freeze({
  shape: "circle",
  ring: "solid",
  ringWidth: "regular",
  ringColor: "orange",
  ringColor2: "gold",
  photoBg: "white",
  shadow: "soft",
  photoPos: "top-center",
  textSide: "auto",
  textAlign: "auto",
  bgKind: "preset",
  bgColor: "brown",
  bgColor2: "brownM",
  bgPreset: "ember",
});

export const MAX_STYLE_JSON_LENGTH = 1500;

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Any input → a complete, valid style. Unknown keys are dropped, bad values
 *  fall back to the default. Never throws; the renderer calls this on
 *  whatever the database returns. */
export function normalizeStyle(input) {
  const src = isPlainObject(input) ? input : {};
  const out = {};
  for (const key of STYLE_KEYS) {
    const v = src[key];
    out[key] = typeof v === "string" && ALLOWED[key].includes(v) ? v : DEFAULT_STYLE[key];
  }
  return out;
}

/** Strict mirror of `profile_style_is_valid`: object, only known keys, every
 *  present value allowed, serialised length under the cap. Used by the editor
 *  before it sends, so a server rejection is never the first signal. */
export function isValidStyle(input) {
  if (!isPlainObject(input)) return false;
  if (JSON.stringify(input).length > MAX_STYLE_JSON_LENGTH) return false;
  for (const [key, v] of Object.entries(input)) {
    if (!STYLE_KEYS.includes(key)) return false;
    if (typeof v !== "string" || !ALLOWED[key].includes(v)) return false;
  }
  return true;
}

const RING_WIDTH_PX = { thin: 3, regular: 6, bold: 10 };

const SHADOW_CSS = {
  none: null,
  soft: "0 12px 32px rgba(0,0,0,0.22)",
  strong: "0 24px 56px rgba(0,0,0,0.42)",
};
const DROP_SHADOW_CSS = {
  none: null,
  soft: "drop-shadow(0 12px 18px rgba(0,0,0,0.28))",
  strong: "drop-shadow(0 22px 30px rgba(0,0,0,0.5))",
};

function splitPos(pos) {
  const [v, h] = pos.split("-");
  return { v, h };
}

/** A normalized style → concrete CSS values the components render with. */
export function resolveStyle(style) {
  const s = normalizeStyle(style);

  let backgroundCss;
  let onDark;
  if (s.bgKind === "preset") {
    backgroundCss = BG_PRESETS[s.bgPreset].css;
    onDark = BG_PRESETS[s.bgPreset].onDark;
  } else if (s.bgKind === "gradient") {
    backgroundCss = `linear-gradient(160deg,${PALETTE[s.bgColor]} 0%,${PALETTE[s.bgColor2]} 100%)`;
    onDark = isDarkHex(PALETTE[s.bgColor]) || isDarkHex(PALETTE[s.bgColor2]);
  } else {
    backgroundCss = PALETTE[s.bgColor];
    onDark = isDarkHex(PALETTE[s.bgColor]);
  }

  const ringWidthPx = s.ring === "none" || s.shape === "none" ? 0 : RING_WIDTH_PX[s.ringWidth];
  let ringCss = null;
  if (ringWidthPx > 0) {
    ringCss =
      s.ring === "gradient"
        ? `linear-gradient(135deg,${PALETTE[s.ringColor]} 0%,${PALETTE[s.ringColor2]} 100%)`
        : PALETTE[s.ringColor];
  }

  // A cut-out photo (transparent backdrop, or no frame at all) gets a
  // drop-shadow that follows its alpha; a filled frame gets a box-shadow.
  const floating = s.shape === "none" || s.photoBg === "transparent";
  const shadowCss = floating ? null : SHADOW_CSS[s.shadow];
  const dropShadowCss = floating ? DROP_SHADOW_CSS[s.shadow] : null;

  const photoCorner = splitPos(s.photoPos);
  const textCorner = {
    v: s.textSide === "auto" ? (photoCorner.v === "top" ? "bottom" : "top") : s.textSide,
    h: s.textAlign === "auto" ? photoCorner.h : s.textAlign,
  };

  return {
    style: s,
    backgroundCss,
    onDark,
    textColor: onDark ? "#FFFFFF" : "#3D2B1F",
    mutedTextColor: onDark ? "rgba(255,255,255,0.78)" : "#6B4226",
    ringCss,
    ringWidthPx,
    shape: s.shape,
    photoBgCss: s.photoBg === "white" ? "#FFFFFF" : "transparent",
    shadowCss,
    dropShadowCss,
    photoCorner,
    textCorner,
    textAlign: textCorner.h,
  };
}

function isDarkHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Relative luminance, cheap version — enough to pick white vs brown text.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 150;
}

/** Border-radius / clip for each shape, for an element of the given size. */
export function shapeCss(shape) {
  switch (shape) {
    case "circle":
      return { borderRadius: "50%" };
    case "rounded":
      return { borderRadius: "22%" };
    case "squircle":
      // FramedPhoto defines the `ps-squircle` <clipPath> once, in
      // objectBoundingBox units, so this scales with any element.
      return { clipPath: "url(#ps-squircle)", WebkitClipPath: "url(#ps-squircle)" };
    case "arch":
      return { borderRadius: "999px 999px 18% 18%" };
    default:
      return {};
  }
}

// The squircle outline in 0..1 objectBoundingBox units; FramedPhoto puts it in
// an inline <svg><clipPath id="ps-squircle">. Exported so swatches can reuse it.
export const SQUIRCLE_PATH =
  "M0.5,0 C0.9,0 1,0.1 1,0.5 C1,0.9 0.9,1 0.5,1 C0.1,1 0,0.9 0,0.5 C0,0.1 0.1,0 0.5,0 Z";
