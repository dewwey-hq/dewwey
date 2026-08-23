"use client";

import { CaretDown as ChevronDown } from "@phosphor-icons/react";

export default function MapFilterDropdown({
  label,
  value,
  options,
  onChange,
  disabled = false,
  defaultValue = "All",
}: {
  label: string;
  value: string;
  options: string[];
  onChange?: (value: string) => void;
  disabled?: boolean;
  defaultValue?: string;
}) {
  const displayValue = value === defaultValue ? label : value;

  if (disabled) {
    return (
      <div className="inline-flex shrink-0 cursor-not-allowed items-center gap-1 rounded-full border border-black/[0.06] bg-gray-50 px-3.5 py-1.5 text-xs text-gray-400">
        <span>{label}</span>
        <ChevronDown size={14} className="opacity-60" />
      </div>
    );
  }

  return (
    <div className="relative inline-flex shrink-0">
      <span className="pointer-events-none flex items-center gap-1 rounded-full border border-black/[0.1] bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700">
        {displayValue}
        <ChevronDown size={14} className="text-gray-500" />
      </span>
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        aria-label={label}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option === defaultValue ? `All ${label.toLowerCase()}s` : option}
          </option>
        ))}
      </select>
    </div>
  );
}
