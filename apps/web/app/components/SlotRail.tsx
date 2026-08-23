"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CaretDown, SquaresFour } from "@phosphor-icons/react";
import { DEFAULT_SLOTS, SLOT_ROLES } from "@/lib/team";
import { SLOT_ICONS, vendorsHref, type Slot, type VendorsQuery } from "@/lib/slots";
import { ROLE_LABELS } from "@/lib/roles";
import { pillClassName, pillShellClassName } from "@/lib/typography";

// The subtype menu is fixed-positioned: the scrolling rail clips absolute children.
export function SlotRail({ state }: { state: VendorsQuery }) {
  const router = useRouter();
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [emptyStaged, setEmptyStaged] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggersRef = useRef(new Map<Slot, HTMLButtonElement>());

  useEffect(() => {
    if (!openSlot) return;
    const close = () => setOpenSlot(null);
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggersRef.current.get(openSlot)?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", close);
    };
  }, [openSlot]);

  const href = (over: Partial<VendorsQuery>) => vendorsHref({ ...state, ...over });

  const toggleMenu = (slot: Slot, button: HTMLButtonElement) => {
    if (openSlot === slot) {
      setOpenSlot(null);
      return;
    }
    const rect = (button.parentElement ?? button).getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 8, left: rect.left });
    setEmptyStaged(false);
    setOpenSlot(slot);
  };

  const selectionFor = (slot: Slot): Set<string> => {
    const all = SLOT_ROLES[slot];
    if (slot === state.slot && emptyStaged) return new Set();
    if (slot === state.slot && state.roles?.length) return new Set(state.roles);
    return new Set(all);
  };

  const navigateSelection = (slot: Slot, selected: Set<string>) => {
    if (selected.size === 0) {
      setEmptyStaged(true);
      return;
    }
    setEmptyStaged(false);
    const all = SLOT_ROLES[slot];
    const roles = selected.size === all.length ? [] : all.filter((r) => selected.has(r));
    router.push(href({ slot, roles }), { scroll: false });
  };

  const pillValue = (slot: Slot): string | null => {
    if (slot !== state.slot) return null;
    const all = SLOT_ROLES[slot];
    if (all.length <= 1) return null;
    const selected = state.roles?.length ? state.roles : all;
    if (selected.length === all.length) return "All";
    if (selected.length === 1) return ROLE_LABELS[selected[0]] ?? selected[0];
    return `${selected.length}/${all.length}`;
  };

  const openRoles = openSlot ? SLOT_ROLES[openSlot] : [];
  const openSelection = openSlot ? selectionFor(openSlot) : new Set<string>();
  const allSelected = openSlot ? openSelection.size === openRoles.length : false;

  return (
    <>
      <Link
        href={href({ slot: null, roles: [] })}
        className={`flex shrink-0 items-center gap-1.5 ${pillClassName(!state.slot)}`}
      >
        <SquaresFour size={15} weight={!state.slot ? "fill" : "regular"} />
        All
      </Link>

      {DEFAULT_SLOTS.map((slot) => {
        const active = slot === state.slot;
        const roles = SLOT_ROLES[slot];
        const SlotIcon = SLOT_ICONS[slot];
        const value = pillValue(slot);

        if (roles.length <= 1) {
          return (
            <Link
              key={slot}
              href={href({ slot, roles: [] })}
              className={`flex shrink-0 items-center gap-1.5 ${pillClassName(active)}`}
            >
              <SlotIcon size={15} weight={active ? "fill" : "regular"} />
              <span className="whitespace-nowrap">{slot}</span>
            </Link>
          );
        }

        return (
          <span key={slot} className={`flex shrink-0 items-stretch ${pillShellClassName(active)}`}>
            <Link
              href={href({ slot, roles: [] })}
              className="flex items-center gap-1.5 rounded-l-full py-1.5 pl-3.5"
            >
              <SlotIcon size={15} weight={active ? "fill" : "regular"} />
              <span className="whitespace-nowrap">
                {slot}
                {value && <span className="font-semibold">: {value}</span>}
              </span>
            </Link>
            <button
              type="button"
              aria-label={`Filter ${slot} subtypes`}
              ref={(el) => {
                if (el) triggersRef.current.set(slot, el);
                else triggersRef.current.delete(slot);
              }}
              onClick={(e) => toggleMenu(slot, e.currentTarget)}
              className="flex items-center rounded-r-full py-1.5 pl-1.5 pr-3"
            >
              <CaretDown
                size={11}
                className={`transition-transform ${openSlot === slot ? "rotate-180" : ""}`}
              />
            </button>
          </span>
        );
      })}

      {openSlot && menuPos && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}
          className="z-50 w-56 rounded-xl border border-black/[0.08] bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-2.5">
            <button
              type="button"
              onClick={() =>
                navigateSelection(openSlot, allSelected ? new Set() : new Set(openRoles))
              }
              className="text-sm font-medium text-gray-900 hover:underline"
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            <span className="text-sm text-black/[0.56]">
              {openSelection.size}/{openRoles.length}
            </span>
          </div>
          <ul className="py-1.5">
            {openRoles.map((r) => (
              <li key={r}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm text-gray-800 transition-colors hover:bg-black/[0.04]">
                  <input
                    type="checkbox"
                    checked={openSelection.has(r)}
                    onChange={(e) => {
                      const next = new Set(openSelection);
                      if (e.target.checked) next.add(r);
                      else next.delete(r);
                      navigateSelection(openSlot, next);
                    }}
                    className="h-4 w-4 accent-gray-900"
                  />
                  {ROLE_LABELS[r] ?? r}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
