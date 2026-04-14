export type ToolMode = "brush" | "text";

export type CanvasFontKey =
  | "nunito"
  | "merriweather"
  | "space-mono"
  | "caveat";

export type CanvasTextBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  fontKey: CanvasFontKey;
  rotationDeg: number;
  scale: number;
};

export type CanvasImageItem = {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  scale: number;
};

export type InteractionState = {
  mode: "drag" | "resize";
  id: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
};

export type ImageInteractionState = {
  mode: "drag" | "resize";
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  startScale: number;
};

export type TouchTransformState = {
  id: string;
  startDistance: number;
  startAngle: number;
  startRotationDeg: number;
  startScale: number;
  targetRotationDeg: number;
  targetScale: number;
};

export type TouchDragState = {
  id: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  hasMoved: boolean;
};

export type TextTouchInteractionMode = "idle" | "dragging" | "transforming";

export type ImageTouchTransformState = {
  startDistance: number;
  startAngle: number;
  startRotationDeg: number;
  startScale: number;
  startWidth: number;
  startHeight: number;
  targetRotationDeg: number;
  targetScale: number;
};

export type ImageTouchDragState = {
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  hasMoved: boolean;
};

export type TouchPoint = {
  clientX: number;
  clientY: number;
};
