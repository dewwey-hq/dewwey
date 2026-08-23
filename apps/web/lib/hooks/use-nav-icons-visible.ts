"use client";

import { type RefObject, useEffect, useState } from "react";

/** True at scroll top; false after user scrolls (nav shows text-only labels). */
export function useNavIconsVisible(
  threshold = 32,
  scrollRef?: RefObject<HTMLElement | null>,
) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const readScrollY = () =>
      scrollRef?.current ? scrollRef.current.scrollTop : window.scrollY;

    const update = () => setVisible(readScrollY() <= threshold);
    update();

    window.addEventListener("scroll", update, { passive: true });

    let el = scrollRef?.current ?? null;
    el?.addEventListener("scroll", update, { passive: true });

    let raf = 0;
    const attachToRef = () => {
      const next = scrollRef?.current ?? null;
      if (next !== el) {
        el?.removeEventListener("scroll", update);
        el = next;
        el?.addEventListener("scroll", update, { passive: true });
        update();
      }
      if (scrollRef && !scrollRef.current) {
        raf = requestAnimationFrame(attachToRef);
      }
    };
    if (scrollRef) attachToRef();

    return () => {
      window.removeEventListener("scroll", update);
      el?.removeEventListener("scroll", update);
      cancelAnimationFrame(raf);
    };
  }, [threshold, scrollRef]);

  return visible;
}
