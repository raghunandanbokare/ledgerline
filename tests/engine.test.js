// Engine checks against hand-computed cases. Run: node tests/engine.test.js
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/../index.html", "utf8");
const start = html.indexOf("function sortedEvents(state)");
const end = html.indexOf("/* ================================================================\n   TOOLTIP");
const src = html.slice(start, end > 0 ? end : html.indexOf("function useTooltip"));
const fmtPct = (v, d = 1) => (v * 100).toFixed(d) + "%";
const E = new Function("fmtPct", src + "; return { computeCapTable, computeWaterfall, xirr };")(fmtPct);
let fails = 0;
const near = (name, got, want, tol = 1e-6) => {
  const ok = got != null && Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: got ${got}, want ${want}`);
};

// 1. Plain priced round: founders 1,000,000; Seed 10 @ pre 40 → investor 20%
{
  const st = { founders: [{ name: "F", shares: 1e6 }], events: [
    { id: "a", kind: "priced", name: "Seed", date: "2020-01-01", preMoney: 40, investments: [{ investor: "VC", amount: 10 }] }] };
  const cap = E.computeCapTable(st);
  const vc = cap.positions.find(p => p.holder === "VC");
  near("seed investor shares", vc.shares, 250000);
  const wf = E.computeWaterfall(cap, 30); // below conversion point (50): VC takes 1x pref
  near("1x non-part pref at exit 30", wf.rows.find(r => r.holder === "VC").proceeds, 10);
  const wf2 = E.computeWaterfall(cap, 100); // converts: 20% of 100
  near("converts at exit 100", wf2.rows.find(r => r.holder === "VC").proceeds, 20);
}

// 2. Secondary: Seed VC sells 50% at Series A (A price = 3x seed price). Total preference must stay 10 (seed) + 30 (A).
{
  const st = { founders: [{ name: "F", shares: 1e6 }], events: [
    { id: "a", kind: "priced", name: "Seed", date: "2020-01-01", preMoney: 40, investments: [{ investor: "SeedVC", amount: 10 }] },
    { id: "b", kind: "priced", name: "Series A", date: "2022-01-01", preMoney: 150, investments: [{ investor: "AVC", amount: 30 }],
      secondaries: [{ seller: "SeedVC", buyer: "AVC", pct: 0.5 }] }] };
  const cap = E.computeCapTable(st);
  // exit 20: A is senior (30 pref) → takes all 20; seed gets 0 regardless
  // exit 36: A takes 30 pref; 6 left for seed prefs (10 total: 5 held by SeedVC, 5 by AVC via secondary)
  const wf = E.computeWaterfall(cap, 36);
  const total = h => wf.rows.filter(r => r.holder === h).reduce((a, r) => a + r.proceeds, 0);
  near("exit 36 — SeedVC gets half of remaining seed pref pool", total("SeedVC"), 3);
  near("exit 36 — AVC gets A pref + other half", total("AVC"), 33);
  near("exit 36 — founders get nothing", total("F"), 0);
}

// 3. XIRR parity with Excel (365-day count): -100 on 2020-01-01, +200 on 2023-01-01 (1096 days)
{
  const r = E.xirr([{ date: "2020-01-01", amount: -100 }, { date: "2023-01-01", amount: 200 }]);
  near("xirr matches Excel XIRR (365 basis)", r, Math.pow(2, 365 / 1096) - 1, 1e-6);
}

// 4. Post-money SAFE excludes the round's new pool (YC post-money SAFE definition)
{
  // SAFE 10 @ 100 post cap → owns 10% of (1,000,000 existing + its own shares), the new 10% pool excluded → 111,111.1
  const st = { founders: [{ name: "F", shares: 1e6 }], events: [
    { id: "s", kind: "safe", name: "SAFE", date: "2020-01-01", investor: "Angel", amount: 10, cap: 100, capType: "post" },
    { id: "a", kind: "priced", name: "Seed", date: "2021-01-01", preMoney: 200, esopTarget: 0.1, esopTiming: "pre", investments: [{ investor: "VC", amount: 50 }] }] };
  const cap = E.computeCapTable(st);
  near("post-money SAFE shares ignore new-round pool", cap.positions.find(p => p.holder === "Angel").shares, 1e6 / 9);
}
// 5. Pre-money pool: pre 80 / raise 20 / 10% pool carved from pre-money → investor 20%, pool 10%, founders 70%
{
  const st = { founders: [{ name: "F", shares: 1e6 }], events: [
    { id: "a", kind: "priced", name: "Seed", date: "2020-01-01", preMoney: 80, esopTarget: 0.1, esopTiming: "pre", investments: [{ investor: "VC", amount: 20 }] }] };
  const cap = E.computeCapTable(st);
  near("pre-money pool size", cap.esopShares, 1e6 / 0.7 * 0.1, 1e-6);
  near("investor shares with pre-money pool", cap.positions.find(p => p.holder === "VC").shares, 1e6 / 0.7 * 0.2, 1e-6);
}

// 6. Pre-money SAFE at a 90 cap (1,000,000 shares) → 111,111 shares; round priced above the cap
{
  const st = { founders: [{ name: "F", shares: 1e6 }], events: [
    { id: "s", kind: "safe", name: "SAFE", date: "2020-01-01", investor: "Angel", amount: 10, cap: 90, capType: "pre" },
    { id: "a", kind: "priced", name: "Seed", date: "2021-01-01", preMoney: 180, investments: [{ investor: "VC", amount: 30 }] }] };
  near("pre-money SAFE shares", E.computeCapTable(st).positions.find(p => p.holder === "Angel").shares, 1e6 / 9, 1e-6);
}

// 7. Uncapped 20% discount SAFE: p·1e6 + 12.5 = 100 → p = 8.75e-5 → 142,857 shares
{
  const st = { founders: [{ name: "F", shares: 1e6 }], events: [
    { id: "s", kind: "safe", name: "SAFE", date: "2020-01-01", investor: "Angel", amount: 10, discount: 0.2 },
    { id: "a", kind: "priced", name: "Seed", date: "2021-01-01", preMoney: 100, investments: [{ investor: "VC", amount: 25 }] }] };
  near("discount SAFE shares", E.computeCapTable(st).positions.find(p => p.holder === "Angel").shares, 12.5 / 8.75e-5, 1e-6);
}

// 8. Seller keeps its original cost basis for returns: 5 left on the position, 5 carried on the realized entry
{
  const st = { founders: [{ name: "F", shares: 1e6 }], events: [
    { id: "a", kind: "priced", name: "Seed", date: "2020-01-01", preMoney: 40, investments: [{ investor: "SeedVC", amount: 10 }] },
    { id: "b", kind: "priced", name: "Series A", date: "2022-01-01", preMoney: 150, investments: [{ investor: "AVC", amount: 30 }],
      secondaries: [{ seller: "SeedVC", buyer: "AVC", pct: 0.5 }] }] };
  const cap = E.computeCapTable(st);
  const r = cap.realized[0];
  near("secondary proceeds (125k sh × A price)", r.amount, 125000 * 150 / 1.25e6, 1e-6);
  near("sold cost basis", r.costs.reduce((a, c) => a + c.amount, 0), 5);
  near("remaining cost basis", cap.positions.find(p => p.holder === "SeedVC").invested, 5);
  near("primary raised conserved", cap.positions.reduce((a, p) => a + p.prefBase, 0), 40);
}
console.log(fails ? `\n${fails} failing` : "\nall passing");
process.exitCode = fails ? 1 : 0;
