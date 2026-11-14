/**
 * Dependency-free SVG chart for cumulative PV / EV / AC.
 *
 * One shared money axis by construction — no dual axes. Marks follow the
 * house spec: 2px lines, 8px markers with a 2px surface ring, solid hairline
 * grid, one crosshair that snaps to the nearest date and a tooltip listing
 * every series at that date.
 */

const NS = 'http://www.w3.org/2000/svg';
const HEIGHT = 340;
const MARGIN = { top: 34, right: 92, bottom: 34, left: 66 };
const COMPACT_MARGIN = { top: 34, right: 58, bottom: 34, left: 48 };

const SERIES = [
  { key: 'pv', name: '计划价值 PV', slot: 1, role: '--series-1' },
  { key: 'ev', name: '挣值 EV', slot: 2, role: '--series-2' },
  { key: 'ac', name: '实际成本 AC', slot: 3, role: '--series-3' },
];

export const SERIES_META = SERIES;

function el(tag, attrs = {}, text = null) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    node.setAttribute(key, String(value));
  }
  if (text !== null) node.textContent = text;
  return node;
}

function parse(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Nice axis max/step in 万. */
function niceScale(maxValue) {
  if (maxValue <= 0) return { max: 1, step: 0.2 };
  const rough = maxValue / 4;
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / power;
  const stepNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = stepNorm * power;
  const max = Math.ceil(maxValue / step) * step;
  return { max, step };
}

function fmtWan(value) {
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: value < 10 ? 1 : 0 });
}

/**
 * Render into `container`.
 * options: { points, asOf, projectStart, projectFinish, onHover? }
 */
