"use client";

/**
 * Real vendors from `weddingStacks`, bucketed by category — same "who are the real options"
 * framing as Marchetti's VendorCategoryList. Deduped by name within a category (e.g. Kehoe
 * Designs appears on nearly every stack, shown once here).
 */

import { VendorIcon, ICON_SRC } from "./VendorStackDeck";
import { geraghty } from "./data";

type CategoryVendor = { name: string; url: string };

const CATEGORY_ORDER = Object.keys(ICON_SRC);

function buildCategoryBuckets(): { category: string; vendors: CategoryVendor[] }[] {
  const buckets = new Map<string, Map<string, string>>();
  const add = (category: string, name: string, url: string) => {
    if (!buckets.has(category)) buckets.set(category, new Map());
    buckets.get(category)!.set(name, url);
  };

  for (const stack of geraghty.weddingStacks) {
    for (const v of stack.vendors) add(v.category, v.name, v.url);
  }

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
