import type { GenealogyComponent, GenealogyGraph, GenealogyIndex, GraphEdge, GraphNode } from '../genealogy/layout.ts';
import type { AtlasViewState } from '../genealogy/state.ts';
import { relationshipEdgeStyle } from '../genealogy/edge-style.ts';
import { routeGenealogyEdge } from '../genealogy/edge-route.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface GenealogyMessages {
  treeLabel: string;
  generationLabel: string;
  truncatedMessage: string;
  viewProfileLabel: string;
  panLeftLabel: string;
  panRightLabel: string;
  panUpLabel: string;
  panDownLabel: string;
  zoomInLabel: string;
  zoomOutLabel: string;
}

export interface GlobalOverviewMessages {
  globalIndexSummary: string;
  globalOverviewAriaLabel: string;
  largestFamiliesLabel: string;
  familyAnimalsLabel: string;
}

export interface GenealogyViewController {
  setView(patch: Partial<AtlasViewState>): void;
  resize?(): void;
  setVisibleAnimalIds?(animalIds: Set<string> | null): void;
  fitAll?(): void;
  zoomBy?(difference: number): void;
}

function svgElement<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string> = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
}

function createEdge(edge: GraphEdge, nodeById: Map<string, GraphNode>) {
  const route = routeGenealogyEdge(edge, nodeById, 'focused');
  if (!route) return null;
  const style = relationshipEdgeStyle(edge.type, edge.status);
  const pathData = route.pathType === 'line'
    ? `M ${route.start.x} ${route.start.y} L ${route.end.x} ${route.end.y}`
    : `M ${route.start.x} ${route.start.y} C ${route.control1.x} ${route.control1.y}, ${route.control2.x} ${route.control2.y}, ${route.end.x} ${route.end.y}`;
  const path = svgElement('path', {
    d: pathData,
    class: `genealogy-edge edge-${edge.type.replaceAll('_', '-')} status-${edge.status}`,
    'data-edge-id': edge.id,
    'data-edge-status': edge.status,
    'data-edge-type': edge.type,
    stroke: style.stroke,
    ...(style.dashArray.length ? { 'stroke-dasharray': style.dashArray.join(' ') } : {}),
    fill: 'none',
    'aria-label': `${edge.type.replaceAll('_', ' ')}; ${edge.status}`,
  });
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  return path;
}

function createNode(node: GraphNode, messages: GenealogyMessages, onSelect: (id: string) => void) {
  const group = svgElement('g', {
    class: 'genealogy-node',
    role: 'treeitem',
    tabindex: '0',
    'aria-label': `${node.name}, ${messages.generationLabel} ${node.generation}, ${messages.viewProfileLabel}`,
    'data-animal-id': node.id,
    transform: `translate(${node.x} ${node.y})`,
  });
  const rect = svgElement('rect', { x: '-88', y: '-37', width: '176', height: '74', rx: '14' });
  const title = svgElement('title');
  title.textContent = node.name;
  const compactName = svgElement('text', { class: 'node-compact-name', x: '0', y: '5', 'text-anchor': 'middle' });
  compactName.textContent = [...node.name][0] ?? '?';
  const name = svgElement('text', { class: 'node-name', x: '0', y: '-3', 'text-anchor': 'middle' });
  name.textContent = node.name;
  const metadata = svgElement('text', { class: 'node-metadata', x: '0', y: '19', 'text-anchor': 'middle' });
  metadata.textContent = [node.countryCode ?? '', `${messages.generationLabel} ${node.generation}`].filter(Boolean).join(' · ');
  group.append(title, rect, compactName, name, metadata);
  group.addEventListener('click', () => onSelect(node.id));
  group.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(node.id);
    }
  });
  return group;
}

