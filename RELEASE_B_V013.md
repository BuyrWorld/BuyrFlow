# BuyrFlow Release B v0.13.0 — RFQ Generator

Status: **Stage 5 third vertical slice / audit candidate**

RFQ Generator now prepares a structured, versioned draft directly from a Procurement Case. It snapshots the requirement and intended suppliers, carries open evidence gaps as explicit clarifications, and creates a governed human review action.

## Deliberate boundaries

- Draft only: BuyrWorld does not send the RFQ.
- Missing quantity/unit/specification are refused, not guessed.
- Open evidence is exposed as a clarification, not silently converted into a fact.
- Re-running unchanged inputs does not create duplicate artefacts or work.
- Any eventual external issue step remains a separate authorised human-controlled action.
