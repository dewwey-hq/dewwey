"use client";

import { useState, type ReactNode } from "react";
import { Camera, ForkKnife, MagnifyingGlass, Images } from "@phosphor-icons/react";
import { displayHeadingClassName, uiHeadingClassName, pillClassName } from "@/lib/typography";
import { TodaySwatch, MosaicSwatch, PairSwatch, CollageSwatch, GraphSwatch } from "./swatches";
import { Recommended } from "./Recommended";

type Option = "today" | "mosaic" | "pair" | "collage" | "graph" | "rec";

const OPTIONS: { id: Option; label: string; short: string }[] = [
  { id: "today", label: "Today", short: "Deck + feed" },
  { id: "mosaic", label: "Look grid", short: "Photo is the result" },
  { id: "pair", label: "Pair as search", short: "Stack becomes a query" },
  { id: "collage", label: "Vendor collage", short: "Wrong subject" },
  { id: "graph", label: "Graph explorer", short: "Wrong customer" },
  { id: "rec", label: "Recommended", short: "Look + pair" },
];

export default function ExploreClient() {
  const [option, setOption] = useState<Option>("rec");

  return (
    <div className="space-y-14">
      <Intro />
      <Analogies />

      <section>
        <div className="mb-4">
          <h2 className={`text-xl text-gray-900 ${uiHeadingClassName}`}>Live swatches</h2>
          <p className="mt-1 text-sm text-gray-500">
            Same 13 mock Chicago weddings in every option. Click around. The recommended one
            is a working explore flow, not a still.
          </p>
        </div>
        <div className="sticky top-0 z-30 -mx-1 mb-5 bg-white/90 px-1 py-2 backdrop-blur">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setOption(o.id)}
                className={`${pillClassName(option === o.id)} shrink-0`}
              >
                {o.label}
                <span className={`ml-1.5 text-xs ${option === o.id ? "text-white/70" : "text-gray-400"}`}>
                  {o.short}
                </span>
              </button>
            ))}
          </div>
        </div>
        <SwatchCaption option={option} />
        <div className="mt-4 overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
          {option === "today" && <TodaySwatch />}
          {option === "mosaic" && <MosaicSwatch />}
          {option === "pair" && <PairSwatch />}
          {option === "collage" && <CollageSwatch />}
          {option === "graph" && <GraphSwatch />}
          {option === "rec" && <Recommended />}
        </div>
      </section>

      <Rationale />
    </div>
  );
}

function Intro() {
  return (
    <section className="max-w-3xl">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-rose-500">Design swatch</p>
      <h1 className={`text-3xl leading-tight text-gray-900 sm:text-4xl ${displayHeadingClassName}`}>
        The wedding is the search result.
        <span className="mt-1 block font-normal italic text-rose-400">The team is how you search next.</span>
      </h1>
      <p className="mt-5 text-[17px] leading-relaxed text-gray-600">
        A couple does not open Dewwey looking for a “stack.” They are trying to feel a
        Saturday, then figure out who made it. The Knot makes them shop one category at a
        time, which is why they book people who have never worked together. Our data is the
        opposite of that. The current UI does not quite say so.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Note title="What we have">
          A literal card deck on the venue page (v4) and an Instagram-shaped feed at
          /weddings. Both treat one wedding at a time. The deck visualizes the word stack.
          The feed visualizes Instagram. Neither visualizes the job.
        </Note>
        <Note title="The job">
          See many real Saturdays fast. Notice the team on the photo. Ask “show me more with
          this venue and this florist.” Then keep that pairing when they estimate cost or
          save a team.
        </Note>
      </div>
    </section>
  );
}

function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className={`text-sm text-gray-900 ${uiHeadingClassName}`}>{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{children}</p>
    </div>
  );
}

