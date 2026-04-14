# Phase 1: Domain And Export Extraction

## Objective

Move the pure, low-risk logic out of `components/DrawingBoard.tsx` first so later interaction work is smaller and easier to verify.

## Scope

- Extract shared types:
  - `ToolMode`
  - `CanvasFontKey`
  - `CanvasTextBox`
  - `CanvasImageItem`
  - interaction-state types if they remain shared
- Extract constants and font metadata.
- Extract pure helpers:
  - `clamp`
  - `createTextBoxId`
  - `getTextFontSize`
  - `getCanvasTextFontFamily`
  - touch-angle helpers
  - `drawWrappedText`
  - file/image loading helpers
- Extract export rendering into `renderExportCanvas.ts`.

## Notes

- `renderExportCanvas.ts` should operate on plain inputs and return a `Blob`.
- Keep DOM access limited to the source canvas and optional loaded image element.
- Cache the loaded image in one place so repeated exports do not implicitly reload.

## Acceptance criteria

- `DrawingBoard.tsx` no longer contains shared domain types or pure canvas helper functions.
- Export behavior stays covered by the existing image/text export tests.
- `LeaveNoteForm` continues using the same imperative ref contract unchanged.

## Test additions

- Add a focused export test around overlay ordering for `brush` vs `text` mode.
- Add unit-level coverage for wrapped text and font-family mapping if those utilities become independently testable.
