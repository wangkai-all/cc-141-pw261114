import {
  buildSnapshot,
  saveBaseline,
  forecastFromTotals,
  COST_MODES,
  STATUS_LABELS,
  STATUS_TONE,
  METHOD_LABELS,
  formatMoney,
  formatPercent,
  formatIndex,
} from './evm-core.js';
import { SAMPLES, SAMPLE_LIST, getSample } from './samples.js';
import { renderEvmChart, SERIES_META } from './chart.js';

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const state = {
  sampleId: SAMPLE_LIST[0].id,
  caseData: null,          // working copy; baselines may be appended at runtime
  asOf: SAMPLES[SAMPLE_LIST[0].id].project.asOfDefault,
  costMode: COST_MODES.AS_KNOWN,
  baselineId: null,
  expanded: new Set(),      // containers currently open
  detailOpen: new Set(),    // leaves whose detail block is open
  chartTableOpen: false,
  scenarioEtc: '',
  chartCleanup: null,
};

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const $ = (sel) => document.querySelector(sel);

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value; // only for static inline SVG icons
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const wan = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return formatMoney(Number(value) / 10000, true);
};

const compactMoney = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${wan(value)} 万元`;
};

const money = (value) => formatMoney(value, false);

function statusPill(status, extraText) {
  const tone = STATUS_TONE[status] || 'neutral';
  return h('span', { class: `status ${tone}` },
    h('span', { class: 'dot', 'aria-hidden': 'true' }),
    extraText || STATUS_LABELS[status] || status
  );
}

const CHEVRON = '<svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><path d="M3 1.5 6.5 4.5 3 7.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* ------------------------------------------------------------------ *
 * Derive current report
 * ------------------------------------------------------------------ */

function currentSample() {
  return getSample(state.sampleId);
}

function caseData() {
  if (!state.caseData) state.caseData = structuredClone(currentSample());
  return state.caseData;
}

function snapshot() {
  return buildSnapshot(caseData(), {
    asOf: state.asOf,
    costMode: state.costMode,
    baselineId: state.baselineId || undefined,
  });
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function renderHeader(sample, snap) {
  $('#sampleLabel').textContent = sample.name;
  $('#projectName').textContent = snap.project.name;
  $('#projectDesc').textContent = sample.description;

  const meta = [
    `计划 ${snap.project.startDate} → ${snap.project.finishDate}`,
    `截止 ${snap.asOf}`,
    snap.observedThrough < snap.asOf ? `数据截至 ${snap.observedThrough}` : null,
    `${snap.packageCount} 个工作包`,
    snap.baseline ? `计划基线：${snap.baseline.label}` : null,
  ].filter(Boolean);
  $('#projectMeta').textContent = meta.join(' · ');
}

function renderControls(sample, snap) {
  const sampleSelect = $('#sampleSelect');
  if (!sampleSelect.options.length) {
    for (const item of SAMPLE_LIST) {
      sampleSelect.append(h('option', { value: item.id, text: item.name }));
    }
  }
  sampleSelect.value = state.sampleId;

  const asOfInput = $('#asOf');
  asOfInput.min = snap.project.startDate;
  asOfInput.max = snap.project.finishDate;
  asOfInput.value = state.asOf;
  asOfInput.setAttribute('aria-label', `截止日期，范围 ${snap.project.startDate} 至 ${snap.project.finishDate}`);

  document.querySelectorAll('[data-cost-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.costMode === state.costMode));
  });

  const baselineSelect = $('#baselineSelect');
  baselineSelect.textContent = '';
  for (const baseline of snap.baselines) {
    baselineSelect.append(h('option', {
      value: baseline.id,
      text: `${baseline.label}${baseline.isCurrent ? ' · 当前' : ''}`,
    }));
  }
  const selected = (snap.baselines.find((b) => b.isSelected) || snap.baselines.at(-1));
  if (selected) baselineSelect.value = selected.id;

  const note = $('#controlNote');
  note.textContent = '';

  if (snap.baseline && !snap.baseline.isCurrent) {
    note.append(h('strong', { text: '历史基线：' }),
      `计划价值按「${snap.baseline.label}」计算，实际成本与挣值仍取截至 ${snap.observedThrough} 的观测数据。`);
    note.append(h('br'));
  }

  if (snap.corrections.length) {
    const total = snap.corrections.reduce((s, c) => s + c.amount, 0);
    if (state.costMode === COST_MODES.AS_KNOWN) {
      note.append(
        `「当时已知」口径：${snap.corrections.length} 笔发生日期在截止前、但登记日期在截止后的成本（合计 ${compactMoney(total)}）未计入。`
      );
    } else {
      note.append(
        `「当前更正」口径：已把 ${snap.corrections.length} 笔后期补录（合计 ${compactMoney(total)}）计入实际成本。`
      );
    }
  } else {
    note.append(state.costMode === COST_MODES.AS_KNOWN
      ? '截止日期前登记的成本已全部计入，没有后期补录差异。'
      : '当前没有晚于截止日期登记的补录。');
  }
}

function kpi(label, value, options = {}) {
  const { unit = '万元', sub = null, keyColor = null, muted = false, subNode = null } = options;
  return h('div', { class: `kpi${muted ? ' is-muted' : ''}` },
    h('div', { class: 'kpi-label' },
      keyColor ? h('span', { class: 'kpi-key', style: `background:var(${keyColor})`, 'aria-hidden': 'true' }) : null,
      label),
    h('div', { class: 'kpi-value' }, value, unit ? h('span', { class: 'unit', text: unit }) : null),
    subNode || h('div', { class: 'kpi-sub', text: sub || '' })
  );
}

function renderKpis(snap) {
  const t = snap.total;
  const root = $('#kpis');
  root.textContent = '';

  const cv = t.cv;
  const sv = t.sv;
  const cvTone = cv > 0 ? 'var(--good-text)' : cv < 0 ? 'var(--critical)' : 'var(--text-secondary)';
  const svTone = sv > 0 ? 'var(--good-text)' : sv < 0 ? 'var(--critical)' : 'var(--text-secondary)';

  root.append(
    kpi('总预算 BAC', wan(t.bac), {
      sub: snap.baseline && !snap.baseline.isCurrent ? `按 ${snap.baseline.label}` : '当前基线',
    }),
    kpi('计划价值 PV', wan(t.pv), { keyColor: '--series-1', sub: `截至 ${snap.asOf}` }),
    kpi('挣值 EV', wan(t.ev), {
      keyColor: '--series-2',
      sub: `${formatPercent(t.progress)} 完工比例`,
    }),
    kpi('实际成本 AC', wan(t.ac), {
      keyColor: '--series-3',
      sub: state.costMode === COST_MODES.AS_KNOWN ? '当时已知口径' : '当前更正口径',
    }),
    kpi('成本偏差 CV', `${cv >= 0 ? '+' : ''}${wan(cv)}`, {
      subNode: h('div', { class: 'kpi-sub', style: `color:${cvTone}` },
        t.cpi === null ? 'CPI 无定义（零挣值或零成本）' : `CPI ${formatIndex(t.cpi)} · ${cv >= 0 ? '低于预算' : '超出预算'}`),
    }),
    kpi('进度偏差 SV', `${sv >= 0 ? '+' : ''}${wan(sv)}`, {
      subNode: h('div', { class: 'kpi-sub', style: `color:${svTone}` },
        t.spi === null ? 'SPI 无定义（零挣值或零计划价值）' : `SPI ${formatIndex(t.spi)} · ${sv >= 0 ? '快于计划' : '落后计划'}`),
    })
  );
}

function renderLegend() {
  const legend = $('#chartLegend');
  legend.textContent = '';
  for (const s of SERIES_META) {
    legend.append(h('span', { class: 'legend-item' },
      h('span', { class: 'legend-key', style: `background:var(${s.role})`, 'aria-hidden': 'true' }),
      s.name));
  }
}

function chartPointsFor(snap) {
  return snap.series.points;
}

function renderChart(snap) {
  const container = $('#chart');
  if (state.chartCleanup) state.chartCleanup();
  state.chartCleanup = renderEvmChart(container, {
    points: chartPointsFor(snap),
    asOf: snap.asOf,
    projectStart: snap.project.startDate,
    projectFinish: snap.project.finishDate,
    tooltipEl: $('#chartTooltip'),
  });

  const observedLabel = snap.observedThrough < snap.asOf
    ? `进展观测截至 ${snap.observedThrough}，成本截至 ${snap.asOf}`
    : `实际观测截至 ${snap.asOf}`;
  $('#chartSub').textContent = `金额单位：万元 · ${observedLabel} · ${state.costMode === COST_MODES.AS_KNOWN ? '当时已知' : '当前更正'}口径`;
  const evStop = `挣值画到 ${snap.observedThrough}`;
  const acStop = `实际成本画到 ${snap.asOf}`;
  $('#chartNote').textContent = state.costMode === COST_MODES.AS_KNOWN
    ? `${evStop}、${acStop}，之后不再延伸；计划价值继续按当前基线推进到完工。`
    : `${acStop}，按发生日期计入截止日期之后才登记的补录；${evStop}，不随后续补录虚增。`;

  renderChartTable(snap);
}

function renderChartTable(snap) {
  const wrap = $('#chartTableWrap');
  const table = $('#chartTable');
  table.textContent = '';
  const thead = h('thead');
  thead.append(h('tr', {},
    h('th', { scope: 'col', text: '日期' }),
    h('th', { scope: 'col', class: 'num', text: '计划价值 PV（万元）' }),
    h('th', { scope: 'col', class: 'num', text: '挣值 EV（万元）' }),
    h('th', { scope: 'col', class: 'num', text: '实际成本 AC（万元）' }),
    h('th', { scope: 'col', class: 'num', text: 'EV − AC' })
  ));
  table.append(thead);

  const tbody = h('tbody');
  const points = snap.series.points;
  // Weekly points plus money/milestone anchors would be dense; the table
  // keeps every point but scrolls, so nothing is gated behind the chart.
  for (const p of points) {
    tbody.append(h('tr', {},
      h('td', { text: p.date }),
      h('td', { class: 'num', text: wan(p.pv) }),
      h('td', { class: 'num', text: p.ev === null ? '—' : wan(p.ev) }),
      h('td', { class: 'num', text: p.ac === null ? '—' : wan(p.ac) }),
      h('td', { class: 'num', text: p.ev === null || p.ac === null ? '—' : `${p.ev - p.ac >= 0 ? '+' : ''}${wan(p.ev - p.ac)}` })
    ));
  }
  table.append(tbody);
  wrap.hidden = !state.chartTableOpen;
  const toggle = $('#chartViewToggle');
  toggle.textContent = state.chartTableOpen ? '收起表格视图' : '表格视图';
  toggle.setAttribute('aria-expanded', String(state.chartTableOpen));
}

function renderBaselines(snap) {
  const panel = $('#baselinePanel');
  panel.textContent = '';
  const list = h('div', { class: 'baseline-list' });

  for (const b of snap.baselineComparison) {
    const selected = b.isSelected;
    const card = h('div', { class: `baseline-card${selected ? ' is-selected' : ''}` },
      h('div', { class: 'baseline-top' },
        h('span', { class: 'baseline-title' },
          b.label,
          b.isCurrent ? h('span', { class: 'baseline-tag current', text: '当前' }) : h('span', { class: 'baseline-tag', text: '历史' }),
          selected ? h('span', { class: 'baseline-tag', text: '正在使用' }) : null
        ),
        h('span', { class: 'baseline-date', text: `保存于 ${b.createdAt}` })
      ),
      h('div', { class: 'baseline-nums' },
        h('span', { class: 'bn' }, h('span', { text: '预算总额' }), h('span', { text: `${wan(b.bac)} 万元` })),
        h('span', { class: 'bn' }, h('span', { text: `截至 ${snap.asOf} 计划价值` }), h('span', { text: `${wan(b.pv)} 万元` })),
        b.deltaBacFromPrevious !== 0
          ? h('span', { class: 'bn' },
              h('span', { text: '较上一基线预算' }),
              h('span', { text: `${b.deltaBacFromPrevious > 0 ? '+' : ''}${wan(b.deltaBacFromPrevious)} 万元`, style: `color:${b.deltaBacFromPrevious > 0 ? 'var(--good-text)' : 'var(--critical)'}` }))
          : null
      ),
      b.reason ? h('p', { class: 'baseline-reason', text: b.reason }) : null
    );
    list.append(card);
  }
  panel.append(list);

  if (snap.scopeEvents.length) {
    const changes = h('div', { style: 'margin-top:16px' },
      h('h3', { style: 'font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:8px', text: '已保存的范围与工期变更' }));
    const ul = h('ul', { class: 'assumption-list' });
    for (const event of snap.scopeEvents) {
      ul.append(h('li', {},
        h('span', {},
          `${event.date} · ${event.type}：${event.summary}`,
          event.bacDelta ? `（预算 ${event.bacDelta > 0 ? '+' : ''}${wan(event.bacDelta)} 万元）` : '',
          event.scheduleDeltaDays ? `（工期 ${event.scheduleDeltaDays > 0 ? '+' : ''}${event.scheduleDeltaDays} 天）` : ''
        )));
    }
    changes.append(ul);
    panel.append(changes);
  }

  const note = h('p', { class: 'footnote', text: snap.baseline && !snap.baseline.isCurrent
    ? '正在查看历史基线。旧基线保留当时的预算与日期，调整后的新基线另存，不回写历史计划。'
    : '保存新基线时，旧基线的预算与日期保持原样，用于并排对照；历史偏差不会因改基线而消失。' });
  panel.append(note);
  panel.append(renderBaselineEditor(snap));
}

/**
 * Save a new baseline. The editor changes one work package's budget and/or
 * finish date, copies every other item from the selected baseline untouched,
 * and appends a new version. Nothing already stored is modified.
 */
function renderBaselineEditor(snap) {
  const leaves = snap.rows.filter((r) => r.isLeaf);
  const baselineId = snap.baseline?.id;

  const packageSelect = h('select', { 'aria-label': '要调整的工作包' },
    ...leaves.map((row) => h('option', { value: row.id, text: row.name })));
  const budgetInput = h('input', {
    type: 'number', min: '0', step: '10000', inputmode: 'numeric',
    'aria-label': '调整后的预算（元）',
  });
  const finishInput = h('input', { type: 'date', 'aria-label': '调整后的完工日期' });
  const reasonInput = h('input', {
    type: 'text', placeholder: '例如：业主新增范围', 'aria-label': '变更原因',
  });
  const status = h('p', { class: 'footnote', role: 'status' });

  const fillFromPackage = () => {
    const row = leaves.find((r) => r.id === packageSelect.value);
    if (!row) return;
    const item = caseData().baselines.find((b) => b.id === baselineId)?.items?.find((i) => i.packageId === row.id);
    budgetInput.value = item ? item.bac : row.bac;
    finishInput.value = item ? item.finish : '';
  };
  packageSelect.addEventListener('change', fillFromPackage);
  fillFromPackage();

  const save = () => {
    const data = caseData();
    const source = data.baselines.find((b) => b.id === baselineId);
    if (!source) return;
    const packageId = packageSelect.value;
    const nextBudget = Number(budgetInput.value);
    const nextFinish = finishInput.value;
    if (!Number.isFinite(nextBudget) || nextBudget < 0) {
      status.textContent = '预算必须是非负数字。';
      return;
    }
    if (!nextFinish) {
      status.textContent = '请选择调整后的完工日期。';
      return;
    }

    const previous = source.items.find((i) => i.packageId === packageId);
    const saved = saveBaseline(data, baselineId, {
      packageId,
      bac: nextBudget,
      finish: nextFinish,
      reason: reasonInput.value.trim() || '范围与预算调整',
    }, state.asOf);

    const row = leaves.find((r) => r.id === packageId);
    data.scopeEvents = [...(data.scopeEvents || []), {
      date: state.asOf,
      type: '基线更新',
      summary: `${row ? row.name : packageId} 预算调整为 ${money(nextBudget)} 元，完工日期改为 ${nextFinish}`,
      bacDelta: nextBudget - (previous?.bac ?? 0),
      scheduleDeltaDays: 0,
    }];

    state.baselineId = saved.id;
    reasonInput.value = '';
    status.textContent = '';
    const fresh = snapshot();
    renderHeader(caseData(), fresh);
    renderControls(caseData(), fresh);
    renderKpis(fresh);
    renderChart(fresh);
    renderBaselines(fresh);
    renderPackageTable(fresh);
    renderCorrections(fresh);
    renderForecast(fresh);
    $('#baselineSelect').focus();
  };

  return h('details', { class: 'baseline-editor' },
    h('summary', { text: '调整范围或预算并保存新基线' }),
    h('div', { class: 'editor-grid' },
      h('label', {}, '工作包', packageSelect),
      h('label', {}, '调整后预算（元）', budgetInput),
      h('label', {}, '调整后完工日期', finishInput),
      h('label', {}, '变更原因', reasonInput),
      h('div', { class: 'editor-actions' },
        h('button', { type: 'button', class: 'primary-button', text: '保存为新基线', onclick: save }))
    ),
    h('p', { class: 'footnote', text: `新基线保存于 ${state.asOf}，旧基线不动；保存后可随时在上方切换回旧基线对照。` }),
    status
  );
}

function forecastFigures(snap) {
  return forecastFromTotals(
    snap.total,
    { ...(caseData().forecast || {}), scenarioEtc: state.scenarioEtc === '' ? null : state.scenarioEtc },
    snap.asOf
  );
}

function renderForecast(snap) {
  const panel = $('#forecastPanel');
  panel.textContent = '';

  const forecast = forecastFigures(snap);

  const scenarioInput = h('input', {
    type: 'number',
    id: 'etcInput',
    min: '0',
    step: '1000',
    inputmode: 'numeric',
    value: state.scenarioEtc,
    'aria-label': '用户情景的完工尚需成本（元）',
  });

  const baseValue = h('div', { class: 'fc-value', text: forecast.baseEac === null ? '不可计算' : `${wan(forecast.baseEac)} 万元` });
  const baseSub = h('div', { class: 'fc-sub' });
  const scenarioValue = h('div', { class: 'fc-value' });
  const scenarioSub = h('div', { class: 'fc-sub' });
  const baseCell = h('div', { class: 'forecast-cell' }, h('div', { class: 'fc-label' }, '基准预测 EAC'), baseValue, baseSub);
  const scenarioCell = h('div', { class: 'forecast-cell is-scenario' }, h('div', { class: 'fc-label' }, '用户情景 EAC'), scenarioValue, scenarioSub);

  const assumptions = h('ul', { class: 'assumption-list' });
  const acHint = h('span', { class: 'etc-hint' });

  const paint = () => {
    const f = forecastFigures(snap);
    baseCell.classList.toggle('is-unavailable', f.baseEac === null);
    baseValue.textContent = f.baseEac === null ? '不可计算' : `${wan(f.baseEac)} 万元`;
    baseSub.textContent = f.baseEac === null
      ? f.baseUnavailable
      : `VAC ${f.baseVac >= 0 ? '+' : ''}${wan(f.baseVac)} 万元 · 按当前 CPI ${formatIndex(f.cpi)} 延续`;
    scenarioValue.textContent = f.scenarioEac === null ? '未设定' : `${wan(f.scenarioEac)} 万元`;
    scenarioSub.textContent = f.scenarioEac === null
      ? '填写剩余成本后生成独立情景'
      : `VAC ${f.scenarioVac >= 0 ? '+' : ''}${wan(f.scenarioVac)} 万元 · 剩余成本 ${wan(f.scenarioEtc)} 万元`;
    assumptions.textContent = '';
    for (const line of f.assumptions) assumptions.append(h('li', { text: line }));
    if (snap.observedThrough < snap.asOf) {
      assumptions.append(h('li', {
        text: `进展只观测到 ${snap.observedThrough}；预测以该时点的挣值为基础，报告日期 ${snap.asOf} 之后的新进展不在内。`,
      }));
    }
    acHint.textContent = `当前已发生成本 ${money(snap.total.ac)} 元`;
  };
  paint();

  panel.append(
    h('div', { class: 'forecast-grid' },
      h('div', { class: 'forecast-rows' }, baseCell, scenarioCell),
      h('div', {},
        h('h3', { style: 'font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:6px', text: '预测假设' }),
        assumptions),
      h('div', { class: 'etc-editor' },
        h('label', {}, '用户情景剩余成本（元）', scenarioInput),
        acHint
      )
    )
  );

  // Repaint only the figures while typing, so the field keeps focus and caret.
  scenarioInput.addEventListener('input', () => {
    state.scenarioEtc = scenarioInput.value;
    paint();
  });
}

function renderCorrections(snap) {
  const panel = $('#correctionsPanel');
  panel.textContent = '';

  const asKnown = state.costMode === COST_MODES.AS_KNOWN;
  panel.append(
    h('div', { class: 'cost-mode-explain' },
      h('div', { class: `mode-card${asKnown ? ' is-active' : ''}` },
        h('h3', {}, '当时已知', asKnown ? h('span', { class: 'baseline-tag', style: 'margin-left:6px', text: '当前口径' }) : null),
        h('p', { text: '重开历史报表时，只使用截止日期前已登记的成本，保留当时看到的数字。' })),
      h('div', { class: `mode-card${!asKnown ? ' is-active' : ''}` },
        h('h3', {}, '当前更正', !asKnown ? h('span', { class: 'baseline-tag', style: 'margin-left:6px', text: '当前口径' }) : null),
        h('p', { text: '使用截至今天的全部登记记录，并按其实际发生日期归入各期；不覆盖「当时已知」的数字。' }))
    )
  );

  if (snap.corrections.length) {
    const total = snap.corrections.reduce((s, c) => s + c.amount, 0);
    panel.append(h('div', { class: 'correction-note' },
      h('span', { class: 'ico', 'aria-hidden': 'true', text: '!' }),
      h('span', {},
        `截止 ${snap.asOf} 有 ${snap.corrections.length} 笔成本在截止日期后才登记，合计 ${money(total)} 元。`,
        state.costMode === COST_MODES.AS_KNOWN
          ? '它们未计入当前实际成本；切换到「当前更正」即可看到更正后的数字。'
          : '当前口径已将其按实际发生日期计入实际成本。')
    ));

    const table = h('table', { class: 'mini-table' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col', text: '工作包' }),
        h('th', { scope: 'col', text: '记录' }),
        h('th', { scope: 'col', class: 'num', text: '金额（元）' }),
        h('th', { scope: 'col', text: '发生日期' }),
        h('th', { scope: 'col', text: '登记日期' })
      ))
    );
    const tbody = h('tbody');
    for (const c of snap.corrections) {
      tbody.append(h('tr', {},
        h('td', { text: c.packageName }),
        h('td', { text: c.note || c.category || c.id }),
        h('td', { class: 'num', text: money(c.amount) }),
        h('td', { text: c.effectiveDate }),
        h('td', {}, c.recordedDate, ' ', h('span', { class: 'cost-flag late', text: c.visibleNow ? '已计入' : '未计入' }))
      ));
    }
    table.append(tbody);
    panel.append(h('div', { class: 'table-scroll' }, table));
  } else {
    panel.append(h('p', { class: 'empty-state', text: '截止日期前后没有登记日期差异的成本记录。' }));
  }

  if (snap.assumptions.length) {
    const ul = h('ul', { class: 'assumption-list', style: 'margin-top:14px' });
    for (const line of snap.assumptions) ul.append(h('li', { text: line }));
    panel.append(h('h3', { style: 'font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin:14px 0 6px', text: '数据口径说明' }), ul);
  }
}

/* ------------------------------------------------------------------ *
 * Work-package table
 * ------------------------------------------------------------------ */

function methodText(row) {
  if (row.outOfBaseline) return '—';
  if (row.isContainer) return '汇总';
  if (!row.method) return '未设';
  const base = METHOD_LABELS[row.method] || row.method;
  if (row.milestoneInfo) return `${base} ${row.milestoneInfo.done}/${row.milestoneInfo.total}`;
  if (row.quantityInfo) return `${base} ${row.quantityInfo.completed}/${row.quantityInfo.planned}${row.quantityInfo.unit ? ' ' + row.quantityInfo.unit : ''}`;
  return base;
}

function efficiencyText(row) {
  if (row.cpi === null && row.spi === null) return '—';
  return `${formatIndex(row.cpi)} / ${formatIndex(row.spi)}`;
}

/**
 * Variances only mean something when both sides exist. A package with no
 * earned value or no cost reports a dash instead of a misleading "+0".
 */
function varianceText(value) {
  if (value === null || value === undefined) return '—';
  if (Math.abs(value) < 0.5) return '0';
  return `${value > 0 ? '+' : ''}${money(value)}`;
}

function moneyCell(value, extraClass = '') {
  return h('td', {
    class: `num ${extraClass}`.trim(),
    text: value === null || value === undefined ? '—' : money(value),
    title: value === null || value === undefined ? '' : `${money(value)} 元`,
  });
}

function renderPackageTable(snap) {
  const table = $('#packageTable');
  table.textContent = '';

  const columns = [
    ['工作包', ''],
    ['计量方式', ''],
    ['预算 BAC', 'num'],
    ['计划价值 PV', 'num'],
    ['挣值 EV', 'num'],
    ['实际成本 AC', 'num'],
    ['完成比例', 'num'],
    ['成本偏差 CV', 'num'],
    ['进度偏差 SV', 'num'],
    ['CPI / SPI', 'num'],
    ['状态', ''],
  ];

  const thead = h('thead');
  thead.append(h('tr', {}, ...columns.map(([label, cls]) =>
    h('th', { scope: 'col', class: cls, text: label }))));
  table.append(thead);

  const tbody = h('tbody');

  /* Total row — clicking it expands/collapses every container. */
  const expandable = snap.rows.some((r) => r.isContainer);
  const allOpen = expandable && snap.rows.filter((r) => r.isContainer).every((r) => state.expanded.has(r.id));

  const totalRow = h('tr', { class: 'is-total' },
    h('td', { colspan: '1' },
      h('div', { class: 'name-cell' },
        expandable ? h('button', {
          class: 'tree-toggle',
          type: 'button',
          'aria-expanded': String(allOpen),
          'aria-label': allOpen ? '收起全部工作包' : '展开全部工作包',
          html: CHEVRON,
          onclick: () => toggleAllContainers(snap, !allOpen),
        }) : h('span', { class: 'tree-spacer' }),
        h('span', { class: 'node-name', text: snap.total.name })
      )),
    h('td', { text: '汇总' }),
    moneyCell(snap.total.bac),
    moneyCell(snap.total.pv),
    moneyCell(snap.total.ev),
    moneyCell(snap.total.ac),
    h('td', { class: 'num', text: formatPercent(snap.total.progress) }),
    h('td', { class: 'num', text: varianceText(snap.total.cv) }),
    h('td', { class: 'num', text: varianceText(snap.total.sv) }),
    h('td', { class: 'num', text: efficiencyText(snap.total) }),
    h('td', {}, statusPill(snap.total.status))
  );
  tbody.append(totalRow);

  const rowsById = new Map(snap.rows.map((r) => [r.id, r]));
  const childrenIndex = new Map();
  for (const row of snap.rows) {
    const key = row.parentId || '__root__';
    if (!childrenIndex.has(key)) childrenIndex.set(key, []);
    childrenIndex.get(key).push(row);
  }

  const appendRows = (parentId) => {
    const kids = childrenIndex.get(parentId || '__root__') || [];
    for (const row of kids) {
      const isOpen = state.expanded.has(row.id);
      const detailOpen = state.detailOpen.has(row.id);
      const indent = (row.depth + 1) * 16;

      const nameCell = h('div', { class: 'name-cell', style: `padding-left:${indent}px` });
      if (row.isContainer) {
        nameCell.append(h('button', {
          class: 'tree-toggle',
          type: 'button',
          'aria-expanded': String(isOpen),
          'aria-label': `${isOpen ? '收起' : '展开'} ${row.name}`,
          html: CHEVRON,
          onclick: (event) => {
            event.stopPropagation();
            if (isOpen) state.expanded.delete(row.id);
            else state.expanded.add(row.id);
            renderPackageTable(snapshot());
          },
        }));
      } else {
        nameCell.append(h('button', {
          class: 'tree-toggle',
          type: 'button',
          'aria-expanded': String(detailOpen),
          'aria-label': `${detailOpen ? '收起' : '展开'} ${row.name} 的原始记录`,
          html: CHEVRON,
          onclick: (event) => {
            event.stopPropagation();
            if (detailOpen) state.detailOpen.delete(row.id);
            else state.detailOpen.add(row.id);
            renderPackageTable(snapshot());
          },
        }));
      }
      nameCell.append(h('span', { class: 'node-name', text: row.name }));

      const tr = h('tr', {
        class: row.isContainer ? 'is-container' : 'is-leaf',
      },
        h('td', {}, nameCell),
        h('td', { text: methodText(row) }),
        moneyCell(row.bac),
        moneyCell(row.pv),
        moneyCell(row.ev),
        moneyCell(row.ac),
        h('td', { class: 'num', text: row.measurable && !row.outOfBaseline ? formatPercent(row.progress) : '—' }),
        h('td', { class: 'num', text: varianceText(row.cv) }),
        h('td', { class: 'num', text: varianceText(row.sv) }),
        h('td', { class: 'num', text: efficiencyText(row) }),
        h('td', {}, statusPill(row.status))
      );
      tbody.append(tr);

      if (row.isContainer && isOpen) appendRows(row.id);

      if (!row.isContainer && detailOpen) {
        tbody.append(renderDetailRow(row, snap));
      }
    }
  };

  appendRows(null);

  if (!snap.rows.length) {
    tbody.append(h('tr', {}, h('td', { colspan: String(columns.length) },
      h('p', { class: 'empty-state', text: '当前基线没有工作包。' }))));
  }

  table.append(tbody);
}

function renderDetailRow(row, snap) {
  const inner = h('div', { class: 'detail-inner' });

  /* Measurement block */
  const measurement = h('div', { class: 'detail-block' },
    h('h3', { text: '计量方式与进度依据' }));
  if (!row.method) {
    measurement.append(h('p', { text: '该工作包尚未设定计量方式，因此不计算挣值，也不推断完成比例。请在维护工作包时选择里程碑、完成数量或加权步骤。' }));
  } else if (row.method === 'milestone') {
    measurement.append(h('p', { text: '按里程碑权重计量，里程碑完成才计入相应预算。' }));
    const ul = h('ul', { class: 'milestone-list' });
    for (const m of row.milestones || []) {
      const done = m.completedDate ? m.completedDate <= snap.observedThrough : Boolean(m.completed);
      ul.append(h('li', { class: done ? 'done' : '' },
        h('span', { class: 'tick', 'aria-hidden': 'true', text: '✓' }),
        h('span', { text: m.name }),
        m.completedDate ? h('span', { class: 'm-date', text: m.completedDate }) : h('span', { class: 'm-date', text: '未完成' }),
        h('span', { class: 'm-weight', text: `权重 ${m.weight}%` })
      ));
    }
    measurement.append(ul);
  } else if (row.method === 'quantity') {
    const q = row.quantityInfo;
    measurement.append(h('p', { text: q
      ? `按完成数量计量：已完成 ${q.completed}${q.unit ? ' ' + q.unit : ''}，计划 ${q.planned}${q.unit ? ' ' + q.unit : ''}。完成比例 ${formatPercent(row.progress)}，与实际花费无关。`
      : '计划数量尚未设定，无法计量。' }));
  } else if (row.method === 'weighted') {
    measurement.append(h('p', { text: `按加权步骤计量，整体完成比例 ${formatPercent(row.progress)}。` }));
  }

  /* Metrics block */
  const metrics = h('div', { class: 'detail-block' },
    h('h3', { text: '偏差与效率' }),
    h('div', { class: 'kv-list' },
      kv('预算 BAC', `${money(row.bac)} 元`),
      kv('计划价值 PV', `${money(row.pv)} 元`),
      kv('挣值 EV', `${money(row.ev)} 元`),
      kv('实际成本 AC', `${money(row.ac)} 元`),
      kv('成本偏差 CV', `${row.cv >= 0 ? '+' : ''}${money(row.cv)} 元`),
      kv('进度偏差 SV', `${row.sv >= 0 ? '+' : ''}${money(row.sv)} 元`),
      kv('CPI', row.cpi === null ? '无定义（分子或分母为零）' : formatIndex(row.cpi)),
      kv('SPI', row.spi === null ? '无定义（分子或分母为零）' : formatIndex(row.spi))
    )
  );
  if (row.note) metrics.append(h('p', { class: 'footnote', text: row.note }));

  /* Cost records block */
  const costBlock = h('div', { class: 'detail-block', style: 'grid-column: 1 / -1' },
    h('h3', { text: '原始成本记录（发生日期 / 登记日期）' }));
  if (!row.costs || !row.costs.length) {
    costBlock.append(h('p', { text: '暂无成本记录。' }));
  } else {
    const table = h('table', { class: 'mini-table' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col', text: '记录' }),
        h('th', { scope: 'col', class: 'num', text: '金额（元）' }),
        h('th', { scope: 'col', text: '发生日期' }),
        h('th', { scope: 'col', text: '登记日期' }),
        h('th', { scope: 'col', text: '状态' })
      )));
    const tb = h('tbody');
    for (const c of row.costs) {
      tb.append(h('tr', {},
        h('td', { text: c.note || c.category || c.id }),
        h('td', { class: 'num', text: money(c.amount) }),
        h('td', { text: c.effectiveDate }),
        h('td', { text: c.recordedDate }),
        h('td', {}, costStateBadge(c.state))
      ));
    }
    table.append(tb);
    costBlock.append(table);
    costBlock.append(h('p', { class: 'footnote', text: state.costMode === COST_MODES.AS_KNOWN
      ? '「当时已知」只计入截止日期前已登记的记录；标记「补录未计入」的成本需切到「当前更正」查看。'
      : '「当前更正」按发生日期计入全部已登记记录，包含截止日期后补录的记录。' }));
  }

  inner.append(measurement, metrics, costBlock);
  return h('tr', { class: 'detail-row' }, h('td', { colspan: '11' }, inner));
}

function costStateBadge(stateName) {
  const map = {
    recorded: ['recorded', '已登记'],
    'late-hidden': ['hidden', '补录未计入'],
    'late-included': ['included', '补录已计入'],
    future: ['future', '未发生'],
  };
  const [cls, text] = map[stateName] || ['future', stateName];
  return h('span', { class: `cost-flag ${cls}`, text });
}

function kv(key, value) {
  return h('div', { class: 'kv' },
    h('span', { class: 'k', text: key }),
    h('span', { class: 'v', text: value }));
}

function toggleAllContainers(snap, open) {
  state.expanded.clear();
  if (open) for (const row of snap.rows) if (row.isContainer) state.expanded.add(row.id);
  renderPackageTable(snap);
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

function renderAll() {
  const sample = currentSample();
  const snap = snapshot();
  renderHeader(sample, snap);
  renderControls(sample, snap);
  renderKpis(snap);
  renderLegend();
  renderChart(snap);
  renderBaselines(snap);
  renderForecast(snap);
  renderPackageTable(snap);
  renderCorrections(snap);
}

function resetForSample(sample) {
  state.caseData = structuredClone(sample);
  state.asOf = sample.project.asOfDefault;
  state.baselineId = null;
  state.expanded.clear();
  state.detailOpen.clear();
  state.scenarioEtc = sample.forecast?.scenarioEtc ?? '';
  const snap = buildSnapshot(sample, { asOf: state.asOf, costMode: state.costMode });
  for (const row of snap.rows) if (row.isContainer) state.expanded.add(row.id);
}

function wire() {
  $('#sampleSelect').addEventListener('change', (event) => {
    state.sampleId = event.target.value;
    resetForSample(currentSample());
    renderAll();
  });

  $('#asOf').addEventListener('change', (event) => {
    const value = event.target.value;
    if (!value) return;
    state.asOf = value;
    renderAll();
  });

  document.querySelectorAll('[data-cost-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.costMode = button.dataset.costMode;
      renderAll();
    });
  });

  $('#baselineSelect').addEventListener('change', (event) => {
    state.baselineId = event.target.value;
    renderAll();
  });

  $('#chartViewToggle').addEventListener('click', () => {
    state.chartTableOpen = !state.chartTableOpen;
    renderChartTable(snapshot());
  });

  $('#expandAll').addEventListener('click', () => toggleAllContainers(snapshot(), true));
  $('#collapseAll').addEventListener('click', () => toggleAllContainers(snapshot(), false));

  const themeButton = $('#themeToggle');
  themeButton.addEventListener('click', () => {
    const root = document.documentElement;
    const next = isDarkMode() ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem('evm-theme', next);
    updateThemeLabel();
    renderChart(snapshot());
  });

  // Redraw the SVG on resize so the viewBox matches its container.
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderChart(snapshot()), 120);
  });

  // Re-render the chart when the OS theme flips while in auto mode.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    updateThemeLabel();
    renderChart(snapshot());
  });
}

function isDarkMode() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function updateThemeLabel() {
  const dark = isDarkMode();
  $('#themeLabel').textContent = dark ? '浅色' : '深色';
  $('#themeToggle').setAttribute('aria-label', dark ? '切换到浅色模式' : '切换到深色模式');
}

function initTheme() {
  const saved = localStorage.getItem('evm-theme');
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
  updateThemeLabel();
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

initTheme();
wire();
resetForSample(currentSample());
renderAll();

// Expose a tiny amount of state for smoke tests / debugging.
window.__evm = { state, snapshot };
