---
name: Parla
description: Latin American slang map with regional color and a radial cross-country diagram
colors:
  canvas-bg: "#040714"
  surface-1: "rgba(255,255,255,0.03)"
  surface-2: "rgba(255,255,255,0.06)"
  surface-3: "rgba(255,255,255,0.09)"
  border-subtle: "rgba(255,255,255,0.07)"
  border: "rgba(255,255,255,0.1)"
  border-strong: "rgba(255,255,255,0.22)"
  text-primary: "#f9f9f9"
  text-secondary: "#cacaca"
  text-muted: "rgba(255,255,255,0.45)"
  accent: "#c084fc"
  accent-bright: "#d8b4fe"
  accent-dim: "rgba(192,132,252,0.12)"
  header-magenta: "#B015B0"
  header-violet: "#3D0080"
  success-share: "#4ade80"
typography:
  display:
    fontFamily: "'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  sm: "6px"
  md: "10px"
  lg: "15px"
  pill: "20px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent-dim}"
    textColor: "{colors.accent-bright}"
    rounded: "{rounded.md}"
    padding: "8px 18px"
  input-search:
    backgroundColor: "rgba(255,255,255,0.04)"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "18px 52px"
  card-surface:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "16px 24px"
---

# Design System: Parla

## Overview

**Creative North Star: "The Regional Plaza"**

Parla looks like a night map of conversations: deep canvas, country colors on the diagram, and Neorgon chrome only at the edges. Surfaces stay quiet so slang terms and flags carry the energy. Density is moderate: one strong search field, filters on one row, then either a radial diagram or a short list of matches.

This system rejects dry dictionary layouts, generic SaaS card grids, and hub-purple glass on every element. Depth comes from tonal surfaces and the canvas dot-map, not from stacked modal cards.

**Key characteristics:**

- Dark canvas (`#040714`) with per-country node colors from dictionary data
- Purple accent for focus, search, and Neorgon header alignment, not for all cards
- Single type family (Avenir Next stack) with scale + weight hierarchy
- Motion: short fades and diagram entrance; no bounce easing on primary transitions
- Glass blur sparingly (header + search at most after polish)

## Colors

A restrained Neorgon-dark base with a **full palette** of country hues in the diagram layer.

### Primary

- **Plaza Violet** (`#c084fc` / accent): Focus rings, search highlight, word-of-day border, diagram center stroke. Chrome accent, not fill for every card.

### Secondary

- **Bright Lilac** (`#d8b4fe` / accent-bright): Hero terms in browse and diagram center, example pill text on hover.

### Neutral

- **Night Canvas** (`#040714`): Page background; map canvas sits on this.
- **Mist Surface** (`rgba(255,255,255,0.03–0.09)`): Cards, inputs, browse tiles via `--surface-1` … `--surface-3`.
- **Fog Text** (`#f9f9f9`, `#cacaca`, muted white): Primary, secondary, and helper copy.
- **Hairline Border** (`rgba(255,255,255,0.07–0.22)`): Dividers and card edges.

### Named Rules

**The Country-First Rule.** In the diagram and browse, country colors from `dictionary.json` (`CL` red, `CO` yellow, etc.) must dominate attention. Accent purple must not be the only memorable hue on screen.

**The Glass Sparingly Rule.** `backdrop-filter` is allowed on the sticky header and optionally the search field. Result cards, browse cards, and diagram nodes use solid or near-solid surfaces unless there is a documented exception.

## Typography

**Display / Body / Label Font:** Avenir Next with system-ui fallbacks (single family throughout).

**Character:** Friendly and readable; hierarchy from size and weight, not a second display face. Line length for intro and meanings stays within ~65–75ch where prose blocks appear.

### Hierarchy

- **Display** (700, 1.5rem / 1.25rem mobile): Diagram center term, browse hero lines.
- **Title** (600, 1.25rem): Result card terms, section browse headings.
- **Body** (400–500, 1rem / 0.875rem): Search input, meanings, filter labels.
- **Label** (500, 0.75rem): Word-of-day prompt, categories, node metadata.

### Named Rules

**The One Voice Rule.** Do not add a separate display font for marketing effect. Personality comes from copy and color, not from type pairing.

## Elevation

Mostly **flat tonal layering** with light shadows on hover (cards lift slightly). Diagram center uses a soft glow (`box-shadow` + inset highlight), not heavy drop shadows.

### Shadow Vocabulary

- **Card hover:** `0 4px 20px rgba(0,0,0,0.3)` on result cards; `0 8px 24px` on browse cards.
- **Search focus:** `0 8px 32px rgba(192,132,252,0.08)` plus 3px accent ring.
- **Toast:** `0 4px 20px rgba(0,0,0,0.55)` fixed bottom-right.

**The Flat-By-Default Rule.** Rest state surfaces use border + surface tint. Shadow appears on hover or focus, not at rest on every card.

## Components

### Buttons

- **Shape:** Pill radius (20px) for diagram back/share; 6–10px for pills and clears.
- **Primary action:** Example pills and browse expand use bordered surface + accent text; diagram controls are ghost pills on the center card.
- **Hover / Focus:** Border shifts to accent; `:focus-visible` outline 2px `accent-bright`. Avoid overshoot easing (`cubic-bezier` with values > 1).

### Chips

- **Example pills:** Rounded 20px, `surface-1` background, accent text; hover fills `accent-dim`.

### Cards / Containers

- **Corner Style:** 10px (`--radius`) default; 15px on search and diagram center.
- **Background:** `--surface-1` at rest; `--surface-2` on hover.
- **Border:** 1px `--border`; use full border or country-colored edge, not left-only accent stripes (Impeccable ban).
- **Internal Padding:** 16–24px horizontal on result/browse cards.

### Inputs / Fields

- **Search:** Large single field, icon left, clear control right; focus border `accent` + dim ring.
- **Selects:** Native `<select>` styled with custom chevron; `surface-1` background; require visible labels.

### Navigation (chrome)

- **Header:** 68px sticky bar, Neorgon gradient `135deg #B015B0 → #3D0080 → #040714`, logo inverted white, home icon right.

## Do's and Don'ts

**Do**

- Lead with the radial diagram when a term resolves to one concept.
- Show flags alongside country codes in nodes and cards.
- Keep Spanish copy lively in prompts and empty states.
- Use `prefers-reduced-motion` to strip entrance animations.

**Don't**

- Use `border-left` wider than 1px as the main card accent (use full border or country tint).
- Apply `backdrop-filter` to every card and node.
- Use bounce/elastic easing on diagram entrance.
- Use em dashes in user-facing strings (commas, colons, or periods instead).
- Default to identical icon + heading + blurb card grids for browse (vary density; diagram is the hero).
