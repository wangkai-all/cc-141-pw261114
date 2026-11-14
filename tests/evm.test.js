import test from 'node:test';
import assert from 'node:assert/strict';
import {
  plannedValue,
  earnedValueAt,
  actualCostAt,
  indexTree,
  leafPackages,
  buildSnapshot,
  forecastFromTotals,
  saveBaseline,
  classify,
  STATUS,
  COST_MODES,
  parseISO,
  addDays,
} from '../src/evm-core.js';
import { getSample, SAMPLES } from '../src/samples.js';

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

test('date helpers reject impossible dates', () => {
  assert.equal(parseISO('2026-02-30'), null);
  assert.equal(parseISO('2026-13-01'), null);
  assert.equal(parseISO('not-a-date'), null);
  assert.ok(parseISO('2026-02-28'));
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});

/* ------------------------------------------------------------------ *
 * Planned value
 * ------------------------------------------------------------------ */

test('planned value is linear across the baseline window', () => {
  const pkg = { bac: 100000, baselineStart: '2026-04-01', baselineFinish: '2026-07-01' };
  assert.equal(plannedValue(pkg, '2026-03-01'), 0);
  assert.equal(plannedValue(pkg, '2026-04-01'), 0);
  assert.equal(plannedValue(pkg, '2026-07-01'), 100000);
  assert.equal(plannedValue(pkg, '2026-08-01'), 100000);
  const mid = plannedValue(pkg, '2026-05-16'); // 45 of 91 days
  assert.ok(mid > 48000 && mid < 50000, `mid=${mid}`);
});

test('planned value uses the baseline item budget and window, not today’s package', () => {
  const pkg = { bac: 900000, baselineStart: '2026-04-01', baselineFinish: '2026-12-31' };
  const baselineItem = { packageId: 'p', bac: 1000000, start: '2026-04-01', finish: '2026-07-01' };
  // Old baseline: budget and dates come from the baseline item.
  assert.equal(plannedValue(pkg, '2026-07-01', baselineItem), 1000000);
  // Without the item, the package's own window is used (91 of 274 days).
  const own = plannedValue(pkg, '2026-07-01');
  assert.ok(Math.abs(own - (900000 * 91 / 274)) < 0.01, `own=${own}`);
});

test('milestone-based planned value steps on milestone dates', () => {
  const pkg = { bac: 100000 };
  const baselineItem = {
    start: '2026-01-01', finish: '2026-12-31',
    milestones: [
      { date: '2026-05-01', weight: 40 },
      { date: '2026-09-01', weight: 60 },
    ],
  };
  assert.equal(plannedValue(pkg, '2026-04-01', baselineItem), 0);
  assert.equal(plannedValue(pkg, '2026-05-02', baselineItem), 40000);
  assert.equal(plannedValue(pkg, '2026-09-02', baselineItem), 100000);
});

/* ------------------------------------------------------------------ *
 * Earned value — the measurement method governs, not cost
 * ------------------------------------------------------------------ */

test('quantity method earns by completed quantity, ignoring cost', () => {
  const pkg = {
    bac: 100000,
    progress: { method: 'quantity', plannedQuantity: 1000, completedQuantity: 450 },
    costs: [{ effectiveDate: '2026-01-01', recordedDate: '2026-01-01', amount: 90000 }],
  };
  const ev = earnedValueAt(pkg, '2026-01-01', '2026-01-01');
  assert.equal(ev.measurable, true);
  assert.equal(ev.ratio, 0.45);
  assert.equal(ev.earned, 45000);
});

test('milestone method earns by completed milestones, weighted', () => {
  const pkg = {
    bac: 200000,
    progress: {
      method: 'milestone',
      milestones: [
        { name: 'a', weight: 25, completed: true, completedDate: '2026-03-01' },
        { name: 'b', weight: 35, completed: false },
        { name: 'c', weight: 40, completed: false },
      ],
    },
  };
  const ev = earnedValueAt(pkg, '2026-06-01', '2026-06-01');
  assert.equal(ev.ratio, 0.25);
  assert.equal(ev.earned, 50000);
});

