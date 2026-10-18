# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package uses semantic versioning.

## [0.1.0] - 2026-10-18

### Added

- `planSlices` with "around" and "beyond" placement, seeded size variation, tier caps and size rounding.
- `planLoans` with collateral split, staggered debt, max LTV caps, `capped` and `overMax`.
- `alertSafeSlices` and `slicesAbove`, with the alert threshold always a caller input.
- `costPreview` for fills, venue fees and account costs with and without splitting.
- `buildSchedule` with `off`, `light` and `heavy` jitter.
- One internal seeded generator with the app's two seed mixes, pinned by golden plans from the app's planner.
