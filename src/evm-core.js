/**
 * EVM engine — pure functions, no DOM, no dependencies.
 *
 * Conventions
 * -----------
 * Dates are ISO "YYYY-MM-DD" strings, compared lexicographically.
 * Money is a plain number in the project currency; rounding happens only at
 * display time.
 *
 * Cost records carry two dates on purpose:
 *   effectiveDate — when the cost actually occurred (business date)
 *   recordedDate  — when the entry was registered in the ledger
 * They are never collapsed. A report re-opened "as known at T" must not see
 * costs entered after T, even when those entries belong to an earlier
 * business date.
 *
 * Progress comes from each package's own measurement method (milestones,
 * quantity, weighted steps). Money spent never substitutes for physical
 * progress.
 *
 * Packages form a forest. A package with children is a container and is
 * rolled up from its leaves only, so parent + child can never both be counted
 * in a total.
 */

const DAY_MS = 86400000;

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

export function parseISO(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date;
}

export function toISO(value) {
  return value.toISOString().slice(0, 10);
}

export function addDays(isoDate, days) {
  const date = parseISO(isoDate);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return toISO(date);
}

export function daysBetween(startISO, endISO) {
  const a = parseISO(startISO);
  const b = parseISO(endISO);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Round money to cents so aggregations don't accumulate float dust. */
export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/* ------------------------------------------------------------------ *
 * Planned value
 * ------------------------------------------------------------------ */

/**
 * Planned value of one package at a date.
 *
 * Value accrues linearly between baseline start and finish. If the baseline
 * item carries weighted milestones, value accrues in steps on their dates.
 * A milestone whose date has not been reached earns nothing yet.
 */
export function plannedValue(pkg, asOf, baselineItem = null) {
  const bac = Number(baselineItem?.bac ?? pkg.bac) || 0;
  const start = baselineItem?.start ?? pkg.baselineStart;
  const finish = baselineItem?.finish ?? pkg.baselineFinish;
  if (!bac || !parseISO(start ?? '') || !parseISO(finish ?? '')) return 0;
  if (asOf < start) return 0;

  const milestones = baselineItem?.milestones ?? pkg.weightedMilestones;
  if (Array.isArray(milestones) && milestones.length) {
    const totalWeight = milestones.reduce((s, m) => s + (Number(m.weight) || 0), 0);
    if (totalWeight <= 0) return 0;
    const reached = milestones.reduce(
      (s, m) => s + (m.date && m.date <= asOf ? Number(m.weight) || 0 : 0),
      0
    );
    return bac * (reached / totalWeight);
  }

  if (asOf >= finish) return bac;
  const span = daysBetween(start, finish);
  if (span <= 0) return bac;
  return bac * (daysBetween(start, asOf) / span);
}

/* ------------------------------------------------------------------ *
 * Earned value — the package's own measurement method
 * ------------------------------------------------------------------ */

export const PROGRESS_METHODS = Object.freeze(['milestone', 'quantity', 'weighted']);

export const METHOD_LABELS = Object.freeze({
  milestone: '里程碑',
  quantity: '完成数量',
  weighted: '加权步骤',
});

function methodOf(pkg) {
  const progress = pkg.progress || {};
  if (progress.method) return progress.method;
  if (Array.isArray(progress.milestones)) return 'milestone';
  if (progress.plannedQuantity !== undefined) return 'quantity';
  if (Array.isArray(progress.steps)) return 'weighted';
  return null;
}

function isContainerNode(pkg) {
  return Array.isArray(pkg.children) && pkg.children.length > 0;
}

/**
 * Earned value of a single package at a date.
 *
 * `asOf` is the snapshot date and `knowledgeAt` is the date through which
 * progress had actually been observed. A standing measurement
 * (`completedQuantity`, a step percent, a milestone with no completion date)
 * belongs to the date it was taken — `progress.measuredAt`, else
 * `knowledgeAt`. Re-opening an earlier cutoff therefore counts only the
 * history that existed then; a later measurement is never back-dated into an
 * old report. Pass `knowledgeAt = asOf` when the cutoff itself is the
 * observation date (the default).
 *
 * Returns { ratio, earned, measurable, method, reason, note, ... }.
 * ratio is null — never 0 — when the method cannot be evaluated, so callers
 * cannot quietly turn a data gap into a performance number.
 */
export function earnedValueAt(pkg, date, asOf = date, knowledgeAt = asOf) {
  const bac = Number(pkg.bac) || 0;
  const method = methodOf(pkg);
  const progress = pkg.progress || {};
  // Progress can only be known through the observation date. A report dated
  // later than the data still shows the last observed position — it never
  // invents movement between the last observation and the report cutoff.
  const observedDate = date < knowledgeAt ? date : knowledgeAt;

  if (isContainerNode(pkg)) {
    return { ratio: null, earned: 0, measurable: false, method, reason: 'container', note: '汇总包，由子工作包汇总计入' };
  }

  if (!method) {
    return { ratio: null, earned: 0, measurable: false, method: null, reason: 'no-method', note: '未设置计量方式，无法计算实际完成比例' };
  }

  if (method === 'milestone') {
    const milestones = progress.milestones || [];
    const totalWeight = milestones.reduce((s, m) => s + (Number(m.weight) || 0), 0);
    if (!milestones.length || totalWeight <= 0) {
      return { ratio: null, earned: 0, measurable: false, method, reason: 'no-milestones', note: '里程碑未设置或权重合计为零' };
    }
    const completeBy = (m) => Boolean(m.completedDate)
      ? m.completedDate <= observedDate
      : Boolean(m.completed) && observedDate >= knowledgeAt;
    let done = 0;
    for (const m of milestones) {
      if (completeBy(m)) done += Number(m.weight) || 0;
    }
    const ratio = done / totalWeight;
    return {
      ratio,
      earned: bac * ratio,
      measurable: true,
      method,
      milestonesDone: milestones.filter(completeBy).length,
      milestonesTotal: milestones.length,
      note: null,
    };
  }

  if (method === 'quantity') {
    const planned = Number(progress.plannedQuantity) || 0;
    if (planned <= 0) {
      return { ratio: null, earned: 0, measurable: false, method, reason: 'no-quantity', note: '计划数量未设置，无法按数量计量' };
    }
    const completed = completedQuantityAt(pkg, observedDate, knowledgeAt);
    const ratio = clamp(completed / planned, 0, 1);
    return {
      ratio,
      earned: bac * ratio,
      measurable: true,
      method,
      completedQuantity: completed,
      plannedQuantity: planned,
      unit: progress.unit || '',
      note: `${completed}/${planned}${progress.unit ? ' ' + progress.unit : ''}`,
    };
  }

  if (method === 'weighted') {
    const steps = progress.steps || [];
    const totalWeight = steps.reduce((s, step) => s + (Number(step.weight) || 0), 0);
    if (!steps.length || totalWeight <= 0) {
      return { ratio: null, earned: 0, measurable: false, method, reason: 'no-steps', note: '加权步骤未设置或权重合计为零' };
    }
    let gained = 0;
    for (const step of steps) {
      const weight = Number(step.weight) || 0;
      const entries = (step.history || []).filter((h) => parseISO(h.date));
      if (step.percent !== undefined) {
        entries.push({ date: progress.measuredAt || knowledgeAt, percent: step.percent, implicit: true });
      }
      const reached = entries
        .filter((h) => h.date <= observedDate)
        .sort(byDateExplicitLast);
      const last = reached[reached.length - 1];
      gained += weight * clamp(Number(last?.percent) || 0, 0, 1);
    }
    return { ratio: gained / totalWeight, earned: bac * (gained / totalWeight), measurable: true, method, note: '按加权步骤完成度计量' };
  }

  return { ratio: null, earned: 0, measurable: false, method, reason: 'unknown-method', note: '未知的计量方式' };
}

/**
 * Completed quantity as of `date`.
 *
 * History is the evidence for past dates. The current measurement is treated
 * as an implicit entry at the snapshot date, so a report re-opened before the
 * first history entry shows zero rather than borrowing progress that had not
 * been recorded yet.
 */
function completedQuantityAt(pkg, date, knowledgeAt) {
  const progress = pkg.progress || {};
  const entries = (progress.history || []).filter((h) => parseISO(h.date));
  if (progress.completedQuantity !== undefined) {
    // The standing measurement belongs to the date it was observed. A report
    // re-opened before that date must not borrow the later number, so it is
    // stamped with measuredAt (falling back to the knowledge date).
    entries.push({
      date: progress.measuredAt || knowledgeAt,
      completedQuantity: progress.completedQuantity,
      implicit: true,
    });
  }
  const reached = entries
    .filter((h) => h.date <= date)
    .sort(byDateExplicitLast);
  const last = reached[reached.length - 1];
  return last ? Number(last.completedQuantity) || 0 : 0;
}

/**
 * Chronological order; on the same date a dated history entry wins over the
 * implicit standing measurement, because explicit evidence is more specific
 * than an undated "current" value.
 */
function byDateExplicitLast(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (Boolean(a.implicit) === Boolean(b.implicit)) return 0;
  return a.implicit ? -1 : 1;
}

/** Current-state earned value (snapshot at the latest known progress). */
export function earnedValue(pkg) {
  return earnedValueAt(pkg, '9999-12-31', '9999-12-31', '9999-12-31');
}

/* ------------------------------------------------------------------ *
 * Actual cost — occurrence date and entry date kept separate
 * ------------------------------------------------------------------ */

export const COST_MODES = Object.freeze({
  AS_KNOWN: 'as-known',
  CURRENT: 'current',
});

/**
 * Actual cost visible at `asOf` under one of two data conventions.
 *
 * as-known: entries that had been registered by `asOf`, counted at their
 *           occurrence date. Reproduces the ledger as it stood on that date.
 * current:  every entry known today, counted from its occurrence date.
 *           Later corrections are included.
 *
 * Both modes exclude costs whose occurrence date is after `asOf`. Entries
 * registered early for a future occurrence date ("提前采购") are therefore
 * not counted before they occur.
 *
 * Returns total plus:
 *   included     entries counted in this mode
 *   lateEntries  entries that occurred by asOf but were registered after it
 *                (hidden under as-known; this is exactly what corrrection
 *                 mode changes)
 *   futureEntries entries registered but not yet occurred
 */
export function actualCostAt(records, asOf, mode = COST_MODES.AS_KNOWN) {
  let total = 0;
  const included = [];
  const lateEntries = [];
  const futureEntries = [];

  for (const record of records || []) {
    const amount = Number(record.amount) || 0;
    if (!record.effectiveDate || !record.recordedDate) continue;
    const occurred = record.effectiveDate <= asOf;

    if (!occurred) {
      if (record.recordedDate <= asOf) futureEntries.push(record);
      continue;
    }

    const registeredByCutoff = record.recordedDate <= asOf;
    if (mode === COST_MODES.CURRENT || registeredByCutoff) {
      total += amount;
      included.push(record);
    }
    if (!registeredByCutoff) lateEntries.push(record);
  }

  return { total, included, lateEntries, futureEntries };
}

/* ------------------------------------------------------------------ *
 * Tree
 * ------------------------------------------------------------------ */

/**
 * Build a navigable tree from a flat package list. Unknown parents are
 * treated as roots rather than silently discarded.
 */
export function indexTree(packages) {
  const byId = new Map();
  for (const pkg of packages) byId.set(pkg.id, { ...pkg, children: [] });
  const roots = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId) && node.parentId !== node.id) {
      byId.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return { byId, roots };
}

