import React from "react";
import { HighlightImage } from "../HighlightImage";
import highlightData from "./highlight-data.json";

export type ChinaGrowthHighlightProps = {
  readonly seed: number | string;
};

export const ChinaGrowthHighlight: React.FC<ChinaGrowthHighlightProps> = ({ seed }) => {
  return (
    <HighlightImage
      sourceImage={highlightData.sourceImage}
      imageWidth={highlightData.imageWidth}
      imageHeight={highlightData.imageHeight}
      highlights={highlightData.highlights}
      seed={seed}
    />
  );
};