export function renderEvmChart(container, options) {
  const { points, asOf, projectStart, projectFinish } = options;
  container.textContent = '';

  if (!points || points.length < 2) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = '所选截止日期没有可绘制的数据。';
    container.append(empty);
    return () => {};
  }

  const width = Math.max(Math.round(container.clientWidth) || 960, 320);
  const M = width < 620 ? COMPACT_MARGIN : MARGIN;
  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;

  const startMs = parse(projectStart || points[0].date);
  const finishMs = parse(projectFinish || points[points.length - 1].date);
  const span = Math.max(finishMs - startMs, 1);

  const maxValue = Math.max(
    ...points.flatMap((p) => [p.pv || 0, p.ev || 0, p.ac || 0])
  ) / 10000;
  const { max, step } = niceScale(maxValue);

  const x = (iso) => M.left + ((parse(iso) - startMs) / span) * plotW;
  const y = (wan) => M.top + plotH - (wan / max) * plotH;

  const svg = el('svg', {
    viewBox: `0 0 ${width} ${HEIGHT}`,
    role: 'img',
    'aria-label': `累计计划价值、挣值与实际成本曲线，截至 ${asOf}`,
  });

  // Surface
  svg.append(el('rect', {
    x: 0, y: 0, width, height: HEIGHT,
    fill: 'var(--surface-1)',
  }));

  /* ---- grid + y ticks ---- */
  const gridG = el('g', { 'aria-hidden': 'true' });
  for (let v = 0; v <= max + 1e-9; v += step) {
    const yy = y(v);
    gridG.append(el('line', {
      x1: M.left, x2: M.left + plotW,
      y1: yy, y2: yy,
      stroke: v === 0 ? 'var(--axis)' : 'var(--grid)',
      'stroke-width': 1,
    }));
    gridG.append(el('text', {
      x: M.left - 10, y: yy + 3.5,
      'text-anchor': 'end',
      fill: 'var(--text-muted)',
      'font-size': 11,
      'font-variant-numeric': 'tabular-nums',
    }, fmtWan(v)));
  }
  svg.append(gridG);

  // y-axis unit label sits above the top tick, clear of its number.
  svg.append(el('text', {
    x: M.left - 10, y: 12,
    'text-anchor': 'end',
    fill: 'var(--text-muted)',
    'font-size': 10.5,
  }, '万元'));

  /* ---- x ticks: month starts ---- */
  const months = [];
  const startDate = new Date(startMs);
  let cursor = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1);
  while (cursor <= finishMs) {
    months.push(cursor);
    const d = new Date(cursor);
    cursor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  // Thin tick labels so they never collide.
  const maxLabels = Math.max(3, Math.floor(plotW / 70));
  const stride = Math.ceil(months.length / maxLabels);

  const xG = el('g', { 'aria-hidden': 'true' });
  months.forEach((ms, i) => {
    const iso = new Date(ms).toISOString().slice(0, 10);
    const xx = x(iso);
    xG.append(el('line', {
      x1: xx, x2: xx,
      y1: M.top, y2: M.top + plotH,
      stroke: 'var(--grid)', 'stroke-width': 1, opacity: 0.55,
    }));
    if (i % stride === 0) {
      const d = new Date(ms);
      xG.append(el('text', {
        x: xx, y: M.top + plotH + 18,
        'text-anchor': 'middle',
        fill: 'var(--text-muted)',
        'font-size': 11,
        'font-variant-numeric': 'tabular-nums',
      }, `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`));
    }
  });
  svg.append(xG);

  /* ---- as-of marker ---- */
  const asOfX = x(asOf);
  const asOfG = el('g');
  asOfG.append(el('line', {
    x1: asOfX, x2: asOfX,
    y1: M.top, y2: M.top + plotH,
    stroke: 'var(--text-muted)', 'stroke-width': 1, opacity: 0.6,
  }));
  // Keep the marker label inside the plot when the cutoff sits at the right edge.
  const asOfLabelRight = asOfX > M.left + plotW - 26;
  asOfG.append(el('text', {
    x: asOfLabelRight ? asOfX - 5 : asOfX + 5,
    y: M.top + 11,
    'text-anchor': asOfLabelRight ? 'end' : 'start',
    fill: 'var(--text-muted)', 'font-size': 10.5, 'font-weight': 600,
  }, '截止'));
  svg.append(asOfG);

  /* ---- lines ---- */
  const defs = el('defs');
  const clip = el('clipPath', { id: 'plot-clip' });
  clip.append(el('rect', { x: M.left, y: M.top - 6, width: plotW + 1, height: plotH + 12 }));
  defs.append(clip);
  svg.append(defs);

  const lineG = el('g', { 'clip-path': 'url(#plot-clip)' });

  for (const s of SERIES) {
    const color = `var(${s.role})`;
    // Split at nulls so a series stops where observation stops.
    let segment = [];
    const flush = () => {
      if (segment.length > 1) {
        lineG.append(el('path', {
          d: segment.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(2)},${y(p[s.key] / 10000).toFixed(2)}`).join(' '),
          fill: 'none',
          stroke: color,
          'stroke-width': 2,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        }));
      }
      segment = [];
    };
    for (const p of points) {
      if (p[s.key] === null || p[s.key] === undefined) flush();
      else segment.push(p);
    }
    flush();
  }
  svg.append(lineG);

  /* ---- end markers + direct labels (selective: line ends only) ---- */
  const endG = el('g');
  const labels = [];
  for (const s of SERIES) {
    // Each series ends at its own last observation — EV stops at the data
    // cutoff while AC may keep going, so they do not share a marker.
    const lastPoint = [...points].reverse().find((p) => p[s.key] !== null && p[s.key] !== undefined) || points[points.length - 1];
    const value = lastPoint[s.key];
    if (value === null || value === undefined) continue;
    const cx = x(lastPoint.date);
    const cy = y(value / 10000);
    endG.append(el('circle', {
      cx, cy, r: 4,
      fill: `var(${s.role})`,
      stroke: 'var(--surface-1)',
      'stroke-width': 2,
    }));
    labels.push({ cx, cy, text: fmtWan(value / 10000), labelY: cy + 3.5 });
  }

  // End labels that would overlap are stacked upward — never onto the x-axis —
  // and each gets a leader line back to its own dot, so the value stays tied to
  // the line it belongs to.
  const minGap = 14;
  const bottomLimit = M.top + plotH - 8;
  const sorted = [...labels].sort((a, b) => b.cy - a.cy);
  let previousY = Infinity;
  for (const item of sorted) {
    let labelY = Math.min(item.cy + 3.5, bottomLimit);
    if (labelY > previousY - minGap) labelY = previousY - minGap;
    item.labelY = labelY;
    item.stacked = Math.abs(labelY - (item.cy + 3.5)) > 0.5;
    previousY = labelY;
  }
  for (const item of labels) {
    if (item.stacked) {
      endG.append(el('path', {
        d: `M${item.cx + 5},${item.cy} L${item.cx + 10},${item.labelY - 3.5} L${item.cx + 18},${item.labelY - 3.5}`,
        fill: 'none',
        stroke: 'var(--axis)',
        'stroke-width': 1,
      }));
    }
    endG.append(el('text', {
      x: item.cx + 22, y: item.labelY,
      fill: 'var(--text-secondary)',
      'font-size': 11,
      'font-weight': 600,
      'font-variant-numeric': 'tabular-nums',
    }, item.text));
  }
  svg.append(endG);

  /* ---- crosshair + hit layer ---- */
  const crossG = el('g', { 'pointer-events': 'none', opacity: 0 });
  const crossLine = el('line', {
    y1: M.top, y2: M.top + plotH,
    stroke: 'var(--text-muted)', 'stroke-width': 1, 'stroke-opacity': 0.7,
  });
  crossG.append(crossLine);
  const crossDots = SERIES.map((s) =>
    el('circle', { r: 4.5, fill: `var(${s.role})`, stroke: 'var(--surface-1)', 'stroke-width': 2 })
  );
  crossDots.forEach((dot) => crossG.append(dot));
  svg.append(crossG);

  const hit = el('rect', {
    x: M.left, y: M.top,
    width: plotW, height: plotH,
    fill: 'transparent',
    style: 'cursor: crosshair;',
  });
  svg.append(hit);

  container.append(svg);

  const tooltip = options.tooltipEl;
  let active = null;

  const nearestIndex = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const scale = width / rect.width;
    const px = (clientX - rect.left) * scale;
    let best = 0;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(x(p.date) - px);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    return { index: best, svgX: x(points[best].date) };
  };

  const showAt = (index, hx, pointerY = null) => {
    const p = points[index];
    active = index;
    crossG.setAttribute('opacity', '1');
    crossLine.setAttribute('x1', hx);
    crossLine.setAttribute('x2', hx);
    crossLine.setAttribute('y1', M.top);
    crossLine.setAttribute('y2', M.top + plotH);

    SERIES.forEach((s, i) => {
      const dot = crossDots[i];
      if (p[s.key] === null || p[s.key] === undefined) {
        dot.setAttribute('opacity', '0');
      } else {
        dot.setAttribute('opacity', '1');
        dot.setAttribute('cx', hx);
        dot.setAttribute('cy', y(p[s.key] / 10000));
      }
    });

    if (!tooltip) return;
    tooltip.textContent = '';
    const date = document.createElement('div');
    date.className = 'tooltip-date';
    date.textContent = p.date;
    tooltip.append(date);
    for (const s of SERIES) {
      const row = document.createElement('div');
      row.className = 'tooltip-row';
      const key = document.createElement('span');
      key.className = 'tooltip-key';
      key.style.background = `var(${s.role})`;
      const name = document.createElement('span');
      name.className = 'tooltip-name';
      name.textContent = s.name;
      const value = document.createElement('span');
      value.className = 'tooltip-value';
      value.textContent = p[s.key] === null || p[s.key] === undefined ? '—' : `${fmtWan(p[s.key] / 10000)} 万`;
      row.append(key, name, value);
      tooltip.append(row);
    }
    const sep = document.createElement('div');
    sep.className = 'tooltip-sep';
    tooltip.append(sep);
    const variance = document.createElement('div');
    variance.className = 'tooltip-row';
    const vName = document.createElement('span');
    vName.className = 'tooltip-name';
    vName.textContent = 'EV − AC（成本偏差）';
    const vVal = document.createElement('span');
    vVal.className = 'tooltip-value';
    const cv = (p.ev ?? 0) - (p.ac ?? 0);
    vVal.textContent = p.ev === null || p.ac === null ? '—' : `${cv >= 0 ? '+' : ''}${fmtWan(cv / 10000)} 万`;
    variance.append(vName, vVal);
    tooltip.append(variance);

    tooltip.hidden = false;
    const rect = svg.getBoundingClientRect();
    const ratio = rect.width / width;
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let left = hx * ratio;
    left = Math.min(Math.max(left, tw / 2 + 4), rect.width - tw / 2 - 4);
    tooltip.style.left = `${left}px`;

    // Keep the tooltip inside the chart card: above the pointer when it fits,
    // otherwise below it, and never above the shell's top edge.
    const anchorY = pointerY === null ? 0 : pointerY;
    const aboveTop = anchorY - th - 12;
    if (aboveTop >= -6) {
      tooltip.style.top = `${anchorY}px`;
      tooltip.style.transform = 'translate(-50%, calc(-100% - 12px))';
    } else {
      tooltip.style.top = `${Math.max(anchorY + 14, 6)}px`;
      tooltip.style.transform = 'translate(-50%, 0)';
    }
  };

  hit.addEventListener('pointermove', (event) => {
    const { index, svgX } = nearestIndex(event.clientX);
    showAt(index, svgX, event.clientY - svg.getBoundingClientRect().top);
  });
  hit.addEventListener('pointerleave', () => {
    active = null;
    crossG.setAttribute('opacity', '0');
    if (tooltip) tooltip.hidden = true;
  });

  // Keyboard: arrows walk the same positions the pointer snaps to.
  svg.setAttribute('tabindex', '0');
  svg.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const current = active ?? points.length - 1;
    const next = Math.min(points.length - 1, Math.max(0, current + (event.key === 'ArrowRight' ? 1 : -1)));
    showAt(next, x(points[next].date));
  });
  svg.addEventListener('focus', () => {
    if (active === null) showAt(points.length - 1, x(points[points.length - 1].date));
  });
  svg.addEventListener('blur', () => {
    active = null;
    crossG.setAttribute('opacity', '0');
    if (tooltip) tooltip.hidden = true;
  });

  return () => {
    if (tooltip) tooltip.hidden = true;
  };
}
