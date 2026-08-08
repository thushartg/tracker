#!/bin/sh
# Stamp app.js and style.css references with a hash of the file's own contents,
# so each deploy asks for a URL no cache can answer with a stale copy.
#
# GitHub Pages sends `cache-control: max-age=600` on everything and the pages
# request their assets by bare name, so without this a change sits invisible for
# up to ten minutes and looks like the deploy failed.
#
# The version is derived, never typed. There is no number to remember to bump,
# and a stamp can never disagree with the file it points at.
#
# Run by scripts/githooks/pre-commit. Safe to run by hand at any time; it is
# idempotent and rewrites nothing when the contents have not changed.
set -eu

cd "$(dirname "$0")/.."

PAGES="index.html tasks.html"
changed=0

for asset in app.js style.css; do
  hash=$(shasum "$asset" | cut -c1-8)
  for page in $PAGES; do
    [ -f "$page" ] || continue
    before=$(shasum "$page")
    # Matches the bare name or an existing ?v=..., so re-running is a no-op.
    perl -pi -e "s{\Q$asset\E(\?v=[0-9a-f]+)?}{$asset?v=$hash}g" "$page"
    [ "$before" = "$(shasum "$page")" ] || changed=1
  done
done

[ "$changed" -eq 1 ] && echo "stamp-assets: asset versions updated"
exit 0
