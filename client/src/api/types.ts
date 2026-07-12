// טיפוסי הנתונים המוחזרים מה-API.

export interface Variant {
  entityId: string;
  catalogNumber: string;
  description: string | null;
  entitlementFrequency: string | null;
  quantityPerPeriod: string | null;
  maxQuantity: string | null;
  entitledTypeRaw: string | null;
  entitledType: number;
  amountTypeRaw: string | null;
  amountType: number;
  baseLevel: number;
  exceptionLevel: number;
  exceptionPercent: string | null;
  amount: string | null;
  catalogPricelistNum: string | null;
  history_count?: number;
  supplier_count?: number;
}

export interface MaktGroup {
  catalogNumber: string;
  description: string | null;
  variant_count: number;
  supplier_count: number;
  variants: Variant[];
}

export interface SearchResponse {
  query: string;
  match: string;
  field: string;
  count: number;
  items: Variant[];
  group_count?: number;
  groups?: MaktGroup[];
}

export interface Supplier {
  modSupplierId: string;
  rehabSupplierId: string | null;
  name: string | null;
  city: string | null;
  street: string | null;
  mobile: string | null;
  workPhone: string | null;
  landline: string | null;
  email: string | null;
  profession: string | null;
  specialization: string | null;
  subSpecialization: string | null;
  therapeuticApproach: string | null;
  validFrom: string | null;
  validTo: string | null;
  district: string | null;
  isActiveAgreement?: boolean;
  distance_km?: number | null;
  proximity_label?: string;
  is_nearest?: boolean;
}

export interface HistoryEntry {
  id: number;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
  syncRun?: { filename: string | null; fileType: string } | null;
}

export interface ItemDetail extends Variant {
  authorized_suppliers: Supplier[];
  change_history: HistoryEntry[];
  special_note?: string;
}

export interface AiResult {
  catalogNumber: string;
  description: string | null;
  variant_count: number;
  supplier_count: number;
  variants: Variant[];
  suppliers: Supplier[];
  nearest_supplier: Supplier | null;
  supplier_note: string | null;
}

export interface AiSearchResponse {
  query: string;
  parsed: { explanation: string; product_terms: string[]; location_normalized: string | null };
  engine: string;
  count: number;
  user_location?: string | null;
  results: AiResult[];
  message: string | null;
}

export interface ChatContext {
  makat?: string | null;
  product?: string | null;
  awaitingLocation?: boolean;
  location?: string | null;
}

export interface ChatResponse {
  intent: 'search' | 'suppliers' | 'contact';
  reply: string;
  results?: AiResult[];
  suppliers?: Supplier[];
  quickReplies?: string[];
  followup?: 'location' | null;
  context: ChatContext;
}

export interface UnansweredRow {
  id: number;
  query: string;
  rawSample: string | null;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

export interface SynonymRow {
  id: number;
  term: string;
  target: string;
  createdAt: string;
}

export interface SyncSummary {
  new: number;
  updated: number;
  deleted: number;
  unchanged: number;
}
export interface PlanRow {
  key: string;
  label: Record<string, unknown>;
  changes?: { field: string; old: string | null; new: string | null }[];
  restored?: boolean;
}
export interface SyncPlan {
  fileType: string;
  filename: string;
  summary: SyncSummary;
  new: PlanRow[];
  updated: PlanRow[];
  deleted: PlanRow[];
  unchanged_count: number;
}
export interface SyncRun {
  id: number;
  fileType: string;
  filename: string | null;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  addedCount: number;
  updatedCount: number;
  deletedCount: number;
  unchangedCount: number;
  errorMessage: string | null;
}
export interface ConfigMapRow {
  id: number;
  field: string;
  textValue: string;
  intValue: number;
}
