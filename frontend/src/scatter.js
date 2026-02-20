/**
 * D3 scatter plot with animated query point, drift trail, and top-k connections.
 */

import * as d3 from 'd3';

const TRAIL_LENGTH = 8;
const TRANSITION_MS = 200;
const LINE_STAGGER_MS = 80;

// Source-to-color mapping
const SOURCE_COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#96e6a1',
  '#dda0dd', '#f4a460', '#87ceeb', '#ffd700', '#ff69b4',
];

let svg, xScale, yScale, width, height;
let docGroup, queryGroup, lineGroup, trailGroup, labelGroup;
let tooltip;
let sourceColorMap = {};
let categoryMap = new Map();
let trail = [];
let currentTopK = [];

function symbolPath(category, size) {
  const type = category === 'olympics' ? d3.symbolDiamond : d3.symbolCircle;
  return d3.symbol().type(type).size(size)();
}

export function initScatter(container, embeddings, chunks) {
  const rect = container.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  const margin = { top: 20, right: 20, bottom: 20, left: 20 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  // Scales
  const xExtent = d3.extent(embeddings, d => d.x);
  const yExtent = d3.extent(embeddings, d => d.y);
  const xPad = (xExtent[1] - xExtent[0]) * 0.1;
  const yPad = (yExtent[1] - yExtent[0]) * 0.1;

  xScale = d3.scaleLinear()
    .domain([xExtent[0] - xPad, xExtent[1] + xPad])
    .range([margin.left, margin.left + innerW]);

  yScale = d3.scaleLinear()
    .domain([yExtent[0] - yPad, yExtent[1] + yPad])
    .range([margin.top + innerH, margin.top]);

  // Source colors
  const sources = [...new Set(chunks.map(c => c.source))].sort();
  sources.forEach((s, i) => {
    sourceColorMap[s] = SOURCE_COLORS[i % SOURCE_COLORS.length];
  });

  // SVG
  svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  // Glow filter
  const defs = svg.append('defs');

  const glowFilter = defs.append('filter').attr('id', 'glow');
  glowFilter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
  const merge = glowFilter.append('feMerge');
  merge.append('feMergeNode').attr('in', 'blur');
  merge.append('feMergeNode').attr('in', 'SourceGraphic');

  const queryGlow = defs.append('filter').attr('id', 'query-glow');
  queryGlow.append('feGaussianBlur').attr('stdDeviation', '5').attr('result', 'blur');
  const qMerge = queryGlow.append('feMerge');
  qMerge.append('feMergeNode').attr('in', 'blur');
  qMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Layer ordering: lines → trail → docs → query → labels
  lineGroup = svg.append('g').attr('class', 'lines');
  trailGroup = svg.append('g').attr('class', 'trail');
  docGroup = svg.append('g').attr('class', 'docs');
  queryGroup = svg.append('g').attr('class', 'query');
  labelGroup = svg.append('g').attr('class', 'labels');

  // Document points
  const chunkMap = new Map(chunks.map(c => [c.id, c]));
  chunks.forEach(c => categoryMap.set(c.id, c.category || 'nfl'));

  docGroup.selectAll('.doc-point')
    .data(embeddings)
    .join('path')
    .attr('class', 'doc-point')
    .attr('d', d => symbolPath(categoryMap.get(d.id), 78))
    .attr('transform', d => `translate(${xScale(d.x)},${yScale(d.y)})`)
    .attr('fill', d => sourceColorMap[chunkMap.get(d.id)?.source] || '#666')
    .attr('opacity', 0.7)
    .attr('stroke', 'none')
    .attr('data-id', d => d.id)
    .on('mouseenter', (event, d) => showTooltip(event, d, chunkMap))
    .on('mouseleave', hideTooltip);

  // Tooltip element
  tooltip = d3.select(container)
    .append('div')
    .attr('class', 'chunk-tooltip');

  // Legend
  const legendEl = document.getElementById('legend');
  if (legendEl) {
    const entries = [
      { label: 'Super Bowl', category: 'nfl' },
      { label: 'Winter Olympics', category: 'olympics' },
    ];
    legendEl.innerHTML = entries.map(e => {
      const sym = d3.symbol().type(e.category === 'olympics' ? d3.symbolDiamond : d3.symbolCircle).size(64)();
      return `<span class="legend-item">
        <svg class="legend-swatch" width="14" height="14" viewBox="-7 -7 14 14">
          <path d="${sym}" fill="white"/>
        </svg>
        ${e.label}
      </span>`;
    }).join('');
  }

  return { sourceColorMap };
}

function showTooltip(event, d, chunkMap) {
  const chunk = chunkMap.get(d.id);
  if (!chunk) return;
  tooltip
    .html(`<div class="tooltip-source">${chunk.source.replace(/_/g, ' ')}</div>${chunk.text}`)
    .classed('visible', true);

  const ttRect = tooltip.node().getBoundingClientRect();
  const containerRect = svg.node().parentElement.getBoundingClientRect();
  let x = event.clientX - containerRect.left + 12;
  let y = event.clientY - containerRect.top - 8;
  if (x + ttRect.width > containerRect.width) x = x - ttRect.width - 24;
  if (y + ttRect.height > containerRect.height) y = containerRect.height - ttRect.height - 4;
  tooltip.style('left', x + 'px').style('top', y + 'px');
}

function hideTooltip() {
  tooltip.classed('visible', false);
}

/**
 * Update the query point position with smooth transition + trail.
 */
export function updateQueryPoint(x, y) {
  const cx = xScale(x);
  const cy = yScale(y);

  // Add to trail
  trail.push({ cx, cy });
  if (trail.length > TRAIL_LENGTH) trail.shift();

  // Render trail
  trailGroup.selectAll('circle')
    .data(trail)
    .join('circle')
    .attr('cx', d => d.cx)
    .attr('cy', d => d.cy)
    .attr('r', 3)
    .attr('fill', 'var(--accent)')
    .attr('opacity', (d, i) => (i + 1) / trail.length * 0.3);

  // Query point (square)
  const size = 16;
  const queryDot = queryGroup.selectAll('rect').data([{ cx, cy }]);

  queryDot.join(
    enter => enter.append('rect')
      .attr('x', cx - size / 2)
      .attr('y', cy - size / 2)
      .attr('width', size)
      .attr('height', size)
      .attr('fill', 'white')
      .attr('filter', 'url(#query-glow)')
      .attr('stroke', 'var(--accent)')
      .attr('stroke-width', 2),
    update => update.transition().duration(TRANSITION_MS).ease(d3.easeCubicOut)
      .attr('x', cx - size / 2)
      .attr('y', cy - size / 2),
  );
}

/**
 * Show connection lines to top-k results with staggered animation.
 */
export function showConnections(queryX, queryY, topK, embeddings) {
  currentTopK = topK;
  const qcx = xScale(queryX);
  const qcy = yScale(queryY);

  const embMap = new Map(embeddings.map(e => [e.id, e]));

  // Lines
  const lineData = topK.map((tk, i) => {
    const emb = embMap.get(tk.id);
    return {
      id: tk.id,
      x1: qcx, y1: qcy,
      x2: xScale(emb.x), y2: yScale(emb.y),
      score: tk.score,
      rank: i,
    };
  });

  lineGroup.selectAll('line').remove();
  labelGroup.selectAll('text').remove();

  lineGroup.selectAll('line')
    .data(lineData)
    .join('line')
    .attr('x1', d => d.x1).attr('y1', d => d.y1)
    .attr('x2', d => d.x1).attr('y2', d => d.y1)
    .attr('stroke', 'var(--accent)')
    .attr('stroke-width', d => 2 - d.rank * 0.25)
    .attr('stroke-opacity', d => 0.8 - d.rank * 0.1)
    .attr('stroke-dasharray', '4 2')
    .transition()
    .delay(d => d.rank * LINE_STAGGER_MS)
    .duration(300)
    .attr('x2', d => d.x2)
    .attr('y2', d => d.y2);

  // Similarity labels at midpoints
  labelGroup.selectAll('text')
    .data(lineData)
    .join('text')
    .attr('x', d => (d.x1 + d.x2) / 2)
    .attr('y', d => (d.y1 + d.y2) / 2 - 6)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px')
    .attr('font-family', 'var(--font-mono)')
    .attr('fill', 'var(--accent)')
    .attr('opacity', 0)
    .text(d => d.score.toFixed(3))
    .transition()
    .delay(d => d.rank * LINE_STAGGER_MS + 200)
    .duration(200)
    .attr('opacity', 0.9);

  // Highlight top-k docs, dim others
  const topKIds = new Set(topK.map(t => t.id));

  docGroup.selectAll('.doc-point')
    .transition().duration(300)
    .attr('d', d => symbolPath(categoryMap.get(d.id), topKIds.has(d.id) ? 200 : 50))
    .attr('opacity', d => topKIds.has(d.id) ? 1 : 0.2)
    .attr('filter', d => topKIds.has(d.id) ? 'url(#glow)' : 'none')
    .attr('stroke', d => topKIds.has(d.id) ? 'white' : 'none')
    .attr('stroke-width', d => topKIds.has(d.id) ? 1.5 : 0);
}

/**
 * Clear connections and reset doc point styling.
 */
export function clearConnections() {
  lineGroup.selectAll('line').remove();
  labelGroup.selectAll('text').remove();
  currentTopK = [];

  docGroup.selectAll('.doc-point')
    .transition().duration(200)
    .attr('d', d => symbolPath(categoryMap.get(d.id), 78))
    .attr('opacity', 0.7)
    .attr('filter', 'none')
    .attr('stroke', 'none');
}

/**
 * Full reset — remove query point and trail.
 */
export function resetScatter() {
  clearConnections();
  queryGroup.selectAll('rect').remove();
  trailGroup.selectAll('circle').remove();
  trail = [];
}

/**
 * Highlight a specific result card's point on hover.
 */
export function highlightPoint(id, highlight) {
  docGroup.selectAll('.doc-point')
    .filter(d => d.id === id)
    .transition().duration(150)
    .attr('d', d => symbolPath(categoryMap.get(d.id), highlight ? 314 : (currentTopK.some(t => t.id === id) ? 200 : 78)))
    .attr('stroke-width', highlight ? 2.5 : (currentTopK.some(t => t.id === id) ? 1.5 : 0));
}
