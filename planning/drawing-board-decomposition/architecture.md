# Current Architecture And Target Boundaries

## Current structure

`components/DrawingBoard.tsx` currently has these major sections:

- Shared constants and helper functions: lines 22-276
- Component state and refs: lines 278-319
- Touch ownership and global listeners: lines 341-495
- p5 setup and brush drawing: lines 497-568
- Window-level mouse interactions for text/image overlays: lines 570-683
- Canvas reset and image insertion: lines 685-780
- Toolbar event handlers: lines 782-957
- Text placement and text gesture logic: lines 959-1390
- Image gesture logic: lines 1392-1755
- Export composition and imperative handle: lines 1757-1867
- JSX for toolbar, canvas host, image overlay, and text overlay: lines 1869-2210

## Main coupling problems

- Export logic depends on live component state and DOM refs instead of a small serializable model.
- Text, image, and brush concerns share one component scope, so every change touches unrelated state.
- Overlay rendering duplicates layout assumptions used by export rendering.
- Global touch ownership is managed alongside feature-specific handlers, which makes lifecycle bugs harder to isolate.

## Target module boundaries

### Shell

`components/DrawingBoard.tsx`

- Owns the public ref contract.
- Wires together hooks and presentational components.
- Contains only composition-level state that truly spans features.

### Brush subsystem

`components/drawing-board/useP5Canvas.ts`

- Boot p5.
- Expose `canvasElementRef`, `canvasSize`, and `clearBrushLayer`.
- Own resize policy.
- Keep brush drawing isolated from text and image logic.

### Text subsystem

`components/drawing-board/useTextLayer.ts`

- Own text-box collection and active selection.
- Expose event handlers for create, edit, drag, resize, and touch transforms.
- Expose export-ready text model.

### Image subsystem

`components/drawing-board/useImageLayer.ts`

- Own inserted image state and selection.
- Expose upload/paste support and image interaction handlers.
- Keep all scale and rotation math in one place.

### Export subsystem

`components/drawing-board/renderExportCanvas.ts`

- Accept brush canvas, image model, text model, and current z-order mode.
- Render a PNG without depending on React state setters or JSX.

### Presentational components

- `DrawingBoardToolbar.tsx`
- `DrawingBoardCanvas.tsx`

These should stay dumb. They receive state and handlers, but they do not implement movement math, export behavior, or file-loading logic.

The split should also preserve room for clearer interaction affordances:

- visible or more discoverable resize handles
- clearer selection state for image/text items
- space to improve gesture hints without touching export or state logic

## Dependency direction

- constants/types/utils -> hooks/export/presentational
- hooks -> shell
- export -> shell
- presentational -> shell

Hooks should not import JSX components, and presentational components should not import p5 or file-loading helpers directly.
