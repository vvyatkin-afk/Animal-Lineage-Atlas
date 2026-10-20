import type { GenealogyGraph, GraphEdge, GraphNode, RelationshipStatus, RelationshipType } from '../genealogy/layout.ts';
import type { AtlasViewState } from '../genealogy/state.ts';
import type { GenealogyMessages, GenealogyViewController } from './genealogy-view.ts';

const NODE_WIDTH = 176;
const NODE_HEIGHT = 74;
const SPATIAL_CELL = 512;
const CARD_ZOOM = 0.6;
const MAX_VISIBLE_CARDS = 180;

export interface GlobalGenealogyMessages extends GenealogyMessages {
  globalIndexSummary: string;
  globalOverviewAriaLabel: string;
  familyGroupingLabel: string;
  countryGroupingLabel: string;
  unknownValue: string;
  maleLabel: string;
  femaleLabel: string;
  livingStatus: string;
  deceasedStatus: string;
  photoConfirmedLabel: string;
  graphFilterSummary: string;
  allAnimalsLabel: string;
  fitAllLabel: string;
  graphLegendLabel: string;
  biologicalMotherLegend: string;
  biologicalFatherLegend: string;
  fosterLegend: string;
  adoptiveLegend: string;
  socialLegend: string;
  confirmedLabel: string;
  probableLabel: string;
  disputedLabel: string;
}

type Bounds = { left: number; top: number; right: number; bottom: number };
type EdgeRoute = {
  id: string;
  edge: GraphEdge;
  start: { x: number; y: number };
  control1: { x: number; y: number };
  control2: { x: number; y: number };
  end: { x: number; y: number };
  bounds: Bounds;
};

class SpatialIndex<T extends { id: string }> {
  private readonly items = new Map<string, T>();
  private readonly cells = new Map<string, Set<string>>();
  private readonly overflow = new Set<string>();

  constructor(items: T[], getBounds: (item: T) => Bounds) {
    for (const item of items) {
      this.items.set(item.id, item);
      const bounds = getBounds(item);
      const minX = Math.floor(bounds.left / SPATIAL_CELL);
      const maxX = Math.floor(bounds.right / SPATIAL_CELL);
      const minY = Math.floor(bounds.top / SPATIAL_CELL);
      const maxY = Math.floor(bounds.bottom / SPATIAL_CELL);
      const cellCount = (maxX - minX + 1) * (maxY - minY + 1);
      if (cellCount > 256) {
        this.overflow.add(item.id);
        continue;
      }
      for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
          const key = `${x}:${y}`;
          const bucket = this.cells.get(key) ?? new Set<string>();
          bucket.add(item.id);
          this.cells.set(key, bucket);
        }
      }
    }
  }

  query(bounds: Bounds): T[] {
    const ids = new Set(this.overflow);
    const minX = Math.floor(bounds.left / SPATIAL_CELL);
    const maxX = Math.floor(bounds.right / SPATIAL_CELL);
    const minY = Math.floor(bounds.top / SPATIAL_CELL);
    const maxY = Math.floor(bounds.bottom / SPATIAL_CELL);
    const cellCount = (maxX - minX + 1) * (maxY - minY + 1);
    if (cellCount > 8192) return [...this.items.values()];
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (const id of this.cells.get(`${x}:${y}`) ?? []) ids.add(id);
      }
    }
    const result: T[] = [];
    for (const id of ids) {
      const item = this.items.get(id);
      if (item) result.push(item);
    }
    return result;
  }
}

function nodeBounds(node: GraphNode): Bounds {
  return {
    left: node.x - NODE_WIDTH / 2,
    top: node.y - NODE_HEIGHT / 2,
    right: node.x + NODE_WIDTH / 2,
    bottom: node.y + NODE_HEIGHT / 2,
  };
}

