import type { ChangeEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { CANVAS_TEXT_FONT_OPTIONS } from "@/components/drawing-board/constants";
import type { CanvasFontKey, ToolMode } from "@/components/drawing-board/types";

type DrawingBoardToolbarProps = {
  toolMode: ToolMode;
  brushColor: string;
  brushSize: number;
  selectedTextFontKey: CanvasFontKey;
  brushSizeInputRef: RefObject<HTMLInputElement | null>;
  uploadImageInputRef: RefObject<HTMLInputElement | null>;
  onToolModeChange: (nextMode: ToolMode) => void;
  onBrushColorChange: (value: string) => void;
  onTextFontChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onBrushSizeChange: (value: number) => void;
  onBrushPointerDown: (event: ReactPointerEvent<HTMLInputElement>) => void;
  onBrushPointerMove: (event: ReactPointerEvent<HTMLInputElement>) => void;
  onBrushPointerEnd: (event: ReactPointerEvent<HTMLInputElement>) => void;
  onUploadImageChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
};

export function DrawingBoardToolbar({
  toolMode,
  brushColor,
  brushSize,
  selectedTextFontKey,
  brushSizeInputRef,
  uploadImageInputRef,
  onToolModeChange,
  onBrushColorChange,
  onTextFontChange,
  onBrushSizeChange,
  onBrushPointerDown,
  onBrushPointerMove,
  onBrushPointerEnd,
  onUploadImageChange,
  onClear,
}: DrawingBoardToolbarProps) {
  return (
    <div className="border border-slate-200 bg-slate-50/80 p-3">
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="flex items-center border border-slate-300 bg-white">
          <button
            className={`border-r border-slate-300 px-3 py-2 text-sm font-semibold transition ${
              toolMode === "brush"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 hover:bg-slate-100"
            }`}
            onClick={() => onToolModeChange("brush")}
            type="button"
          >
            Brush
          </button>
          <button
            className={`px-3 py-2 text-sm font-semibold transition ${
              toolMode === "text"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 hover:bg-slate-100"
            }`}
            onClick={() => onToolModeChange("text")}
            type="button"
          >
            Text
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          Color
          <input
            aria-label="Brush color"
            className="h-9 w-11 cursor-pointer border border-slate-300 bg-white"
            onChange={(event) => onBrushColorChange(event.target.value)}
            type="color"
            value={brushColor}
          />
        </label>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          Font
          <select
            aria-label="Text font"
            className="border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700"
            data-canvas-font-picker="true"
            onChange={onTextFontChange}
            value={selectedTextFontKey}
          >
            {CANVAS_TEXT_FONT_OPTIONS.map((fontOption) => (
              <option key={fontOption.key} value={fontOption.key}>
                {fontOption.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[210px] flex-1 items-center gap-2 text-sm font-medium text-slate-700">
          Brush size
          <input
            aria-label="Brush size"
            className="w-full accent-slate-700"
            max={20}
            min={1}
            onChange={(event) => onBrushSizeChange(Number(event.currentTarget.value))}
            onInput={(event) => onBrushSizeChange(Number(event.currentTarget.value))}
            onLostPointerCapture={onBrushPointerEnd}
            onPointerCancel={onBrushPointerEnd}
            onPointerDown={onBrushPointerDown}
            onPointerMove={onBrushPointerMove}
            onPointerUp={onBrushPointerEnd}
            ref={brushSizeInputRef}
            style={{ touchAction: "none" }}
            type="range"
            value={brushSize}
          />
          <span className="min-w-10 text-right text-xs font-semibold text-slate-500">
            {brushSize}px
          </span>
        </label>

        <button
          className="border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
          onClick={() => uploadImageInputRef.current?.click()}
          type="button"
        >
          Upload image
        </button>
        <input
          accept="image/*"
          aria-label="Upload image file"
          className="hidden"
          onChange={onUploadImageChange}
          ref={uploadImageInputRef}
          type="file"
        />

        <button
          className="border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
          onClick={onClear}
          type="button"
        >
          Clear
        </button>
      </div>

      <p className="mt-2 text-xs font-medium text-slate-500">
        {toolMode === "text"
          ? "Text mode: tap to place text, click text to edit, drag text to move, drag near the lower-right text area to resize, and paste/upload one image."
          : "Brush mode: draw freely on the canvas."}
      </p>
    </div>
  );
}
