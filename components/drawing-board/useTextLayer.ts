import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FocusEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type SetStateAction,
  type TouchEvent as ReactTouchEvent,
} from "react";
import {
  DEFAULT_TEXT_BOX_HEIGHT,
  DEFAULT_TEXT_BOX_WIDTH,
  DEFAULT_TEXT_FONT_KEY,
  TEXT_BOX_MIN_HEIGHT,
  TEXT_BOX_MIN_WIDTH,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  TOUCH_DRAG_THRESHOLD_PX,
} from "@/components/drawing-board/constants";
import type {
  CanvasFontKey,
  CanvasTextBox,
  InteractionState,
  TextTouchInteractionMode,
  ToolMode,
  TouchDragState,
  TouchTransformState,
} from "@/components/drawing-board/types";
import {
  clamp,
  createTextBoxId,
  getTouchMetrics,
  normalizeAngleDeltaDegrees,
  normalizeAngleDeltaRadians,
} from "@/components/drawing-board/utils";

type UseTextLayerOptions = {
  brushColor: string;
  canvasElementRef: RefObject<HTMLCanvasElement | null>;
  canvasSize: { width: number; height: number };
  toolMode: ToolMode;
  setToolMode: Dispatch<SetStateAction<ToolMode>>;
};

export function useTextLayer({
  brushColor,
  canvasElementRef,
  canvasSize,
  toolMode,
  setToolMode,
}: UseTextLayerOptions) {
  const [textBoxes, setTextBoxes] = useState<CanvasTextBox[]>([]);
  const [activeTextBoxId, setActiveTextBoxId] = useState<string | null>(null);
  const [selectedTextFontKey, setSelectedTextFontKey] =
    useState<CanvasFontKey>(DEFAULT_TEXT_FONT_KEY);

  const interactionRef = useRef<InteractionState | null>(null);
  const touchTransformRef = useRef<TouchTransformState | null>(null);
  const touchDragRef = useRef<TouchDragState | null>(null);
  const suppressTextClickIdRef = useRef<string | null>(null);
  const suppressTextClickTimeoutRef = useRef<number | null>(null);
  const activeTextTouchElementRef = useRef<HTMLElement | null>(null);
  const textTouchInteractionModeRef = useRef<TextTouchInteractionMode>("idle");
  const textAreaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    return () => {
      if (suppressTextClickTimeoutRef.current) {
        window.clearTimeout(suppressTextClickTimeoutRef.current);
        suppressTextClickTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleWindowMouseMove = (event: MouseEvent) => {
      const interaction = interactionRef.current;

      if (!interaction) {
        return;
      }

      const deltaX = event.clientX - interaction.startClientX;
      const deltaY = event.clientY - interaction.startClientY;

      setTextBoxes((currentBoxes) =>
        currentBoxes.map((box) => {
          if (box.id !== interaction.id) {
            return box;
          }

          if (interaction.mode === "drag") {
            // Freeform text is intentionally unclamped so users can stage content
            // partially off-canvas and drag it back later.
            return {
              ...box,
              x: interaction.startX + deltaX,
              y: interaction.startY + deltaY,
            };
          }

          const widthLimit = Math.max(
            TEXT_BOX_MIN_WIDTH,
            canvasSize.width - interaction.startX
          );
          const heightLimit = Math.max(
            TEXT_BOX_MIN_HEIGHT,
            canvasSize.height - interaction.startY
          );

          return {
            ...box,
            width: clamp(
              interaction.startWidth + deltaX,
              TEXT_BOX_MIN_WIDTH,
              widthLimit
            ),
            height: clamp(
              interaction.startHeight + deltaY,
              TEXT_BOX_MIN_HEIGHT,
              heightLimit
            ),
          };
        })
      );
    };

    const handleWindowMouseUp = () => {
      interactionRef.current = null;
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [canvasSize.height, canvasSize.width]);

  const focusTextBox = useCallback((boxId: string) => {
    window.setTimeout(() => {
      textAreaRefs.current[boxId]?.focus();
    }, 0);
  }, []);

  const activateTextBox = useCallback(
    (boxId: string) => {
      const targetBox = textBoxes.find((box) => box.id === boxId);

      if (targetBox) {
        setSelectedTextFontKey(targetBox.fontKey);
      }

      setToolMode("text");
      setActiveTextBoxId(boxId);
      focusTextBox(boxId);
    },
    [focusTextBox, setToolMode, textBoxes]
  );

  const suppressNextTextClick = useCallback((boxId: string) => {
    suppressTextClickIdRef.current = boxId;
    if (suppressTextClickTimeoutRef.current) {
      window.clearTimeout(suppressTextClickTimeoutRef.current);
    }
    suppressTextClickTimeoutRef.current = window.setTimeout(() => {
      suppressTextClickIdRef.current = null;
      suppressTextClickTimeoutRef.current = null;
    }, 400);
  }, []);

  const releaseTextTouchOwnership = useCallback(() => {
    touchTransformRef.current = null;
    touchDragRef.current = null;
    textTouchInteractionModeRef.current = "idle";
    if (activeTextTouchElementRef.current) {
      activeTextTouchElementRef.current.style.touchAction = "manipulation";
      activeTextTouchElementRef.current = null;
    }
  }, []);

  const cleanupEmptyTextBoxes = useCallback(() => {
    setTextBoxes((currentBoxes) =>
      currentBoxes.filter((box) => box.text.trim().length > 0)
    );
  }, []);

  const resetTextTouchState = useCallback(() => {
    releaseTextTouchOwnership();
  }, [releaseTextTouchOwnership]);

  const resetTextLayer = useCallback(() => {
    setTextBoxes([]);
    setActiveTextBoxId(null);
    interactionRef.current = null;
    suppressTextClickIdRef.current = null;
    if (suppressTextClickTimeoutRef.current) {
      window.clearTimeout(suppressTextClickTimeoutRef.current);
      suppressTextClickTimeoutRef.current = null;
    }
    releaseTextTouchOwnership();
  }, [releaseTextTouchOwnership]);

  const resizeTextLayer = useCallback(
    (
      nextCanvasSize: { width: number; height: number },
      previousCanvasSize: { width: number; height: number }
    ) => {
      if (previousCanvasSize.width <= 0 || previousCanvasSize.height <= 0) {
        return;
      }

      const scaleX = nextCanvasSize.width / previousCanvasSize.width;
      const scaleY = nextCanvasSize.height / previousCanvasSize.height;

      setTextBoxes((currentBoxes) =>
        currentBoxes.map((box) => ({
          ...box,
          x: box.x * scaleX,
          y: box.y * scaleY,
          width: box.width * scaleX,
          height: box.height * scaleY,
        }))
      );
    },
    []
  );

  const handleTextFontChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextFontKey = event.currentTarget.value as CanvasFontKey;
      setSelectedTextFontKey(nextFontKey);

      if (!activeTextBoxId) {
        return;
      }

      setTextBoxes((currentBoxes) =>
        currentBoxes.map((currentBox) =>
          currentBox.id === activeTextBoxId
            ? { ...currentBox, fontKey: nextFontKey }
            : currentBox
        )
      );
    },
    [activeTextBoxId]
  );

  const handleCanvasMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (toolMode !== "text") {
        return;
      }

      const canvasElement = canvasElementRef.current;

      if (!canvasElement || event.target !== canvasElement) {
        return;
      }

      const bounds = canvasElement.getBoundingClientRect();
      const clickX = event.clientX - bounds.left;
      const clickY = event.clientY - bounds.top;
      const width = clamp(
        DEFAULT_TEXT_BOX_WIDTH,
        TEXT_BOX_MIN_WIDTH,
        Math.max(TEXT_BOX_MIN_WIDTH, canvasSize.width)
      );
      const height = clamp(
        DEFAULT_TEXT_BOX_HEIGHT,
        TEXT_BOX_MIN_HEIGHT,
        Math.max(TEXT_BOX_MIN_HEIGHT, canvasSize.height)
      );
      const id = createTextBoxId();

      setTextBoxes((currentBoxes) => [
        ...currentBoxes,
        {
          id,
          x: clickX,
          y: clickY,
          width,
          height,
          text: "",
          color: brushColor,
          fontKey: selectedTextFontKey,
          rotationDeg: 0,
          scale: 1,
        },
      ]);
      setActiveTextBoxId(id);
      focusTextBox(id);
    },
    [
      brushColor,
      canvasElementRef,
      canvasSize.height,
      canvasSize.width,
      focusTextBox,
      selectedTextFontKey,
      toolMode,
    ]
  );

  const handlePlacedTextClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, boxId: string) => {
      if (suppressTextClickIdRef.current === boxId) {
        suppressTextClickIdRef.current = null;
        event.preventDefault();
        return;
      }

      activateTextBox(boxId);
    },
    [activateTextBox]
  );

  const handleEditingTextChange = useCallback((boxId: string, nextValue: string) => {
    setTextBoxes((currentBoxes) =>
      currentBoxes.map((currentBox) =>
        currentBox.id === boxId ? { ...currentBox, text: nextValue } : currentBox
      )
    );
  }, []);

  const handleEditingTextBlur = useCallback(
    (event: FocusEvent<HTMLTextAreaElement>, boxId: string) => {
      if (
        event.relatedTarget instanceof Element &&
        event.relatedTarget.closest("[data-canvas-font-picker='true']")
      ) {
        focusTextBox(boxId);
        return;
      }

      setTextBoxes((currentBoxes) => {
        const currentBox = currentBoxes.find((box) => box.id === boxId);

        if (!currentBox) {
          return currentBoxes;
        }

        if (!currentBox.text.trim()) {
          return currentBoxes.filter((box) => box.id !== boxId);
        }

        return currentBoxes;
      });
      setActiveTextBoxId((currentActiveId) =>
        currentActiveId === boxId ? null : currentActiveId
      );
    },
    [focusTextBox]
  );

  const startDrag = useCallback(
    (event: ReactMouseEvent, boxId: string) => {
      event.preventDefault();
      event.stopPropagation();

      const box = textBoxes.find((item) => item.id === boxId);

      if (!box) {
        return;
      }

      interactionRef.current = {
        mode: "drag",
        id: box.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: box.x,
        startY: box.y,
        startWidth: box.width,
        startHeight: box.height,
      };
    },
    [textBoxes]
  );

  const startResize = useCallback(
    (event: ReactMouseEvent, boxId: string) => {
      event.preventDefault();
      event.stopPropagation();

      const box = textBoxes.find((item) => item.id === boxId);

      if (!box) {
        return;
      }

      interactionRef.current = {
        mode: "resize",
        id: box.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: box.x,
        startY: box.y,
        startWidth: box.width,
        startHeight: box.height,
      };
    },
    [textBoxes]
  );

  const startTouchTransform = useCallback(
    (event: ReactTouchEvent, boxId: string) => {
      if (toolMode !== "text" || event.touches.length !== 2) {
        return;
      }

      const box = textBoxes.find((item) => item.id === boxId);

      if (!box) {
        return;
      }

      const touchPoints = Array.from(event.touches)
        .map((touch) => ({
          identifier: touch.identifier,
          clientX: touch.clientX,
          clientY: touch.clientY,
        }))
        .sort((left, right) => left.identifier - right.identifier);
      const touchA = touchPoints[0];
      const touchB = touchPoints[1];

      if (!touchA || !touchB) {
        return;
      }

      const { distance, angle } = getTouchMetrics(touchA, touchB);

      if (distance <= 0) {
        return;
      }

      activeTextTouchElementRef.current = event.currentTarget as HTMLElement;
      activeTextTouchElementRef.current.style.touchAction = "none";
      touchDragRef.current = null;
      textTouchInteractionModeRef.current = "transforming";

      touchTransformRef.current = {
        id: boxId,
        startDistance: distance,
        startAngle: angle,
        startRotationDeg: box.rotationDeg,
        startScale: box.scale,
        targetRotationDeg: box.rotationDeg,
        targetScale: box.scale,
      };

      event.preventDefault();
      event.stopPropagation();
    },
    [textBoxes, toolMode]
  );

  const moveTouchTransform = useCallback((event: ReactTouchEvent, boxId: string) => {
    const interaction = touchTransformRef.current;

    if (
      textTouchInteractionModeRef.current !== "transforming" ||
      !interaction ||
      interaction.id !== boxId ||
      event.touches.length !== 2
    ) {
      return;
    }

    const touchPoints = Array.from(event.touches)
      .map((touch) => ({
        identifier: touch.identifier,
        clientX: touch.clientX,
        clientY: touch.clientY,
      }))
      .sort((left, right) => left.identifier - right.identifier);
    const touchA = touchPoints[0];
    const touchB = touchPoints[1];

    if (!touchA || !touchB) {
      return;
    }

    const { distance, angle } = getTouchMetrics(touchA, touchB);
    const scaleRatio = distance / Math.max(1, interaction.startDistance);
    const rotationDeltaRad = normalizeAngleDeltaRadians(angle - interaction.startAngle);
    const rotationDeltaDeg = (rotationDeltaRad * 180) / Math.PI;
    const targetScale = clamp(
      interaction.startScale * scaleRatio,
      TEXT_SCALE_MIN,
      TEXT_SCALE_MAX
    );
    const targetRotationDeg = interaction.startRotationDeg + rotationDeltaDeg;

    interaction.targetScale = targetScale;
    interaction.targetRotationDeg = targetRotationDeg;

    setTextBoxes((currentBoxes) =>
      currentBoxes.map((currentBox) =>
        currentBox.id === boxId
          ? {
              ...currentBox,
              scale: currentBox.scale + (targetScale - currentBox.scale) * 0.45,
              rotationDeg:
                currentBox.rotationDeg +
                normalizeAngleDeltaDegrees(targetRotationDeg - currentBox.rotationDeg) *
                  0.45,
            }
          : currentBox
      )
    );

    event.preventDefault();
    event.stopPropagation();
  }, []);

  const endTouchTransform = useCallback((event: ReactTouchEvent, boxId: string) => {
    const interaction = touchTransformRef.current;

    if (!interaction || interaction.id !== boxId) {
      return;
    }

    if (event.touches.length < 2) {
      setTextBoxes((currentBoxes) =>
        currentBoxes.map((currentBox) =>
          currentBox.id === boxId
            ? {
                ...currentBox,
                scale: interaction.targetScale,
                rotationDeg: interaction.targetRotationDeg,
              }
            : currentBox
        )
      );
      releaseTextTouchOwnership();
    }
  }, [releaseTextTouchOwnership]);

  const startTouchDrag = useCallback(
    (event: ReactTouchEvent, boxId: string) => {
      if (toolMode !== "text" || event.touches.length !== 1) {
        return;
      }

      const box = textBoxes.find((item) => item.id === boxId);

      if (!box) {
        return;
      }

      const touch = event.touches[0];
      touchDragRef.current = {
        id: boxId,
        startClientX: touch.clientX,
        startClientY: touch.clientY,
        startX: box.x,
        startY: box.y,
        hasMoved: false,
      };
      touchTransformRef.current = null;
      textTouchInteractionModeRef.current = "dragging";
      activeTextTouchElementRef.current = event.currentTarget as HTMLElement;
      activeTextTouchElementRef.current.style.touchAction = "none";

      event.preventDefault();
      event.stopPropagation();
    },
    [textBoxes, toolMode]
  );

  const moveTouchDrag = useCallback((event: ReactTouchEvent, boxId: string) => {
    const dragInteraction = touchDragRef.current;

    if (
      textTouchInteractionModeRef.current !== "dragging" ||
      !dragInteraction ||
      dragInteraction.id !== boxId ||
      event.touches.length !== 1
    ) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - dragInteraction.startClientX;
    const deltaY = touch.clientY - dragInteraction.startClientY;

    if (!dragInteraction.hasMoved) {
      if (Math.hypot(deltaX, deltaY) < TOUCH_DRAG_THRESHOLD_PX) {
        return;
      }

      dragInteraction.hasMoved = true;
      activeTextTouchElementRef.current = event.currentTarget as HTMLElement;
      activeTextTouchElementRef.current.style.touchAction = "none";
    }

    setTextBoxes((currentBoxes) =>
      currentBoxes.map((currentBox) =>
        currentBox.id === boxId
          ? {
              ...currentBox,
              x: dragInteraction.startX + deltaX,
              y: dragInteraction.startY + deltaY,
            }
          : currentBox
      )
    );

    event.preventDefault();
    event.stopPropagation();
  }, []);

  const endTouchDrag = useCallback(
    (event: ReactTouchEvent, boxId: string) => {
      const dragInteraction = touchDragRef.current;

      if (!dragInteraction || dragInteraction.id !== boxId) {
        return;
      }

      if (dragInteraction.hasMoved) {
        suppressNextTextClick(boxId);
        event.preventDefault();
        event.stopPropagation();
      } else if (event.touches.length === 0) {
        suppressNextTextClick(boxId);
        activateTextBox(boxId);
        event.preventDefault();
        event.stopPropagation();
      }

      touchDragRef.current = null;
      releaseTextTouchOwnership();
    },
    [activateTextBox, releaseTextTouchOwnership, suppressNextTextClick]
  );

  const handlePlacedTextTouchStart = useCallback(
    (event: ReactTouchEvent, boxId: string) => {
      if (event.touches.length === 2) {
        startTouchTransform(event, boxId);
        return;
      }

      startTouchDrag(event, boxId);
    },
    [startTouchDrag, startTouchTransform]
  );

  const handlePlacedTextTouchMove = useCallback(
    (event: ReactTouchEvent, boxId: string) => {
      if (
        event.touches.length === 2 &&
        textTouchInteractionModeRef.current !== "transforming"
      ) {
        startTouchTransform(event, boxId);
        return;
      }

      if (textTouchInteractionModeRef.current === "transforming") {
        moveTouchTransform(event, boxId);
        return;
      }

      if (textTouchInteractionModeRef.current === "dragging") {
        moveTouchDrag(event, boxId);
        return;
      }

      if (event.touches.length === 2) {
        startTouchTransform(event, boxId);
      }
    },
    [moveTouchDrag, moveTouchTransform, startTouchTransform]
  );

  const handlePlacedTextTouchEnd = useCallback(
    (event: ReactTouchEvent, boxId: string) => {
      endTouchTransform(event, boxId);
      endTouchDrag(event, boxId);
    },
    [endTouchDrag, endTouchTransform]
  );

  return {
    activeTextBoxId,
    activeTextTouchElementRef,
    cleanupEmptyTextBoxes,
    endTouchTransform,
    handleCanvasMouseDown,
    handleEditingTextBlur,
    handleEditingTextChange,
    handlePlacedTextClick,
    handlePlacedTextTouchEnd,
    handlePlacedTextTouchMove,
    handlePlacedTextTouchStart,
    handleTextFontChange,
    resizeTextLayer,
    resetTextLayer,
    resetTextTouchState,
    selectedTextFontKey,
    setActiveTextBoxId,
    textAreaRefs,
    textBoxes,
    textTouchInteractionModeRef,
    startDrag,
    startResize,
    startTouchTransform,
    moveTouchTransform,
  };
}
