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
	@echo ""

# ── Dev server ────────────────────────────────────────────────────────────────
.PHONY: serve
serve:
	@echo "Serving → http://localhost:$(PORT)"
	@python3 -m http.server $(PORT)

# ── Data ──────────────────────────────────────────────────────────────────────
.PHONY: geometry
geometry:
	@python3 scripts/build_geometry.py --cache /tmp/ne50.geojson

.PHONY: coverage
coverage:
	@python3 scripts/check_coverage.py

# ── Kill ──────────────────────────────────────────────────────────────────────
.PHONY: kill
kill:
	@lsof -ti :$(PORT) | xargs kill 2>/dev/null && echo "Stopped server on port $(PORT)" || echo "No server running on port $(PORT)"