/**
 * Leaf packages only. Containers never appear in a total, so their budgets
 * and costs cannot be counted twice.
 */
export function leafPackages(node) {
  if (!node) return [];
  const out = [];
  const walk = (n) => {
    if (!n.children || n.children.length === 0) {
      out.push(n);
      return;
    }
    for (const child of n.children) walk(child);
  };
  walk(node);
  return out;
}

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

export const STATUS = Object.freeze({
  ON_TRACK: 'on-track',
  AHEAD: 'ahead',
  BEHIND: 'behind',
  OVER_BUDGET: 'over-budget',
  NOT_STARTED: 'not-started',
  NO_EARNING: 'no-earning',
  NO_COST: 'no-cost',
  UNMEASURED: 'unmeasured',
  OUT_OF_BASELINE: 'out-of-baseline',
});

export const STATUS_LABELS = Object.freeze({
  [STATUS.ON_TRACK]: '按计划',
  [STATUS.AHEAD]: '进度超前',
  [STATUS.BEHIND]: '进度落后',
  [STATUS.OVER_BUDGET]: '成本超支',
  [STATUS.NOT_STARTED]: '未开工',
  [STATUS.NO_EARNING]: '零挣值',
  [STATUS.NO_COST]: '未记成本',
  [STATUS.UNMEASURED]: '无法计量',
  [STATUS.OUT_OF_BASELINE]: '不在基线范围',
});

