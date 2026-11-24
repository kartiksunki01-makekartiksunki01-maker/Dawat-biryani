import { publicClient } from './supabase';

export interface LeadInput {
  kind: 'cart' | 'bulk' | 'contact';
  name?: string;
  phone?: string;
  message?: string;
  payload?: Record<string, unknown>;
}

/**
 * Saves an enquiry as a lead. Best effort: it never blocks or breaks the WhatsApp flow,
 * and does nothing when the backend is not configured.
 */
export function saveLead(lead: LeadInput): void {
  if (!publicClient) return;
  void publicClient
    .from('leads')
    .insert({
      kind: lead.kind,
      name: lead.name?.trim().slice(0, 100) || null,
      phone: lead.phone?.trim().slice(0, 20) || null,
      message: lead.message?.slice(0, 2000) || null,
      payload: lead.payload ?? {},
    })
    .then(
      () => undefined,
      () => undefined,
    );
}
