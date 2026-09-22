import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// White space around the image (generous "floating card" look).
const CARD_MARGIN_X = 150;
const CARD_MARGIN_Y = 130;

const HIGHLIGHT_COLOR = "#ffd400";
const BLUR_DURATION_SECONDS = 1;
// Base time to sweep a single-line highlight; each additional wrapped line
// gets its own share of extra time so a longer phrase doesn't feel rushed.
const HIGHLIGHT_BASE_SWEEP_SECONDS = 1;
const HIGHLIGHT_SECONDS_PER_EXTRA_LINE = 0.6;
const MAX_ZOOM = 1.08;

// Peak rotation is randomized per `seed` within these ranges (degrees).
const ROTATE_Y_DEG_RANGE: [number, number] = [10, 22];
const ROTATE_X_DEG_RANGE: [number, number] = [6, 16];

export type HighlightRect = {
  readonly fraction: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
};

export type HighlightImageProps = {
  readonly sourceImage: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  // One rect per text line the highlighted phrase spans, in reading order.
  readonly highlights: readonly HighlightRect[];
  // Change this (e.g. per render) to get a different rotation each time.
  // Remotion's random() is deterministic per seed, so every frame of a
  // single render still agrees on the same values.
  readonly seed: number | string;
};

export const HighlightImage: React.FC<HighlightImageProps> = ({
  sourceImage,
  imageWidth,
  imageHeight,
  highlights,
  seed,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  // Randomize the 3D turn: how far it rotates on each axis, and whether it
  // swings left-to-right or right-to-left (independently per axis).
  const [rotateYMin, rotateYMax] = ROTATE_Y_DEG_RANGE;
  const rotateYAmplitude = rotateYMin + random(`${seed}-rotateY-amplitude`) * (rotateYMax - rotateYMin);
  const rotateYSign = random(`${seed}-rotateY-sign`) < 0.5 ? -1 : 1;
  const [rotateXMin, rotateXMax] = ROTATE_X_DEG_RANGE;
  const rotateXAmplitude = rotateXMin + random(`${seed}-rotateX-amplitude`) * (rotateXMax - rotateXMin);
  const rotateXSign = random(`${seed}-rotateX-sign`) < 0.5 ? -1 : 1;

  // Fit the image inside the canvas with generous padding, without
  // distorting its aspect ratio.
  const availableWidth = width - CARD_MARGIN_X * 2;
  const availableHeight = height - CARD_MARGIN_Y * 2;
  const imageAspectRatio = imageWidth / imageHeight;
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

  // Slow, subtle zoom + 3D turn (left-to-right) across the full duration.
  const motionProgress = interpolate(frame, [0, durationInFrames - 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const zoom = interpolate(motionProgress, [0, 1], [1, MAX_ZOOM]);
  const rotateY = interpolate(
    motionProgress,
    [0, 1],
    [-rotateYAmplitude * rotateYSign, rotateYAmplitude * rotateYSign],
  );
  const rotateX = interpolate(
    motionProgress,
    [0, 1],
    [rotateXAmplitude * rotateXSign, -rotateXAmplitude * rotateXSign],
  );

  // The highlighter evolves left-to-right, line by line, right after the
  // blur settles. Each line's share of the total sweep is proportional to
  // its width, so the "pen" moves at a roughly constant speed.
  const highlightStartFrame = fps * BLUR_DURATION_SECONDS;
  const sweepSeconds =
    HIGHLIGHT_BASE_SWEEP_SECONDS + (highlights.length - 1) * HIGHLIGHT_SECONDS_PER_EXTRA_LINE;
  const highlightEndFrame = highlightStartFrame + fps * sweepSeconds;
  const overallReveal = interpolate(frame, [highlightStartFrame, highlightEndFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const totalWidthFraction = highlights.reduce((sum, h) => sum + h.fraction.width, 0);
  let widthSoFar = 0;
  const highlightSegments = highlights.map((h) => {
    const segmentStart = widthSoFar / totalWidthFraction;
    widthSoFar += h.fraction.width;
    const segmentEnd = widthSoFar / totalWidthFraction;
    const localReveal = interpolate(overallReveal, [segmentStart, segmentEnd], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return { rect: h, reveal: localReveal };
  });

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
            src={staticFile(sourceImage)}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
            }}
          />
          {/* Each sits on top of the text in the DOM, but "multiply" makes
              the (black) text read as if the marker is drawn behind it,
              since the source image's highlighted area is plain white. */}
          {highlightSegments.map(({ rect, reveal }, index) => (
            <div
              key={index}
              style={{
                position: "absolute",
                left: `${rect.fraction.left * 100}%`,
                top: `${rect.fraction.top * 100}%`,
                width: `${rect.fraction.width * 100 * reveal}%`,
                height: `${rect.fraction.height * 100}%`,
                backgroundColor: HIGHLIGHT_COLOR,
                mixBlendMode: "multiply",
                borderRadius: 4,
              }}
            />
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
