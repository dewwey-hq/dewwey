#!/usr/bin/env bash
# Logs go to $ACQ_LOG_DIR (default apps/web/scripts/graph/tmp_analysis/acq_logs, gitignored by pattern below).
# D061 post-ingest chain for one acquisition batch. Usage: chain.sh <batch_id>  (logs to <batch>.chain.log)
# Never pipe these through head (SIGPIPE kills the step); everything goes to the log file.
set -u
B="$1"; cd /home/jhoffen/dewwey/apps/web || exit 1
mkdir -p "$(dirname "${ACQ_LOG_DIR:-/home/jhoffen/dewwey/apps/web/scripts/graph/tmp_analysis/acq_logs}/x")"; L="${ACQ_LOG_DIR:-/home/jhoffen/dewwey/apps/web/scripts/graph/tmp_analysis/acq_logs}/$B.chain.log"
R=/home/jhoffen/dewwey/apps/web/scripts
{
echo "== $(date -u +%H:%M:%S) parse";        bun run $R/graph/runStackParserBaseline.ts --acquisition-batch "$B"
echo "== $(date -u +%H:%M:%S) cluster v2";   bun run $R/graph/runJeremyWeddingClustering.ts --evidence-source structural --acquisition-batch "$B"
echo "== $(date -u +%H:%M:%S) cluster a1";   bun run $R/graph/runJeremyWeddingClustering.ts --evidence-source structural --eligibility venue-anchor-plus-wedding-keyword --clustering-version structural-v3-a1 --acquisition-batch "$B"
echo "== $(date -u +%H:%M:%S) reconcile";    bun run $R/graph/runJeremyWeddingReconciliation.ts --acquisition-batch "$B"
echo "== $(date -u +%H:%M:%S) reader v2";    bun run $R/classify/runExtract.ts --mode corpus --acquisition-batch "$B" --limit 2000 --write-verdicts --max-cost-usd 6
echo "== $(date -u +%H:%M:%S) reader a1";    bun run $R/classify/runExtract.ts --mode corpus --acquisition-batch "$B" --clustering-version structural-v3-a1 --limit 500 --write-verdicts --max-cost-usd 2
echo "== $(date -u +%H:%M:%S) create dry v2"; bun run $R/graph/createWeddingsFromJeremyEvidence.ts --from-confirmed-candidates --batch-id "$B-create-1" --acquisition-batch "$B" --dry-run
echo "== $(date -u +%H:%M:%S) create dry a1"; bun run $R/graph/createWeddingsFromJeremyEvidence.ts --from-confirmed-candidates --batch-id "$B-create-2" --acquisition-batch "$B" --clustering-version structural-v3-a1 --author-min-confidence 0.9 --dry-run
echo "== $(date -u +%H:%M:%S) funnel";       bun run $R/acquire/reportAcquisitionFunnel.ts --batch-id "$B"
echo "== $(date -u +%H:%M:%S) DONE"
} > "$L" 2>&1
grep -E "^== |DONE —|created [0-9]+ new|re-anchored|processed:|selected|eligible=|summary|venues moving|\| TOTAL" "$L" | tail -40
