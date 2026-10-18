# BuyrFlow — Release A v0.8.1

BuyrWorld's execution engine for procurement cases: a problem becomes a case, the case asks for evidence, evidence is received and judged, a named person decides, the decision is executed, and the outcome is recorded against it.

Synthetic review data only. Everything is stored in your browser.

## Run it

```sh
npm start          # http://localhost:4173
npm run check      # syntax checks and 126 tests
```

Node 22 or later. No dependencies to install.

## Where things are

| | |
| --- | --- |
| `public/domain.js` | Every rule: commands, gates, risk, calculations, migration. No DOM, no storage. |
| `public/views.js` | Each screen as a pure function of state. |
| `public/app.js` | The page: storage, dialogs, events. Changes state only through `apply()`. |
| `public/index.html`, `public/style.css` | The static shell and styles. |
| `server.mjs` | Local static server with security headers. |
| `vercel.json` | The same, as a static Vercel deployment. |
| `RELEASE_A_V081.md` | What changed in this release and what is not done. |
| `RELEASE_A_V080.md` | The previous release, kept as the record. |
| `CLAUDE.md` | Rules for anyone, or any Claude Code session, changing this. |
