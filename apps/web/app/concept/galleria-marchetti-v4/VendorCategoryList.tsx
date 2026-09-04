"use client";

/**
 * Vendors, bucketed by category — replaces the "wedding stacks" framing in this section (the
 * top of the page now covers that: same weddingStacks data, shown as real stacked decks). Down
 * here the goal shifted per user feedback 2026-08-15: not "who worked together," just "who are
 * the real options in each category," so a couple can go look them up. Combines every real
 * vendor we have a category+name+url for — weddingStacks' vendors and soloVendorCredits both —
 * deduped by name within a category (no name currently appears in both, but a real vendor
 * could plausibly show up in a future stack AND as a standalone photo credit).
 *
 * Client component (not the default Server Component) even though nothing here is stateful:
 * it imports ICON_SRC/VendorIcon, plain non-component exports, from VendorStackDeck.tsx, which
 * is itself "use client" — a Server Component importing a "use client" module only reliably
 * gets real values for that module's *component* exports, not arbitrary objects/functions, so
 * ICON_SRC came through empty at SSR (buckets always computed as []) until this file joined the
 * same client module graph.
 */

import { VendorIcon, ICON_SRC } from "./VendorStackDeck";
import { marchetti } from "./data";

type CategoryVendor = { name: string; url: string };

const CATEGORY_ORDER = Object.keys(ICON_SRC);

function buildCategoryBuckets(): { category: string; vendors: CategoryVendor[] }[] {
  const buckets = new Map<string, Map<string, string>>();
  const add = (category: string, name: string, url: string) => {
    if (!buckets.has(category)) buckets.set(category, new Map());
    buckets.get(category)!.set(name, url);
  };

  for (const stack of marchetti.weddingStacks) {
    for (const v of stack.vendors) add(v.category, v.name, v.url);
  }
  for (const v of marchetti.soloVendorCredits) add(v.category, v.name, v.url);

  return CATEGORY_ORDER.filter((category) => buckets.has(category)).map((category) => ({
    category,
    vendors: Array.from(buckets.get(category)!.entries()).map(([name, url]) => ({ name, url })),
  }));
}

export function VendorCategoryList() {
  const buckets = buildCategoryBuckets();

  return (
    <div className="space-y-5">
      {buckets.map((bucket) => (
        <div key={bucket.category}>
          <div className="mb-2 flex items-center gap-2">
            <VendorIcon category={bucket.category} size={16} />
            <h3 className="text-sm font-medium text-gray-900">{bucket.category}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {bucket.vendors.map((v) => (
              <a
                key={v.name}
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-rose-200"
              >
                {v.name}
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
