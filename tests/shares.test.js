// Share-count mode through the UI: a split, a round priced per share (cheques by amount
// and by share count), a post-round pool top-up and a pre-money round with whole-share
// rounding. Figures are hand-computed in the comments.
// Run: node tests/shares.test.js   (needs `npm install`)
const { loadApp, toText, checker } = require("./harness");
const { expect, done } = checker();

const scenario = {
  isExample: false,
  company: { name: "Tara Labs", sector: "SaaS (India → global)", stage: "Series A", currency: "₹", unit: "cr",
    revenue: 5, ebitda: 0, faceValue: 10, wholeShares: true },
  founders: [
    { id: "f1", name: "Asha", shares: 6000, group: "Founders" },
    { id: "f2", name: "Ravi", shares: 4000, group: "Founders" },
  ],
  events: [
    // 10,000 shares @ ₹10 → 100,000 @ ₹1
    { id: "x", kind: "split", name: "1:10 split", date: "2021-01-01", splitType: "split", ratio: 10 },
    // ₹100/share: X ₹1 Cr → 100,000 sh; Y 50,000 sh → ₹0.5 Cr; pool to 10% of 250,000 → floor(27,777.8)
    { id: "s", kind: "priced", name: "Seed", date: "2022-01-01", pricing: "price", pricePerShare: 100,
      esopTarget: 0.1, esopTiming: "post", prefMultiple: 1, participating: false, revenue: 1,
      investments: [{ investor: "X Ventures", amount: 1 }, { investor: "Y Angels", shares: 50000 }], secondaries: [] },
    // ₹50 Cr ÷ 277,777 = ₹1,800.005 → ₹1,800.01; Z ₹10 Cr → 55,555 sh, pays ₹9,99,99,555.55 (₹444.45 unallotted)
    { id: "a", kind: "priced", name: "Series A", date: "2024-01-01", preMoney: 50,
      esopTarget: 0, esopTiming: "post", prefMultiple: 1, participating: false, revenue: 5,
      investments: [{ investor: "Z Capital", amount: 10 }], secondaries: [] },
  ],
  exit: { value: 300, date: "2028-03-31" },
  scenarios: { rounds: [], cases: [] },
};
const cap = loadApp().computeCapTable(scenario);
expect("engine: no errors", cap.errors.length === 0, cap.errors.join("; "));
expect("issued = 100,000 + 100,000 + 50,000 + 55,555", cap.issuedShares === 305555, String(cap.issuedShares));
expect("pool = 27,777", cap.esopShares === 27777, String(cap.esopShares));

// The tab comes from the URL, so load the app per tab. The cap-table basis toggle is the
// only state initialised to "fd", which lets a test open the issued-shares view.
const tabText = (tab, basis) => {
  const a = loadApp({
    search: `?demo=1&tab=${tab}`,
    beforeRun(React) {
      const useState = React.useState;
      React.useState = init => useState(init === "fd" && basis ? basis : init);
    },
  });
  Object.keys(a.SEED).forEach(k => delete a.SEED[k]);
  Object.assign(a.SEED, scenario);
  return toText(a.renderToString(a.React.createElement(a.App)));
};

const fd = tabText("captable");
expect("FD view: shares panel", /Issued & paid-up 3,05,555 Option pool \(reserved, not issued\) 27,777 Fully diluted 3,33,332/.test(fd));
expect("last price per share", /Last price per share \(Series A\) ₹1,800\.01/.test(fd), fd.match(/Last price per share[^F]*/)?.[0]);
expect("face value after split", /Face value ₹1 /.test(fd));
expect("share capital = 3,05,555 × ₹1", /Share capital \(issued × face value\) ₹3,05,555\.00/.test(fd));
// premium: 0.99 + 0.495 + (9.99995556 − 0.0055555) = 11.479 Cr
expect("securities premium", /Securities premium received ₹11\.5 Cr/.test(fd));
expect("FD register total", /Total \(fully diluted\) 3,33,332 100\.0%/.test(fd));
// Asha 60,000 / 333,332 = 18.0%
expect("FD % for founder", /Asha Founders Common 60,000 18\.0%/.test(fd));

const iss = tabText("captable", "issued");
expect("issued view title", /Ownership of issued shares/.test(iss));
expect("issued register total", /Total \(issued\) 3,05,555 100\.0%/.test(iss));
// Asha 60,000 / 305,555 = 19.6%
expect("issued % for founder", /Asha Founders Common 60,000 19\.6%/.test(iss));
expect("issued view has no pool row", !/Option pool \(ESOP\) ESOP/.test(iss));

const rounds = tabText("rounds");
expect("split editor", /Every holding and the option pool × 10\. Face value divides/.test(rounds));
expect("seed info line", /₹100\.00 per share · 1,50,000 new shares · implied pre-money ₹1\.0 Cr · post-money ₹2\.5 Cr/.test(rounds),
  rounds.match(/₹100\.00 per share[^A-Z]*/)?.[0]);
expect("per-investor allotments", /→ 1,00,000 shares/.test(rounds) && /→ 50,000 shares/.test(rounds));
expect("series A info line with unallotted remainder",
  /₹1,800\.01 per share · 55,555 new shares · pre-money ₹50\.0 Cr · post-money ₹60\.0 Cr · ₹444\.45 not allotted \(whole shares\)/.test(rounds),
  (rounds.match(/₹[\d,.]+ per share · 55,555[^A-Z]*/) || [rounds.slice(rounds.indexOf("Z Capital") - 20, rounds.indexOf("Z Capital") + 260)])[0]);
expect("round economics price + new shares", /Seed 2022-01-01 ₹100\.00 1,50,000 ₹1\.0 Cr ₹1\.5 Cr ₹2\.5 Cr/.test(rounds),
  rounds.match(/Seed 2022-01-01[^A-Z]*/)?.[0]);
expect("company panel share controls", /Face value \(₹\/share, at founding\)/.test(rounds) && /Whole shares/.test(rounds));

for (const t of ["exit", "returns", "scenarios", "valuation"]) {
  let ok = true, err = "";
  try { ok = tabText(t).length > 500; } catch (e) { ok = false; err = e.message; }
  expect(`tab ${t} renders in share mode`, ok, err);
}
done();
