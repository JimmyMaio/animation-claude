import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import highlightData from "./highlight-data.json";

// White space around the article image (generous "floating card" look).
const CARD_MARGIN_X = 150;
const CARD_MARGIN_Y = 130;

const HIGHLIGHT_COLOR = "#ffd400";
const BLUR_DURATION_SECONDS = 1;
const HIGHLIGHT_SWEEP_SECONDS = 1;
const MAX_ROTATE_Y_DEG = 15;
const MAX_ROTATE_X_DEG = 15;
const MAX_ZOOM = 1.08;

export const ArticleHighlight: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  // Fit the article image inside the canvas with generous padding, without
  // distorting its aspect ratio (derived from the OCR'd source image, so
  // this isn't a hardcoded literal Studio can keyframe).
  const availableWidth = width - CARD_MARGIN_X * 2;
  const availableHeight = height - CARD_MARGIN_Y * 2;
  const imageAspectRatio = highlightData.imageWidth / highlightData.imageHeight;
  let cardWidth = availableWidth;
  let cardHeight = cardWidth / imageAspectRatio;
  if (cardHeight > availableHeight) {
    cardHeight = availableHeight;
    cardWidth = cardHeight * imageAspectRatio;
  }

  // The whole composition starts blurred and sharpens over the first second.
  const blurPx = interpolate(frame, [0, fps * BLUR_DURATION_SECONDS], [28, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Slow, subtle zoom + 3D turn (left-to-right) across the full 5 seconds.
  const motionProgress = interpolate(frame, [0, durationInFrames - 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const zoom = interpolate(motionProgress, [0, 1], [1, MAX_ZOOM]);
  const rotateY = interpolate(motionProgress, [0, 1], [-MAX_ROTATE_Y_DEG, MAX_ROTATE_Y_DEG]);
  const rotateX = interpolate(motionProgress, [0, 1], [MAX_ROTATE_X_DEG, -MAX_ROTATE_X_DEG]);

  // The highlighter evolves left-to-right right after the blur settles.
  const highlightStartFrame = fps * BLUR_DURATION_SECONDS;
  const highlightEndFrame = highlightStartFrame + fps * HIGHLIGHT_SWEEP_SECONDS;
  const highlightReveal = interpolate(
    frame,
    [highlightStartFrame, highlightEndFrame],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#ffffff",
        filter: `blur(${blurPx}px)`,
      }}
    >
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          perspective: 2400,
        }}
      >
        <div
          style={{
            position: "relative",
            width: cardWidth,
            height: cardHeight,
            boxShadow: "0 60px 140px rgba(0, 0, 0, 0.2)",
            transform: `scale(${zoom}) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
          }}
        >
          <Img
            src={staticFile(highlightData.sourceImage)}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
            }}
          />
          {/* Sits on top of the text in the DOM, but "multiply" makes the
              (black) text read as if the marker is drawn behind it, since
              the source image's highlighted area is plain white. */}
          <div
            style={{
              position: "absolute",
              left: `${highlightData.highlightFraction.left * 100}%`,
              top: `${highlightData.highlightFraction.top * 100}%`,
              width: `${highlightData.highlightFraction.width * 100 * highlightReveal}%`,
              height: `${highlightData.highlightFraction.height * 100}%`,
              backgroundColor: HIGHLIGHT_COLOR,
              mixBlendMode: "multiply",
              borderRadius: 4,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
