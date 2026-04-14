# Phase 2: Interaction Split

## Objective

Separate brush, text, and image behavior so each interaction model has one owner.

## Scope

### Brush

- Move p5 setup, brush refs, and brush pointer-size logic into `useP5Canvas.ts`.
- Decide whether the hook owns the brush color/size state or receives it from the shell.

### Text

- Move text-box state and handlers into `useTextLayer.ts`.
- Include:
  - placement
  - selection
  - editor focus
  - mouse drag/resize
  - touch drag/transform
  - empty-box cleanup

### Image

- Move inserted image state and handlers into `useImageLayer.ts`.
- Include:
  - upload
  - paste
  - mouse drag/resize
  - touch drag/transform
  - selection state

### Render split

- Move toolbar JSX into `DrawingBoardToolbar.tsx`.
- Move host and overlay JSX into `DrawingBoardCanvas.tsx`.
- Keep the shell responsible only for passing state, refs, and handlers down.

## Migration order

1. Extract toolbar first.
2. Extract image behavior next.
3. Extract text behavior next.
4. Extract brush hook last, because the p5 lifecycle touches shared refs and sizing.

## Acceptance criteria

- No hook exceeds a single concern.
- Mouse and touch listeners are registered in the subsystem that owns their state.
- The shell reads as composition code rather than behavior code.
- Existing `DrawingBoard.test.tsx` scenarios still pass after each extraction step.

## Testing strategy

- Preserve the current integration-style test file during the split.
- Add smaller hook or helper tests only where math/state can be verified without DOM-heavy setup.
- Add browser-level MCP or Playwright checks for:
  - brush draw on the real canvas
  - text placement/edit/drag/resize
  - image upload/drag/resize
  - submit/export/feed update
  - mobile-width rendering

## Manual validation steps

Run these after each major extraction:

1. Open the app locally and draw a brush stroke. Confirm the canvas bitmap changes.
2. Switch to text mode, place text, blur it, drag it, and resize it.
3. Upload an image, then drag and resize it.
4. Submit a post and confirm the success message appears and the new note reaches the top of the feed.
5. Repeat a quick sanity pass at mobile width.
6. Check browser console output for new runtime errors.