function Analogies() {
  const items = [
    {
      icon: Images,
      name: "Shop the look",
      from: "SSENSE, Farfetch",
      take: "One photo is the whole outfit. Tap a piece to shop it, or shop the set. The wedding photo is the look. Vendors are the garments.",
    },
    {
      icon: Camera,
      name: "Film credits",
      from: "Letterboxd, IMDb",
      take: "A movie is the unit, not an actor. “More with this director and this DP” is exactly “more with this venue and this photographer.”",
    },
    {
      icon: ForkKnife,
      name: "More with these ingredients",
      from: "NYT Cooking",
      take: "You do not start from a blank search. You start from a dish you like, then add or remove an ingredient. Pair chips work the same way.",
    },
    {
      icon: MagnifyingGlass,
      name: "Pinterest, then act",
      from: "Pinterest, Airbnb",
      take: "Scan a grid of feelings first. Open one. Stay in the grid. Do not make them wait on an embed to decide if they even like the look.",
    },
  ];
  return (
    <section>
      <h2 className={`text-xl text-gray-900 ${uiHeadingClassName}`}>What they already know</h2>
      <p className="mt-1 mb-5 text-sm text-gray-500">
        Borrow the motion, not the chrome. A brand-new metaphor (a fanned card deck, a node
        graph) asks a once-in-a-lifetime shopper to learn our vocabulary first.
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.name} className="flex gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fdf8f5] text-rose-400">
              <it.icon size={18} />
            </span>
            <div>
              <p className={`text-[15px] text-gray-900 ${uiHeadingClassName}`}>{it.name}</p>
              <p className="text-xs text-gray-400">{it.from}</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">{it.take}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SwatchCaption({ option }: { option: Option }) {
  const copy: Record<Option, { verdict: string; body: string }> = {
    today: {
      verdict: "Cute. Slow. You can see one Saturday.",
      body: "The fan of cards is a metaphor for the word stack, not a way to compare looks. The feed is a good open state (linger on one wedding) wearing a browse costume.",
    },
    mosaic: {
      verdict: "Right object. Missing the unique action.",
      body: "Twelve looks at once, credits living on the photo. This is how they should scan. Alone it is still a gallery. The graph’s power is the next click.",
    },
    pair: {
      verdict: "This is the Dewwey-only move.",
      body: "Pin two vendors from a wedding you like. The grid becomes “Saturdays these people actually did together.” That is the thing The Knot cannot sell.",
    },
    collage: {
      verdict: "Tempting, and it makes vendors the subject.",
      body: "A yearbook of faces next to a tiny wedding photo. Couples came for the Saturday. Vendor avatars are the index, not the picture.",
    },
    graph: {
      verdict: "True to the data. Wrong for this customer.",
      body: "We should keep a graph explorer for ourselves. A bride does not want to path-find across 11,000 nodes. She wants a look, then a team.",
    },
    rec: {
      verdict: "Look grid + pair chips + the feed as the open state.",
      body: "Try: open Carrie & Mike, tap “See more with this pairing,” watch three Saturdays appear (including one not at Marchetti). Then save Marchetti + in-house catering and watch the estimate attach.",
    },
  };
  const c = copy[option];
  return (
    <div>
      <p className={`text-[15px] text-gray-900 ${uiHeadingClassName}`}>{c.verdict}</p>
      <p className="mt-1 text-sm text-gray-600">{c.body}</p>
    </div>
  );
}

function Rationale() {
  return (
    <section className="max-w-3xl space-y-8 border-t border-black/[0.06] pt-10">
      <div>
        <h2 className={`text-xl text-gray-900 ${uiHeadingClassName}`}>Recommendation</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-gray-700">
          Ship the look grid as browse, the pair chip as search, and keep today’s feed as
          what happens when you open one wedding. Do not lead the product with the word
          stack. Internally it is a stack. In the UI it is a real wedding and its team.
        </p>
      </div>

      <div>
        <h3 className={`text-sm text-gray-900 ${uiHeadingClassName}`}>Why this for a couple</h3>
        <ul className="mt-3 space-y-3 text-sm leading-relaxed text-gray-600">
          <li>
            <span className="font-medium text-gray-900">They start from a feeling.</span>{" "}
            High-stakes, once, visual. Pinterest already trained this motion. A card deck
            hides the feeling behind one frame and a metaphor.
          </li>
          <li>
            <span className="font-medium text-gray-900">They hire a team, not a category.</span>{" "}
            Shopping photographer, then florist, then venue is how strangers get booked.
            Pinning two credits from a Saturday they like is how revealed preference becomes
            a search.
          </li>
          <li>
            <span className="font-medium text-gray-900">Recognition over our jargon.</span>{" "}
            Shop-the-look + “films with this pairing” is already in their head. A fanned
            deck and a node graph are ours.
          </li>
          <li>
            <span className="font-medium text-gray-900">Explore is cheaper than commit.</span>{" "}
            “See more with these two” is the primary action. Add-to-team and estimate come
            after the pair is trusted. Today we invert that: every row is an Add button,
            and there is no next search.
          </li>
        </ul>
      </div>

      <div>
        <h3 className={`text-sm text-gray-900 ${uiHeadingClassName}`}>What to call it, and what not to build</h3>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          Couples will say “weddings like this” and “this photographer with this venue.”
          They will not say stack. Keep stack in the schema and in our mouths. On the page,
          use real wedding, this team, more with these vendors.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          Two blank-slate ideas to leave on the table: a vendor-face collage (makes the
          people the picture; the Saturday is what they came for) and a graph explorer
          (true, and a good internal tool, not a bridal one). Multiple vendors in one image
          is right when it means mosaicing the posts of the same day, or laying credit coins
          on the photo. It is wrong when it means a yearbook.
        </p>
      </div>

      <div>
        <h3 className={`text-sm text-gray-900 ${uiHeadingClassName}`}>Where it lives</h3>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-gray-600">
          <li>
            <span className="font-medium text-gray-900">Venue page</span> (replaces the v4
            deck). Same component, venue already pinned. Suggested pair is photographer +
            florist, because the building is the given.
          </li>
          <li>
            <span className="font-medium text-gray-900">/weddings</span> (replaces the feed
            as browse). Feed layout stays as the open panel. Suggested pair is venue +
            photographer, because the look is building plus eye.
          </li>
        </ul>
      </div>

      <div>
        <h3 className={`text-sm text-gray-900 ${uiHeadingClassName}`}>Ship in this order</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-gray-600">
          <li>
            Look grid with credit coins, using preview images we host (the R2 post-media
            item already on the later roadmap; the mosaic is why that item should move up).
          </li>
          <li>
            Open-in-place panel that is today’s feed card: photo, full credits, add to team.
          </li>
          <li>
            Pair chips. First version can be exact-match on the wedding_vendors graph we
            already have. No new tables.
          </li>
          <li>
            When a saved team contains a venue and a caterer from the same Saturday, the
            cost estimate treats them as one pairing.
          </li>
        </ol>
      </div>
    </section>
  );
}
