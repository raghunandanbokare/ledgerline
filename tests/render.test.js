// Server-renders every tab, and the valuation tab for every sector × stage, to catch
// runtime errors. Run: node tests/render.test.js   (needs `npm install`)
// Optional: node tests/render.test.js "<sector>|<stage>" prints that valuation view as text.
const { loadApp, toText, checker } = require("./harness");
const { expect, done } = checker();
const TABS = ["captable", "rounds", "exit", "returns", "scenarios", "valuation"];
const dump = process.argv[2];

for (const tab of TABS) {
  const app = loadApp({ search: `?demo=1&tab=${tab}` });
  const render = () => app.renderToString(app.React.createElement(app.App));
  if (tab !== "valuation") {
    let out = "", err = "";
    try { out = render(); } catch (e) { err = e.message; }
    expect(`tab ${tab} renders`, out.length > 1000, err);
    continue;
  }
  const failed = [];
  for (const sector of Object.keys(app.SECTORS)) {
    for (const stage of app.STAGES) {
      Object.assign(app.SEED.company, { sector, stage, bookValue: 120, aum: 900, revenue: 75 });
      try {
        const text = toText(render());
        if (dump === `${sector}|${stage}`) console.log(text.split("Is the price defensible?")[1]);
        if (!text.includes(sector)) failed.push(`${sector} · ${stage}: sector missing`);
      } catch (e) { failed.push(`${sector} · ${stage}: ${e.message}`); }
    }
  }
  const n = Object.keys(app.SECTORS).length * app.STAGES.length;
  expect(`valuation renders for ${Object.keys(app.SECTORS).length} sectors × ${app.STAGES.length} stages (${n} views)`, failed.length === 0, failed.join("; "));

  // P/B arithmetic on a lender: book 120, Series A band 1.2–3.5×, median round 90
  Object.assign(app.SEED.company, { sector: "NBFCs & digital lending (India)", stage: "Series A", bookValue: 120, aum: 900 });
  const t = toText(render());
  expect("P/B pre-money range", /indicative pre-money of ₹144 Cr – ₹420 Cr \(median ₹240 Cr\)/.test(t));
  expect("P/B post-money on book + new equity", /1\.11× – 2\.43× post-money book/.test(t));
  expect("P/AUM range", /indicative equity value of ₹360 Cr – ₹1,350 Cr/.test(t));
}
done();
