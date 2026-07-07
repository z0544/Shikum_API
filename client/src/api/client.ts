import type {
  AiSearchResponse,
  ConfigMapRow,
  ItemDetail,
  SearchResponse,
  SyncPlan,
  SyncRun,
} from './types';

/** שגיאת API עם הודעה בעברית מהשרת. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `שגיאה ${res.status}`;
    try {
      const body = await res.json();
      detail = body.message || body.detail || detail;
      if (Array.isArray(detail)) detail = detail.join(', ');
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  async searchItems(params: {
    q: string;
    match: string;
    field: string;
    limit?: number;
  }): Promise<SearchResponse> {
    const qs = new URLSearchParams({
      q: params.q,
      match: params.match,
      field: params.field,
      limit: String(params.limit ?? 100),
      grouped: 'true',
    });
    return handle<SearchResponse>(await fetch(`/api/items?${qs}`));
  },

  async getItem(entityId: string): Promise<ItemDetail> {
    return handle<ItemDetail>(await fetch(`/api/item/${encodeURIComponent(entityId)}`));
  },

  async aiSearch(query: string): Promise<AiSearchResponse> {
    return handle<AiSearchResponse>(
      await fetch('/api/ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      }),
    );
  },

  exportSearchUrl(params: { q: string; match: string; field: string }): string {
    const qs = new URLSearchParams({ ...params, limit: '500' });
    return `/api/export/search?${qs}`;
  },
  exportMaktUrl(makt: string, entityId?: string): string {
    const qs = new URLSearchParams(entityId ? { entity_id: entityId } : {});
    const suffix = qs.toString() ? `?${qs}` : '';
    return `/api/export/makt/${encodeURIComponent(makt)}${suffix}`;
  },
  exportAiUrl(query: string): string {
    return `/api/export/ai/search?${new URLSearchParams({ query })}`;
  },

  // --- Admin ---
  async syncPreview(kind: string, file: File, token: string): Promise<SyncPlan> {
    const fd = new FormData();
    fd.append('file', file);
    return handle<SyncPlan>(
      await fetch(`/api/admin/sync/${kind}/preview`, {
        method: 'POST',
        headers: { 'X-Admin-Token': token },
        body: fd,
      }),
    );
  },
  async syncApply(kind: string, file: File, token: string) {
    const fd = new FormData();
    fd.append('file', file);
    return handle<{ status: string; sync_run_id: number; summary: SyncPlan['summary'] }>(
      await fetch(`/api/admin/sync/${kind}/apply`, {
        method: 'POST',
        headers: { 'X-Admin-Token': token },
        body: fd,
      }),
    );
  },
  async syncRuns(token: string): Promise<{ runs: SyncRun[] }> {
    return handle(
      await fetch('/api/admin/sync-runs', { headers: { 'X-Admin-Token': token } }),
    );
  },
  async configList(token: string): Promise<{ items: ConfigMapRow[] }> {
    return handle(
      await fetch('/api/admin/config-map', { headers: { 'X-Admin-Token': token } }),
    );
  },
  async configUpsert(
    row: { field: string; textValue: string; intValue: number },
    token: string,
  ): Promise<ConfigMapRow> {
    return handle(
      await fetch('/api/admin/config-map', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
        body: JSON.stringify(row),
      }),
    );
  },
};
