# Phase 3: Correctness Hardening

## Findings from review

### 1. Image mouse resize compounds scale incorrectly

Location: `components/DrawingBoard.tsx:643-667`

The mouse-resize path computes a scale ratio from the original width, but then applies it to `currentImage.scale` on every `mousemove`:

- `widthScaleRatio = nextWidth / safeStartWidth`
- `scale: currentImage.scale * widthScaleRatio`

That multiplies an absolute ratio into an already-updated scale value, so scale drifts upward or downward across multiple move events. The width/height are derived from the start dimensions, but `scale` is derived from the latest dimensions. Those two values can diverge.

### 2. Canvas size is fixed at initial mount

Location: `components/DrawingBoard.tsx:509-523`

Canvas dimensions are computed once during `p.setup()` from `canvasHostRef.current?.clientWidth`. There is no resize observer or window resize handling after mount, so the canvas and overlay sizes can become stale when the host width changes.

### 3. Text placement and drag are not bounded to the canvas

Locations:

- creation: `components/DrawingBoard.tsx:971-1005`
- mouse drag: `components/DrawingBoard.tsx:583-588`
- touch drag: `components/DrawingBoard.tsx:1303-1310`

Inserted images are clamped to the canvas, but text boxes can be created or dragged partially outside it. That may be intentional, but it is inconsistent with image behavior and easy to lose content off-canvas before export.

### 4. Touch interaction needs explicit validation during refactor

MCP browser testing was able to move a text item through a synthetic touch path, but that is not the same as proving the UX on real touch hardware. During probing, the browser also surfaced `Unable to preventDefault inside passive event listener invocation` on the synthetic path.

That does not automatically mean production gestures are broken, but it does mean touch ownership and passive-listener behavior need an explicit validation step instead of being assumed safe.

## Fix plan

### A. Stabilize image sizing math

- Store the starting image scale inside the mouse interaction state.
- Derive next width, next height, and next scale from the same baseline values.
- Add a regression test with multiple `mousemove` events during one resize interaction.

### B. Define resize behavior explicitly

- Either:
  - support responsive resizing with `ResizeObserver` plus redraw/export preservation, or
  - document that the board is fixed-size after mount and enforce that more clearly.
- The current code is ambiguous, which is the real problem.

### C. Decide text clamping policy

- If text should stay on-canvas, clamp placement and drag to visible bounds.
- If off-canvas placement is allowed, add tests and UI cues so it is intentional rather than accidental.

### D. Validate touch handling deliberately

- Keep synthetic touch coverage for fast regression detection.
- Add at least one real-device or device-emulation validation pass for:
  - one-finger text drag
  - one-finger image drag
  - two-finger text transform
  - two-finger image transform
- Investigate passive-listener warnings if they appear outside synthetic probes.

## Acceptance criteria

- Image resize state stays internally consistent across repeated mouse moves.
- Canvas sizing behavior is explicit and test-covered.
- Text movement policy matches image policy or is intentionally documented as different.
- Touch behavior has an explicit regression plan and no unresolved listener-mode surprises.