test('earned value before the snapshot only counts milestones completed by that date', () => {
  const pkg = {
    bac: 100000,
    progress: {
      method: 'milestone',
      milestones: [
        { name: 'a', weight: 50, completed: true, completedDate: '2026-05-01' },
        { name: 'b', weight: 50, completed: true, completedDate: '2026-09-01' },
      ],
    },
  };
  assert.equal(earnedValueAt(pkg, '2026-06-01', '2026-10-01').earned, 50000);
});

test('quantity history gives historical earned value', () => {
  const pkg = {
    bac: 100000,
    progress: {
      method: 'quantity', plannedQuantity: 100, completedQuantity: 70,
      history: [
        { date: '2026-03-01', completedQuantity: 30 },
        { date: '2026-06-01', completedQuantity: 55 },
      ],
    },
  };
  assert.equal(earnedValueAt(pkg, '2026-04-01', '2026-10-01').earned, 30000);
  assert.equal(Math.round(earnedValueAt(pkg, '2026-07-01', '2026-10-01').earned), 55000);
  assert.equal(earnedValueAt(pkg, '2026-10-01', '2026-10-01').earned, 70000);
});

test('missing measurement data is “not measurable”, never zero progress', () => {
  const noMethod = { bac: 100000, progress: {}, costs: [] };
  const zeroPlan = { bac: 100000, progress: { method: 'quantity', plannedQuantity: 0, completedQuantity: 10 } };
  const noMilestones = { bac: 100000, progress: { method: 'milestone', milestones: [] } };

  for (const pkg of [noMethod, zeroPlan, noMilestones]) {
    const ev = earnedValueAt(pkg, '2026-06-01', '2026-06-01');
    assert.equal(ev.measurable, false);
    assert.equal(ev.ratio, null, 'ratio must be null, not 0');
    assert.equal(ev.earned, 0);
    assert.ok(ev.note);
  }
});

test('a container package never earns by itself', () => {
  const ev = earnedValueAt({ id: 'c', bac: 500000, children: [{ id: 'x' }], progress: { method: 'quantity', plannedQuantity: 1, completedQuantity: 1 } }, '2026-06-01', '2026-06-01');
  assert.equal(ev.measurable, false);
  assert.equal(ev.earned, 0);
  assert.equal(ev.reason, 'container');
});

/* ------------------------------------------------------------------ *
 * Tree — parent + child never double count
 * ------------------------------------------------------------------ */

test('tree totals roll up leaves only', () => {
  const packages = [
    { id: 'p', parentId: null, bac: 100000, progress: {} },
    { id: 'c1', parentId: 'p', bac: 60000, progress: { method: 'quantity', plannedQuantity: 10, completedQuantity: 5 } },
    { id: 'c2', parentId: 'p', bac: 40000, progress: { method: 'quantity', plannedQuantity: 10, completedQuantity: 5 } },
  ];
  const tree = indexTree(packages);
  const leaves = leafPackages(tree.roots[0]);
  assert.deepEqual(leaves.map((l) => l.id).sort(), ['c1', 'c2']);
});

test('snapshot total sums leaves once, even with several parent levels', () => {
  const caseData = {
    project: { name: 'T', startDate: '2026-01-01', finishDate: '2026-12-31' },
    baselines: [{ id: 'B', label: 'B', isCurrent: true, items: [
      { packageId: 'a1', bac: 100, start: '2026-01-01', finish: '2026-12-31' },
      { packageId: 'a2', bac: 200, start: '2026-01-01', finish: '2026-12-31' },
    ] }],
    packages: [
      { id: 'root', bac: 999, progress: {} },
      { id: 'mid', parentId: 'root', bac: 999, progress: {} },
      { id: 'a1', parentId: 'mid', bac: 100, progress: { method: 'quantity', plannedQuantity: 10, completedQuantity: 10 }, costs: [] },
      { id: 'a2', parentId: 'root', bac: 200, progress: { method: 'quantity', plannedQuantity: 10, completedQuantity: 10 }, costs: [] },
    ],
  };
  const snap = buildSnapshot(caseData, { asOf: '2026-12-31' });
  assert.equal(snap.total.bac, 300);
  assert.equal(snap.total.ev, 300);
  const rootRow = snap.rows.find((r) => r.id === 'root');
  assert.equal(rootRow.bac, 300);
});

