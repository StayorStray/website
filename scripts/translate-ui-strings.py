#!/usr/bin/env python3
"""Translate the page-chrome UI strings (headlines, blurbs, payment/privacy notices, signup, Expedia labels)
into every language with Microsoft Translator (Azure free tier) and write them into data/i18n/<lang>.json "ui".

Env: AZURE_TRANSLATOR_KEY (required), AZURE_TRANSLATOR_REGION (default eastus). Never printed.
Usage: scripts/translate-ui-strings.py [--langs ja,ko] [--dry-run] [--backtranslate DIR]
Brand names are wrapped in <span class="notranslate"> so they stay untouched. Usage is added to
~/.spotandtravel-azure-usage.json (same counter as translate-new-cards.py).
"""
import argparse, html, json, os, re, sys, time, uuid, urllib.request, urllib.error, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USAGE = os.path.expanduser("~/.spotandtravel-azure-usage.json")
AZ = {"zh": "zh-Hans", "pt": "pt-br"}
LANGS = ["es", "fr", "de", "ru", "ja", "nl", "pt", "ko", "zh", "fil"]
PROTECT = ["Spot and Travel", "Xaman", "XRPL", "Stripe", "HTTPS", "Expedia", "Atlantis The Palm", "Fairmont Banff Springs",
           "Hofbräuhaus", "Brazen Head", "hello@spotandtravel.com", "{name}"]

# English source: new/changed keys (page headlines and intros are extracted from the current pages).
EN = json.load(open(os.path.join(ROOT, "scripts", "ui-new-en.json")))
# Short labels where machine translation is ambiguous: hand-set per language.
HAND = {
  "support_link":    dict(es="Ayuda", fr="Aide", de="Hilfe", ru="Поддержка", ja="サポート", nl="Hulp", pt="Suporte", ko="고객 지원", zh="帮助", fil="Tulong"),
  "signup_privacy":  dict(es="Privacidad", fr="Confidentialité", de="Datenschutz", ru="Конфиденциальность", ja="プライバシー", nl="Privacy", pt="Privacidade", ko="개인정보", zh="隐私", fil="Privacy"),
}

def month(): return datetime.date.today().strftime("%Y-%m")
def load_usage():
    try: return json.load(open(USAGE))
    except Exception: return {}
def add_usage(n):
    u = load_usage(); u[month()] = u.get(month(), 0) + n; json.dump(u, open(USAGE, "w"))

def wrap(t):
    t = html.escape(t, quote=False)
    for p in sorted(PROTECT, key=len, reverse=True):
        t = re.sub(r'(?<!notranslate">)' + re.escape(html.escape(p, quote=False)), lambda m: '<span class="notranslate">' + m.group(0) + '</span>', t)
    return t
def unwrap(t):
    t = re.sub(r'<span class="notranslate">(.*?)</span>', r'\1', t)
    t = re.sub(r'</?[a-z][^>]*>', '', t)
    return html.unescape(t).strip()

def call(texts, src, dst, key, region):
    body = json.dumps([{"Text": t} for t in texts]).encode()
    url = "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=%s&to=%s&textType=html" % (src, AZ.get(dst, dst) if dst != "en" else "en")
    for attempt in range(8):
        req = urllib.request.Request(url, data=body, headers={"Ocp-Apim-Subscription-Key": key, "Ocp-Apim-Subscription-Region": region,
                                     "Content-Type": "application/json", "X-ClientTraceId": str(uuid.uuid4())})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return [x["translations"][0]["text"] for x in json.load(r)]
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500: time.sleep(min(60, 5 * 2 ** attempt)); continue
            sys.exit("Azure error %d" % e.code)
    sys.exit("Azure: too many retries")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", default=",".join(LANGS)); ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--qa-dir", default=""); ap.add_argument("--monthly-cap", type=int, default=1_900_000)
    a = ap.parse_args()
    key = os.environ.get("AZURE_TRANSLATOR_KEY"); region = os.environ.get("AZURE_TRANSLATOR_REGION", "eastus")
    todo = [k for k in EN if True]
    mt_keys = [k for k in todo if k not in HAND]
    per_lang = sum(len(wrap(EN[k])) for k in mt_keys)
    langs = a.langs.split(",")
    print("keys:", len(todo), "chars/lang (incl. markup):", per_lang, "x", len(langs), "=", per_lang * len(langs), "(+ same again for back-translation)")
    if a.dry_run: return
    if not key: sys.exit("AZURE_TRANSLATOR_KEY not set")
    sent = 0
    for lang in langs:
        if load_usage().get(month(), 0) + per_lang * 2 > a.monthly_cap: sys.exit("monthly cap would be exceeded")
        outs = call([wrap(EN[k]) for k in mt_keys], "en", lang, key, region); add_usage(sum(len(wrap(EN[k])) for k in mt_keys)); sent += per_lang
        res = {k: unwrap(v) for k, v in zip(mt_keys, outs)}
        for k, v in HAND.items(): res[k] = v[lang]
        if a.qa_dir:
            os.makedirs(a.qa_dir, exist_ok=True); json.dump(res, open(os.path.join(a.qa_dir, "xl-%s.json" % lang), "w"), ensure_ascii=False, indent=1)
        print(lang, "ok", flush=True)
    print("chars sent this run:", sent, "month total:", load_usage().get(month(), 0))

if __name__ == "__main__": main()
