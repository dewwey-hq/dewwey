-- D061 (2026-09-20): the 34 weddings still anchored on @tigerlilyevents after the recredit
-- (d061-tigerlily-recredit-1) -- no other venue credit and no location tag resolved them, or a
-- reviewer rejected the credit-based re-anchor (4723 magazine, 5619 ceremony church, 9744 hotel
-- while the caption says Cafe Brauer). Keyword hints from the captions for the human pass:
-- brauer/loggia -> cafebrauer (18759); zoo/nature boardwalk/lion house -> lincolnparkzoo (560).
select w.id wedding_id, w.event_date_est,
  string_agg(distinct case when p.caption ~* 'brauer|loggia' then 'BRAUER' end, '') ||
  string_agg(distinct case when p.caption ~* '\yzoo\y|nature boardwalk|lion house|regenstein' then ' ZOO' end, '') hint,
  string_agg(distinct a.username::text, ',') filter (where wv.role::text in ('venue','other') and a.username::text <> 'tigerlilyevents') other_venue_ish_credits,
  left(regexp_replace(string_agg(p.caption, ' || '), E'\\s+', ' ', 'g'), 200) caption
from weddings w
left join wedding_posts wp on wp.wedding_id=w.id left join posts p on p.id=wp.post_id
left join wedding_vendors wv on wv.wedding_id=w.id and wv.role::text in ('venue') left join accounts a on a.id=wv.account_id
where w.venue_id = 1437
group by w.id order by hint desc nulls last, w.id;
