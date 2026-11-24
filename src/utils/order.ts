import { restaurant } from '../data/restaurant';
import type { OrderDetails, ResolvedLine } from '../stores/cartStore';
import { formatINR } from './format';

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
  const when = [fmtDate(d.date), fmtTime(d.time)].filter(Boolean).join(', ') || 'As soon as possible';

  return [
    `${restaurant.name.toUpperCase()} — ORDER ENQUIRY`,
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

export const whatsappUrl = (text: string) =>
  `https://wa.me/${restaurant.whatsapp.number}?text=${encodeURIComponent(text)}`;

export const telUrl = `tel:${restaurant.phone.e164}`;

export const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
  restaurant.mapsQuery,
)}`;

export const enquireItemMessage = (itemName: string) =>
  `Namaste! I'd like to know the price and availability of ${itemName} at ${restaurant.name}.`;

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
