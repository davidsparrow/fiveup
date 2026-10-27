"use client";

import { useRef } from "react";

const MIN_DISTANCE = 48;
const MAX_DURATION_MS = 600;
const INTERACTIVE = "a, button, input, textarea, select, [data-no-swipe]";

function startsInScrollable(target, boundary) {
  let el = target;
  while (el && el !== boundary) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const ov = getComputedStyle(el).overflowX;
      if (ov === "auto" || ov === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Horizontal swipe detection with pointer events and no library. Returns
 * handlers to spread onto the swipe surface. Fires `onSwipe('left' | 'right')`
 * when the gesture is long enough, fast enough, mostly horizontal, and did not
 * start on a control or inside a horizontally scrollable region — so buttons,
 * links and inner scroll areas keep working. The surface should set
 * `touch-action: pan-y` so vertical scrolling inside layers stays native.
 */
export function useSwipe(onSwipe, { enabled = true } = {}) {
  const start = useRef(null);

  function onPointerDown(e) {
    if (!enabled || e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest(INTERACTIVE) || startsInScrollable(e.target, e.currentTarget)) {
      start.current = null;
      return;
    }
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }

  function onPointerUp(e) {
    const s = start.current;
    start.current = null;
    if (!s || !enabled) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Date.now() - s.t > MAX_DURATION_MS) return;
    if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) <= 1.5 * Math.abs(dy)) return;
    onSwipe(dx < 0 ? "left" : "right");
  }

  function onPointerCancel() {
    start.current = null;
  }

  return { onPointerDown, onPointerUp, onPointerCancel };
}
