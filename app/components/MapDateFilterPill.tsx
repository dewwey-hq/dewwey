"use client";

import { Calendar, ChevronDown } from "lucide-react";

function formatWeddingDate(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function MapDateFilterPill({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  const hasDate = value.length > 0;
  const displayValue = hasDate ? formatWeddingDate(value) : "Dates";

  if (disabled) {
    return (
      <div className="inline-flex shrink-0 cursor-not-allowed items-center gap-1 rounded-full border border-black/[0.06] bg-gray-50 px-3.5 py-1.5 text-xs text-gray-400">
        <Calendar size={14} className="opacity-70" />
        <span>Dates</span>
        <ChevronDown size={14} className="opacity-60" />
      </div>
    );
  }

  return (
    <div className="relative inline-flex shrink-0">
      <span
        className={`pointer-events-none inline-flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-xs font-medium ${
          hasDate
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-black/[0.1] bg-white text-gray-700"
        }`}
      >
        <Calendar size={14} className={hasDate ? "text-rose-500" : "text-gray-500"} />
        {displayValue}
        <ChevronDown size={14} className={hasDate ? "text-rose-400" : "text-gray-500"} />
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        aria-label="Wedding date"
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </div>
  );
}