/* ------------------------------------------------------------------ *
 * Cost record dates
 * ------------------------------------------------------------------ */

const records = [
  // recorded before cutoff, occurred before cutoff
  { id: 'r1', effectiveDate: '2026-05-01', recordedDate: '2026-05-03', amount: 100 },
  // recorded after cutoff, occurred before cutoff (a late entry)
  { id: 'r2', effectiveDate: '2026-06-01', recordedDate: '2026-11-10', amount: 200 },
  // recorded before cutoff, occurs after cutoff (committed early)
  { id: 'r3', effectiveDate: '2026-12-01', recordedDate: '2026-09-01', amount: 300 },
];

test('as-known sees only entries registered by the cutoff', () => {
  const result = actualCostAt(records, '2026-10-31', COST_MODES.AS_KNOWN);
  assert.equal(result.total, 100);
  assert.deepEqual(result.included.map((r) => r.id), ['r1']);
  assert.deepEqual(result.lateEntries.map((r) => r.id), ['r2']);
  assert.deepEqual(result.futureEntries.map((r) => r.id), ['r3']);
});

test('current revision includes late entries at their occurrence date', () => {
  const result = actualCostAt(records, '2026-10-31', COST_MODES.CURRENT);
  assert.equal(result.total, 300);
  assert.deepEqual(result.included.map((r) => r.id).sort(), ['r1', 'r2']);
  assert.deepEqual(result.futureEntries.map((r) => r.id), ['r3']);
});

test('a committed future cost is never counted before it occurs', () => {
  const futureOnly = [records[2]];
  assert.equal(actualCostAt(futureOnly, '2026-10-31', COST_MODES.CURRENT).total, 0);
  assert.equal(actualCostAt(futureOnly, '2026-10-31', COST_MODES.AS_KNOWN).total, 0);
  assert.equal(actualCostAt(futureOnly, '2026-12-05', COST_MODES.CURRENT).total, 300);
});

test('a report reopened at an earlier cutoff cannot see later corrections', () => {
  const snapKnown = buildSnapshot(SAMPLES.delay, { asOf: '2026-09-30', costMode: COST_MODES.AS_KNOWN });
  const snapCorrected = buildSnapshot(SAMPLES.delay, { asOf: '2026-09-30', costMode: COST_MODES.CURRENT });
  // Four costs occurred by 2026-09-30 but were registered in October/November:
  // C-A1-05 96,000, C-A1-06 142,000, C-A2-02 298,000, C-A3-03 88,000.
  assert.equal(snapCorrected.total.ac - snapKnown.total.ac, 624000);
  assert.equal(snapKnown.corrections.length, 4);
  // The as-known ledger is a real ledger, not zero.
  assert.ok(snapKnown.total.ac > 0);
});

test('switching to current mode does not rewrite the as-known snapshot', () => {
  const options = { asOf: '2026-10-31' };
  const known = buildSnapshot(SAMPLES.delay, { ...options, costMode: COST_MODES.AS_KNOWN });
  const current = buildSnapshot(SAMPLES.delay, { ...options, costMode: COST_MODES.CURRENT });
  assert.equal(current.costMode, 'current');
  assert.equal(known.costMode, 'as-known');
  assert.ok(current.total.ac > known.total.ac);
  // PV and EV do not depend on the cost convention.
  assert.equal(current.total.pv, known.total.pv);
  assert.equal(current.total.ev, known.total.ev);
});

