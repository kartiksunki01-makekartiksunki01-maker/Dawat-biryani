import { restaurant } from '../data/restaurant';
import type { OrderDetails, ResolvedLine } from '../stores/cartStore';
import { formatINR } from './format';
import { useStorefront } from '../data/menuSync';

const plain = (n: number) => `Rs. ${n}`; // WhatsApp-safe currency text

const fmtDate = (d: string) => {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, day)),
  );
};
const fmtTime = (t: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
};

export function buildOrderMessage(lines: ResolvedLine[], d: OrderDetails, subtotal: number): string {
  const items = lines
    .map((l, i) => {
      const variant = l.showVariant ? ` (${l.variantLabel})` : '';
      const note = l.note ? `\n   Note: ${l.note}` : '';
      return `${i + 1}. ${l.name}${variant} x ${l.qty} = ${plain(l.lineTotal)}${note}`;
    })
    .join('\n');
  const variants = lines.map((l) => (l.showVariant ? `${l.name}: ${l.variantLabel}` : `${l.name}: Standard`)).join('; ');
  const qty = lines.reduce((s, l) => s + l.qty, 0);
  const when = (d.when === 'later' ? [fmtDate(d.date), fmtTime(d.time)].filter(Boolean).join(', ') : '') || 'As soon as possible';

  return [
    `${restaurant.name.toUpperCase()} — ORDER ENQUIRY (not yet placed)`,
    '',
    `Customer Name: ${d.name.trim()}`,
    ...(d.phone.trim() ? [`Contact Number: ${d.phone.trim()}`] : []),
    '',
    'Selected Items:',
    items,
    '',
    `Selected Variants: ${variants}`,
    `Quantity: ${qty} item${qty === 1 ? '' : 's'}`,
    `Estimated Subtotal: ${plain(subtotal)}`,
    `Pickup or Delivery Preference: ${d.mode === 'pickup' ? 'Pickup' : 'Delivery (if available)'}`,
    ...(d.mode === 'delivery' && d.address.trim() ? [`Delivery Address: ${d.address.trim()}`] : []),
    `Preferred Date and Time: ${when}`,
    `Additional Instructions: ${d.instructions.trim() || 'None'}`,
    '',
    'Please confirm availability and final price.',
  ].join('\n');
}

export interface BulkEnquiry {
  kg: number;
  variety: string;
  eventType: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  mode: 'pickup' | 'delivery';
  instructions: string;
}

export function buildBulkMessage(b: BulkEnquiry): string {
  return [
    `${restaurant.name.toUpperCase()} — BULK ORDER ENQUIRY`,
    '',
    `Customer Name: ${b.name.trim()}`,
    `Contact Number: ${b.phone.trim()}`,
    `Food Variety: ${b.variety}`,
    `Quantity: ${b.kg} kg`,
    `Event Type: ${b.eventType}`,
    `Preferred Date and Time: ${[fmtDate(b.date), fmtTime(b.time)].filter(Boolean).join(', ')}`,
    `Pickup or Delivery Preference: ${b.mode === 'pickup' ? 'Pickup' : 'Delivery (if available)'}`,
    `Special Instructions: ${b.instructions.trim() || 'None'}`,
    '',
    'Please share a quotation and confirm availability.',
  ].join('\n');
}

const rsIN = (n: number) => `Rs. ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)}`; // WhatsApp-safe, Indian grouping

export interface BulkOrderDetails {
  eventType: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  mode: 'pickup' | 'delivery';
  instructions: string;
}

/** Multi-dish bulk enquiry text for WhatsApp / copy — every line with kg × price per kg, totals marked as estimates. */
export function buildBulkOrderMessage(lines: { name: string; kg: number; pricePerKg: number }[], d: BulkOrderDetails): string {
  const kg = lines.reduce((a, l) => a + l.kg, 0);
  const total = lines.reduce((a, l) => a + l.kg * l.pricePerKg, 0);
  return [
    `${restaurant.name.toUpperCase()} — BULK & SPECIAL ORDER ENQUIRY`,
    '',
    ...lines.map((l, i) => `${i + 1}. ${l.name}: ${l.kg} kg x ${rsIN(l.pricePerKg)}/kg = ${rsIN(l.kg * l.pricePerKg)}`),
    '',
    `Total Quantity: ${kg} kg`,
    `Estimated Total: ${rsIN(total)} (estimate — final price to be confirmed by the restaurant)`,
    '',
    `Customer Name: ${d.name.trim() || '—'}`,
    `Contact Number: ${d.phone.trim() || '—'}`,
    `Event Type: ${d.eventType}`,
    `Preferred Date and Time: ${[fmtDate(d.date), fmtTime(d.time)].filter(Boolean).join(', ') || 'To be discussed'}`,
    `Pickup or Delivery Preference: ${d.mode === 'pickup' ? 'Pickup' : 'Delivery (if available)'}`,
    `Special Instructions: ${d.instructions.trim() || 'None'}`,
    '',
    'Please confirm availability and share the final quotation.',
  ].join('\n');
}

/** WhatsApp number: admin setting when loaded, otherwise the built-in one. Digits only, country code first. */
export const waNumber = () => {
  const n = useStorefront.getState().restaurant?.whatsapp_number ?? restaurant.whatsapp.number;
  return String(n).replace(/\D/g, '');
};

/**
 * Click-to-chat link. Used only as a real <a href> tapped by the customer (see WhatsAppLink):
 * same tab on phones/tablets (in-app browsers ignore new-tab links), new tab on desktop.
 * Never window.open(…, 'noopener'), which Chrome blocks silently.
 */
export const whatsappUrl = (text: string) => `https://wa.me/${waNumber()}?text=${encodeURIComponent(text)}`;
/** WhatsApp Web (desktop browsers / devices without the app). */
export const whatsappWebUrl = (text: string) => `https://web.whatsapp.com/send?phone=${waNumber()}&text=${encodeURIComponent(text)}`;
/** Direct app scheme (only offered in the fallback panel on phones; does nothing if the app is missing). */
export const whatsappAppUrl = (text: string) => `whatsapp://send?phone=${waNumber()}&text=${encodeURIComponent(text)}`;
export const waDisplayNumber = () => `+${waNumber()}`;
export const isMobileUA = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

export const telUrl = `tel:${restaurant.phone.e164}`;

/* ───────────── WhatsApp message templates ───────────── */
export const waTemplates = {
  general: () => `Namaste! I have a question for ${restaurant.name}.`,
  menu: (item?: string) =>
    item ? `Namaste! I'd like to know the price and availability of ${item} at ${restaurant.name}.` : `Namaste! Could you share today's menu at ${restaurant.name}?`,
  delivery: () => `Namaste! Do you deliver to my area? My location / landmark: `,
  orderSupport: (bill: string) => `Namaste! I need help with my order ${bill} at ${restaurant.name}.`,
  orderConfirm: (bill: string, total: string) =>
    `Namaste! I placed order ${bill} (total ${total}) on the ${restaurant.name} website. Could you please confirm it?`,
};

export const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
  restaurant.mapsQuery,
)}`;

export const enquireItemMessage = (itemName: string) => waTemplates.menu(itemName);

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers / insecure contexts
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export { formatINR };