function routeForEdge(edge: GraphEdge, nodeById: Map<string, GraphNode>): EdgeRoute | null {
  const parent = nodeById.get(edge.from);
  const child = nodeById.get(edge.to);
  if (!parent || !child) return null;
  let start: EdgeRoute['start'];
  let end: EdgeRoute['end'];
  let control1: EdgeRoute['control1'];
  let control2: EdgeRoute['control2'];
  if (edge.type === 'social') {
    start = { x: parent.x, y: parent.y };
    end = { x: child.x, y: child.y };
    const midpointX = (parent.x + child.x) / 2;
    const midpointY = (parent.y + child.y) / 2;
    const lift = Math.max(NODE_HEIGHT, Math.abs(child.x - parent.x) * 0.08);
    control1 = { x: midpointX, y: midpointY - lift };
    control2 = { x: midpointX, y: midpointY - lift };
  } else {
    start = { x: parent.x, y: parent.y + NODE_HEIGHT / 2 };
    end = { x: child.x, y: child.y - NODE_HEIGHT / 2 };
    const midpointY = (start.y + end.y) / 2;
    control1 = { x: start.x, y: midpointY };
    control2 = { x: end.x, y: midpointY };
  }
  const points = [start, control1, control2, end];
  return {
    id: edge.id,
    edge,
    start,
    control1,
    control2,
    end,
    bounds: {
      left: Math.min(...points.map((point) => point.x)) - 4,
      top: Math.min(...points.map((point) => point.y)) - 4,
      right: Math.max(...points.map((point) => point.x)) + 4,
      bottom: Math.max(...points.map((point) => point.y)) + 4,
    },
  };
}

function intersects(left: Bounds, right: Bounds): boolean {
  return left.left <= right.right && left.right >= right.left
    && left.top <= right.bottom && left.bottom >= right.top;
}

function edgeColor(type: RelationshipType, status: RelationshipStatus): string {
  if (status === 'disputed') return '#9a4c45';
  if (type === 'biological_mother') return '#9b6f55';
  if (type === 'biological_father') return '#53768a';
  if (type === 'foster' || type === 'adoptive') return '#7c6695';
  return '#87978d';
}

function normalizedCountryCode(countryCode: string | null): string | null {
  return countryCode && /^[A-Za-z]{2}$/.test(countryCode) ? countryCode.toLowerCase() : null;
}

function sexLabel(node: GraphNode, messages: GlobalGenealogyMessages): string {
  if (node.sex === 'female') return messages.femaleLabel;
  if (node.sex === 'male') return messages.maleLabel;
  return messages.unknownValue;
}

function statusLabel(node: GraphNode, messages: GlobalGenealogyMessages): string {
  if (node.lifeStatus === 'living') return messages.livingStatus;
  if (node.lifeStatus === 'deceased') return messages.deceasedStatus;
  return messages.unknownValue;
}