/** Status tone for the UI: only these four mean "health". */
export const STATUS_TONE = Object.freeze({
  [STATUS.ON_TRACK]: 'good',
  [STATUS.AHEAD]: 'good',
  [STATUS.BEHIND]: 'warning',
  [STATUS.OVER_BUDGET]: 'serious',
  [STATUS.NOT_STARTED]: 'neutral',
  [STATUS.NO_EARNING]: 'warning',
  [STATUS.NO_COST]: 'neutral',
  [STATUS.UNMEASURED]: 'neutral',
  [STATUS.OUT_OF_BASELINE]: 'neutral',
});

/**
 * Status from the numbers actually available.
 *
 * The order matters: a data gap is reported as a data gap before any
 * variance is claimed. Zero PV and zero EV are their own states, and no
 * efficiency ratio is derived from them.
 */
export function classify(row) {
  if (!row.measurable) return STATUS.UNMEASURED;
  if (!(row.pv > 0)) return STATUS.NOT_STARTED;
  if (!(row.ev > 0)) return STATUS.NO_EARNING;
  if (!(row.ac > 0)) return STATUS.NO_COST;
  if (row.cpi !== null && row.cpi < 0.95) return STATUS.OVER_BUDGET;
  if (row.spi !== null && row.spi < 0.95) return STATUS.BEHIND;
  if (row.spi !== null && row.spi > 1.05) return STATUS.AHEAD;
  return STATUS.ON_TRACK;
}

