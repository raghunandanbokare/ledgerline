// Renders SetupWizard at preset steps (by seeding its useState calls), then fires
// "Build my dashboard" and checks the scenario it hands to onDone.
// Run: node tests/wizard.test.js   (needs `npm install`)
const { loadApp, toText, checker } = require("./harness");
const { expect, done } = checker();

// Seed the wizard's useState calls in order: step, co, team, rounds, exit, entry
let seeds = null, call = 0, buildFn = null;
const app = loadApp({
  beforeRun(React) {
    const useState = React.useState;
    React.useState = init => { const i = call++; return useState(seeds && i in seeds ? seeds[i] : init); };
    const createElement = React.createElement;
    React.createElement = (type, props, ...kids) => {
      if (type === "button" && kids.includes("Build my dashboard")) buildFn = props.onClick;
      return createElement(type, props, ...kids);
    };
  },
});
const render = (seed, onDone = () => {}) => {
  seeds = seed; call = 0;
  return toText(app.renderToString(app.React.createElement(app.SetupWizard, { onDone, onExample() {}, onCancel: null })));
};

const co = { name: "Lumafin", sector: "SaaS (India → global)", stage: "Series A", unit: "cr", currency: "₹", revenue: 12, ebitda: 0 };
const team = [{ id: "t1", name: "Asha", pct: 60, group: "Founders" }, { id: "t2", name: "Ravi", pct: 40, group: "Founders" }];
const rounds = [
  { id: "r0", kind: "safe", name: "SAFE", date: "2021-01-01", val: 20, amount: 1, investor: "Angel A", esop: 0, investors: [] },
  { id: "r1", kind: "priced", name: "Seed", date: "2022-01-01", val: 40, amount: 0, investor: "", esop: 10,
    investors: [{ id: "i1", name: "Lead VC", amount: 6 }, { id: "i2", name: "", amount: 3 }, { id: "i3", name: "Skipped", amount: 0 }] },
  { id: "r2", kind: "priced", name: "Series A", date: "2024-01-01", val: 150, amount: 0, investor: "", esop: 0,
    investors: [{ id: "i4", name: "Growth Fund", amount: 30 }, { id: "i5", name: "Lead VC", amount: 10 }] },
];

const s1 = render({ 0: 1, 1: co, 2: [...team, { id: "t3", name: "Meera", pct: 5, group: "Angels" }] });
expect("step 1 says stakes are at founding", /at founding/.test(s1) && /Don't enter today's diluted percentages/.test(s1));
expect("step 1 flags non-100 total", /Founding split entered: 105% — will be scaled to 100%/.test(s1));

const s2 = render({ 0: 2, 1: co, 2: team, 3: rounds });
expect("step 2 shows seed round size + post", /Round size: ₹9 Cr · post-money ₹49 Cr/.test(s2));
expect("step 2 shows Series A round size", /Round size: ₹40 Cr · post-money ₹190 Cr/.test(s2));
expect("SAFE keeps single investor", /One investor per SAFE/.test(s2));

let built = null;
const s3 = render({ 0: 3, 1: co, 2: team, 3: rounds }, st => { built = st; });
expect("summary counts cheques", /3 rounds, 5 investor cheques/.test(s3));
buildFn();
const seed = built.events.find(e => e.name === "Seed");
const a = built.events.find(e => e.name === "Series A");
expect("seed investments (blank name defaulted, ₹0 row skipped)",
  JSON.stringify(seed.investments) === JSON.stringify([{ investor: "Lead VC", amount: 6 }, { investor: "Seed investor 2", amount: 3 }]),
  JSON.stringify(seed.investments));
expect("series A investments", a.investments.length === 2 && a.investments[1].investor === "Lead VC");
expect("default exit = 3× last post-money (190)", built.exit.value === 570, String(built.exit.value));
expect("SAFE event intact", built.events.find(e => e.kind === "safe").investor === "Angel A");

// The built scenario runs cleanly through the engine
const cap = app.computeCapTable(built);
const FD = cap.positions.reduce((x, p) => x + p.shares, 0) + cap.esopShares;
const gf = cap.positions.filter(p => p.holder === "Growth Fund").reduce((x, p) => x + p.shares, 0) / FD;
expect("engine: no errors", cap.errors.length === 0, cap.errors.join("; "));
expect("engine: Growth Fund owns 30/190 after Series A", Math.abs(gf - 30 / 190) < 1e-9, `${(gf * 100).toFixed(2)}%`);
// ---- Share-count entry ----
{
  const coS = { ...co, revenue: 0, faceValue: 10 };
  const teamS = [{ id: "t1", name: "Asha", pct: 0, shares: 6000, group: "Founders" }, { id: "t2", name: "Ravi", pct: 0, shares: 4000, group: "Founders" }];
  const roundsS = [
    { id: "x", kind: "split", name: "Split", date: "2021-01-01", val: 0, amount: 0, splitType: "split", ratio: 10, bonusNew: 1, bonusHeld: 1, investors: [] },
    // ₹10,000/share after the split: ₹20 Cr → 20,000 shares; pre = 100,000 × ₹10,000 = ₹100 Cr
    { id: "p", kind: "priced", name: "Seed", date: "2022-01-01", val: 10000, amount: 0, esop: 0, pricing: "price",
      investors: [{ id: "i1", name: "Lead VC", amount: 20 }] },
  ];
  const w1 = render({ 0: 1, 1: coS, 2: teamS, 5: "shares" });
  expect("share entry: founding total + capital", /Issued at founding: 10,000 shares · share capital ₹1,00,000/.test(w1),
    w1.match(/Issued at founding[^A-Z]*/)?.[0]);
  expect("share entry: per-person %", /shares · 60\.0%/.test(w1) && /shares · 40\.0%/.test(w1));
  expect("share entry: no diluted-holdings", /Don't enter today's diluted holdings/.test(w1));
  const w2 = render({ 0: 2, 1: coS, 2: teamS, 3: roundsS, 5: "shares" });
  expect("share entry: split row", /Multiplies every holding by 10/.test(w2));
  expect("share entry: price-per-share round hint", /Round size: ₹20 Cr · ≈ 20,000 new shares at ₹10,000/.test(w2),
    w2.match(/Round size[^A-Z]*/)?.[0]);
  let builtS = null;
  const w3 = render({ 0: 3, 1: coS, 2: teamS, 3: roundsS, 5: "shares" }, st => { builtS = st; });
  expect("share entry: summary", /10,000 founding shares, 1 split\/bonus event/.test(w3), w3.match(/founding shareholders[^A-Z]*/)?.[0]);
  buildFn();
  expect("share entry: company flags", builtS.company.wholeShares === true && builtS.company.faceValue === 10);
  expect("share entry: founders keep share counts", builtS.founders.map(f => f.shares).join() === "6000,4000");
  expect("share entry: split + price round events",
    builtS.events.map(e => e.kind).join() === "split,priced" && builtS.events[1].pricing === "price" && builtS.events[1].pricePerShare === 10000);
  expect("share entry: default exit = 3 × ₹120 Cr post", builtS.exit.value === 360, String(builtS.exit.value));
  const capS = app.computeCapTable(builtS);
  expect("share entry: engine allots 20,000 shares", capS.positions.find(p => p.holder === "Lead VC").shares === 20000);
}
done();
