#!/usr/bin/env python3
"""Check dictionary coverage - find concepts missing country variants."""

import json
from collections import defaultdict

COUNTRIES = ['CL', 'CO', 'AR', 'MX', 'PE', 'VE', 'BR']

with open('api/v1/dictionary.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("=" * 80)
print("DICTIONARY COVERAGE REPORT")
print("=" * 80)

concepts = data['concepts']
total_concepts = len(concepts)

# Count concepts with each country
country_counts = defaultdict(int)
missing_by_country = defaultdict(list)

for concept in concepts:
    countries_in_concept = set()
    for variant in concept['variants']:
        for country in variant['countries']:
            countries_in_concept.add(country)

    for country in COUNTRIES:
        if country in countries_in_concept:
            country_counts[country] += 1
        else:
            missing_by_country[country].append(concept['id'])

print(f"\nTotal concepts: {total_concepts}")
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
        for country in variant['countries']:
            countries_in_concept.add(country)

    missing = [c for c in COUNTRIES if c not in countries_in_concept]

    if len(missing) >= 2:
        country_list = ', '.join(countries_in_concept)
        missing_list = ', '.join(missing)
        print(f"\n{concept['id']} - {concept['meaning_en']}")
        print(f"  Has: {country_list}")
        print(f"  Missing: {missing_list}")
        print(f"  Category: {concept['category']}")
