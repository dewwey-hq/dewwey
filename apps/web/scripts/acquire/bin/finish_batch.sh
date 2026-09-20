#!/usr/bin/env bash
# Logs go to $ACQ_LOG_DIR (default apps/web/scripts/graph/tmp_analysis/acq_logs, gitignored by pattern below).
# D061: after chain.sh <batch> has DONE (spot-check gate passed 2026-09-20), create live for both pools,
# refresh role tags, measure, funnel. Logs to <batch>.finish.log. One batch at a time.
set -u; B="$1"; cd /home/jhoffen/dewwey/apps/web || exit 1
S=${ACQ_LOG_DIR:-/home/jhoffen/dewwey/apps/web/scripts/graph/tmp_analysis/acq_logs}; R=/home/jhoffen/dewwey/apps/web/scripts
until grep -q "^== .* DONE" "$S/$B.chain.log" 2>/dev/null; do sleep 30; done
{
echo "== $(date -u +%H:%M:%S) create v2";  bun run $R/graph/createWeddingsFromJeremyEvidence.ts --from-confirmed-candidates --batch-id "$B-create-1" --acquisition-batch "$B"
echo "== $(date -u +%H:%M:%S) create a1";  bun run $R/graph/createWeddingsFromJeremyEvidence.ts --from-confirmed-candidates --batch-id "$B-create-2" --acquisition-batch "$B" --clustering-version structural-v3-a1 --author-min-confidence 0.9
echo "== $(date -u +%H:%M:%S) refresh";    bun run $R/graph/refreshAccountRoleTagsFromWeddings.ts --apply
echo "== $(date -u +%H:%M:%S) measure";    bun run $R/acquire/measure.ts --batch-id "$B" --apply
echo "== $(date -u +%H:%M:%S) funnel";     bun run $R/acquire/reportAcquisitionFunnel.ts --batch-id "$B"
echo "== $(date -u +%H:%M:%S) DONE"
} > "$S/$B.finish.log" 2>&1
