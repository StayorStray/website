"""Create Spot and Travel products, prices and the 6 manual-capture (card HOLD) Payment Links.

  python3 stripe_setup.py test   # uses env STRIPE_TEST_RESTRICTED_KEY (rk_test_…)
  python3 stripe_setup.py live   # uses env STRIPE_LIVE_RESTRICTED_KEY (rk_live_…) — see GO-LIVE.md

Idempotent: reuses prices found by lookup_key and links found by metadata. The key is read
from the environment and never printed. Prints the link URLs to paste into config/submit.js.
Key permissions needed: Products write, Prices write, Payment Links write
(+ Checkout Sessions read and PaymentIntents write to look up / capture / cancel holds)."""
import os, json, sys, requests
MODE=(sys.argv[1] if len(sys.argv)>1 else 'test'); assert MODE in ('test','live')
KEY=os.environ['STRIPE_%s_RESTRICTED_KEY'%MODE.upper()]; assert KEY.startswith(('rk_%s_'%MODE,'sk_%s_'%MODE))
API='https://api.stripe.com/v1'; S=requests.Session(); S.auth=(KEY,'')
SUBMIT='https://spotandtravel.com/pages/submit-a-place.html'
def call(method, path, **data):
    r=S.request(method, API+path, data=data if method=='POST' else None, params=data if method=='GET' else None)
    j=r.json()
    if 'error' in j:
        print('STRIPE ERROR', method, path, r.status_code, j['error'].get('type'), j['error'].get('code'), j['error'].get('message')); sys.exit(2)
    return j
PRODUCTS=[('founding_standard','Founding Standard listing',3999,'Spot and Travel listing — year 1 founding rate (one-time).'),
          ('standard','Standard listing',4999,'Spot and Travel listing — 12 months.'),
          ('hidden_gems','Hidden Gems listing',9999,'Spot and Travel Hidden Gems listing — 12 months.'),
          ('pin_7d','7-day pin add-on',3999,'Keeps the card in its tab’s first 25 for 7 days after it goes live (pin clock starts at go-live).')]
prices={}
for sku,name,amt,desc in PRODUCTS:
    lk='sat_%s_'%MODE+sku
    ex=call('GET','/prices',**{'lookup_keys[]':lk,'active':'true'})['data']
    if ex: p=ex[0]
    else:
        prod=call('POST','/products',name=name,description=desc,**{'metadata[sku]':sku,'metadata[site]':'spot-and-travel'})
        p=call('POST','/prices',product=prod['id'],unit_amount=amt,currency='usd',lookup_key=lk,**{'metadata[sku]':sku})
    assert p['unit_amount']==amt and p['currency']=='usd' and p['type']=='one_time' and p['livemode']==(MODE=='live')
    prices[sku]=dict(price=p['id'],product=p['product'],amount=amt)
HOLD_MSG=('Your card is only authorized (held) now — it is charged when your listing is approved. '
          'If the listing is rejected, the hold is released and you pay nothing. The hold may show as pending on your statement.')
existing=[l for l in call('GET','/payment_links',limit=100,active='true')['data'] if l['metadata'].get('site')=='spot-and-travel']
links={}
for sku in ('founding_standard','standard','hidden_gems'):
    for pin in (False,True):
        key=f'{sku}{"_pin" if pin else ""}'
        found=[l for l in existing if l['metadata'].get('key')==key]
        if found: l=found[0]
        else:
            d={'line_items[0][price]':prices[sku]['price'],'line_items[0][quantity]':1,
               'payment_intent_data[capture_method]':'manual',
               'payment_intent_data[metadata][sku]':sku,'payment_intent_data[metadata][pin_7d]':'yes' if pin else 'no',
               'payment_intent_data[metadata][site]':'spot-and-travel',
               'payment_intent_data[description]':'Spot and Travel listing hold — '+sku+(' + 7-day pin' if pin else ''),
               'after_completion[type]':'redirect','after_completion[redirect][url]':SUBMIT+'?checkout=success&session_id={CHECKOUT_SESSION_ID}',
               'payment_method_types[0]':'card','submit_type':'pay','custom_text[submit][message]':HOLD_MSG,
               'metadata[site]':'spot-and-travel','metadata[key]':key,'metadata[sku]':sku,'metadata[pin_7d]':'yes' if pin else 'no'}
            if pin: d.update({'line_items[1][price]':prices['pin_7d']['price'],'line_items[1][quantity]':1})
            l=call('POST','/payment_links',**d)
        links[key]=dict(id=l['id'],url=l['url'],livemode=l['livemode'])
out=dict(mode=MODE,prices=prices,payment_links=links)
print(json.dumps(out,indent=2))