test('corrections list reports the entries hidden by the as-known view', () => {
  const snap = buildSnapshot(SAMPLES.procurement, { asOf: '2026-10-31', costMode: COST_MODES.AS_KNOWN });
  const ids = snap.corrections.map((c) => c.id);
  assert.ok(ids.includes('C-B1-03'), 'transport invoice registered in November');
  assert.ok(ids.includes('C-B2-03'), 'backfill settlement registered in November');
  const allHidden = snap.corrections.every((c) => c.visibleNow === false);
  assert.ok(allHidden);
  assert.ok(snap.corrections.every((c) => c.recordedDate > snap.asOf));
  assert.ok(snap.corrections.every((c) => c.effectiveDate <= snap.asOf));
});

test('early purchase commitment appears as future, not as actual cost', () => {
  const snap = buildSnapshot(SAMPLES.procurement, { asOf: '2026-10-31' });
  const transformed = snap.rows.find((r) => r.id === 'B1-1');
  const future = transformed.costs.find((c) => c.id === 'C-B1-04');
  assert.equal(future.state, 'future');
  const counted = transformed.costs.filter((c) => c.state === 'recorded' || c.state === 'late-included').reduce((s, c) => s + c.amount, 0);
  assert.ok(!counted.toString().includes('960000'));
});

/* ------------------------------------------------------------------ *
 * Baselines
 * ------------------------------------------------------------------ */

test('old baseline keeps its own budget and dates; new baseline is saved alongside', () => {
  const sample = SAMPLES.scope;
  const oldSnap = buildSnapshot(sample, { asOf: '2026-10-31', baselineId: 'BL-C1' });
  const newSnap = buildSnapshot(sample, { asOf: '2026-10-31', baselineId: 'BL-C2' });

  assert.ok(newSnap.total.bac > oldSnap.total.bac);
  assert.equal(oldSnap.total.bac, 4200000);
  assert.equal(newSnap.total.bac, 5350000);

  // The new scope package contributes nothing to the old baseline.
  const oldC3 = oldSnap.rows.find((r) => r.id === 'C3');
  assert.equal(oldC3.bac, 0);
  assert.equal(oldC3.pv, 0);
  assert.equal(oldC3.ev, 0);
  assert.equal(oldC3.excluded, true);

  // Both baselines are still listed, old one unchanged.
  const comparison = newSnap.baselineComparison;
  assert.equal(comparison.length, 2);
  const old = comparison.find((b) => b.id === 'BL-C1');
  assert.equal(old.bac, 4200000);
  assert.equal(old.isCurrent, false);
});

test('baseline comparison reports budget change between versions', () => {
  const snap = buildSnapshot(SAMPLES.scope, { asOf: '2026-10-31', baselineId: 'BL-C2' });
  const later = snap.baselineComparison.find((b) => b.id === 'BL-C2');
  assert.equal(later.deltaBacFromPrevious, 1150000);
});

test('changing the baseline does not rewrite the old PV at the same cutoff', () => {
  const sample = SAMPLES.delay;
  const v1 = buildSnapshot(sample, { asOf: '2026-09-30', baselineId: 'BL-A1' });
  const v2 = buildSnapshot(sample, { asOf: '2026-09-30', baselineId: 'BL-A2' });
  assert.notEqual(v1.total.pv, v2.total.pv);
  // Re-reading v1 again yields the same old value — history is stable.
  const v1again = buildSnapshot(sample, { asOf: '2026-09-30', baselineId: 'BL-A1' });
  assert.equal(v1again.total.pv, v1.total.pv);
});

/* ------------------------------------------------------------------ *
 * Statuses and ratios
 * ------------------------------------------------------------------ */

test('zero PV and zero EV are “not started”, with no SPI', () => {
  const snap = buildSnapshot(SAMPLES.delay, { asOf: '2026-06-30' });
  const row = snap.rows.find((r) => r.id === 'A4');
  assert.equal(row.status, STATUS.NOT_STARTED);
  assert.equal(row.spi, null);
  assert.equal(row.cpi, null);
});

