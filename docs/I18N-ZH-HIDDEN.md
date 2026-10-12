# Chinese (zh) is hidden — how to re-enable

Since Oct 12, 2026, Chinese is hidden from the language picker until it is re-translated with Microsoft Translator (free tier resets Nov 1).
Reason: the old NLLB text had ~1,127 fields with missing characters (" - " gaps) and ~440 fields with dropped clauses.

What is hidden (nothing deleted):
- `js/i18n.js`: `'zh'` removed from `SUPPORTED`; `HIDDEN = ['zh']`.
- Visitors with `sos_lang=zh` saved, or `?lang=zh` in the URL, get English (saved value is reset to `en`).
- All data stays: `data/i18n/zh.json` and `data/i18n/zh/*.json`. There were no zh hreflang tags or sitemap entries, so nothing was removed there.

Re-enable (after the zh re-translation is done and spot-checked):
1. `python3 scripts/translate-new-cards.py --langs zh` (needs AZURE_TRANSLATOR_KEY; ~982k chars) — but first clear `_meta.source_hashes` in `data/i18n/zh/*.json` so every card is re-sent.
2. Reviewer spot-check ≥15 cards; scan for " - " gaps between Chinese characters.
3. In `js/i18n.js`: add `'zh'` back into `SUPPORTED` (between `'ko'` and `'fil'`) and set `HIDDEN = []`.
4. Commit, `git push origin HEAD:main`, check the picker at iPhone width, run `scripts/ping-indexnow.sh`.
