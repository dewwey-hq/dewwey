# D056 stage 2 — code-rename inventory (listed only, NOT applied)

Every literal occurrence of the four `vendor_role` enum values the migration renames
(`beauty_other`, `jeweler`, `photobooth`, `musician`) across `apps/web` (`lib`, `app`, `scripts`,
tests) and `pipeline/pipeline.py`. Grepped 2026-09-10, word-boundary (catches unquoted object
keys like `musician: "Musician"`, not just quoted string literals):

```
grep -rn --include='*.ts' --include='*.tsx' -E "\b(beauty_other|jeweler|photobooth|musician)\b" \
  apps/web/lib apps/web/app apps/web/scripts
grep -n -E "beauty_other|jeweler|photobooth|musician" pipeline/pipeline.py
```

Filtered out below: (1) `scripts/graph/vendorRoleRules.ts` itself — its `jeweler`/`musician`/
`photobooth`/`beauty_other` occurrences are either the intentional `V9_TO_D056` old→new
translation table (the exact map this migration's code will use, already correct) or English-word
trigger keys in `EXACT`/`HEAD_RULES` that map the OLD word to the NEW slug ("jeweler" → `jewelry`)
— working as designed, not a rename target. (2) Prose/comments that merely use the English word
(`app/concept/greenhouse-loft/data.ts`, `app/concept/geraghty/data.ts`,
`app/concept/greenhouse-loft/page.tsx` — venue package copy describing a "photobooth" amenity;
`scripts/graph/checkExistingDuplicatesForCreation.ts:37`,
`scripts/graph/checkIntraBatchDuplicates.ts:35` — comments saying "a mislabeled musician"),
`scripts/graph/stackParser.ts:105,107` (comments, real occurrences listed separately below).

Once `applyVendorTaxonomySchema.ts --apply` renames the enum values in Postgres, every literal
below becomes a dead/invalid string for its column or an invisible display-map miss (an INSERT or
comparison using the old spelling errors against the renamed enum; a `ROLE_LABELS[role]` lookup
under the NEW spelling returns undefined until the map is updated) and must be updated in the SAME
commit as the enum rename (plan file, "Execution — Stage 2": "Code change (queries, `lib/roles.ts`,
`CategoryIcon`, `SlotRail`, `pipeline.py`, tests) in the same commit as the enum renames"). Listed
here for that future commit — nothing below is touched by this stage.

## `apps/web/lib/roles.ts` (`ROLE_LABELS` — named explicitly in the plan)

- `lib/roles.ts:12` — `musician: "Musician",` → `live_music: "Live music",`
- `lib/roles.ts:19` — `photobooth: "Photo Booth",` → `photo_booth: "Photo Booth",`
- `lib/roles.ts:22` — `jeweler: "Jewelry",` → `jewelry: "Jewelry",`
- `lib/roles.ts:24` — `beauty_other: "Beauty",` → `beauty_services: "Beauty",`

## `apps/web/app/components/CategoryIcon.tsx` (named explicitly in the plan)

- `CategoryIcon.tsx:19` — `musician: MusicNotes,` → `live_music: MusicNotes,`

## `apps/web/lib/team.ts`

- `lib/team.ts:49` — `Music: ["dj", "band", "musician"],` → `"live_music"`
- `lib/team.ts:50` — `Attire: ["attire", "jeweler"],` → `"jewelry"`
- `lib/team.ts:51` — `"Hair & Makeup": ["hair", "makeup", "beauty_other"],` → `"beauty_services"`

## `apps/web/lib/server/vendors.ts`

- `lib/server/vendors.ts:21` — `"musician",` → `"live_music"`
- `lib/server/vendors.ts:28` — `"photobooth",` → `"photo_booth"`
- `lib/server/vendors.ts:31` — `"jeweler",` → `"jewelry"`
- `lib/server/vendors.ts:33` — `"beauty_other",` → `"beauty_services"`

## `apps/web/scripts/graph/stackParser.ts` (v1–v9 `ROLE_MAP`, still live — v10's `vendorRoleRules.ts`
is the parallel D056 taxonomy, not a replacement for this file's own enum literals)

- `stackParser.ts:100` — `["photobooth", ["photo booth", "photobooth"]],` → `"photo_booth"`
- `stackParser.ts:132` — `["beauty_other", ["hmu", "beauty", "mua"]],` → `"beauty_services"`
- `stackParser.ts:137` — `["musician", ["music", "sax", "strings"]],` → `"live_music"`
- `stackParser.ts:150` — `["jeweler", ["ring", "jewel"]],` → `"jewelry"`

## `apps/web/scripts/graph/buildNonWeddingSimilarPool.ts`

- `buildNonWeddingSimilarPool.ts:124` — `and wv.role::text not in ('venue', 'band', 'musician')` → `'live_music'`

## `apps/web/scripts/graph/buildDeleteCandidates.ts`

- `buildDeleteCandidates.ts:36` — `and wv.role::text not in ('venue', 'band', 'musician')) = false` → `'live_music'`

## `apps/web/scripts/graph/scoreScreensTick3.ts`

- `scoreScreensTick3.ts:131` — `return set.length > 0 && set.every((r) => r === "venue" || r === "band" || r === "musician");` → `"live_music"`

## `apps/web/scripts/graph/graphStrengthening.test.ts` (test literals — re-pin, don't blind-replace;
some of these fixtures assert the OLD v9 `ROLE_MAP` output on purpose and should keep testing
`stackParser.ts`'s v1–v9 path unless that file is renamed too)

- `graphStrengthening.test.ts:1231` — `return roles.length > 0 && roles.every((r) => r === "venue" || r === "band" || r === "musician");`
- `graphStrengthening.test.ts:1239` — `"DcNUEvvMvIk": ["musician", "other", "venue"],`
- `graphStrengthening.test.ts:1240` — `"DcNx6TSnMb2": ["band", "musician", "venue"],`
- `graphStrengthening.test.ts:1243` — `"DcKuJQ-NDop": ["musician", "photographer", "venue"],`
- `graphStrengthening.test.ts:1244` — `"DcKp-bOjpUb": ["content_creator", "musician", "venue"],`
- `graphStrengthening.test.ts:1245` — `"DcL46UADhss": ["band", "musician", "photographer", "venue"],`
- `graphStrengthening.test.ts:1246` — `"DcJvqkRt-1X": ["cake", "catering", "musician", "rentals", "venue"],`
- `graphStrengthening.test.ts:1249` — `"DcJhXRTET86": ["content_creator", "musician", "venue"],`
- `graphStrengthening.test.ts:1262` — `["beauty_other", "florist", "photographer", "planner", "rentals", "venue"],`
- `graphStrengthening.test.ts:1263` — `["catering", "dj", "florist", "musician", "other", "photographer", "planner", "venue", "videographer"],`
- `graphStrengthening.test.ts:1281` — `where wv.wedding_id = w.id and wv.role::text not in ('venue', 'band', 'musician')`

## `pipeline/pipeline.py`

- `pipeline.py:91` — `('photobooth', ['photo booth', 'photobooth']), ('venue', ['venue']),` → `'photo_booth'`
- `pipeline.py:94` — `('hair', ['hair']), ('makeup', ['makeup']), ('beauty_other', ['hmu', 'beauty']),` → `'beauty_services'`
- `pipeline.py:96` — `('musician', ['music', 'sax', 'strings', 'band']),` → `'live_music'`
- `pipeline.py:101` — `('officiant', ['officiant']), ('jeweler', ['ring', 'jewel']),` → `'jewelry'`

## Not found

- `app/` (routes/components): zero literal hits for any of the four values — the app reads role
  strings from the DB/`lib/roles.ts` display maps, not hardcoded enum literals in JSX.
- `lib/roles.ts` itself has no hit under these four exact tokens today (`ROLE_LABELS`/`ROLE_ORDER`
  presumably key off the current 23-value set some other way) — worth a second look in the same
  commit as the rename, since the plan file names it explicitly as in-scope.
