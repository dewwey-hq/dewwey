"use client";

import { useEffect, useRef } from "react";
import { useMeasurement } from "../measurement-context";

/** Wraps one wedding's card so the measurement strip's "median card height" is real,
 * not guessed — a `ResizeObserver` reports the rendered height keyed by wedding id. */
export function MeasuredCard({
  id,
  children,
  className,
}: {
  id: string | number;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { reportCardHeight } = useMeasurement();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      reportCardHeight(String(id), Math.round(entry.contentRect.height));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [id, reportCardHeight]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
