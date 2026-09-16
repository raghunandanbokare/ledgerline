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
// ---- Share-count mode (company.wholeShares; ₹ Cr model, per-share figures in ₹) ----
const CR = { unit: "cr", wholeShares: true, faceValue: 10 };

// 9. Priced by share price ₹1,000: cheques by amount and by share count; odd amount floors to whole shares
{
  const st = { company: CR, founders: [{ name: "A", shares: 6000 }, { name: "B", shares: 4000 }], events: [
    { id: "s", kind: "priced", name: "Seed", date: "2020-01-01", pricing: "price", pricePerShare: 1000, investments: [
      { investor: "X", amount: 1 }, { investor: "Y", shares: 5500 }, { investor: "Z", amount: 0.123456 }] }] };
  const cap = E.computeCapTable(st);
  const sh = h => cap.positions.find(p => p.holder === h).shares;
  near("X gets ₹1 Cr ÷ ₹1,000 = 10,000 shares", sh("X"), 10000);
  near("Y entered by shares", sh("Y"), 5500);
  near("Y pays 5,500 × ₹1,000 = ₹0.55 Cr", cap.positions.find(p => p.holder === "Y").invested, 0.55);
  near("Z floors 1,234.56 → 1,234 shares", sh("Z"), 1234);
  const r = cap.rounds[0];
  near("pre-money = ₹1,000 × 10,000 = ₹1 Cr", r.preMoney, 1);
  near("raise = shares × price", r.raise, 1.6734);
  near("unallotted remainder", r.unallotted, 0.000056);
  near("issued shares", cap.issuedShares, 26734);
  near("share capital = 26,734 × ₹10", cap.shareCapital, 0.026734);
  near("securities premium = raise − new shares × ₹10", cap.premium, 1.656666);
  near("post-money = pre + raise", cap.snapshots[1].postMoney, 2.6734);
}

// 10. 1:10 split, then a round priced from pre-money: ₹10 Cr ÷ 100,000 shares = ₹1,000
{
  const st = { company: CR, founders: [{ name: "A", shares: 10000 }], events: [
    { id: "x", kind: "split", splitType: "split", ratio: 10, name: "Split", date: "2020-01-01" },
    { id: "s", kind: "priced", name: "Seed", date: "2020-06-01", preMoney: 10, investments: [{ investor: "VC", amount: 2 }] }] };
  const cap = E.computeCapTable(st);
  near("founder shares after split", cap.positions[0].shares, 100000);
  near("face value ₹10 → ₹1", cap.faceValue, 1);
  near("price per share in ₹", cap.rounds[0].price * 1e7, 1000);
  near("investor shares", cap.positions.find(p => p.holder === "VC").shares, 20000);
  near("share capital = 120,000 × ₹1", cap.shareCapital, 0.012);
}

// 11. 1:1 bonus issue doubles shares, face value unchanged, share capital doubles
{
  const st = { company: CR, founders: [{ name: "A", shares: 10000 }], events: [
    { id: "b", kind: "split", splitType: "bonus", bonusNew: 1, bonusHeld: 1, name: "Bonus", date: "2020-01-01" }] };
  const cap = E.computeCapTable(st);
  near("bonus doubles shares", cap.issuedShares, 20000);
  near("face value unchanged", cap.faceValue, 10);
  near("share capital ₹2 lakh", cap.shareCapital, 0.02);
}

// 12. Pre-money pricing rounds the price to the paisa: ₹1 Cr ÷ 30,000 = ₹333.33
{
  const st = { company: CR, founders: [{ name: "A", shares: 30000 }], events: [
    { id: "s", kind: "priced", name: "Seed", date: "2020-01-01", preMoney: 1, investments: [{ investor: "VC", amount: 0.1 }] }] };
  const cap = E.computeCapTable(st);
  near("price rounded to ₹333.33", cap.rounds[0].price * 1e7, 333.33);
  near("₹10 lakh buys 3,000 shares", cap.positions.find(p => p.holder === "VC").shares, 3000);
  near("paid 3,000 × ₹333.33", cap.rounds[0].raise, 0.099999);
  near("effective pre-money", cap.rounds[0].preMoney, 0.99999);
}

// 13–14. Issued vs fully diluted with a whole-share pool top-up; whole-share secondary
{
  const st = { company: CR, founders: [{ name: "A", shares: 10000 }], events: [
    { id: "s", kind: "priced", name: "Seed", date: "2020-01-01", preMoney: 4, esopTarget: 0.1, esopTiming: "post", investments: [{ investor: "VC", amount: 1 }] },
    { id: "a", kind: "priced", name: "Series A", date: "2022-01-01", preMoney: 10, investments: [],
      secondaries: [{ seller: "VC", buyer: "B", pct: 0.333 }] }] };
  const cap = E.computeCapTable(st);
  near("seed: ₹1 Cr at ₹4,000 = 2,500 shares", cap.snapshots[1].issuedShares, 12500);
  near("pool top-up floors 1,388.9 → 1,388", cap.snapshots[1].totals.ESOP, 1388);
  near("A price ₹1 Cr×10 ÷ 13,888 → ₹7,200.46", cap.rounds[1].price * 1e7, 7200.46);
  near("secondary floors 832.5 → 832 shares", cap.positions.find(p => p.holder === "B").shares, 832);
  near("sold cost basis pro rata 832/2,500", cap.realized[0].costs[0].amount, 0.3328);
  near("proceeds 832 × ₹7,200.46", cap.realized[0].amount, 0.599078272);
  near("issued excludes the pool", cap.issuedShares, 12500);
}
console.log(fails ? `\n${fails} failing` : "\nall passing");
process.exitCode = fails ? 1 : 0;
