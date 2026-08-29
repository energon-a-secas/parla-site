#!/usr/bin/env python3
"""Check dictionary coverage, and validate every country code the data uses.

Validation runs first and exits non-zero on a bad code. This is the guard that
would have caught the "_CL" typo, which rendered as literal text where a flag
belonged and made that variant invisible to the CL filter.
"""

import json
import sys
from collections import defaultdict

with open('api/v1/dictionary.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

with open('api/v1/expressions.json', 'r', encoding='utf-8') as f:
    expressions = json.load(f)['expressions']

# Countries come from the data, never a hardcoded list, so this script cannot
# go stale when a country is added.
COUNTRIES = list(data['countries'])
concepts = data['concepts']
total_concepts = len(concepts)

# -- Validation ------------------------------------------------------------

errors = []

for code, meta in data['countries'].items():
    if code != code.upper() or len(code) != 2:
        errors.append(f"country key {code!r} is not an uppercase alpha-2 code")
    for field in ('name', 'flag', 'color'):
        if not meta.get(field):
            errors.append(f"country {code} is missing {field!r}")
    anchor = meta.get('anchor') or {}
    if not isinstance(anchor.get('lon'), (int, float)) or not isinstance(anchor.get('lat'), (int, float)):
        errors.append(f"country {code} is missing a numeric anchor lon/lat")

for concept in concepts:
    for variant in concept['variants']:
        for code in variant['countries']:
            if code not in data['countries']:
                errors.append(
                    f"unknown country code {code!r} in {concept['id']} / {variant['term']!r}"
                )

# A concept listing the same term twice is the data shape behind the bug where a
# country appeared on the globe but on no card: the renderer merges these rows,
# and every surface that forgot to merge disagreed with the one that did. The
# renderer still merges defensively, so this keeps the data honest rather than
# relying on it.
for concept in concepts:
    seen_terms = {}
    for variant in concept['variants']:
        key = variant['term'].strip().lower()
        if key in seen_terms:
            errors.append(
                f"concept {concept['id']!r} lists {variant['term']!r} twice "
                f"({seen_terms[key]} and {variant['countries']}); merge them into one variant"
            )
        seen_terms[key] = variant['countries']

# Expressions carry the same risk as variants and worse: a bad code here also
# drops the phrase out of its country group entirely, so it renders nowhere.
seen_ids = set()
for e in expressions:
    if e['country'] not in data['countries']:
        errors.append(f"unknown country code {e['country']!r} in expression {e['id']!r}")
    if e['id'] in seen_ids:
        errors.append(f"duplicate expression id {e['id']!r}")
    seen_ids.add(e['id'])
    # literal and meaning are the section's whole reason to exist; an entry
    # missing either is a phrase with no answer behind it.
    for field in ('phrase', 'literal', 'meaning'):
        if not e.get(field):
            errors.append(f"expression {e['id']!r} is missing {field!r}")

if errors:
    print("VALIDATION FAILED", file=sys.stderr)
    for err in errors:
        print(f"  {err}", file=sys.stderr)
    sys.exit(1)

# -- Coverage report -------------------------------------------------------

print("=" * 80)
print("DICTIONARY COVERAGE REPORT")
print("=" * 80)

expr_counts = defaultdict(int)
for e in expressions:
    expr_counts[e['country']] += 1
print(f"\nExpressions: {len(expressions)} across {len(expr_counts)} countries")
print("  " + "  ".join(f"{c}:{expr_counts[c]}" for c in COUNTRIES))

country_counts = defaultdict(int)

for concept in concepts:
    countries_in_concept = set()
    for variant in concept['variants']:
        countries_in_concept.update(variant['countries'])

    for country in COUNTRIES:
        if country in countries_in_concept:
            country_counts[country] += 1

print(f"\nTotal concepts: {total_concepts}")
print(f"Countries: {len(COUNTRIES)} ({', '.join(COUNTRIES)})")
print("\nCountry coverage:")
for country in COUNTRIES:
    pct = (country_counts[country] / total_concepts) * 100
    print(f"  {country}: {country_counts[country]:3d}/{total_concepts} ({pct:.1f}%)")

print("\n" + "=" * 80)
print("CONCEPTS WITH INCOMPLETE COVERAGE (missing 2+ countries)")
print("=" * 80)

for concept in concepts:
    countries_in_concept = set()
    for variant in concept['variants']:
        countries_in_concept.update(variant['countries'])

    missing = [c for c in COUNTRIES if c not in countries_in_concept]

    if len(missing) >= 2:
        print(f"\n{concept['id']} - {concept['meaning_en']}")
        print(f"  Has: {', '.join(sorted(countries_in_concept))}")
        print(f"  Missing: {', '.join(missing)}")
        print(f"  Category: {concept['category']}")
