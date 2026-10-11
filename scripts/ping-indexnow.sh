#!/usr/bin/env bash
# Ping IndexNow with sitemap URLs (or URL args).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
KEY_FILE=$(find . -maxdepth 1 -type f -regextype posix-extended -regex './[0-9a-f]{32}\.txt' | head -n1 | sed 's|^\./||' || true)
if [ -z "${KEY_FILE:-}" ]; then
  echo "No IndexNow key file at site root" >&2
  exit 1
fi
KEY=$(tr -d '[:space:]' < "$KEY_FILE")
HOST="spotandtravel.com"
KEY_LOCATION="https://${HOST}/${KEY_FILE}"
if [ "$#" -gt 0 ]; then
  URLS=("$@")
else
  mapfile -t URLS < <(grep -oP '(?<=<loc>)[^<]+' sitemap.xml)
fi
BODY=$(printf '%s\n' "${URLS[@]}" | KEY="$KEY" HOST="$HOST" KEY_LOCATION="$KEY_LOCATION" python3 -c '
import json, os, sys
urls = [u for u in sys.stdin.read().splitlines() if u.strip()]
print(json.dumps({
  "host": os.environ["HOST"],
  "key": os.environ["KEY"],
  "keyLocation": os.environ["KEY_LOCATION"],
  "urlList": urls,
}))
')
HTTP=$(curl -sS -o /tmp/indexnow-resp.txt -w '%{http_code}' \
  -X POST 'https://api.indexnow.org/indexnow' \
  -H 'Content-Type: application/json; charset=utf-8' \
  -d "$BODY")
echo "IndexNow HTTP $HTTP (${#URLS[@]} URLs)"
cat /tmp/indexnow-resp.txt 2>/dev/null || true
echo
case "$HTTP" in
  200|202) exit 0 ;;
  *) exit 1 ;;
esac
