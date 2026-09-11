"use client";

import { createContext, useContext } from "react";

/**
 * The lab's measurement strip (`FeedLab.tsx`) needs to know, across every `EmbedFrame`
 * instance in whichever variant is mounted, how many iframes are live, each card's
 * rendered height (for the median), and when the first embed finished loading. Threading
 * that through every variant/component's props would be noise on top of noise, so it's a
 * small context instead. Default is a no-op so `EmbedFrame`/`MeasuredCard` work fine
 * rendered outside the lab (tests, Storybook-style usage) too.
 */
export interface MeasurementApi {
  /** An `EmbedFrame`'s IntersectionObserver decided to mount its iframe. */
  reportMount: () => void;
  /** An embed's `onLoad` fired — only the first one (per variant) is kept. */
  reportLoad: () => void;
  /** A card's measured height, keyed by wedding id — used for the median. */
  reportCardHeight: (id: string, height: number) => void;
}

const noopMeasurement: MeasurementApi = {
  reportMount: () => {},
  reportLoad: () => {},
  reportCardHeight: () => {},
};

export const MeasurementContext = createContext<MeasurementApi>(noopMeasurement);

export function useMeasurement(): MeasurementApi {
  return useContext(MeasurementContext);
}