export function renderGenealogy(
  container: HTMLElement,
  graph: GenealogyGraph,
  view: AtlasViewState,
  messages: GenealogyMessages,
  onSelect: (id: string) => void,
  onViewChange: (patch: Partial<AtlasViewState>) => void,
): GenealogyViewController | null {
  container.replaceChildren();
  const wrapper = document.createElement('div');
  wrapper.className = 'genealogy-surface';
  const svg = svgElement('svg', {
    class: 'genealogy-svg',
    role: 'tree',
    tabindex: '0',
    'aria-label': messages.treeLabel,
    'data-genealogy': 'true',
    'data-layout-mode': 'focused',
  });
  if (!graph.nodes.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = messages.treeLabel;
    container.append(empty);
    return null;
  }
  const focusNode = graph.nodes.find((node) => node.id === view.focusId);
  const updateViewBox = () => {
    if (focusNode && window.matchMedia('(max-width: 560px)').matches) {
      const availableWidth = Math.max(320, svg.clientWidth || container.clientWidth || window.innerWidth - 32);
      const availableHeight = Math.max(330, svg.clientHeight || Math.round(window.innerHeight * 0.52));
      if (graph.nodes.length <= 24) {
        const top = Math.min(...graph.nodes.map((node) => node.y - 37)) - 24;
        const bottom = Math.max(...graph.nodes.map((node) => node.y + 37)) + 24;
        const viewHeight = Math.max(300, bottom - top);
        const scale = Math.min(1, availableHeight / viewHeight);
        const viewWidth = availableWidth / scale;
        const centerY = (top + bottom) / 2;
        svg.setAttribute('viewBox', `${focusNode.x - viewWidth / 2} ${centerY - viewHeight / 2} ${viewWidth} ${viewHeight}`);
      } else {
        svg.setAttribute('viewBox', `${focusNode.x - availableWidth / 2} ${focusNode.y - availableHeight / 2} ${availableWidth} ${availableHeight}`);
      }
      return;
    }
    const minX = Math.min(...graph.nodes.map((node) => node.x)) - 150;
    const maxX = Math.max(...graph.nodes.map((node) => node.x)) + 150;
    const minY = Math.min(...graph.nodes.map((node) => node.y)) - 130;
    const maxY = Math.max(...graph.nodes.map((node) => node.y)) + 140;
    svg.setAttribute('viewBox', `${minX} ${minY} ${Math.max(480, maxX - minX)} ${Math.max(300, maxY - minY)}`);
  };
  updateViewBox();
  const viewport = svgElement('g', { class: 'genealogy-viewport', transform: `translate(${view.pan.x} ${view.pan.y}) scale(${view.zoom})` });
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = svgElement('g', { class: 'genealogy-edges', 'aria-hidden': 'true' });
  for (const edge of graph.edges) {
    const rendered = createEdge(edge, nodesById);
    if (rendered) edges.append(rendered);
  }
  const nodes = svgElement('g', { class: 'genealogy-nodes' });
  for (const node of graph.nodes) nodes.append(createNode(node, messages, onSelect));
  viewport.append(edges, nodes);
  svg.append(viewport);
  let activeView = { ...view, pan: { ...view.pan } };
  const applyViewChange = (patch: Partial<AtlasViewState>) => {
    activeView = {
      ...activeView,
      ...patch,
      pan: patch.pan ? { ...activeView.pan, ...patch.pan } : activeView.pan,
    };
    viewport.setAttribute('transform', `translate(${activeView.pan.x} ${activeView.pan.y}) scale(${activeView.zoom})`);
    viewport.classList.toggle('is-compact', activeView.zoom < 0.7);
    onViewChange(patch);
  };
  svg.addEventListener('keydown', (event) => {
    const pan = { ...activeView.pan };
    const step = 34 / Math.max(activeView.zoom, 0.5);
    if (event.key === 'ArrowLeft') pan.x += step;
    else if (event.key === 'ArrowRight') pan.x -= step;
    else if (event.key === 'ArrowUp') pan.y += step;
    else if (event.key === 'ArrowDown') pan.y -= step;
    else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      applyViewChange({ zoom: Math.min(2.5, activeView.zoom + 0.1) });
      return;
    } else if (event.key === '-') {
      event.preventDefault();
      applyViewChange({ zoom: Math.max(0.45, activeView.zoom - 0.1) });
      return;
    } else return;
    event.preventDefault();
    applyViewChange({ pan });
  });
  viewport.classList.toggle('is-compact', activeView.zoom < 0.7);
  let pointerStart: { x: number; y: number; pan: { x: number; y: number } } | null = null;
  let pendingPan: { x: number; y: number } | null = null;
  let panFrame = 0;
  svg.addEventListener('pointerdown', (event) => {
    if ((event.target as Element).closest('.genealogy-node')) return;
    pointerStart = { x: event.clientX, y: event.clientY, pan: { ...activeView.pan } };
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', (event) => {
    if (!pointerStart) return;
    pendingPan = {
      x: pointerStart.pan.x + (event.clientX - pointerStart.x) / activeView.zoom,
      y: pointerStart.pan.y + (event.clientY - pointerStart.y) / activeView.zoom,
    };
    if (!panFrame) {
      panFrame = window.requestAnimationFrame(() => {
        panFrame = 0;
        if (pendingPan) applyViewChange({ pan: pendingPan });
      });
    }
  });
  const stopDragging = () => {
    pointerStart = null;
    if (panFrame) window.cancelAnimationFrame(panFrame);
    panFrame = 0;
    if (pendingPan) applyViewChange({ pan: pendingPan });
    pendingPan = null;
  };
  svg.addEventListener('pointerup', stopDragging);
  svg.addEventListener('pointercancel', stopDragging);
  if (graph.truncated) {
    const note = document.createElement('p');
    note.className = 'graph-note';
    note.textContent = messages.truncatedMessage;
    wrapper.append(note);
  }
  wrapper.append(svg);
  container.append(wrapper);
  updateViewBox();
  return { setView: applyViewChange, resize: updateViewBox };
}