/**
 * Efficiency ratios are only defined when both sides are positive. A zero
 * earned value or zero actual cost is not a performance level; report null
 * and let the status explain the gap.
 */
export function efficiency(ev, pv, ac) {
  return {
    cpi: ev > 0 && ac > 0 ? ev / ac : null,
    spi: ev > 0 && pv > 0 ? ev / pv : null,
  };
}

/* ------------------------------------------------------------------ *
 * Snapshot
 * ------------------------------------------------------------------ */

/**
 * Build the entire report for one cutoff date.
 *
 * options:
 *   asOf        ISO date (required)
 *   costMode    "as-known" (default) | "current"
 *   baselineId  planned-value basis; default the current baseline
 */
export function buildSnapshot(caseData, options = {}) {
  const asOf = options.asOf;
  if (!parseISO(asOf)) throw new Error('buildSnapshot: asOf must be an ISO date');
  // Progress was observed through the declared data cutoff, not necessarily
  // through the report cutoff. Re-opening an earlier date must not see later
  // measurements.
  const dataThrough = knowledgeDateOf(caseData, asOf);
  // Actual observations in the dataset stop at dataThrough, even when the
  // report cutoff is later.
  const observedThrough = asOf < dataThrough ? asOf : dataThrough;
  const costMode = options.costMode === COST_MODES.CURRENT ? COST_MODES.CURRENT : COST_MODES.AS_KNOWN;
  const baseline = pickBaseline(caseData, options.baselineId);
  const tree = indexTree(caseData.packages);
  const leaves = [];
  for (const node of tree.byId.values()) if (!node.children.length) leaves.push(node);

  const baselineOf = (leaf) => baselineItem(baseline, leaf);
  const inBaseline = (leaf) => {
    // A package absent from the selected baseline was not in that scope. It
    // contributes nothing to that baseline's plan, and its later work is not
    // counted against a plan that never contained it.
    if (!baseline) return true;
    if (!(baseline.items || []).length) return true;
    return Boolean(baselineOf(leaf));
  };

  // Per-leaf numbers at the cutoff, computed once.
  const numbers = new Map();
  for (const leaf of leaves) {
    if (!inBaseline(leaf)) {
      numbers.set(leaf.id, {
        ev: { ratio: null, earned: 0, measurable: true, method: methodOf(leaf), excluded: true, note: '不在所选基线范围内' },
        cost: { total: 0, included: [], lateEntries: [], futureEntries: [] },
        pv: 0,
        bac: 0,
        excluded: true,
      });
      continue;
    }
    const ev = earnedValueAt(leaf, asOf, asOf, dataThrough);
    const cost = actualCostAt(leaf.costs, asOf, costMode);
    numbers.set(leaf.id, {
      ev,
      cost,
      pv: plannedValue(leaf, asOf, baselineOf(leaf)),
      bac: Number(baselineOf(leaf)?.bac ?? leaf.bac) || 0,
      excluded: false,
    });
  }

  const totals = { bac: 0, pv: 0, ev: 0, ac: 0 };
  for (const n of numbers.values()) {
    totals.bac += n.bac;
    totals.pv += n.pv;
    totals.ev += n.ev.earned;
    totals.ac += n.cost.total;
  }

  // Rows, pre-order: containers roll up from leaves, leaves report themselves.
  const rows = [];
  const visit = (node, depth) => {
    const isContainer = node.children.length > 0;
    const nodeLeaves = isContainer ? leafPackages(node) : [node];
    const measured = nodeLeaves.reduce(
      (acc, leaf) => {
        const ln = numbers.get(leaf.id);
        acc.bac += ln.bac;
        acc.pv += ln.pv;
        acc.ev += ln.ev.earned;
        acc.ac += ln.cost.total;
        return acc;
      },
      { bac: 0, pv: 0, ev: 0, ac: 0 }
    );
    const evResult = isContainer ? null : numbers.get(node.id).ev;
    const excluded = !isContainer && numbers.get(node.id).excluded;

    const row = {
      id: node.id,
      name: node.name,
      parentId: node.parentId ?? null,
      depth,
      isContainer,
      isLeaf: !isContainer,
      method: isContainer ? null : evResult.method,
      bac: measured.bac,
      pv: measured.pv,
      ev: measured.ev,
      ac: measured.ac,
      cv: measured.ev - measured.ac,
      sv: measured.ev - measured.pv,
      cpi: measured.ev > 0 && measured.ac > 0 ? measured.ev / measured.ac : null,
      spi: measured.ev > 0 && measured.pv > 0 ? measured.ev / measured.pv : null,
      progress: measured.bac > 0 ? measured.ev / measured.bac : null,
      measurable: isContainer
        ? nodeLeaves.every((leaf) => numbers.get(leaf.id).ev.measurable)
        : evResult.measurable,
      unmeasurableCount: isContainer
        ? nodeLeaves.filter((leaf) => !numbers.get(leaf.id).ev.measurable).length
        : (evResult.measurable ? 0 : 1),
      note: isContainer ? null : evResult.note,
      excluded,
      outOfBaseline: excluded,
      milestoneInfo: !isContainer && evResult.method === 'milestone' && evResult.measurable
        ? { done: evResult.milestonesDone, total: evResult.milestonesTotal }
        : null,
      quantityInfo: !isContainer && evResult.method === 'quantity' && evResult.measurable
        ? { completed: evResult.completedQuantity, planned: evResult.plannedQuantity, unit: evResult.unit }
        : null,
      costs: !isContainer ? (node.costs || []).map((c) => costView(c, asOf, costMode)) : null,
      milestones: !isContainer
        ? (node.progress?.milestones || []).map((m) => ({ ...m }))
        : null,
      leafIds: isContainer ? nodeLeaves.map((leaf) => leaf.id) : undefined,
    };
    row.status = row.outOfBaseline ? STATUS.OUT_OF_BASELINE : classify(row);
    rows.push(row);
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const root of tree.roots) visit(root, 0);

  const unmeasurableCount = leaves.filter((leaf) => !numbers.get(leaf.id).ev.measurable).length;
  const total = {
    id: '__total__',
    name: '项目汇总',
    parentId: null,
    depth: -1,
    isContainer: true,
    isTotal: true,
    bac: totals.bac,
    pv: totals.pv,
    ev: totals.ev,
    ac: totals.ac,
    cv: totals.ev - totals.ac,
    sv: totals.ev - totals.pv,
    cpi: totals.ev > 0 && totals.ac > 0 ? totals.ev / totals.ac : null,
    spi: totals.ev > 0 && totals.pv > 0 ? totals.ev / totals.pv : null,
    progress: totals.bac > 0 ? totals.ev / totals.bac : null,
    // The project total stays classifiable while at least one package can be
    // measured; the unmeasurable count is surfaced beside it instead of
    // blanking the whole headline.
    measurable: unmeasurableCount < leaves.length,
    unmeasurableCount,
  };
  total.status = classify(total);

const series = buildSeries({ caseData, leaves, includeLeaf: inBaseline, baselineOf, asOf, dataThrough, observedThrough, costMode });

  const lateByPackage = [];
  for (const leaf of leaves) {
    for (const record of numbers.get(leaf.id).cost.lateEntries) {
      lateByPackage.push({
        ...costView(record, asOf, costMode),
        packageId: leaf.id,
        packageName: leaf.name,
        visibleNow: costMode === COST_MODES.CURRENT,
      });
    }
  }
  lateByPackage.sort((a, b) => (a.recordedDate === b.recordedDate ? 0 : a.recordedDate < b.recordedDate ? -1 : 1));

  return {
    project: { ...caseData.project },
    asOf,
    dataThrough,
    observedThrough,
    costMode,
    packageCount: leaves.length,
    baseline: baseline
      ? {
          id: baseline.id,
          label: baseline.label,
          createdAt: baseline.createdAt,
          reason: baseline.reason || '',
          isCurrent: Boolean(baseline.isCurrent),
        }
      : null,
    baselines: (caseData.baselines || []).map((b) => ({
      id: b.id,
      label: b.label,
      createdAt: b.createdAt,
      reason: b.reason || '',
      isCurrent: Boolean(b.isCurrent),
      isSelected: baseline ? b.id === baseline.id : false,
    })),
    baselineComparison: compareBaselines(caseData, baseline, asOf),
    rows,
    total,
    series,
    corrections: lateByPackage,
    forecast: forecastFromTotals(total, caseData.forecast, asOf),
    scopeEvents: (caseData.scopeEvents || []).map((e) => ({ ...e })),
    assumptions: (caseData.assumptions || []).slice(),
  };
}

