#!/usr/bin/env python3
"""
fetch_cas.py — Smart CAS number lookup for lab inventory

Usage:
    python scripts/fetch_cas.py data/inventory.json

Strategies (in order per item):
  1. CAS already in item name (e.g. "cas# 67-63-0") — instant, no API
  2. Sigma/Supelco/Merck/Aldrich items — lookup by Cat_No via Sigma API
  3. PubChem name search with progressively cleaned variants:
     - Strip concentration prefixes (0.5M, 1M, 200mM, 10%, 95%)
     - Strip stereochemistry (±, D-, L-, R-, S-)
     - Strip salt/hydrate suffixes (hydrochloride, dihydrate, sodium salt...)
     - Strip Roman numerals (Iron(III) → Iron)
  4. Skip confirmed non-CAS items (buffers, kits, solutions, mixtures)

Only writes to CAS_No field. Never modifies Item_Name or any other field.
Safe to re-run — skips items that already have CAS_No.
Runtime: ~15-25 min for 150 items.
"""

import json, re, sys, time, urllib.parse, urllib.request, ssl
from pathlib import Path

MSDS_CATS  = {'Chemical', 'Kit/Assay'}
RATE_LIMIT = 0.25   # seconds between requests (~4/sec, under PubChem 5/sec limit)
TIMEOUT    = 15
HEADERS    = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

# SSL context — bypasses certificate verification on Windows Python
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# Sigma/Merck manufacturer keywords
SIGMA_MFR = re.compile(r'sigma|supelco|aldrich|merck', re.IGNORECASE)

# Items that genuinely have no single CAS — skip immediately
SKIP_RE = re.compile(r'''
    \b(buffer|lysis|running|transfer|blocking|wash|elution|loading|
       standard\s+solution|working\s+solution|
       phosphate.buffered|tris.buffered|tris.caps|
       folin|griess|modified\s+solution|
       10x|1x|2x|\dx\s|
       fbs|serum|lysate|
       rnase.free.water|depc.water|
       wizard|powersoil|powerwater|powerfecal|
       restore|stripping\s+buffer|
       bca\s+protein|pierce|
       sephadex|sepharose|
       hybrid-r|riboex|trizol|
       giemsa.*solution|
       ponceau.*solution)\b
''', re.VERBOSE | re.IGNORECASE)

# Concentration prefix: 0.5M, 1M, 200mM, 10%, 95.0%, 1N etc.
CONC_RE = re.compile(
    r'^\d+\.?\d*\s*(M|mM|uM|nM|N|%)\s+',
    re.IGNORECASE
)

# Stereochemistry prefix
STEREO_RE = re.compile(
    r'^[\(\[]?(±|\+|-|D|L|R|S|E|Z|cis|trans|endo|exo|erythro|threo)[\)\]]?[-\s]',
    re.IGNORECASE
)

# Salt/hydrate suffix
SALT_RE = re.compile(
    r',?\s*(hydrochloride|hydrobromide|dihydrochloride|trihydrochloride|'
    r'sulfate|bisulfate|acetate|chloride|bromide|iodide|phosphate|'
    r'citrate|tartrate|fumarate|maleate|succinate|nitrate|nitrite|'
    r'sodium\s+salt|potassium\s+salt|calcium\s+salt|'
    r'sodium|potassium|calcium|magnesium|zinc|ammonium|'
    r'monohydrate|dihydrate|trihydrate|tetrahydrate|hemihydrate|'
    r'anhydrous|hemi\w+|'
    r'form\b|salt\b|free\s+base|reduced\b)\s*$',
    re.IGNORECASE
)

# Roman numerals e.g. Iron(III), Cobalt(II)
ROMAN_RE = re.compile(r'\s*[\(\[]?[IVXivx]{1,4}[\)\]]?(?=\s|$|,)')

# Purity/grade suffixes
PURITY_RE = re.compile(
    r',?\s*(≥|>=|>)?\s*\d+\.?\d*\s*%.*$|'
    r',?\s*(for analysis|suitable for|ACS|HPLC|GR|AR|PA|RPE|puriss|purum|'
    r'biotechnology grade|reagent grade|cell culture grade|analytical grade|'
    r'pharmaceutical grade|minum \d+%|minimum \d+%|titration)\b.*$',
    re.IGNORECASE
)


def extract_cas_from_name(name: str) -> str | None:
    """Extract CAS directly embedded in item name."""
    m = re.search(r'cas#?\s*([\d]{2,7}-[\d]{2}-[\d])', name, re.IGNORECASE)
    return m.group(1).strip() if m else None


def clean_name(name: str) -> str:
    """Strip all non-chemical metadata from name."""
    name = re.sub(r'\s*\[.*?\]', '', name)
    name = re.sub(r'\s*\(cas#?[^)]*\)', '', name, flags=re.IGNORECASE)
    name = re.sub(r'\s*\([^)]*synonyms?[^)]*\)', '', name, flags=re.IGNORECASE)
    name = re.sub(r',?\s*\d+\.?\d*\s*(mg|g|mL|L|uL|ug|kg)\b.*$', '', name, flags=re.IGNORECASE)
    name = PURITY_RE.sub('', name)
    name = re.sub(r'\s+', ' ', name)
    return name.strip(' ,.')


