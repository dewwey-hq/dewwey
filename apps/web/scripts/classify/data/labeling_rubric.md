# Golden-set labeling rubric (v1, established from golden_set_v0's 120-post bootstrap)

You are hand-labeling Instagram posts for a Chicago wedding-vendor product. The product
requirement: **only surface posts that are credible examples of REAL weddings relevant to
CHICAGO.** A false positive (a fake/styled/non-Chicago/non-credible post reaching a user) is
worse than a false negative. When genuinely unsure, prefer REVIEW or EXCLUDE over INCLUDE.

For each post, output one of three decisions:

- **INCLUDE** — a real, identifiable wedding (named couple, or unambiguous real-event
  narrative), with real evidence the event was in the Chicago metro (explicit location_tag
  naming a Chicago-area place, explicit "Chicago" in caption/hashtags tied to THIS event, or a
  venue name you can recognize as a real Chicago venue), from a credible source (the vendor's
  own account describing work they did, or another credited vendor's account).
- **EXCLUDE** — confidently NOT includable. Always give `exclusion_reason` (free text, use one
  of the vocabulary below when it fits, invent a new short snake_case label if a real recurring
  pattern doesn't fit any of them — do NOT force a bad fit).
- **REVIEW** — genuinely insufficient evidence either way. Don't force a guess.

## Exclusion reason vocabulary (extend, don't force-fit)

- `not_wedding_related` — no wedding at all (food/venue/product/corporate/seasonal content,
  newborn/portrait sessions, generic business posts). **Proposals and engagement sessions are
  NOT weddings** — use this reason for them too unless the caption also explicitly references
  a specific real upcoming/past wedding (e.g. "can't wait for their wedding this Saturday").
- `vendor_marketing_generic` — mentions weddings in general (tips, "now booking," a philosophy
  statement, a portfolio recap of many weddings, a giveaway) but names NO specific real
  couple/event. This was the 2nd-largest bucket in the bootstrap set (20%) — expect it to be
  common again. Distinguish from `not_wedding_related`: this one IS wedding-adjacent, it just
  lacks a specific real event.
- `styled_or_editorial` — a styled shoot, flatlay, product photography, or inspiration content
  with no real couple/event (e.g. an invitation-suite flatlay).
- `not_chicago` — a real wedding, confidently NOT in the Chicago metro (explicit non-Chicago
  location_tag or caption city/state).
- `destination_wedding` — same as not_chicago but specifically when the account/vendor is
  Chicago-based and the event is elsewhere — a Chicago vendor's own post is not evidence the
  EVENT was in Chicago.
- `low_credibility_source` — account isn't a legitimate wedding vendor/venue/participant.
- `insufficient_evidence` — real content is plausible but there's nothing to confirm/deny a
  specific real Chicago wedding (no couple name, no location, no vendor stack, no real-event
  narrative) — use this rather than guessing INCLUDE or EXCLUDE for a different reason.
- `duplicate_post` — not usable in this sample (no dedup context), skip.
- `other` — a real pattern that doesn't fit above; name it clearly in notes.

## Judgment calls established in the bootstrap set — apply consistently

1. **Anniversary/retrospective posts** ("5 years later," "happy anniversary," "one year ago
   today") that name a real venue/vendor stack: lean REVIEW (`insufficient_evidence`) unless
   there's enough specific detail (named couple + named real venue) to lean INCLUDE. This is a
   genuine open question, not a bug — flag it as REVIEW when thin.
2. **Engagement sessions / proposals**: EXCLUDE `not_wedding_related` UNLESS the caption
   explicitly references a specific real wedding (not just "getting married" vaguely — a named
   couple + a real upcoming/past wedding reference).
3. **Location signal priority**: `location_tag` (the IG geotag on THIS post) is the strongest
   single signal for where the depicted event happened — weight it over the vendor's own
   home-market hashtags/bio. A vendor's own city or multi-market hashtags are NOT reliable
   evidence for where a specific post's event was.
4. **A real, specific vendor credit stack** (3+ "Role: @handle" lines, or several distinct
   named collaborators) is strong evidence of a genuinely booked real event, not a styled shoot
   — styled/editorial shoots are usually recognizable by explicit language ("styled shoot,"
   "flatlay," "inspiration") or by being product photography, not by having multiple credits.
5. **Known-vendor cross-reference** (`known_vendor_owner`/`known_vendor_role` fields, when
   present in the data) means this account is independently confirmed as a real wedding vendor
   in our own graph (built from a separate tagged-feed crawl) — a positive signal when present,
   but its ABSENCE is not evidence against a post (most legitimate vendors aren't in the graph
   yet).
6. **Hashtag-only captions with no real prose** (just a hashtag list, no sentence describing a
   specific event) are usually not enough to confirm a real specific wedding even if the
   hashtags are Chicago+wedding-themed — lean REVIEW or EXCLUDE `insufficient_evidence` unless
   `location_tag` independently names a specific real venue.
7. **`det_decision`/`det_reason` columns** in the data show what the FREE deterministic filter
   already decided (or `null` = deterministic tier deferred it). This is given for context only
   — label the post on its actual merits; you are producing INDEPENDENT ground truth, not
   grading the deterministic tier. Do not let a `det_decision=EXCLUDE` bias you toward EXCLUDE
   or vice versa — actively look for cases where the deterministic tier might be WRONG (that's
   exactly what this adversarial sample is for).

## Output format

Write a JSON array to the output file specified in your task, one object per post IN THE SAME
ORDER as the input file, each shaped exactly as:

```json
{
  "post_url": "https://www.instagram.com/p/XXXX/",
  "expected_decision": "INCLUDE" | "EXCLUDE" | "REVIEW",
  "exclusion_reason": "snake_case_reason_or_null",
  "notes": "one concise sentence: the concrete evidence that drove the decision"
}
```

`notes` must cite the actual evidence (a quote, a location_tag value, a real venue name) —
never a vague justification like "seems real" or "looks styled." Every post in the input file
must get exactly one output entry, in order, matched by `post_url`.