/**
 * The date through which progress is known: an explicit `project.dataThrough`
 * or the sample's default cutoff; otherwise the report cutoff is the only
 * observation date we can claim.
 */
function knowledgeDateOf(caseData, asOf) {
  const declared = caseData?.project?.dataThrough || caseData?.project?.asOfDefault;
  return parseISO(declared ?? '') ? declared : asOf;
}

function pickBaseline(caseData, baselineId) {
  const baselines = caseData.baselines || [];
  if (!baselines.length) return null;
  if (baselineId) return baselines.find((b) => b.id === baselineId) || null;
  return baselines.find((b) => b.isCurrent) || baselines[baselines.length - 1];
}

function baselineItem(baseline, leaf) {
  if (!baseline) return null;
  return (baseline.items || []).find((item) => item.packageId === leaf.id) || null;
}

/* ------------------------------------------------------------------ *
 * Baseline comparison — old and new side by side, no history rewrite
 * ------------------------------------------------------------------ */

function compareBaselines(caseData, selected, asOf) {
  const baselines = caseData.baselines || [];
  if (!baselines.length) return [];
  return baselines.map((b) => {
    const items = b.items || [];
    const bac = items.reduce((s, item) => s + (Number(item.bac) || 0), 0);
    const pv = items.reduce((s, item) => {
      // Recompute PV from the item's own window so an old baseline is read
      // as it was written, not through today's schedule.
      return s + plannedValue({ bac: item.bac, weightedMilestones: item.milestones }, asOf, item);
    }, 0);
    return {
      id: b.id,
      label: b.label,
      createdAt: b.createdAt,
      reason: b.reason || '',
      isCurrent: Boolean(b.isCurrent),
      isSelected: selected ? b.id === selected.id : false,
      bac,
      pv,
      deltaBacFromPrevious: 0,
    };
  }).map((entry, index, all) => {
    const prev = all[index - 1];
    if (prev) entry.deltaBacFromPrevious = entry.bac - prev.bac;
    return entry;
  });
}

