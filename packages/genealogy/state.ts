export interface AtlasViewState {
  focusId: string | null;
  filters: Record<string, unknown>;
  zoom: number;
  pan: { x: number; y: number };
  selectedGroup: string | null;
  activeProfileId: string | null;
}

export type ViewStateInput = Partial<AtlasViewState>;

function copyState(state: AtlasViewState): AtlasViewState {
  return {
    ...state,
    filters: { ...state.filters },
    pan: { ...state.pan },
  };
}

export function createViewState(initial: ViewStateInput = {}) {
  let current: AtlasViewState = {
    focusId: initial.focusId ?? null,
    filters: { ...(initial.filters ?? {}) },
    zoom: initial.zoom ?? 1,
    pan: { x: initial.pan?.x ?? 0, y: initial.pan?.y ?? 0 },
    selectedGroup: initial.selectedGroup ?? null,
    activeProfileId: initial.activeProfileId ?? null,
  };

  return {
    get(): AtlasViewState {
      return copyState(current);
    },
    update(patch: ViewStateInput): AtlasViewState {
      current = {
        ...current,
        ...patch,
        filters: patch.filters ? { ...current.filters, ...patch.filters } : current.filters,
        pan: patch.pan ? { ...current.pan, ...patch.pan } : current.pan,
      };
      return copyState(current);
    },
    openProfile(id: string): AtlasViewState {
      current = { ...current, activeProfileId: id };
      return copyState(current);
    },
    closeProfile(): AtlasViewState {
      current = { ...current, activeProfileId: null };
      return copyState(current);
    },
  };
}
