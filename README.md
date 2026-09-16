# Ledgerline

Cap table & dilution intelligence for founders — model rounds, SAFEs, ESOP top-ups and secondaries; see the exit waterfall, investor IRR/MOIC, and India sector-by-stage valuation benchmarks. Runs entirely in the browser; your data stays on your device.

Live: https://raghunandanbokare.github.io/ledgerline/

## Local development

The app is the single file `index.html` — no build step. To preview it, serve the folder (`npm run serve`, then open http://localhost:8642/).

Tests need Node 18+:

```
npm install   # once — pins the same React / Babel builds the page loads from cdnjs
npm test      # engine math, every tab and sector view, and the setup wizard
```

`npm run test:engine` runs just the cap-table / waterfall / XIRR checks and needs no install.
