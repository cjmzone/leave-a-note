import type { CanvasFontKey } from "@/components/drawing-board/types";

export const DEFAULT_COLOR = "#000000";
export const DEFAULT_BRUSH_SIZE = 4;
export const DEFAULT_TEXT_BOX_WIDTH = 220;
export const DEFAULT_TEXT_BOX_HEIGHT = 84;
export const TEXT_BOX_MIN_WIDTH = 100;
export const TEXT_BOX_MIN_HEIGHT = 56;
export const TEXT_BOX_INNER_PADDING = 8;
export const TEXT_BOX_DRAG_BAR_HEIGHT = 0;

export const CANVAS_MAX_WIDTH = 1040;
export const CANVAS_MIN_WIDTH = 320;
export const CANVAS_HEIGHT_RATIO = 1.08;
export const IMAGE_MIN_WIDTH = 64;
export const IMAGE_MIN_HEIGHT = 64;
export const TEXT_SCALE_MIN = 0.5;
export const TEXT_SCALE_MAX = 4;
export const TOUCH_DRAG_THRESHOLD_PX = 4;
export const DEFAULT_TEXT_FONT_KEY: CanvasFontKey = "nunito";

export const CANVAS_TEXT_FONT_FAMILIES: Record<CanvasFontKey, string> = {
  nunito: "\"Nunito\", \"Helvetica Neue\", Arial, sans-serif",
  merriweather: "\"Merriweather\", Georgia, serif",
  "space-mono": "\"Space Mono\", \"Courier New\", monospace",
  caveat: "\"Caveat\", \"Brush Script MT\", cursive",
};

export const CANVAS_TEXT_FONT_OPTIONS: Array<{
  key: CanvasFontKey;
  label: string;
}> = [
  { key: "nunito", label: "Rounded" },
  { key: "merriweather", label: "Serif" },
  { key: "space-mono", label: "Mono" },
  { key: "caveat", label: "Handwritten" },
];