test('zero earned value with real spend is “zero earned”, not infinity', () => {
  const row = {
    measurable: true,
    pv: 1000,
    ev: 0,
    ac: 800,
    cpi: null,
    spi: null,
  };
  assert.equal(classify(row), STATUS.NO_EARNING);
});

test('zero actual cost is reported as “no cost”, not as CPI infinity', () => {
  const row = { measurable: true, pv: 1000, ev: 500, ac: 0, cpi: null, spi: 0.5 };
  assert.equal(classify(row), STATUS.NO_COST);
});

test('unmeasurable packages are flagged before any variance is claimed', () => {
  const row = { measurable: false, pv: 5000, ev: 0, ac: 3000, cpi: null, spi: null };
  assert.equal(classify(row), STATUS.UNMEASURED);
});

test('sample covers the awkward states: not started, zero earned, no cost, unmeasured', () => {
  const snap = buildSnapshot(SAMPLES.delay, { asOf: '2026-10-31' });
  const statuses = new Set(snap.rows.map((r) => r.status));
  for (const expected of [STATUS.NOT_STARTED, STATUS.NO_EARNING, STATUS.UNMEASURED, STATUS.BEHIND]) {
    assert.ok(statuses.has(expected), `missing status ${expected}`);
  }
  // No row carries a ratio when its denominator is zero.
  for (const row of snap.rows) {
    if (row.ac === 0) assert.equal(row.cpi, null, `${row.id} cpi`);
    if (row.pv === 0) assert.equal(row.spi, null, `${row.id} spi`);
    if (row.ev === 0) assert.equal(row.cpi, null, `${row.id} cpi`);
  }
});

/* ------------------------------------------------------------------ *
 * Forecast
 * ------------------------------------------------------------------ */

test('forecast states assumptions and refuses a CPI projection with zero EV', () => {
  const total = { bac: 1000000, ev: 0, ac: 200000 };
  const forecast = forecastFromTotals(total, { scenarioEtc: 500000 }, '2026-10-31');
  assert.equal(forecast.baseEac, null);
  assert.ok(forecast.baseUnavailable.includes('挣值'));
  assert.equal(forecast.scenarioEac, 700000);
  assert.ok(forecast.assumptions.length >= 1);
});

test('forecast refuses a CPI projection with zero actual cost', () => {
  const forecast = forecastFromTotals({ bac: 1000000, ev: 300000, ac: 0 }, {}, '2026-10-31');
  assert.equal(forecast.baseEac, null);
  assert.ok(forecast.baseUnavailable.includes('成本'));
});

test('user ETC scenario is independent of CPI and does not mutate the base', () => {
  const total = { bac: 1000000, ev: 400000, ac: 500000 };
  const noScenario = forecastFromTotals(total, {}, '2026-10-31');
  const withScenario = forecastFromTotals(total, { scenarioEtc: 700000 }, '2026-10-31');
  assert.equal(noScenario.baseEac, withScenario.baseEac);
  assert.equal(withScenario.baseEac, 1250000);
  assert.equal(withScenario.scenarioEac, 1200000);
  assert.notEqual(withScenario.scenarioEac, withScenario.baseEac);
  assert.equal(withScenario.baseVac, -250000);
  assert.equal(withScenario.scenarioVac, -200000);
});

test('sample snapshots produce finite, consistent numbers', () => {
  for (const id of Object.keys(SAMPLES)) {
    const sample = getSample(id);
    const snap = buildSnapshot(sample, { asOf: sample.project.asOfDefault });
    assert.ok(Number.isFinite(snap.total.bac));
    assert.ok(snap.total.pv > 0);
    assert.ok(snap.total.ac > 0);
    assert.equal(snap.total.bac, snap.rows.filter((r) => r.isLeaf).reduce((s, r) => s + r.bac, 0));
    for (const point of snap.series.points) {
      assert.ok(point.pv >= 0);
      assert.ok(point.ev === null || point.ev >= 0);
      assert.ok(point.ac === null || point.ac >= 0);
    }
    // No actual observations after the cutoff.
    for (const point of snap.series.points) {
      if (point.date > snap.asOf) {
        assert.equal(point.ev, null);
        assert.equal(point.ac, null);
      }
    }
  }
});