function makeNodeCard(node: GraphNode, basePath: string, messages: GlobalGenealogyMessages): HTMLAnchorElement {
  const card = document.createElement('a');
  card.className = 'global-node-card';
  card.href = `${basePath}?animal=${encodeURIComponent(node.id)}`;
  card.target = '_blank';
  card.rel = 'noopener';
  card.dataset.animalId = node.id;
  card.setAttribute('aria-label', `${node.name}, ${node.countryCode ?? ''}. ${messages.generationLabel} ${node.generation}. ${sexLabel(node, messages)}. ${statusLabel(node, messages)}. ${messages.viewProfileLabel} in a new tab.`);
  card.style.left = `${node.x}px`;
  card.style.top = `${node.y}px`;
  card.style.transform = 'translate(-50%, -50%)';

  const avatar = document.createElement('span');
  avatar.className = 'global-node-avatar';
  const countryCode = normalizedCountryCode(node.countryCode);
  avatar.textContent = node.countryCode || '•';
  if (countryCode) {
    const flag = document.createElement('img');
    flag.className = 'global-node-flag';
    flag.src = `${basePath}flags/${countryCode}.svg`;
    flag.alt = `${node.countryCode} flag`;
    flag.loading = 'lazy';
    flag.decoding = 'async';
    flag.addEventListener('error', () => flag.remove(), { once: true });
    avatar.append(flag);
  }
  if (node.photoConfirmed && node.photoUrl) {
    const image = document.createElement('img');
    image.className = 'global-node-photo';
    image.src = node.photoUrl;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => image.remove(), { once: true });
    avatar.append(image);
  }
  card.append(avatar);

  const details = document.createElement('span');
  details.className = 'global-node-details';
  const name = document.createElement('strong');
  name.textContent = node.name;
  const metadata = document.createElement('small');
  metadata.textContent = [node.countryCode ?? '', sexLabel(node, messages), statusLabel(node, messages)]
    .filter(Boolean).join(' · ');
  const dates = document.createElement('small');
  dates.textContent = [
    node.birthDateLabel,
    node.deathDateLabel ? `† ${node.deathDateLabel}` : '',
    node.institutionLabel ?? '',
    `${messages.generationLabel} ${node.generation}`,
  ].filter(Boolean).join(' · ');
  details.append(name, metadata, dates);
  card.append(details);

  if (node.photoConfirmed) {
    const check = document.createElement('span');
    check.className = 'global-photo-confirmed';
    check.textContent = '✓';
    check.title = messages.photoConfirmedLabel;
    check.setAttribute('aria-label', messages.photoConfirmedLabel);
    card.append(check);
  }
  return card;
}

function makeLegend(messages: GlobalGenealogyMessages): HTMLElement {
  const legend = document.createElement('div');
  legend.className = 'global-graph-legend';
  legend.setAttribute('aria-label', messages.graphLegendLabel);
  const relationItems = [
    ['edge-biological-mother', messages.biologicalMotherLegend],
    ['edge-biological-father', messages.biologicalFatherLegend],
    ['edge-foster', messages.fosterLegend],
    ['edge-adoptive', messages.adoptiveLegend],
    ['edge-social', messages.socialLegend],
    ['status-confirmed', messages.confirmedLabel],
    ['status-probable', messages.probableLabel],
    ['status-disputed', messages.disputedLabel],
    ['status-unknown', messages.unknownValue],
  ];
  for (const [className, label] of relationItems) {
    const item = document.createElement('span');
    const mark = document.createElement('i');
    mark.className = `graph-legend-mark ${className}`;
    mark.setAttribute('aria-hidden', 'true');
    item.append(mark, document.createTextNode(label));
    legend.append(item);
  }
  return legend;
}

function componentBounds(nodes: GraphNode[]): Bounds {
  return nodes.reduce<Bounds>((bounds, node) => {
    const next = nodeBounds(node);
    return {
      left: Math.min(bounds.left, next.left),
      top: Math.min(bounds.top, next.top),
      right: Math.max(bounds.right, next.right),
      bottom: Math.max(bounds.bottom, next.bottom),
    };
  }, { left: Number.POSITIVE_INFINITY, top: Number.POSITIVE_INFINITY, right: Number.NEGATIVE_INFINITY, bottom: Number.NEGATIVE_INFINITY });
}

function globalBounds(graph: GenealogyGraph): Bounds {
  if (graph.bounds) return graph.bounds;
  return graph.nodes.length ? componentBounds(graph.nodes) : { left: 0, top: 0, right: 1, bottom: 1 };
}

