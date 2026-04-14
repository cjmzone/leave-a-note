# Drawing Board Decomposition

## Why this exists

`components/DrawingBoard.tsx` is currently a 2,200+ line client component that mixes:

- p5 canvas bootstrapping and brush drawing
- text-box state, editing, rendering, and gestures
- image upload/paste, rendering, and gestures
- export composition
- toolbar rendering and UI wiring

That makes correctness work expensive because state, DOM behavior, and export behavior are tightly coupled in one file.

## Goals

- Break the module into small units with stable ownership.
- Preserve the current external API:
  - default `DrawingBoard` export
  - `DrawingBoardHandle`
  - `exportImageBlob()`
  - `clear()`
- Keep behavior covered while moving code.
- Fix known correctness issues as part of the split, not afterward.

## Non-goals

- No feature redesign.
- No rewrite away from p5 in this pass.
- No change to the `LeaveNoteForm` integration contract.

## Proposed end state

- `components/DrawingBoard.tsx`
  - thin shell
  - binds toolbar, canvas layers, and imperative handle
- `components/drawing-board/types.ts`
  - shared domain types
- `components/drawing-board/constants.ts`
  - sizing and interaction constants
- `components/drawing-board/utils.ts`
  - clamp, touch metrics, wrapped text, font helpers, file/image loading
- `components/drawing-board/useP5Canvas.ts`
  - p5 lifecycle and brush drawing
- `components/drawing-board/useTextLayer.ts`
  - text box state and text interactions
- `components/drawing-board/useImageLayer.ts`
  - inserted image state and image interactions
- `components/drawing-board/renderExportCanvas.ts`
  - export-only composition logic
- `components/drawing-board/DrawingBoardToolbar.tsx`
  - tool, color, font, brush size, upload, clear controls
- `components/drawing-board/DrawingBoardCanvas.tsx`
  - host, mount layer, overlay layer, and item rendering

## Workstreams

- [01-domain-and-export.md](./01-domain-and-export.md)
- [02-interaction-split.md](./02-interaction-split.md)
- [03-correctness-hardening.md](./03-correctness-hardening.md)

## Sequencing

1. Extract pure types, constants, and export helpers first.
2. Move image and text state/handlers behind focused hooks.
3. Split rendering from behavior.
4. Land correctness fixes with regression tests before any cleanup pass.

## Validation checklist

The refactor is not done until these checks pass against the real app, not just unit tests:

- Desktop MCP/browser validation:
  - brush stroke changes the canvas bitmap
  - text can be placed, edited, dragged, and resized
  - image can be uploaded, dragged, and resized
  - submit/export succeeds and a new feed item appears
- Mobile-width MCP/browser validation:
  - toolbar remains usable
  - canvas still renders at the minimum supported width
  - text placement still works
- Touch validation:
  - at minimum, synthetic touch interaction still exercises drag paths
  - follow up on real touch hardware for one-finger drag and two-finger transform
- Console hygiene:
  - no new runtime errors introduced by the split
  - investigate touch/passive-listener issues if they appear during gesture testing
