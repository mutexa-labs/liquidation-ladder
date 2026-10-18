# Security

This package plans how a position or loan is split into slices that people may open with real money. A wrong number is a
security problem, not only a bug.

## Reporting

Please report privately through GitHub's private vulnerability reporting on this repository
(Security tab, "Report a vulnerability"). Do not open a public issue for a problem that could cause a wrong plan,
a slice placed closer to price than reported, or totals that do not reconcile.

Include the input and the output you consider wrong.
A failing test case is the most useful report.

## Scope

- Formula errors in any exported function.
- Anything in the published package that is not in this repository.

The package does no I/O and never signs, sends or funds anything.
