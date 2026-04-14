import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import {
  IMAGE_MIN_HEIGHT,
  IMAGE_MIN_WIDTH,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  TOUCH_DRAG_THRESHOLD_PX,
} from "@/components/drawing-board/constants";
import type {
  CanvasImageItem,
  ImageInteractionState,
  ImageTouchDragState,
  ImageTouchTransformState,
  TextTouchInteractionMode,
  ToolMode,
} from "@/components/drawing-board/types";
import {
  clamp,
  getTouchMetrics,
  loadImageElement,
  normalizeAngleDeltaDegrees,
  normalizeAngleDeltaRadians,
  readFileAsDataUrl,
} from "@/components/drawing-board/utils";

type UseImageLayerOptions = {
  canvasSize: { width: number; height: number };
  toolMode: ToolMode;
};

export function useImageLayer({ canvasSize, toolMode }: UseImageLayerOptions) {
  const [insertedImage, setInsertedImage] = useState<CanvasImageItem | null>(null);
  const [isImageSelected, setIsImageSelected] = useState(false);

  const imageInteractionRef = useRef<ImageInteractionState | null>(null);
  const imageTouchTransformRef = useRef<ImageTouchTransformState | null>(null);
  const imageTouchDragRef = useRef<ImageTouchDragState | null>(null);
  const activeImageTouchElementRef = useRef<HTMLElement | null>(null);
  const imageTouchInteractionModeRef = useRef<TextTouchInteractionMode>("idle");
  const insertedImageElementRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const handleWindowMouseMove = (event: MouseEvent) => {
      const imageInteraction = imageInteractionRef.current;

      if (!imageInteraction) {
        return;
      }

      const imageDeltaX = event.clientX - imageInteraction.startClientX;
      const imageDeltaY = event.clientY - imageInteraction.startClientY;

      setInsertedImage((currentImage) => {
        if (!currentImage) {
          return currentImage;
        }

        if (imageInteraction.mode === "drag") {
          const maxX = Math.max(0, canvasSize.width - currentImage.width);
          const maxY = Math.max(0, canvasSize.height - currentImage.height);

          return {
            ...currentImage,
            x: clamp(imageInteraction.startX + imageDeltaX, 0, maxX),
            y: clamp(imageInteraction.startY + imageDeltaY, 0, maxY),
          };
        }

        const safeStartWidth = Math.max(1, imageInteraction.startWidth);
        const safeStartHeight = Math.max(1, imageInteraction.startHeight);
        const scaleByX = (imageInteraction.startWidth + imageDeltaX) / safeStartWidth;
        const scaleByY = (imageInteraction.startHeight + imageDeltaY) / safeStartHeight;
        const rawScale =
          Math.abs(scaleByY - 1) > Math.abs(scaleByX - 1) ? scaleByY : scaleByX;
        const minScale = Math.max(
          IMAGE_MIN_WIDTH / safeStartWidth,
          IMAGE_MIN_HEIGHT / safeStartHeight
        );
        const maxScaleByWidth = (canvasSize.width - imageInteraction.startX) / safeStartWidth;
        const maxScaleByHeight =
          (canvasSize.height - imageInteraction.startY) / safeStartHeight;
        const maxScale = Math.max(minScale, Math.min(maxScaleByWidth, maxScaleByHeight));
        const scale = clamp(rawScale, minScale, maxScale);
        const nextWidth = Math.round(safeStartWidth * scale);
        const nextHeight = Math.round(safeStartHeight * scale);
        const widthScaleRatio = nextWidth / Math.max(1, safeStartWidth);

        return {
          ...currentImage,
          width: nextWidth,
          height: nextHeight,
          scale: imageInteraction.startScale * widthScaleRatio,
        };
      });
    };

    const handleWindowMouseUp = () => {
      imageInteractionRef.current = null;
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [canvasSize.height, canvasSize.width]);

  const insertImageFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        return;
      }

      const src = await readFileAsDataUrl(file);
      const loadedImage = await loadImageElement(src);
      const imageWidth = Math.max(1, loadedImage.naturalWidth || 1);
      const imageHeight = Math.max(1, loadedImage.naturalHeight || 1);
      const maxWidth = Math.max(IMAGE_MIN_WIDTH, canvasSize.width * 0.8);
      const maxHeight = Math.max(IMAGE_MIN_HEIGHT, canvasSize.height * 0.8);
      const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight, 1);
      const width = clamp(Math.round(imageWidth * scale), IMAGE_MIN_WIDTH, canvasSize.width);
      const height = clamp(
        Math.round(imageHeight * scale),
        IMAGE_MIN_HEIGHT,
        canvasSize.height
      );

      setInsertedImage({
        src,
        x: Math.round((canvasSize.width - width) / 2),
        y: Math.round((canvasSize.height - height) / 2),
        width,
        height,
        rotationDeg: 0,
        scale: 1,
      });
      setIsImageSelected(true);
    },
    [canvasSize.height, canvasSize.width]
  );

  useEffect(() => {
    const handleWindowPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;

      if (!items) {
        return;
      }

      const imageItem = Array.from(items).find((item) => item.type.startsWith("image/"));

      if (!imageItem) {
        return;
      }

      const file = imageItem.getAsFile();

      if (!file) {
        return;
      }

      event.preventDefault();
      void insertImageFile(file);
    };

    window.addEventListener("paste", handleWindowPaste);

    return () => {
      window.removeEventListener("paste", handleWindowPaste);
    };
  }, [insertImageFile]);

  const releaseImageTouchOwnership = useCallback(() => {
    imageTouchTransformRef.current = null;
    imageTouchDragRef.current = null;
    imageTouchInteractionModeRef.current = "idle";
    if (activeImageTouchElementRef.current) {
      activeImageTouchElementRef.current.style.touchAction = "manipulation";
      activeImageTouchElementRef.current = null;
    }
  }, []);

  const startImageTouchTransform = useCallback(
    (event: ReactTouchEvent) => {
      if (toolMode !== "text" || !insertedImage || event.touches.length !== 2) {
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

      setIsImageSelected(true);
      imageTouchDragRef.current = null;
      imageTouchInteractionModeRef.current = "transforming";
      activeImageTouchElementRef.current = event.currentTarget as HTMLElement;
      activeImageTouchElementRef.current.style.touchAction = "none";
      imageTouchTransformRef.current = {
        startDistance: distance,
        startAngle: angle,
        startRotationDeg: insertedImage.rotationDeg,
        startScale: insertedImage.scale,
        startWidth: insertedImage.width,
        startHeight: insertedImage.height,
        targetRotationDeg: insertedImage.rotationDeg,
        targetScale: insertedImage.scale,
      };

      event.preventDefault();
      event.stopPropagation();
    },
    [insertedImage, toolMode]
  );

  const moveImageTouchTransform = useCallback(
    (event: ReactTouchEvent) => {
      const interaction = imageTouchTransformRef.current;

      if (
        imageTouchInteractionModeRef.current !== "transforming" ||
        !interaction ||
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

      setInsertedImage((currentImage) => {
        if (!currentImage) {
          return currentImage;
        }

        const nextScale = currentImage.scale + (targetScale - currentImage.scale) * 0.45;
        const scaleRatioFromCurrent = nextScale / Math.max(0.001, currentImage.scale);

        return {
          ...currentImage,
          width: clamp(
            Math.round(currentImage.width * scaleRatioFromCurrent),
            IMAGE_MIN_WIDTH,
            canvasSize.width
          ),
          height: clamp(
            Math.round(currentImage.height * scaleRatioFromCurrent),
            IMAGE_MIN_HEIGHT,
            canvasSize.height
          ),
          scale: nextScale,
          rotationDeg:
            currentImage.rotationDeg +
            normalizeAngleDeltaDegrees(targetRotationDeg - currentImage.rotationDeg) * 0.45,
        };
      });

      event.preventDefault();
      event.stopPropagation();
    },
    [canvasSize.height, canvasSize.width]
  );

  const endImageTouchTransform = useCallback(
    (event: ReactTouchEvent) => {
      const interaction = imageTouchTransformRef.current;

      if (!interaction) {
        return;
      }

      if (event.touches.length < 2) {
        const finalScaleRatio =
          interaction.targetScale / Math.max(0.001, interaction.startScale);
        setInsertedImage((currentImage) => {
          if (!currentImage) {
            return currentImage;
          }

          return {
            ...currentImage,
            width: clamp(
              Math.round(interaction.startWidth * finalScaleRatio),
              IMAGE_MIN_WIDTH,
              canvasSize.width
            ),
            height: clamp(
              Math.round(interaction.startHeight * finalScaleRatio),
              IMAGE_MIN_HEIGHT,
              canvasSize.height
            ),
            scale: interaction.targetScale,
            rotationDeg: interaction.targetRotationDeg,
          };
        });
        releaseImageTouchOwnership();
      }
    },
    [canvasSize.height, canvasSize.width, releaseImageTouchOwnership]
  );

  const startImageTouchDrag = useCallback(
    (event: ReactTouchEvent) => {
      if (toolMode !== "text" || !insertedImage || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      setIsImageSelected(true);
      imageTouchTransformRef.current = null;
      imageTouchDragRef.current = {
        startClientX: touch.clientX,
        startClientY: touch.clientY,
        startX: insertedImage.x,
        startY: insertedImage.y,
        hasMoved: false,
      };
      imageTouchInteractionModeRef.current = "dragging";
      activeImageTouchElementRef.current = event.currentTarget as HTMLElement;
      activeImageTouchElementRef.current.style.touchAction = "none";

      event.preventDefault();
      event.stopPropagation();
    },
    [insertedImage, toolMode]
  );

  const moveImageTouchDrag = useCallback(
    (event: ReactTouchEvent) => {
      const dragInteraction = imageTouchDragRef.current;

      if (
        imageTouchInteractionModeRef.current !== "dragging" ||
        !dragInteraction ||
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
        activeImageTouchElementRef.current = event.currentTarget as HTMLElement;
        activeImageTouchElementRef.current.style.touchAction = "none";
      }

      setInsertedImage((currentImage) => {
        if (!currentImage) {
          return currentImage;
        }

        const maxX = Math.max(0, canvasSize.width - currentImage.width);
        const maxY = Math.max(0, canvasSize.height - currentImage.height);

        return {
          ...currentImage,
          x: clamp(dragInteraction.startX + deltaX, 0, maxX),
          y: clamp(dragInteraction.startY + deltaY, 0, maxY),
        };
      });

      event.preventDefault();
      event.stopPropagation();
    },
    [canvasSize.height, canvasSize.width]
  );

  const endImageTouchDrag = useCallback(
    (event: ReactTouchEvent) => {
      const dragInteraction = imageTouchDragRef.current;

      if (!dragInteraction) {
        return;
      }

      if (dragInteraction.hasMoved) {
        event.preventDefault();
        event.stopPropagation();
      }

      imageTouchDragRef.current = null;
      releaseImageTouchOwnership();
    },
    [releaseImageTouchOwnership]
  );

  const handleImageTouchStart = useCallback(
    (event: ReactTouchEvent) => {
      if (event.touches.length === 2) {
        startImageTouchTransform(event);
        return;
      }

      startImageTouchDrag(event);
    },
    [startImageTouchDrag, startImageTouchTransform]
  );

  const handleImageTouchMove = useCallback(
    (event: ReactTouchEvent) => {
      if (
        event.touches.length === 2 &&
        imageTouchInteractionModeRef.current !== "transforming"
      ) {
        startImageTouchTransform(event);
        return;
      }

      if (imageTouchInteractionModeRef.current === "transforming") {
        moveImageTouchTransform(event);
        return;
      }

      if (imageTouchInteractionModeRef.current === "dragging") {
        moveImageTouchDrag(event);
      }
    },
    [moveImageTouchDrag, moveImageTouchTransform, startImageTouchTransform]
  );

  const handleImageTouchEnd = useCallback(
    (event: ReactTouchEvent) => {
      endImageTouchTransform(event);
      endImageTouchDrag(event);
    },
    [endImageTouchDrag, endImageTouchTransform]
  );

  const startImageDrag = useCallback(
    (event: ReactMouseEvent) => {
      if (!insertedImage || toolMode !== "text") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setIsImageSelected(true);

      imageInteractionRef.current = {
        mode: "drag",
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: insertedImage.x,
        startY: insertedImage.y,
        startWidth: insertedImage.width,
        startHeight: insertedImage.height,
        startScale: insertedImage.scale,
      };
    },
    [insertedImage, toolMode]
  );

  const startImageResize = useCallback(
    (event: ReactMouseEvent) => {
      if (!insertedImage || toolMode !== "text") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setIsImageSelected(true);

      imageInteractionRef.current = {
        mode: "resize",
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: insertedImage.x,
        startY: insertedImage.y,
        startWidth: insertedImage.width,
        startHeight: insertedImage.height,
        startScale: insertedImage.scale,
      };
    },
    [insertedImage, toolMode]
  );

  const handleUploadImageChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];

      if (file) {
        void insertImageFile(file);
      }

      event.currentTarget.value = "";
    },
    [insertImageFile]
  );

  const handleCanvasMouseDownCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!insertedImage) {
        return;
      }

      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest("[data-canvas-image-root='true']")) {
        return;
      }

      setIsImageSelected(false);
    },
    [insertedImage]
  );

  const handleCanvasTouchStartCapture = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!insertedImage) {
        return;
      }

      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest("[data-canvas-image-root='true']")) {
        return;
      }

      setIsImageSelected(false);
    },
    [insertedImage]
  );

  const resetImageLayer = useCallback(() => {
    setInsertedImage(null);
    setIsImageSelected(false);
    imageInteractionRef.current = null;
    releaseImageTouchOwnership();
  }, [releaseImageTouchOwnership]);

  const resetImageTouchState = useCallback(() => {
    imageTouchTransformRef.current = null;
    imageTouchDragRef.current = null;
    imageTouchInteractionModeRef.current = "idle";
    if (activeImageTouchElementRef.current) {
      activeImageTouchElementRef.current.style.touchAction = "manipulation";
      activeImageTouchElementRef.current = null;
    }
  }, []);

  return {
    activeImageTouchElementRef,
    handleCanvasMouseDownCapture,
    handleCanvasTouchStartCapture,
    handleImageTouchEnd,
    handleImageTouchMove,
    handleImageTouchStart,
    handleUploadImageChange,
    imageInteractionRef,
    imageTouchDragRef,
    imageTouchInteractionModeRef,
    imageTouchTransformRef,
    insertedImage,
    insertedImageElementRef,
    isImageSelected,
    resetImageLayer,
    resetImageTouchState,
    setInsertedImage,
    setIsImageSelected,
    startImageDrag,
    startImageResize,
  };
}
