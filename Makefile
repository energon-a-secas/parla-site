.DEFAULT_GOAL := help

PORT = 8817

# ── Help ──────────────────────────────────────────────────────────────────────
.PHONY: help
help:
	@echo ""
	@echo "  make serve     Start dev server → http://localhost:$(PORT)"
	@echo "  make kill      Kill this project's HTTP server"
	@echo "  make geometry  Rebuild data/americas.json from Natural Earth"
	@echo "  make coverage  Validate country codes + print coverage"
	@echo "  make check     Run the camera-fit tests (node, no deps)"
	@echo "  make check-stage  Open the runtime layout checks in a browser"
	@echo ""

# ── Dev server ────────────────────────────────────────────────────────────────
.PHONY: serve
serve:
	@echo "Serving → http://localhost:$(PORT)"
	@if [ -f ../../scripts/serve.py ]; then python3 ../../scripts/serve.py $(PORT); else python3 -m http.server $(PORT); fi

# ── Data ──────────────────────────────────────────────────────────────────────
.PHONY: geometry
geometry:
	@python3 scripts/build_geometry.py --cache /tmp/ne50.geojson

.PHONY: coverage
coverage:
	@python3 scripts/check_coverage.py

# ── Tests ─────────────────────────────────────────────────────────────────────
# js/camerafit.js is pure trigonometry with no three.js and no DOM, which is the
# whole reason it is a separate file: the framing bugs that shipped were all
# arithmetic, and arithmetic is testable without a browser. No dependencies and
# no package.json; the warning suppressed below is node noticing there isn't one.
.PHONY: check
check:
	@node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test 'tests/*.test.mjs'

# The other half. Layout, contrast and boot state need a laid-out page at a real
# viewport size, so tests/stage.html boots the app in sized iframes and asserts
# against what rendered. Needs the dev server; every line must be green.
.PHONY: check-stage
check-stage:
	@curl -sf -o /dev/null http://localhost:$(PORT)/ \
		|| { echo "No server on :$(PORT). Run 'make serve' in another shell first."; exit 1; }
	@echo "Opening → http://localhost:$(PORT)/tests/stage.html"
	@open http://localhost:$(PORT)/tests/stage.html 2>/dev/null \
		|| echo "Open it yourself: http://localhost:$(PORT)/tests/stage.html"

# ── Kill ──────────────────────────────────────────────────────────────────────
.PHONY: kill
kill:
	@lsof -ti :$(PORT) | xargs kill 2>/dev/null && echo "Stopped server on port $(PORT)" || echo "No server running on port $(PORT)"