test('chart series starts at zero and ends at the full plan', () => {
  const snap = buildSnapshot(SAMPLES.delay, { asOf: '2026-10-31' });
  const first = snap.series.points[0];
  const last = snap.series.points.at(-1);
  assert.equal(first.pv, 0);
  assert.equal(last.pv, snap.total.bac);
});

test('every sample’s project total never counts the same cost twice', () => {
  for (const id of Object.keys(SAMPLES)) {
    const sample = getSample(id);
    const snap = buildSnapshot(sample, { asOf: sample.project.asOfDefault });
    const leaves = snap.rows.filter((r) => r.isLeaf);
    const sum = leaves.reduce((s, r) => s + r.ac, 0);
    assert.equal(snap.total.ac, sum);
  }
});

/* ------------------------------------------------------------------ *
 * Saving a new baseline
 * ------------------------------------------------------------------ */

test('saving a baseline appends a version and leaves the old one byte-identical', () => {
  const data = structuredClone(SAMPLES.scope);
  const before = JSON.parse(JSON.stringify(data.baselines));

  const saved = saveBaseline(data, 'BL-C2', {
    packageId: 'C2-1',
    bac: 600000,
    finish: '2027-01-15',
    reason: '业主追加给排水点位',
  }, '2026-10-31');

  assert.equal(data.baselines.length, 3);
  assert.equal(saved.isCurrent, true);
  assert.equal(data.baselines[1].isCurrent, false);
  // Existing versions are untouched.
  assert.deepEqual(data.baselines.slice(0, 2), before.map((b) => ({ ...b, isCurrent: false })));

  // Only the requested package changed in the new version.
  const sourceItem = data.baselines[1].items.find((i) => i.packageId === 'C2-1');
  const nextItem = data.baselines[2].items.find((i) => i.packageId === 'C2-1');
  assert.equal(sourceItem.bac, 520000);
  assert.equal(nextItem.bac, 600000);
  assert.equal(nextItem.finish, '2027-01-15');
  const untouched = data.baselines[2].items.filter((i) => i.packageId !== 'C2-1');
  const untouchedSource = data.baselines[1].items.filter((i) => i.packageId !== 'C2-1');
  assert.deepEqual(untouched, untouchedSource);
});

test('a saved baseline is selectable and yields its own PV', () => {
  const data = structuredClone(SAMPLES.scope);
  const saved = saveBaseline(data, 'BL-C2', { packageId: 'C1-1', bac: 1800000 }, '2026-10-31');
  const oldSnap = buildSnapshot(data, { asOf: '2026-10-31', baselineId: 'BL-C2' });
  const newSnap = buildSnapshot(data, { asOf: '2026-10-31', baselineId: saved.id });
  assert.ok(newSnap.total.bac > oldSnap.total.bac);
  assert.equal(newSnap.total.bac - oldSnap.total.bac, 200000);
  assert.ok(newSnap.total.pv > oldSnap.total.pv);
  // The old baseline still reports the original PV.
  const oldAgain = buildSnapshot(data, { asOf: '2026-10-31', baselineId: 'BL-C2' });
  assert.equal(oldAgain.total.pv, oldSnap.total.pv);
});

test('saveBaseline validates input and rejects unknown ids', () => {
  const data = structuredClone(SAMPLES.delay);
  assert.throws(() => saveBaseline(data, 'nope', { packageId: 'A2' }));
  assert.throws(() => saveBaseline(data, 'BL-A2', {}));
  assert.throws(() => saveBaseline(data, 'BL-A2', { packageId: 'A2', bac: -1 }));
  assert.throws(() => saveBaseline(data, 'BL-A2', { packageId: 'ghost', bac: 1 }));
});

