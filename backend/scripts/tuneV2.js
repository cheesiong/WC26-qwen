/**
 * Hyperparameter sweep for v2 model.
 * Tries combinations of learning rate, regularisation, home advantage, and
 * DC ρ, and reports which config gives the best Brier score.
 */

const { loadMatches } = require('./backtestData');
const { runBacktest } = require('./backtestHarness');
const { createV2Model } = require('./modelV2');

const LR_GRID = [0.02, 0.04, 0.06, 0.08, 0.12];
const REG_GRID = [0.005, 0.015, 0.030, 0.060];
const HOME_GRID = [1.20, 1.25, 1.30, 1.40];
const RHO_GRID = [-0.05, -0.13, -0.18];

async function main() {
  const matches = await loadMatches({ sinceYear: 1990 });
  console.log(`Loaded ${matches.length} matches; running sweep (~${LR_GRID.length * REG_GRID.length * HOME_GRID.length * RHO_GRID.length} configs)…\n`);

  const results = [];
  for (const lr of LR_GRID) {
    for (const reg of REG_GRID) {
      for (const ha of HOME_GRID) {
        for (const rho of RHO_GRID) {
          const model = createV2Model({
            LEARNING_RATE: lr,
            REG_STRENGTH: reg,
            HOME_ADV_LOG: Math.log(ha),
            DC_RHO: rho,
          });
          const r = runBacktest(model, matches, { warmupMatches: 500, verbose: false });
          results.push({ lr, reg, ha, rho, ...r });
        }
      }
    }
  }

  results.sort((a, b) => a.avgBrier - b.avgBrier);

  console.log('Top 10 by Brier:');
  console.log('lr     reg    ha    rho     n    acc     Brier    LogLoss');
  for (const r of results.slice(0, 10)) {
    console.log(
      `${r.lr.toFixed(2)}   ${r.reg.toFixed(3)}  ${r.ha.toFixed(2)}  ${r.rho.toFixed(2)}   ${r.n}  ${(r.accuracy * 100).toFixed(2)}%  ${r.avgBrier.toFixed(4)}  ${r.avgLogLoss.toFixed(4)}`
    );
  }

  console.log('\nTop 5 by Accuracy:');
  results.sort((a, b) => b.accuracy - a.accuracy);
  for (const r of results.slice(0, 5)) {
    console.log(
      `${r.lr.toFixed(2)}   ${r.reg.toFixed(3)}  ${r.ha.toFixed(2)}  ${r.rho.toFixed(2)}   ${r.n}  ${(r.accuracy * 100).toFixed(2)}%  ${r.avgBrier.toFixed(4)}  ${r.avgLogLoss.toFixed(4)}`
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
