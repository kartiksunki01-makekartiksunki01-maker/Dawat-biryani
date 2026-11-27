// Thin, honest wrappers around the public database functions.
// Every call resolves with real data or throws an ApiError that says what actually happened.
import { publicClient } from './supabase';

export interface Issue {
  code: string;
  message: string;
  variant_id?: string;
  new_price?: number;
  /** bulk enquiries */
  bulk_id?: string;
  name?: string;
  old_price?: number;
}

export type ApiErrorKind =
  | 'unavailable' // backend not configured
  | 'timeout' //     no answer in time — the outcome is UNKNOWN
  | 'network' //     request did not get a response — outcome UNKNOWN
  | 'rejected' //    the server answered "no" — nothing was stored
  | 'rate_limited';

export class ApiError extends Error {
  kind: ApiErrorKind;
  issues: Issue[];
  hint?: string;
  constructor(kind: ApiErrorKind, message: string, issues: Issue[] = [], hint?: string) {
    super(message);
    this.kind = kind;
    this.issues = issues;
    this.hint = hint;
  }
  /** true when we cannot know whether the server stored the request */
  get uncertain() {
    return this.kind === 'timeout' || this.kind === 'network';
  }
}

const parseIssues = (details: unknown): Issue[] => {
  if (typeof details !== 'string' || !details.startsWith('[')) return [];
  try {
    const v = JSON.parse(details);
    return Array.isArray(v) ? (v as Issue[]) : [];
  } catch {
    return [];
  }
};

export async function rpc<T>(fn: string, args: Record<string, unknown>, timeoutMs = 20000): Promise<T> {
  if (!publicClient) throw new ApiError('unavailable', 'Online ordering is not connected right now.');
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const { data, error } = await publicClient.rpc(fn, args).abortSignal(ctrl.signal);
    if (error) {
      if (ctrl.signal.aborted) throw new ApiError('timeout', 'The restaurant’s server did not answer in time.');
      const pgCode = (error as { code?: string }).code ?? '';
      // A Postgres error code means the database answered — the request was refused and nothing was stored.
      if (/^[0-9A-Z]{5}$/.test(pgCode)) {
        if (error.message === 'rate_limited') {
          throw new ApiError('rate_limited', error.hint || 'Too many requests. Please wait a few minutes.', [], error.hint ?? undefined);
        }
        const issues = parseIssues(error.details);
        const msg = issues[0]?.message || error.hint || 'The restaurant could not accept this request.';
        throw new ApiError('rejected', msg, issues, error.hint ?? undefined);
      }
      throw new ApiError('network', 'Could not reach the restaurant’s server. Check your internet connection.');
    }
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (ctrl.signal.aborted) throw new ApiError('timeout', 'The restaurant’s server did not answer in time.');
    throw new ApiError('network', 'Could not reach the restaurant’s server. Check your internet connection.');
  } finally {
    window.clearTimeout(timer);
  }
}

/* ───────────────────────── order types ───────────────────────── */
export type OrderStatus =
  | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'completed' | 'cancelled' | 'rejected';

export interface OrderJSON {
  id: string;
  bill_number: string;
  created_at: string;
  order_date: string;
  customer_name: string;
  customer_phone: string | null;
  mode: 'pickup' | 'delivery';
  delivery_address: string | null;
  scheduled_for: string | null;
  instructions: string | null;
  status: OrderStatus;
  status_reason: string | null;
  payment_status: 'unpaid' | 'paid' | 'refunded';
  prep_minutes: number | null;
  subtotal: number;
  discount: number;
  delivery_charge: number;
  tax: number;
  total: number;
  coupon_code: string | null;
  updated_at: string;
  receipt: { title: string; restaurant: string; address: string; phone: string; phone_e164: string; whatsapp: string | null; gstin: string | null; footer: string } | null;
  items: { name: string; variant_label: string; unit_price: number; qty: number; line_total: number; note: string | null }[];
  history: { status: OrderStatus; at: string }[];
  replayed?: boolean;
}

export interface Quote {
  lines: { variant_id: string; dish_id: string; name: string; variant_label: string; unit_price: number; qty: number; line_total: number }[];
  subtotal: number;
  discount: number;
  offer: { id: string; title: string; code: string | null } | null;
  delivery_charge: number;
  tax: number;
  tax_label: string | null;
  total: number;
  issues: Issue[];
  blocking: boolean;
}

export interface OrderRequest {
  idempotency_key: string;
  access_token: string;
  name: string;
  phone: string;
  mode: 'pickup' | 'delivery';
  address?: string;
  scheduled_for: string | null;
  instructions?: string;
  coupon?: string;
  confirm: boolean;
  items: { variant_id: string; qty: number; expected_price: number; note?: string }[];
}

const num = (o: OrderJSON): OrderJSON => ({
  ...o,
  subtotal: Number(o.subtotal),
  discount: Number(o.discount),
  delivery_charge: Number(o.delivery_charge),
  tax: Number(o.tax),
  total: Number(o.total),
  items: o.items.map((i) => ({ ...i, unit_price: Number(i.unit_price), line_total: Number(i.line_total) })),
});

export const quoteOrder = async (req: Omit<OrderRequest, 'idempotency_key' | 'access_token' | 'name' | 'confirm'>) => {
  const q = await rpc<Quote>('quote_order', { p: req }, 12000);
  return { ...q, subtotal: Number(q.subtotal), discount: Number(q.discount), delivery_charge: Number(q.delivery_charge), tax: Number(q.tax), total: Number(q.total) };
};
export const placeOrder = async (req: OrderRequest) => num(await rpc<OrderJSON>('place_order', { p: req }, 25000));
export const getOrder = async (id: string, token: string) => num(await rpc<OrderJSON>('get_order', { p_order_id: id, p_token: token }));
export const submitEnquiry = (p: { kind: 'bulk' | 'contact'; name: string; phone: string; message: string; payload?: Record<string, unknown> }) =>
  rpc<{ id: string; created_at: string }>('submit_enquiry', { p });

export interface BulkEnquiryRequest {
  idempotency_key: string;
  name: string;
  phone: string;
  items: { id: string; kg: number }[];
  /** prices per kg the customer saw — only used to tell them if a price changed */
  seen_prices: Record<string, number>;
  event_type: string;
  date: string;
  time: string;
  mode: 'pickup' | 'delivery';
  instructions: string;
  consent: boolean;
}
export interface BulkEnquiryResult {
  id: string;
  created_at: string;
  duplicate: boolean;
  total_kg: number;
  estimated_total: number;
  items: { id: string; name: string; kg: number; price_per_kg: number; subtotal: number }[];
}
/** Multi-dish bulk enquiry. The database prices it from its own menu; the result is an enquiry, not an order. */
export const submitBulkEnquiry = async (p: BulkEnquiryRequest) => {
  const r = await rpc<BulkEnquiryResult>('submit_bulk_enquiry', { p }, 20000);
  return { ...r, total_kg: Number(r.total_kg), estimated_total: Number(r.estimated_total),
    items: (r.items ?? []).map((i) => ({ ...i, kg: Number(i.kg), price_per_kg: Number(i.price_per_kg), subtotal: Number(i.subtotal) })) };
};

/** Cryptographically random secrets generated in the customer's browser. */
export const newOrderSecrets = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { idempotency_key: crypto.randomUUID(), access_token: token };
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending confirmation',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};
export const PAYMENT_LABEL = { unpaid: 'Unpaid', paid: 'Paid', refunded: 'Refunded' } as const;