export function renderGlobalGenealogy(
  container: HTMLElement,
  graph: GenealogyGraph,
  view: AtlasViewState,
  messages: GlobalGenealogyMessages,
  basePath: string,
  onFocus: (animalId: string) => void,
  onViewChange: (patch: Partial<AtlasViewState>) => void,
  fitLargestOnMount = false,
): GenealogyViewController {
  container.replaceChildren();
  const wrapper = document.createElement('div');
  wrapper.className = 'global-graph-shell';
  wrapper.dataset.globalOverview = 'true';
  wrapper.dataset.globalGraph = 'true';

  const summary = document.createElement('p');
  summary.className = 'global-index-summary';
  summary.textContent = messages.globalIndexSummary
    .replace('{animals}', String(graph.nodes.length))
    .replace('{relationships}', String(graph.edges.length))
    .replace('{components}', String(graph.componentCount ?? 0))
    .replace('{generations}', String(graph.generationRows.length));
  const filterSummary = document.createElement('p');
  filterSummary.className = 'global-filter-summary';
  filterSummary.hidden = true;

  const viewport = document.createElement('div');
  viewport.className = 'global-graph-viewport';
  viewport.dataset.globalGraphViewport = 'true';
  const canvas = document.createElement('canvas');
  canvas.className = 'global-graph-canvas';
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('aria-label', messages.globalOverviewAriaLabel
    .replace('{animals}', String(graph.nodes.length))
    .replace('{components}', String(graph.componentCount ?? 0)));
  canvas.dataset.globalGraphCanvas = 'true';
  canvas.dataset.nodeCount = String(graph.nodes.length);
  canvas.dataset.edgeCount = String(graph.edges.length);
  const nodeLayer = document.createElement('div');
  nodeLayer.className = 'global-node-layer';
  nodeLayer.setAttribute('aria-label', messages.allAnimalsLabel);
  const liveStatus = document.createElement('p');
  liveStatus.className = 'visually-hidden';
  liveStatus.setAttribute('role', 'status');
  liveStatus.setAttribute('aria-live', 'polite');
  viewport.append(canvas, nodeLayer, liveStatus);
  wrapper.append(summary, filterSummary, viewport, makeLegend(messages));
  container.append(wrapper);

  const context = canvas.getContext('2d');
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const routes = graph.edges.flatMap((edge) => {
    const route = routeForEdge(edge, nodeById);
    return route ? [route] : [];
  });
  const nodeIndex = new SpatialIndex(graph.nodes, nodeBounds);
  const edgeIndex = new SpatialIndex(routes, (route) => route.bounds);
  const cardById = new Map<string, HTMLAnchorElement>();
  let visibleAnimalIds: Set<string> | null = null;
  let activeView = { ...view, pan: { ...view.pan } };
  let selectedId: string | null = null;
  let pixelRatio = 1;
  let frame = 0;
  let dragStart: { x: number; y: number; panX: number; panY: number; pointerId: number } | null = null;
  let dragMoved = false;
  let viewportWidth = 0;
  let viewportHeight = 0;
  const flagImages = new Map<string, HTMLImageElement | null>();

  const scheduleDraw = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  };

  const getFlagImage = (countryCode: string | null): HTMLImageElement | null => {
    const code = normalizedCountryCode(countryCode);
    if (!code) return null;
    if (!flagImages.has(code)) {
      const image = new Image();
      flagImages.set(code, image);
      image.addEventListener('load', scheduleDraw, { once: true });
      image.addEventListener('error', () => flagImages.set(code, null), { once: true });
      image.src = `${basePath}flags/${code}.svg`;
    }
    const image = flagImages.get(code);
    return image?.complete && image.naturalWidth > 0 ? image : null;
  };

  const applyView = (patch: Partial<AtlasViewState>) => {
    activeView = {
      ...activeView,
      ...patch,
      pan: patch.pan ? { ...activeView.pan, ...patch.pan } : activeView.pan,
      zoom: Math.max(0.002, Math.min(2.5, patch.zoom ?? activeView.zoom)),
    };
    onViewChange({ zoom: activeView.zoom, pan: { ...activeView.pan } });
    scheduleDraw();
  };

  const fitBounds = (bounds: Bounds) => {
    if (!viewportWidth || !viewportHeight || !Number.isFinite(bounds.left)) return;
    const width = Math.max(1, bounds.right - bounds.left);
    const height = Math.max(1, bounds.bottom - bounds.top);
    const zoom = Math.max(0.002, Math.min(1.4,
      (viewportWidth - 48) / width,
      (viewportHeight - 48) / height,
    ));
    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;
    applyView({
      zoom,
      pan: { x: viewportWidth / 2 - centerX * zoom, y: viewportHeight / 2 - centerY * zoom },
    });
  };

  const currentlyVisibleNodes = () => visibleAnimalIds
    ? graph.nodes.filter((node) => visibleAnimalIds?.has(node.id))
    : graph.nodes;

  const fitLargest = () => {
    const counts = new Map<string, number>();
    const visibleNodes = currentlyVisibleNodes();
    for (const node of visibleNodes) counts.set(node.componentId, (counts.get(node.componentId) ?? 0) + 1);
    const largestId = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
    const nodes = largestId ? visibleNodes.filter((node) => node.componentId === largestId) : visibleNodes;
    if (nodes.length) fitBounds(componentBounds(nodes));
  };

  const fitAll = () => {
    const nodes = currentlyVisibleNodes();
    if (!visibleAnimalIds) fitBounds(globalBounds(graph));
    else if (nodes.length) fitBounds(componentBounds(nodes));
  };

  const zoomBy = (difference: number) => {
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;
    const oldZoom = activeView.zoom;
    const zoom = Math.max(0.002, Math.min(2.5, oldZoom + difference));
    const worldX = (centerX - activeView.pan.x) / oldZoom;
    const worldY = (centerY - activeView.pan.y) / oldZoom;
    applyView({ zoom, pan: { x: centerX - worldX * zoom, y: centerY - worldY * zoom } });
  };

  const viewBounds = (): Bounds => ({
    left: -activeView.pan.x / activeView.zoom,
    top: -activeView.pan.y / activeView.zoom,
    right: (viewportWidth - activeView.pan.x) / activeView.zoom,
    bottom: (viewportHeight - activeView.pan.y) / activeView.zoom,
  });

  const resizeCanvas = () => {
    const rectangle = viewport.getBoundingClientRect();
    viewportWidth = Math.max(1, rectangle.width);
    viewportHeight = Math.max(1, rectangle.height);
    pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const width = Math.round(viewportWidth * pixelRatio);
    const height = Math.round(viewportHeight * pixelRatio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    if (fitLargestOnMount) {
      fitLargestOnMount = false;
      fitLargest();
    } else scheduleDraw();
  };

  const drawEdge = (route: EdgeRoute, zoom: number) => {
    if (!context) return;
    const { edge } = route;
    context.beginPath();
    context.moveTo(route.start.x, route.start.y);
    context.bezierCurveTo(route.control1.x, route.control1.y, route.control2.x, route.control2.y, route.end.x, route.end.y);
    context.strokeStyle = edgeColor(edge.type, edge.status);
    context.lineWidth = Math.max(0.7 / zoom, 0.25);
    if (edge.status === 'probable' || edge.status === 'disputed' || edge.status === 'unknown'
      || edge.type === 'foster' || edge.type === 'adoptive' || edge.type === 'social') {
      const dash = edge.status === 'disputed'
        ? [7 / zoom, 4 / zoom]
        : edge.status === 'unknown' ? [2 / zoom, 4 / zoom] : [5 / zoom, 4 / zoom];
      context.setLineDash(dash);
    } else context.setLineDash([]);
    context.stroke();
  };

  const drawNodes = (visibleNodes: GraphNode[]) => {
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const zoom = activeView.zoom;
    for (const node of visibleNodes) {
      const x = node.x * zoom + activeView.pan.x;
      const y = node.y * zoom + activeView.pan.y;
      const radius = zoom < 0.02 ? 1.35 : zoom < 0.07 ? 2.5 : zoom < 0.24 ? 4.2 : 6;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fillStyle = node.lifeStatus === 'living' ? '#47775c' : node.lifeStatus === 'deceased' ? '#78837d' : '#b0935e';
      context.fill();
      context.lineWidth = node.sex === 'female' || node.sex === 'male' ? 1.1 : 0.65;
      context.strokeStyle = node.sex === 'female' ? '#874c85' : node.sex === 'male' ? '#3f6f91' : '#f8f6ef';
      context.stroke();
      if (node.photoConfirmed) {
        context.beginPath();
        context.arc(x + radius * 0.72, y - radius * 0.72, Math.max(1.5, radius * 0.42), 0, Math.PI * 2);
        context.fillStyle = '#f8f6ef';
        context.fill();
      }
      if (zoom >= 0.07 && zoom < CARD_ZOOM) {
        const flag = getFlagImage(node.countryCode);
        if (flag) context.drawImage(flag, x + radius + 2, y - 4, 12, 8);
        else if (node.countryCode) {
          context.font = '10px sans-serif';
          context.textBaseline = 'middle';
          context.fillStyle = '#273b32';
          context.fillText(node.countryCode, x + radius + 2, y);
        }
      } else if (zoom >= 0.02) {
        const flag = getFlagImage(node.countryCode);
        if (flag) {
          const size = zoom < 0.035 ? 5 : 8;
          context.drawImage(flag, x + radius + 1, y - size * 0.375, size, size * 0.75);
        } else if (node.countryCode) {
          context.font = `${zoom < 0.035 ? 6 : 8}px sans-serif`;
          context.textBaseline = 'middle';
          context.fillStyle = '#273b32';
          context.fillText(node.countryCode, x + radius + 1, y);
        }
      }
      if (selectedId === node.id) {
        context.beginPath();
        context.arc(x, y, radius + 3, 0, Math.PI * 2);
        context.strokeStyle = '#b47733';
        context.lineWidth = 2;
        context.stroke();
      }
    }
  };

  const syncVisibleCards = (visibleNodes: GraphNode[], worldBounds: Bounds) => {
    nodeLayer.style.transform = `translate(${activeView.pan.x}px, ${activeView.pan.y}px) scale(${activeView.zoom})`;
    const shouldShowCards = activeView.zoom >= CARD_ZOOM;
    const candidates = shouldShowCards
      ? visibleNodes.filter((node) => intersects(nodeBounds(node), worldBounds))
      : [];
    const centerX = (worldBounds.left + worldBounds.right) / 2;
    const centerY = (worldBounds.top + worldBounds.bottom) / 2;
    candidates.sort((left, right) => Math.hypot(left.x - centerX, left.y - centerY) - Math.hypot(right.x - centerX, right.y - centerY));
    const chosen = candidates.slice(0, MAX_VISIBLE_CARDS);
    const chosenIds = new Set(chosen.map((node) => node.id));
    for (const [id, element] of cardById) {
      if (chosenIds.has(id)) continue;
      element.remove();
      cardById.delete(id);
    }
    for (const node of chosen) {
      let card = cardById.get(node.id);
      if (!card) {
        card = makeNodeCard(node, basePath, messages);
        cardById.set(node.id, card);
        nodeLayer.append(card);
      }
    }
  };

  function draw() {
    if (!context || !viewportWidth || !viewportHeight) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    context.fillStyle = '#fbfaf5';
    context.fillRect(0, 0, viewportWidth, viewportHeight);
    const bounds = viewBounds();
    const visibleNodes = nodeIndex.query(bounds).filter((node) =>
      (!visibleAnimalIds || visibleAnimalIds.has(node.id)) && intersects(nodeBounds(node), bounds));
    const visibleEdges = edgeIndex.query(bounds).filter((route) =>
      (!visibleAnimalIds || (visibleAnimalIds.has(route.edge.from) && visibleAnimalIds.has(route.edge.to)))
      && intersects(route.bounds, bounds));

    context.setTransform(
      pixelRatio * activeView.zoom, 0, 0, pixelRatio * activeView.zoom,
      pixelRatio * activeView.pan.x, pixelRatio * activeView.pan.y,
    );
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const generationLabelThreshold = 0.025;
    const generationPositions = graph.generationRows.flatMap((row) => {
      const first = nodeById.get(row.animalIds[0] ?? '');
      return first ? [first.y] : [];
    }).sort((left, right) => left - right);
    const minimumGenerationGap = generationPositions.length > 1
      ? Math.min(...generationPositions.slice(1).map((position, index) => position - generationPositions[index]!))
      : Number.POSITIVE_INFINITY;
    const showGenerationLabels = activeView.zoom >= generationLabelThreshold
      && minimumGenerationGap * activeView.zoom >= 16;
    if (activeView.zoom >= generationLabelThreshold) {
      for (const row of graph.generationRows) {
        const first = nodeById.get(row.animalIds[0] ?? '');
        if (!first) continue;
        context.beginPath();
        context.moveTo(bounds.left, first.y);
        context.lineTo(bounds.right, first.y);
        context.strokeStyle = 'rgba(93, 112, 101, 0.08)';
        context.lineWidth = 1 / activeView.zoom;
        context.setLineDash([]);
        context.stroke();
      }
    }
    for (const route of visibleEdges) drawEdge(route, activeView.zoom);
    drawNodes(visibleNodes);

    if (showGenerationLabels) {
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.font = '11px system-ui, sans-serif';
      context.fillStyle = '#6a766e';
      context.textBaseline = 'middle';
      for (const row of graph.generationRows) {
        const first = nodeById.get(row.animalIds[0] ?? '');
        if (!first) continue;
        const y = first.y * activeView.zoom + activeView.pan.y;
        if (y < 4 || y > viewportHeight - 4) continue;
        context.fillText(`${messages.generationLabel} ${row.generation}`, 8, y - 8);
      }
    }
    syncVisibleCards(visibleNodes, bounds);
    canvas.dataset.visibleNodeCount = String(visibleNodes.length);
    canvas.dataset.visibleEdgeCount = String(visibleEdges.length);
    const activeVisibleIds = visibleAnimalIds;
    canvas.dataset.filteredNodeCount = String(activeVisibleIds?.size ?? graph.nodes.length);
    canvas.dataset.filteredEdgeCount = String(activeVisibleIds
      ? graph.edges.filter((edge) => activeVisibleIds.has(edge.from) && activeVisibleIds.has(edge.to)).length
      : graph.edges.length);
    canvas.dataset.renderedCardCount = String(cardById.size);
    canvas.dataset.zoom = String(activeView.zoom);
    canvas.dataset.panX = String(activeView.pan.x);
    canvas.dataset.panY = String(activeView.pan.y);
    canvas.dataset.generationLabelsVisible = String(showGenerationLabels);
    canvas.dataset.layoutBounds = `${graph.bounds?.left ?? 0},${graph.bounds?.top ?? 0},${graph.bounds?.right ?? 0},${graph.bounds?.bottom ?? 0}`;
  }

  const worldPoint = (event: PointerEvent | WheelEvent) => {
    const rect = viewport.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    return {
      screenX,
      screenY,
      worldX: (screenX - activeView.pan.x) / activeView.zoom,
      worldY: (screenY - activeView.pan.y) / activeView.zoom,
    };
  };

  const hitNode = (worldX: number, worldY: number): GraphNode | null => {
    const screenHitRadius = 12;
    const searchRadius = Math.max(NODE_WIDTH / 2, screenHitRadius / activeView.zoom);
    const candidates = nodeIndex.query({
      left: worldX - searchRadius,
      top: worldY - searchRadius,
      right: worldX + searchRadius,
      bottom: worldY + searchRadius,
    });
    let closest: GraphNode | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const node of candidates) {
      if (visibleAnimalIds && !visibleAnimalIds.has(node.id)) continue;
      const horizontal = (node.x - worldX) * activeView.zoom;
      const vertical = (node.y - worldY) * activeView.zoom;
      const distance = Math.hypot(horizontal, vertical);
      if (distance > screenHitRadius) continue;
      if (distance < closestDistance) {
        closest = node;
        closestDistance = distance;
      }
    }
    return closest;
  };

  const zoomAt = (screenX: number, screenY: number, factor: number) => {
    const oldZoom = activeView.zoom;
    const zoom = Math.max(0.002, Math.min(2.5, oldZoom * factor));
    const worldX = (screenX - activeView.pan.x) / oldZoom;
    const worldY = (screenY - activeView.pan.y) / oldZoom;
    applyView({ zoom, pan: { x: screenX - worldX * zoom, y: screenY - worldY * zoom } });
  };

  viewport.addEventListener('pointerdown', (event) => {
    if ((event.target as Element).closest('.global-node-card')) return;
    dragStart = { x: event.clientX, y: event.clientY, panX: activeView.pan.x, panY: activeView.pan.y, pointerId: event.pointerId };
    dragMoved = false;
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - dragStart.x;
    const deltaY = event.clientY - dragStart.y;
    if (Math.hypot(deltaX, deltaY) > 4) dragMoved = true;
    if (!dragMoved) return;
    activeView.pan = { x: dragStart.panX + deltaX, y: dragStart.panY + deltaY };
    onViewChange({ pan: { ...activeView.pan } });
    scheduleDraw();
  });
  const stopDragging = (event: PointerEvent) => {
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;
    const point = worldPoint(event);
    const moved = dragMoved;
    dragStart = null;
    if (!moved) {
      const node = hitNode(point.worldX, point.worldY);
      if (node) {
        selectedId = node.id;
        liveStatus.textContent = `${node.name}, ${messages.generationLabel} ${node.generation}`;
        scheduleDraw();
        onFocus(node.id);
      }
    }
  };
  viewport.addEventListener('pointerup', stopDragging);
  viewport.addEventListener('pointercancel', stopDragging);
  viewport.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    zoomAt(event.clientX - rect.left, event.clientY - rect.top, event.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });
  canvas.addEventListener('keydown', (event) => {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomAt(viewportWidth / 2, viewportHeight / 2, 1.15);
      return;
    }
    if (event.key === '-') {
      event.preventDefault();
      zoomAt(viewportWidth / 2, viewportHeight / 2, 1 / 1.15);
      return;
    }
    const panStep = 42;
    if (event.key === 'ArrowLeft') applyView({ pan: { x: activeView.pan.x + panStep, y: activeView.pan.y } });
    else if (event.key === 'ArrowRight') applyView({ pan: { x: activeView.pan.x - panStep, y: activeView.pan.y } });
    else if (event.key === 'ArrowUp') applyView({ pan: { x: activeView.pan.x, y: activeView.pan.y + panStep } });
    else if (event.key === 'ArrowDown') applyView({ pan: { x: activeView.pan.x, y: activeView.pan.y - panStep } });
    else if (event.key === 'Enter') {
      event.preventDefault();
      if (selectedId) onFocus(selectedId);
      else fitLargest();
    } else return;
    event.preventDefault();
  });

  const observer = new ResizeObserver(resizeCanvas);
  observer.observe(viewport);
  resizeCanvas();
  if (!fitLargestOnMount && activeView.zoom === 1 && activeView.pan.x === 0 && activeView.pan.y === 0) fitLargest();

  return {
    setView: applyView,
    setVisibleAnimalIds(animalIds) {
      visibleAnimalIds = animalIds;
      const filteredEdges = animalIds
        ? graph.edges.filter((edge) => animalIds.has(edge.from) && animalIds.has(edge.to)).length
        : graph.edges.length;
      const visibleCount = animalIds?.size ?? graph.nodes.length;
      filterSummary.hidden = visibleCount === graph.nodes.length && filteredEdges === graph.edges.length;
      filterSummary.textContent = messages.graphFilterSummary
        .replace('{animals}', String(visibleCount))
        .replace('{total}', String(graph.nodes.length))
        .replace('{relationships}', String(filteredEdges));
      scheduleDraw();
    },
    fitAll,
    zoomBy,
  };
}
