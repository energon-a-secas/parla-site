# Product

## Register

product

## Users

- Spanish-primary or bilingual people curious about how Latin America actually talks day to day
- Remote workers, travelers, and developers in distributed LATAM teams (Neorgon "Remote Worker" persona)
- Context: quick lookup on phone or laptop, often casual browsing; they want the right regional word without opening a dry dictionary or a corporate glossary

## Product Purpose

Search any slang term or English meaning and see regional equivalents in a visual radial diagram across Chile, Colombia, Argentina, Mexico, Peru, and Venezuela. Browse by category, filter by country, share deep links. Zero signup; static JSON API for programmatic use.

Success means a user finds the right word fast, understands cross-country differences at a glance, and leaves feeling the tool celebrates regional diversity rather than flattening it.

## Brand Personality

**Cultural · Lively · Inclusive**

Voice is warm and conversational in Spanish (playful word-of-day prompts, informal browse copy), not institutional. English is used where it aids search (meanings, meta, API). The interface should feel like overhearing a good conversation across borders, not grading vocabulary.

## Anti-references

- Dry dictionary or Wikipedia tone (no personality, no delight, no cultural framing)
- Generic SaaS dashboard patterns (hero metrics, identical icon-heading-text card grids, modal-first flows)
- Indistinguishable Neorgon hub clone (decorative glass on every surface, purple accent with no regional character)
- Corporate stiff Spanish UX (formal labels, bureaucratic phrasing, "enterprise" calm)

## Design Principles

1. **The diagram is the product.** Search and browse exist to feed the radial map; the map is the payoff, not a secondary panel.
2. **Country color is data.** Each nation's hue should read in diagram nodes and the canvas map; accent purple supports chrome, not replace regional identity.
3. **Progressive disclosure.** Intro example pills, then results, then diagram; browse fills idle time without competing with search.
4. **Zero friction.** No account; only country and category filters persist; keyboard shortcuts (`/` focus, Escape back) for power users.
5. **Bilingual by purpose.** Spanish carries cultural voice; English supports discovery (meanings, meta, share text where appropriate).

## Accessibility & Inclusion

- Target **WCAG 2.1 AA** for text contrast and keyboard operation
- Visible labels (or equivalent `aria-label`) for search and filter controls; interactive surfaces must not be mouse-only
- Honor `prefers-reduced-motion` (animations collapse to instant state changes)
- Do not rely on color alone: pair country node colors with flags and country names in labels
