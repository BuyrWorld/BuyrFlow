# BuyrFlow Release B v0.11.0 — Price Increase Defender

Status: **Stage 5 vertical slice / audit candidate**

This release integrates the first BuyrWorld procurement-intelligence capability into the Procurement Case spine.

## Contract

Price Increase Defender now follows:

`Case → deterministic calculation → DERIVED evidence → BuyrFlow evidence work → human decision gate → execution → outcome`

It does not accept supplier terms or send external communication.

## Exact commercial measures

All commercial arithmetic remains integer pence and basis points. The capability records supplier ask, contract cap, annual requested cost, contractual-cap cost and annual exposure above cap.

## Evidence + workflow

Running Defender freezes the commercial calculation into versioned DERIVED evidence. Missing material evidence receives linked BuyrFlow actions; one execution action prepares the eventual negotiation position. Re-running identical inputs is idempotent. Changed inputs create new evidence versions so earlier decisions can become stale rather than history being rewritten.

## Release gate

This is not a Stage 5 PASS by itself. It must pass the full repository suite, Vercel build, browser review, and remain understandable in the simplified Today / My work / Case experience.
