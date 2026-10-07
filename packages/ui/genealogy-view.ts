import type { GenealogyGraph, GraphEdge, GraphNode } from '../genealogy/layout.ts';
import type { AtlasViewState } from '../genealogy/state.ts';

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

function svgElement<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string> = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
}

function createEdge(edge: GraphEdge, nodeById: Map<string, GraphNode>) {
  const parent = nodeById.get(edge.from);
  const child = nodeById.get(edge.to);
  if (!parent || !child) return null;
  const startY = parent.y + 38;
  const endY = child.y - 38;
  const midY = (startY + endY) / 2;
  const path = svgElement('path', {
    d: `M ${parent.x} ${startY} C ${parent.x} ${midY}, ${child.x} ${midY}, ${child.x} ${endY}`,
    class: `genealogy-edge edge-${edge.type.replaceAll('_', '-')} status-${edge.status}`,
    'data-edge-id': edge.id,
    'data-edge-status': edge.status,
    'data-edge-type': edge.type,
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
  const name = svgElement('text', { class: 'node-name', x: '0', y: '-3', 'text-anchor': 'middle' });
  name.textContent = node.name;
  const metadata = svgElement('text', { class: 'node-metadata', x: '0', y: '19', 'text-anchor': 'middle' });
  metadata.textContent = [node.countryCode ?? '', `${messages.generationLabel} ${node.generation}`].filter(Boolean).join(' · ');
  group.append(rect, name, metadata);
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
) {
  container.replaceChildren();
  const wrapper = document.createElement('div');
  wrapper.className = 'genealogy-surface';
  const svg = svgElement('svg', {
    class: 'genealogy-svg',
    role: 'tree',
    tabindex: '0',
    'aria-label': messages.treeLabel,
    'data-genealogy': 'true',
  });
  if (!graph.nodes.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = messages.treeLabel;
    container.append(empty);
    return null;
  }
  const minX = Math.min(...graph.nodes.map((node) => node.x)) - 150;
  const maxX = Math.max(...graph.nodes.map((node) => node.x)) + 150;
  const minY = Math.min(...graph.nodes.map((node) => node.y)) - 130;
  const maxY = Math.max(...graph.nodes.map((node) => node.y)) + 140;
  svg.setAttribute('viewBox', `${minX} ${minY} ${Math.max(480, maxX - minX)} ${Math.max(300, maxY - minY)}`);
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
  let pointerStart: { x: number; y: number; pan: { x: number; y: number } } | null = null;
  svg.addEventListener('pointerdown', (event) => {
    if ((event.target as Element).closest('.genealogy-node')) return;
    pointerStart = { x: event.clientX, y: event.clientY, pan: { ...activeView.pan } };
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', (event) => {
    if (!pointerStart) return;
    applyViewChange({ pan: {
      x: pointerStart.pan.x + (event.clientX - pointerStart.x) / activeView.zoom,
      y: pointerStart.pan.y + (event.clientY - pointerStart.y) / activeView.zoom,
    } });
  });
  const stopDragging = () => { pointerStart = null; };
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
  return svg;
}