/* ------------------------------------------------------------------ *
 * Saving a new baseline
 * ------------------------------------------------------------------ */

/**
 * Append a new baseline version without touching the existing ones.
 *
 * The new version copies every item of the source baseline, applies the
 * requested change for one package, and becomes current. The source baseline
 * keeps its budgets and dates exactly as written, so an old report read with
 * that baseline still shows the old plan.
 *
 * change: { packageId, bac?, finish?, start?, reason? }
 */
export function saveBaseline(caseData, sourceBaselineId, change, savedOn) {
  const baselines = caseData.baselines || [];
  const source = baselines.find((b) => b.id === sourceBaselineId);
  if (!source) throw new Error('saveBaseline: unknown source baseline');
  if (!change || !change.packageId) throw new Error('saveBaseline: packageId is required');
  if (change.bac !== undefined && (!Number.isFinite(Number(change.bac)) || Number(change.bac) < 0)) {
    throw new Error('saveBaseline: bac must be a non-negative number');
  }

  const items = (source.items || []).map((item) => (
    item.packageId === change.packageId
      ? {
          ...item,
          ...(change.bac !== undefined ? { bac: Number(change.bac) } : {}),
          ...(change.finish !== undefined ? { finish: change.finish } : {}),
          ...(change.start !== undefined ? { start: change.start } : {}),
        }
      : { ...item }
  ));

  if (!items.some((item) => item.packageId === change.packageId)) {
    const pkg = (caseData.packages || []).find((p) => p.id === change.packageId);
    if (!pkg) throw new Error('saveBaseline: unknown package');
    items.push({
      packageId: change.packageId,
      bac: change.bac !== undefined ? Number(change.bac) : Number(pkg.bac) || 0,
      start: change.start ?? pkg.baselineStart,
      finish: change.finish ?? pkg.baselineFinish,
    });
  }

  const version = baselines.length + 1;
  const next = {
    id: `BL-${caseData.project?.name ? 'NEW' : 'NEW'}-${version}-${baselines.length}`,
    label: change.label || `基线 v${version} · ${change.reason || '范围与预算调整'}`,
    createdAt: savedOn,
    reason: change.reason || '范围与预算调整',
    isCurrent: true,
    items,
  };

  caseData.baselines = baselines.map((b) => ({ ...b, isCurrent: false })).concat(next);
  return next;
}