def name_variants(raw: str) -> list[str]:
    """Generate progressively simpler search variants."""
    base = clean_name(raw)
    seen = set()
    variants = []

    def add(v):
        v = v.strip(' ,.')
        if v and len(v) >= 3 and v not in seen:
            seen.add(v)
            variants.append(v)

    add(base)

    # Strip concentration prefix (0.5M, 1M, 200mM, 10% etc.)
    no_conc = CONC_RE.sub('', base).strip()
    add(no_conc)

    # Strip stereochemistry prefix
    no_stereo = STEREO_RE.sub('', no_conc or base).strip()
    add(no_stereo)

    # Strip Roman numerals
    no_roman = ROMAN_RE.sub('', no_stereo or base).strip()
    add(no_roman)

    # Strip salt/hydrate suffix from each variant so far
    for v in list(variants):
        add(SALT_RE.sub('', v))

    return variants


def pubchem_cas(name: str) -> str | None:
    """PubChem: name → CID → CAS from synonyms."""
    url = ('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/'
           f'{urllib.parse.quote(name)}/property/IUPACName/JSON')
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CTX) as r:
            d = json.load(r)
        cid = d['PropertyTable']['Properties'][0]['CID']
    except Exception:
        return None

    time.sleep(RATE_LIMIT)

    url2 = f'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{cid}/synonyms/JSON'
    try:
        req2 = urllib.request.Request(url2, headers=HEADERS)
        with urllib.request.urlopen(req2, timeout=TIMEOUT, context=SSL_CTX) as r:
            d2 = json.load(r)
        syns = d2['InformationList']['Information'][0]['Synonym']
        hits = [s for s in syns if re.match(r'^\d{2,7}-\d{2}-\d$', s)]
        return hits[0] if hits else None
    except Exception:
        return None


def sigma_cas_via_pubchem(cat_no: str) -> str | None:
    """Look up Sigma Cat_No via PubChem — PubChem indexes Sigma catalog numbers as synonyms."""
    # Clean cat number
    cat = re.sub(r'\s+', '', cat_no)
    url = (f'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/'
           f'{urllib.parse.quote(cat)}/cids/JSON')
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CTX) as r:
            d = json.load(r)
        cid = d['IdentifierList']['CIDs'][0]
    except Exception:
        return None

    time.sleep(RATE_LIMIT)

    url2 = f'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{cid}/synonyms/JSON'
    try:
        req2 = urllib.request.Request(url2, headers=HEADERS)
        with urllib.request.urlopen(req2, timeout=TIMEOUT, context=SSL_CTX) as r:
            d2 = json.load(r)
        syns = d2['InformationList']['Information'][0]['Synonym']
        hits = [s for s in syns if re.match(r'^\d{2,7}-\d{2}-\d$', s)]
        return hits[0] if hits else None
    except Exception:
        return None


def main():
    if len(sys.argv) < 2:
        print(__doc__); raise SystemExit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        raise SystemExit(f'Not found: {path}')

    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    items = data['items']

    targets = [i for i in items
               if i.get('Category') in MSDS_CATS
               and not i.get('CAS_No', '').strip()]
    total = len(targets)
    print(f'\nSearching CAS for {total} items missing CAS_No...\n')

    found = skipped = not_found = 0
    results = []

    for idx, item in enumerate(targets):
        iid    = item['Item_ID']
        name   = item.get('Item_Name', '')
        cat_no = item.get('Cat_No', '').strip()
        mfr    = item.get('Manufacturer', '')

        print(f'[{idx+1}/{total}] {iid}: {name[:52]}', end='', flush=True)

        # 1. CAS embedded in name
        cas = extract_cas_from_name(name)
        if cas:
            item['CAS_No'] = cas
            found += 1
            results.append((iid, cas, 'in name'))
            print(f' → {cas}')
            continue

        # 2. Skip confirmed non-CAS items
        cleaned = clean_name(name)
        if SKIP_RE.search(cleaned):
            skipped += 1
            print(' → skip (mixture/kit/solution)')
            continue

        # 3. Sigma Cat_No lookup via PubChem
        if cat_no and SIGMA_MFR.search(mfr):
            time.sleep(RATE_LIMIT)
            cas = sigma_cas_via_pubchem(cat_no)
            if cas:
                item['CAS_No'] = cas
                found += 1
                results.append((iid, cas, f'Sigma Cat#{cat_no}'))
                print(f' → {cas} (Sigma Cat#)')
                continue
            print(f' [Sigma miss]', end='')

        # 4. PubChem with name variants
        variants = name_variants(name)
        cas = None
        used = None
        for v in variants:
            time.sleep(RATE_LIMIT)
            cas = pubchem_cas(v)
            if cas:
                used = v
                break

        if cas:
            item['CAS_No'] = cas
            found += 1
            results.append((iid, cas, used))
            note = f' (via: "{used}")' if used != cleaned else ''
            print(f' → {cas}{note}')
        else:
            not_found += 1
            print(' → not found')

    # Save — only CAS_No fields changed, everything else untouched
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f'\n{"="*60}')
    print(f'  CAS found   : {found}')
    print(f'  Not found   : {not_found}')
    print(f'  Skipped     : {skipped}')
    print(f'  Total       : {total}')
    print(f'  Saved to    : {path}')
    print(f'{"="*60}')
    if results:
        print(f'\n  Added {len(results)} CAS numbers:')
        for iid, cas, src in results:
            print(f'    {iid}: {cas}  [{src}]')
    print()


if __name__ == '__main__':
    main()
