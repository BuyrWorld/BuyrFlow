# BuyrFlow v0.11.0 — a demo and a real workspace, one click apart

**Date:** 25 October 2026
**Baseline:** v0.10.0 — 230 tests, 42 suites
**Now:** 275 tests, 53 suites, all passing on Node 22

Until now there was one workspace and it was always the synthetic one. Every
page carried a REVIEW DATA banner, and there was nowhere to put real work
that would not be sitting next to three fictional cases under a banner
calling it all fictional.

Now there are two, and the switch is in the top right of every page.

| | Demo | My workspace |
| --- | --- | --- |
| Holds | Three worked cases — a shortage, a sourcing decision, a price increase — with their evidence, decisions and outcomes | Whatever you put in it |
| Starts | Seeded | Empty |
| Banner | REVIEW DATA on every page, with a link out | None, ever |
| Reset says | "Reset the demo" | "Clear my workspace", and you type DELETE |
| Stored at | `buyrflow.workspace.demo.v3` | `buyrflow.workspace.live.v3` |

A first visit opens the Demo, because an empty screen tells a new buyer
nothing. After that it opens wherever you were last.

## They cannot reach each other

Separate keys, and one function writes a workspace — `writeRaw(s, m = mode)`,
which indexes those keys by mode. Resetting the demo cannot touch real cases,
and real cases never appear under a banner calling them synthetic.

Three consequences that needed deciding rather than inheriting:

- **A conflict belongs to one workspace.** The cross-tab listener fires only
  for the key this tab is showing, so another tab editing the demo no longer
  freezes real work. Switching clears the conflict, because the workspace
  being opened is not the one that changed.
- **An import lands in the slot it was dropped into.** The file is restamped
  with that mode, and if the file came from the other one the dialog says so
  before you confirm — a demo file imported into real work would otherwise
  stop being labelled as review data.
- **The threshold is carried into a new workspace.** A second-approval
  default of zero means every decision needs two names; no default means none
  ever does. Neither is safe to invent, so the figure comes across and the
  screen says it is a review-build default to change.

## The empty screen

The hardest screen in the product: nothing has happened, so nothing can be
shown. It now says the emptiness is correct — there is no sample case to
delete and no placeholder supplier to rename — gives the two ways in, and
points at the Demo for anyone who does not yet know what this is. It
disappears the moment there is one task or one case, without being dismissed.

The walkthrough gained a fourth paragraph saying which workspace you are in
and that the two are separate. Three worked cases look like somebody else's
data until you know they are the demo.

## Governed identically

An empty workspace is the same product with nothing in it. Asserted, not
assumed: a case opened in it carries the same evidence checklist, a decision
on it is refused for the same reasons, and both states have exactly the same
keys. The only difference is what is in the arrays.

## app.js has tests now

`tests/dom-stub.mjs` is just enough browser to import `app.js`: a flat
registry of the elements the shell declares, with `innerHTML` as a string.
`app.js` owns storage, routing and the dialogs, and none of it had ever been
executed by a test — views.js is pure and could be rendered, but the layer
that decides *which workspace is on screen and where it is saved* could only
be read as text.

`tests/workspace-switch.test.mjs` boots the application against it and drives
it the way a person would: press Demo, press My workspace, add something,
press back, and check what is in each key.

The stub is deliberately not a DOM. It cannot see layout, focus, a real click
reaching a real button, or anything about how any of this looks. A test using
it proves behaviour, never appearance.

## Tests

275 passing, 53 suites, up from 230/42. Eight deliberate mutations, each
caught by the test meant to catch it:

| Mutation | Caught by |
| --- | --- |
| Both workspaces share one key | four tests in the switch suite |
| Switching relabels without reloading | two tests |
| `writeRaw` always writes the demo key | five tests |
| The conflict listener fires for any workspace | the isolation test |
| Switching keeps the conflict | "commands work again" |
| The mode is not remembered | the reload test |
| Pressing the current workspace re-switches | "does nothing" |
| The strip always shows | three tests |

Two of those found gaps in the tests rather than in the code, and both were
real. A reset with no typed confirmation still contained the word DELETE, so
a text assertion passed while the guard underneath it read an undefined
answer. And the first-run panel's "the demo never shows it" passed on the
wrong grounds, because the seeded demo has cases and so fails the second
condition regardless of mode. Both tests were rewritten until the mutation
failed them.

## What was not checked

- **No browser.** Not at desktop width, not at 390px. The switch has never
  been pressed by a person; the stub fires the handler the delegated listener
  would call, which is not the same as a click landing on a button.
- **No two real tabs.** The cross-tab conflict path is exercised by firing a
  synthetic `storage` event, not by opening two windows.
- **Private-browsing storage.** Every `localStorage` access is wrapped and
  the product works without it, but nobody has run it in a window where
  writes throw.
- **Nothing was migrated in anger.** The pre-split key becomes the demo and
  is left in place as the backup. That path is covered by one test reading
  `app.js`, not by a real workspace from before the split.
