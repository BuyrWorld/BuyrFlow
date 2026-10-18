# BuyrFlow Release B v0.12.0 — Quote Comparator

Status: **Stage 5 second vertical slice / audit candidate**

Quote Comparator now runs inside a Procurement Case rather than as a separate tool. It consumes the linked supplier quotations, performs exact deterministic comparison, freezes the result as DERIVED evidence, creates missing-evidence work, and creates one human sourcing-review action.

## Deliberate boundaries

- No composite supplier score.
- No automatic supplier selection.
- No automatic award.
- No guessed unit conversion.
- No hidden weighting of price, lead time, OTD or approval status.

The buyer sees the trade-offs and the human decision remains explicit.
