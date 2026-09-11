"use client";

/**
 * The compliant path (D058 revision, 2026-09-11 compliance pass against Meta's oEmbed
 * docs): Instagram's own `embed.js` turns a `<blockquote class="instagram-media">` into
 * the real iframe, sized to the true media height, with the header (username) and footer
 * ("View on Instagram") intact — attribution is delivered by the embed itself, not
 * something we can crop. This loads that script exactly once, guarded by `window.instgrm`,
 * shared by every `InstagramPostEmbed` instance on the page.
 */

declare global {
  interface Window {
    instgrm?: {
      Embeds: {
        process: (parent?: HTMLElement) => void;
      };
    };
  }
}

const EMBED_SCRIPT_SRC = "https://www.instagram.com/embed.js";

let scriptPromise: Promise<void> | null = null;

function loadInstagramEmbedScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.instgrm) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${EMBED_SCRIPT_SRC}"]`);
    if (existing) {
      if (window.instgrm) {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve());
      }
      return;
    }
    const script = document.createElement("script");
    script.src = EMBED_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    document.body.appendChild(script);
  });
  return scriptPromise;
}

/** Ensures `embed.js` is loaded, then asks it to scan the DOM (or just `parent`, when
 * given) for unprocessed `blockquote.instagram-media` elements and turn them into
 * iframes. Safe to call repeatedly — Instagram's own script no-ops on already-processed
 * blockquotes. */
export async function processInstagramEmbeds(parent?: HTMLElement): Promise<void> {
  await loadInstagramEmbedScript();
  window.instgrm?.Embeds.process(parent);
}