/* ------------------------------------------------------------------ *
 * Re-opening a historical cutoff
 * ------------------------------------------------------------------ */

test('re-opening an earlier cutoff shows the progress known then, not today’s measurement', () => {
  const sample = SAMPLES.delay;
  const early = buildSnapshot(sample, { asOf: '2026-04-01' });
  // Project starts 2026-04-01; no quantity history or completed milestone
  // exists by that date, so the standing 2026-10-31 measurement must not leak in.
  assert.equal(early.total.ev, 0);
  assert.equal(early.total.pv, 0);
  assert.equal(early.total.ac, 0);

  const may = buildSnapshot(sample, { asOf: '2026-05-15' });
  assert.equal(may.total.ev, 0, 'no history was recorded by mid-May either');

  // EV only moves once dated evidence exists, and never falls back later.
  const ordered = ['2026-04-01', '2026-06-30', '2026-08-31', '2026-10-31']
    .map((asOf) => buildSnapshot(sample, { asOf }).total.ev);
  for (let i = 1; i < ordered.length; i += 1) {
    assert.ok(ordered[i] >= ordered[i - 1], 'cumulative EV is monotonic across cutoffs');
  }
  assert.equal(ordered.at(-1), 2458400);
});

test('the declared data cutoff still lets the default report use the standing measurement', () => {
  const snap = buildSnapshot(SAMPLES.delay, { asOf: '2026-10-31' });
  const a11 = snap.rows.find((r) => r.id === 'A1-1');
  assert.equal(a11.quantityInfo.completed, 43200);
  assert.equal(snap.dataThrough, '2026-10-31');
});

test('an explicit knowledge date overrides the sample default', () => {
  const sample = structuredClone(SAMPLES.delay);
  sample.project.dataThrough = '2026-06-30';
  const snap = buildSnapshot(sample, { asOf: '2026-10-31' });
  const a11 = snap.rows.find((r) => r.id === 'A1-1');
  // Through June only the 20,800 m³ history entry is known.
  assert.equal(a11.quantityInfo.completed, 20800);
  assert.ok(snap.total.ev < buildSnapshot(SAMPLES.delay, { asOf: '2026-10-31' }).total.ev);
});

test('a cutoff after the data cutoff keeps progress frozen while costs keep accruing', () => {
  const snap = buildSnapshot(SAMPLES.delay, { asOf: '2026-12-31' });
  assert.equal(snap.observedThrough, '2026-10-31');
  assert.equal(snap.total.ev, buildSnapshot(SAMPLES.delay, { asOf: '2026-10-31' }).total.ev);

  const lastEv = [...snap.series.points].reverse().find((p) => p.ev !== null);
  const lastAc = [...snap.series.points].reverse().find((p) => p.ac !== null);
  assert.equal(lastEv.date, '2026-10-31');
  assert.equal(lastEv.ev, snap.total.ev);
  assert.equal(lastAc.date, '2026-12-31');
  assert.equal(lastAc.ac, snap.total.ac);
  // Costs for late-registered work keep accruing after the last progress reading.
  assert.ok(lastAc.ac > buildSnapshot(SAMPLES.delay, { asOf: '2026-10-31' }).total.ac);
});

test('series always ends at the report totals it summarises', () => {
  const sample = SAMPLES.delay;
  for (const asOf of ['2026-06-30', '2026-10-31', '2026-12-31']) {
    const snap = buildSnapshot(sample, { asOf });
    const lastEv = [...snap.series.points].reverse().find((p) => p.ev !== null);
    const lastAc = [...snap.series.points].reverse().find((p) => p.ac !== null);
    assert.equal(lastEv ? Math.round(lastEv.ev) : 0, Math.round(snap.total.ev));
    assert.equal(lastAc ? Math.round(lastAc.ac) : 0, Math.round(snap.total.ac));
  }
});
