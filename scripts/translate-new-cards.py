#!/usr/bin/env python3
"""Translate new/changed card text with Microsoft Translator (Azure).

Tracks a SHA-256 of each card's English source in data/i18n/<lang>/<section>.json
under _meta.source_hashes. Only cards whose hash is missing or different are sent.
Cards that are hand-translated in data/i18n/<lang>.json "cards" are never touched.

Env: AZURE_TRANSLATOR_KEY (required), AZURE_TRANSLATOR_REGION (default eastus).
Usage:
  scripts/translate-new-cards.py --dry-run                # show chars needed
  scripts/translate-new-cards.py --langs ja,ko --budget 500000
Usage log (chars sent per calendar month) kept in ~/.spotandtravel-azure-usage.json;
the script refuses to exceed --monthly-cap (default 1,900,000).
"""
import argparse, hashlib, json, os, sys, time, uuid, urllib.request, urllib.error, datetime, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENDPOINT = "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to={to}&textType=plain"
AZ_CODE = {"zh": "zh-Hans", "fil": "fil", "pt": "pt-br"}
ALL_LANGS = ["ja", "ko", "zh", "fr", "de", "ru", "fil", "nl", "es", "pt"]
USAGE = os.path.expanduser("~/.spotandtravel-azure-usage.json")
FIELDS = ["one_liner", "why_go", "best_time", "how_to_get_there", "good_to_know"]

def month(): return datetime.date.today().strftime("%Y-%m")
def load_usage():
    try: return json.load(open(USAGE))
    except Exception: return {}
def add_usage(n):
    u = load_usage(); u[month()] = u.get(month(), 0) + n
    json.dump(u, open(USAGE, "w"))

def card_hash(c):
    src = {"short_line": c.get("short_line", ""), "country": c.get("country", ""),
           "facts": {k: c.get("facts", {}).get(k, "") for k in FIELDS}}
    return hashlib.sha256(json.dumps(src, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]

def sections():
    out = []
    for f in sorted(os.listdir(os.path.join(ROOT, "data"))):
        p = os.path.join(ROOT, "data", f)
        if not f.endswith(".json") or f == "country-list.json": continue
        try: d = json.load(open(p))
        except Exception: continue
        cards = d if isinstance(d, list) else d.get("cards") if isinstance(d, dict) else None
        if isinstance(cards, list) and cards and isinstance(cards[0], dict) and "facts" in cards[0]:
            out.append((f[:-5], cards))
    return out

def call(texts, lang, key, region):
    body = json.dumps([{"Text": t} for t in texts]).encode()
    for attempt in range(8):
        req = urllib.request.Request(ENDPOINT.format(to=AZ_CODE.get(lang, lang)), data=body, headers={
            "Ocp-Apim-Subscription-Key": key, "Ocp-Apim-Subscription-Region": region,
            "Content-Type": "application/json", "X-ClientTraceId": str(uuid.uuid4())})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return [x["translations"][0]["text"] for x in json.load(r)]
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:300]
            if e.code == 429 or e.code >= 500:
                time.sleep(min(60, 5 * 2 ** attempt)); continue
            sys.exit(f"Azure error {e.code}: {msg}")
    sys.exit("Azure: too many retries")

def save(p, d, sec):
    d["_meta"].update({"machine_translated": True, "engine": "Microsoft Translator (Azure)", "source": "en", "section": sec})
    tmp = p + ".tmp"; json.dump(d, open(tmp, "w"), ensure_ascii=False, separators=(",", ":")); os.replace(tmp, p)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", default=",".join(ALL_LANGS))
    ap.add_argument("--sections", default="")
    ap.add_argument("--budget", type=int, default=10**9, help="max chars this run")
    ap.add_argument("--monthly-cap", type=int, default=1_900_000)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--batch-chars", type=int, default=9000)
    a = ap.parse_args()
    key = os.environ.get("AZURE_TRANSLATOR_KEY")
    region = os.environ.get("AZURE_TRANSLATOR_REGION", "eastus")
    if not key and not a.dry_run: sys.exit("AZURE_TRANSLATOR_KEY not set")
    secs = [s for s in sections() if not a.sections or s[0] in a.sections.split(",")]
    sent_run = 0
    for lang in a.langs.split(","):
        main_p = os.path.join(ROOT, "data", "i18n", lang + ".json")
        human = set((json.load(open(main_p)).get("cards") or {}).keys()) if os.path.exists(main_p) else set()
        for sec, cards in secs:
            p = os.path.join(ROOT, "data", "i18n", lang, sec + ".json")
            d = json.load(open(p)) if os.path.exists(p) else {"_meta": {"source": "en", "section": sec}, "cards": {}}
            meta = d.setdefault("_meta", {}); hashes = meta.setdefault("source_hashes", {})
            todo = [c for c in cards if c["id"] not in human and hashes.get(c["id"]) != card_hash(c)]
            need = sum(len(c.get("short_line", "")) + len(c.get("country", "")) + sum(len(c["facts"].get(k, "")) for k in FIELDS) for c in todo)
            print(f"{lang}/{sec}: {len(todo)} cards, {need} chars", flush=True)
            if a.dry_run or not todo: continue
            cache = {}; changed = 0
            for c in todo:
                items = [("short_line", c.get("short_line", "")), ("country", c.get("country", ""))] + \
                        [("f:" + k, c["facts"].get(k, "")) for k in FIELDS if c["facts"].get(k)]
                new = [t for _, t in items if t and t not in cache]
                n = sum(len(t) for t in set(new))
                used = load_usage().get(month(), 0)
                if sent_run + n > a.budget or used + n > a.monthly_cap:
                    print(f"STOP: budget reached (run {sent_run}, month {used})"); break
                uniq = list(dict.fromkeys(new))
                # batch within limits
                i = 0
                while i < len(uniq):
                    batch = []; size = 0
                    while i < len(uniq) and (not batch or size + len(uniq[i]) <= a.batch_chars) and len(batch) < 100:
                        batch.append(uniq[i]); size += len(uniq[i]); i += 1
                    out = call(batch, lang, key, region)
                    add_usage(size); sent_run += size
                    cache.update(zip(batch, out))
                tr = {"facts": {}}
                for f, t in items:
                    v = cache.get(t, t)
                    if f.startswith("f:"): tr["facts"][f[2:]] = v
                    else: tr[f] = v
                d["cards"][c["id"]] = tr; hashes[c["id"]] = card_hash(c); changed += 1
                if changed % 10 == 0: save(p, d, sec)
            if changed:
                save(p, d, sec)
                print(f"  wrote {changed} cards; run chars {sent_run}", flush=True)
            if sent_run >= a.budget or load_usage().get(month(), 0) >= a.monthly_cap:
                print("Budget exhausted."); return
    print(f"Done. chars sent this run: {sent_run}; month total: {load_usage().get(month(), 0)}")

if __name__ == "__main__": main()