/* ------------------------------------------------------------------ *
 * Forecast — assumptions stated, scenario independent
 * ------------------------------------------------------------------ */

export const DEFAULT_FORECAST_ASSUMPTIONS = Object.freeze([
  '基准情景：剩余工作继续按当前成本绩效（CPI）消耗，CPI 保持到完工',
  '用户情景：完工尚需成本由用户单独填写，不套用历史 CPI',
  '预测只使用截止日期之前已登记的数据，之后发生的变更不在基准内',
]);

/**
 * Forecast from live totals.
 *
 * baseEac uses BAC / CPI when CPI is defined. That is the standard
 * "performance continues" estimate and is flagged as an assumption.
 * Zero earned value or zero cost is not a performance level, so no base
 * estimate is produced — the reason is returned in `baseUnavailable`.
 */
export function forecastFromTotals(total, config = {}, asOf) {
  const bac = Number(total.bac) || 0;
  const ev = Number(total.ev) || 0;
  const ac = Number(total.ac) || 0;
  const remaining = bac - ev;

  let baseEac = null;
  let baseUnavailable = null;
  let cpiForForecast = null;
  const cpiDefined = ev > 0 && ac > 0;

  if (!cpiDefined) {
    baseUnavailable = ac <= 0
      ? '实际成本为零，没有可用的成本绩效，无法按 CPI 推算'
      : '挣值为零，成本绩效无定义，无法按 CPI 推算';
  } else {
    cpiForForecast = ev / ac;
    baseEac = bac / cpiForForecast;
  }

  const scenarioEtc = config?.scenarioEtc !== undefined && config?.scenarioEtc !== null && config?.scenarioEtc !== ''
    ? Number(config.scenarioEtc)
    : null;
  const hasScenario = Number.isFinite(scenarioEtc) && scenarioEtc >= 0 && config?.scenarioEtc !== '';
  // A scenario needs a defined AC; with zero AC the remaining cost IS the
  // estimate at completion.
  const scenarioEac = hasScenario ? ac + scenarioEtc : null;

  const assumptions = [...(config?.assumptions || DEFAULT_FORECAST_ASSUMPTIONS)];

  return {
    asOf,
    bac,
    ev,
    ac,
    remainingWork: remaining,
    cpi: cpiForForecast,
    baseEtc: baseEac === null ? null : Math.max(0, baseEac - ac),
    baseEac,
    baseVac: baseEac === null ? null : bac - baseEac,
    baseUnavailable,
    scenarioEtc: hasScenario ? scenarioEtc : null,
    scenarioEac,
    scenarioVac: scenarioEac === null ? null : bac - scenarioEac,
    assumptions,
  };
}

/* ------------------------------------------------------------------ *
 * Chart series
 * ------------------------------------------------------------------ */

