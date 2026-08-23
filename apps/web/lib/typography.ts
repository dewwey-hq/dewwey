/** Large hero / section headlines. */
export const displayHeadingClassName = "font-sans font-semibold tracking-tight";

/** Card titles, nav, and smaller headings. */
export const uiHeadingClassName = "font-sans font-medium";

export function pillShellClassName(active: boolean): string {
  return `rounded-full text-sm ring-1 ring-inset transition-colors ${
    active
      ? "bg-gray-900 text-white ring-gray-900"
      : "bg-white text-gray-600 ring-black/[0.10] hover:ring-black/[0.25]"
  }`;
}

export function pillClassName(active: boolean): string {
  return `px-3.5 py-1.5 ${pillShellClassName(active)}`;
}