/** Render a lightweight map of every connected family component before a focus is selected. */
export function renderGlobalOverview(
  container: HTMLElement,
  index: GenealogyIndex,
  messages: GlobalOverviewMessages,
  onSelect: (animalId: string) => void,
) {
  container.replaceChildren();
  const wrapper = document.createElement('div');
  wrapper.className = 'global-overview';
  wrapper.dataset.globalOverview = 'true';
  const summary = document.createElement('p');
  summary.className = 'global-index-summary';
  summary.textContent = messages.globalIndexSummary
    .replace('{animals}', String(index.animalById.size))
    .replace('{components}', String(index.components.length));
  const canvas = document.createElement('canvas');
  canvas.className = 'global-component-map';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', messages.globalOverviewAriaLabel);
  canvas.dataset.globalOverviewMap = 'true';

  const logicalWidth = 1200;
  const columns = Math.max(1, Math.ceil(Math.sqrt(index.components.length * 1.55)));
  const rows = Math.max(1, Math.ceil(index.components.length / columns));
  const logicalHeight = Math.max(360, Math.min(1200, rows * 28 + 48));
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = logicalWidth * pixelRatio;
  canvas.height = logicalHeight * pixelRatio;
  const context = canvas.getContext('2d');
  if (context) {
    context.scale(pixelRatio, pixelRatio);
    context.fillStyle = '#fbfaf5';
    context.fillRect(0, 0, logicalWidth, logicalHeight);
  }

  const components: Array<{ component: GenealogyComponent; x: number; y: number; radius: number }> = [];
  const ordered = [...index.components].sort((left, right) =>
    right.animalIds.length - left.animalIds.length || left.representativeId.localeCompare(right.representativeId));
  ordered.forEach((component, position) => {
    const column = position % columns;
    const row = Math.floor(position / columns);
    const radius = Math.min(12, 3 + Math.sqrt(component.animalIds.length) * 1.4);
    const point = {
      component,
      x: 24 + (column + 0.5) * ((logicalWidth - 48) / columns),
      y: 24 + (row + 0.5) * ((logicalHeight - 48) / rows),
      radius,
    };
    components.push(point);
    if (!context) return;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fillStyle = component.animalIds.length > 1 ? '#315e50' : '#a8b9ad';
    context.fill();
  });

  canvas.addEventListener('click', (event) => {
    if (!components.length) return;
    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * logicalWidth;
    const y = ((event.clientY - bounds.top) / bounds.height) * logicalHeight;
    const scaleX = logicalWidth / Math.max(1, bounds.width);
    const scaleY = logicalHeight / Math.max(1, bounds.height);
    let closest: typeof components[number] | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const point of components) {
      const distance = Math.hypot((x - point.x) / scaleX, (y - point.y) / scaleY);
      if (distance < closestDistance) {
        closest = point;
        closestDistance = distance;
      }
    }
    if (closest && closestDistance <= Math.max(14, closest.radius + 8)) {
      onSelect(closest.component.representativeId);
    }
  });

  const familyHeading = document.createElement('h3');
  familyHeading.className = 'global-family-heading';
  familyHeading.textContent = messages.largestFamiliesLabel;
  const familyList = document.createElement('div');
  familyList.className = 'global-family-list';
  for (const component of ordered.slice(0, 12)) {
    const representative = index.animalById.get(component.representativeId);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'global-family-button';
    button.textContent = `${representative?.name?.canonical ?? component.representativeId} · ${component.animalIds.length} ${messages.familyAnimalsLabel}`;
    button.addEventListener('click', () => onSelect(component.representativeId));
    familyList.append(button);
  }
  wrapper.append(summary, canvas, familyHeading, familyList);
  container.append(wrapper);
}