function buildSeries({ caseData, leaves, includeLeaf = () => true, baselineOf, asOf, dataThrough, observedThrough, costMode }) {
  const visible = leaves.filter(includeLeaf);
  const anchors = new Set([asOf]);
  const add = (d) => { if (parseISO(d ?? '')) anchors.add(d); };
  add(caseData.project.startDate);
  add(caseData.project.finishDate);
  add(asOf);

  for (const leaf of visible) {
    add(leaf.baselineStart);
    add(leaf.baselineFinish);
    for (const c of leaf.costs || []) {
      add(c.effectiveDate);
      add(c.recordedDate);
    }
    for (const h of leaf.progress?.history || []) add(h.date);
    for (const m of leaf.progress?.milestones || []) add(m.completedDate);
    for (const s of leaf.progress?.steps || []) for (const h of s.history || []) add(h.date);
  }

  // The visible window covers the selected baseline's plan as well as the
  // project contract dates, so an old baseline with an earlier finish still
  // shows its full curve.
  const projectStart = caseData.project.startDate;
  const projectFinish = caseData.project.finishDate;
  const itemStarts = visible.map((leaf) => baselineOf(leaf)?.start).filter(Boolean).sort();
  const itemFinishes = visible.map((leaf) => baselineOf(leaf)?.finish).filter(Boolean).sort();
  const planStart = itemStarts[0];
  const planFinish = itemFinishes[itemFinishes.length - 1];

  const candidatesStart = [projectStart, planStart, [...anchors].sort()[0]].filter(Boolean).sort();
  const candidatesFinish = [projectFinish, planFinish, [...anchors].sort().pop()].filter(Boolean).sort();
  const first = candidatesStart[0];
  const last = candidatesFinish[candidatesFinish.length - 1];
  if (!first || !last) return { points: [], start: null, finish: null, sampleStepDays: 7 };

  const dates = new Set(anchors);
  // Weekly skeleton keeps the curve legible without a point per day.
  for (let cursor = first; cursor <= last; cursor = addDays(cursor, 7)) dates.add(cursor);
  if (asOf >= first && asOf <= last) dates.add(asOf);
  // Trim points beyond the visible window (project finish already included).
  const points = [...dates]
    .filter((d) => parseISO(d) && d >= first && d <= last)
    .sort()
    .map((date) => {
      const pv = visible.reduce((s, leaf) => s + plannedValue(leaf, date, baselineOf(leaf)), 0);
      // Actual observations stop at the cutoff: beyond it the chart shows the
      // plan only. A flat EV/AC projection would invent performance that was
      // never measured.
      // Progress and cost have separate observation ends: measured progress
      // stops at the data cutoff, while cost may still be registered later.
      const ev = date <= observedThrough
        ? visible.reduce((s, leaf) => s + earnedValueAt(leaf, date, asOf, dataThrough).earned, 0)
        : null;
      const ac = date <= asOf
        ? visible.reduce((s, leaf) => s + actualCostAt(leaf.costs, date, costMode).total, 0)
        : null;
      return {
        date,
        pv: round2(pv),
        ev: ev === null ? null : round2(ev),
        ac: ac === null ? null : round2(ac),
      };
    });

  return { points, start: first, finish: last, sampleStepDays: 7 };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ *
 * Cost record view
 * ------------------------------------------------------------------ */

/**
 * A cost row as a report should show it: the amount, when it occurred, when
 * it was registered, and whether the cutoff date had that entry at all.
 */
export function costView(record, asOf, costMode) {
  const occurred = record.effectiveDate <= asOf;
  const registered = record.recordedDate <= asOf;
  let state;
  if (!occurred) state = 'future';
  else if (registered) state = 'recorded';
  else if (costMode === COST_MODES.CURRENT) state = 'late-included';
  else state = 'late-hidden';
  return {
    id: record.id,
    amount: Number(record.amount) || 0,
    effectiveDate: record.effectiveDate,
    recordedDate: record.recordedDate,
    category: record.category || '',
    note: record.note || '',
    state,
  };
}

/* ------------------------------------------------------------------ *
 * Formatting (shared by UI and table export)
 * ------------------------------------------------------------------ */

export function formatMoney(value, compact = false) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (compact) {
    if (abs >= 1e8) return `${sign}${trim(abs / 1e8)}亿`;
    if (abs >= 1e4) return `${sign}${trim(abs / 1e4)}万`;
    return `${sign}${Math.round(abs)}`;
  }
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function trim(n) {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatIndex(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toFixed(2);
}

export function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${(Number(value) * 100).toFixed(digits)}%`;
}
