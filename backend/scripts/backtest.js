/**
 * Backtest runner.
 *
 *   node scripts/backtest.js [baseline|v2|both] [--since=1990]
 *
 * Default: both, since=1990.
 */

const { loadMatches } = require('./backtestData');
const { runBacktest } = require('./backtestHarness');
const { createBaselineModel } = require('./modelBaseline');

let createV2Model = null;
try {
  // Optional — only available once v2 is implemented
  ({ createV2Model } = require('./modelV2'));
} catch {
  // Silent; v2 not built yet
}

function fmt(r) {
  return [
    `n=${r.n}`,
    `accuracy=${(r.accuracy * 100).toFixed(2)}%`,
    `avgBrier=${r.avgBrier.toFixed(4)}`,
    `avgLogLoss=${r.avgLogLoss.toFixed(4)}`,
  ].join('  ');
}

function pointsLine(p) {
  if (!p) return '   (top-3 picker not exposed by this model)';
  const lift = p.avgRealised - p.avgRealisedNaive;
  return [
    `   Avg realised points/match: ${p.avgRealised.toFixed(4)}  (n=${p.n})`,
    `   Avg expected points/match: ${p.avgExpected.toFixed(4)}`,
    `   Naive top-3 (by raw prob) realised: ${p.avgRealisedNaive.toFixed(4)}  expected: ${p.avgExpectedNaive.toFixed(4)}`,
    `   Lift from optimal picker over naive: ${lift > 0 ? '+' : ''}${lift.toFixed(4)} pts/match  (${(lift / Math.max(p.avgRealisedNaive, 1e-9) * 100).toFixed(2)}%)`,
  ].join('\n');
}

function calibrationTable(r) {
  return r.calibration
    .map(b => `  predicted ${(b.avgPredicted * 100).toFixed(0)}% → observed ${(b.observedRate * 100).toFixed(0)}%  (n=${b.n})`)
    .join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const which = ['baseline', 'v2', 'both'].includes(args[0]) ? args[0] : 'both';
  const sinceArg = args.find(a => a.startsWith('--since='));
  const since = sinceArg ? parseInt(sinceArg.split('=')[1], 10) : 1990;

  console.log(`\n📥 Loading historical matches since ${since}…`);
  const matches = await loadMatches({ sinceYear: since });
  console.log(`   → ${matches.length} matches between WC2026 teams\n`);

  const results = {};

  if (which === 'baseline' || which === 'both') {
    console.log('🟦 BASELINE (current engine backbone)');
    results.baseline = runBacktest(createBaselineModel(), matches, { verbose: true });
    console.log(`   ${fmt(results.baseline)}`);
    console.log('   Calibration buckets:');
    console.log(calibrationTable(results.baseline));
    console.log('   Top-3 scoring (3/2/2/1/0 rule):');
    console.log(pointsLine(results.baseline.points));
    console.log();
  }

  if ((which === 'v2' || which === 'both') && createV2Model) {
    console.log('🟩 V2 (Dixon-Coles attack/defense)');
    results.v2 = runBacktest(createV2Model(), matches, { verbose: true });
    console.log(`   ${fmt(results.v2)}`);
    console.log('   Calibration buckets:');
    console.log(calibrationTable(results.v2));
    console.log('   Top-3 scoring (3/2/2/1/0 rule):');
    console.log(pointsLine(results.v2.points));
    console.log();
  } else if (which === 'v2' && !createV2Model) {
    console.log('⚠️  modelV2.js not found — skipping');
  }

  if (results.baseline && results.v2) {
    const dBrier = results.baseline.avgBrier - results.v2.avgBrier;
    const dLogLoss = results.baseline.avgLogLoss - results.v2.avgLogLoss;
    const dAcc = results.v2.accuracy - results.baseline.accuracy;
    console.log('📊 DELTA (v2 − baseline)');
    console.log(`   Brier improvement:    ${dBrier > 0 ? '+' : ''}${dBrier.toFixed(4)} (lower better; positive = v2 wins)`);
    console.log(`   LogLoss improvement:  ${dLogLoss > 0 ? '+' : ''}${dLogLoss.toFixed(4)} (lower better; positive = v2 wins)`);
    console.log(`   Accuracy improvement: ${dAcc > 0 ? '+' : ''}${(dAcc * 100).toFixed(2)}pp`);
    if (results.baseline.points && results.v2.points) {
      const dPts = results.v2.points.avgRealised - results.baseline.points.avgRealised;
      console.log(`   Points/match improvement: ${dPts > 0 ? '+' : ''}${dPts.toFixed(4)}`);
    }
  }
}

main().catch(err => {
  console.error('Backtest failed:', err);
  process.exit(1);
});
