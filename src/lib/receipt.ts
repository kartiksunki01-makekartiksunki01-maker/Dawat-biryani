// Receipt output: printable HTML, a PDF (jsPDF, loaded only when asked) and a shareable text summary.
// All values come from the stored order (price snapshots), so later menu changes never alter a receipt.
import { PAYMENT_LABEL, STATUS_LABEL, type OrderJSON } from './api';
import { asset } from '../utils/format';

const rs = (n: number) => `Rs. ${Number(n).toFixed(2).replace(/\.00$/, '')}`;
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
    : '';

export const whenText = (o: OrderJSON) => (o.scheduled_for ? fmtDateTime(o.scheduled_for) : 'As soon as possible');

const lineLabel = (i: OrderJSON['items'][number]) => `${i.name}${i.variant_label ? ` (${i.variant_label})` : ''}`;

export function receiptText(o: OrderJSON): string {
  const r = o.receipt;
  return [
    `${r?.restaurant ?? 'Dawat Biryani House'} — ${r?.title ?? 'Order Receipt'}`,
    `Bill No: ${o.bill_number}`,
    `Date: ${fmtDateTime(o.created_at)}`,
    `Name: ${o.customer_name}`,
    `${o.mode === 'pickup' ? 'Pickup' : 'Delivery'}: ${whenText(o)}`,
    '',
    ...o.items.map((i) => `${i.qty} x ${lineLabel(i)} = ${rs(i.line_total)}`),
    '',
    `Subtotal: ${rs(o.subtotal)}`,
    ...(o.discount > 0 ? [`Discount${o.coupon_code ? ` (${o.coupon_code})` : ''}: -${rs(o.discount)}`] : []),
    ...(o.delivery_charge > 0 ? [`Delivery: ${rs(o.delivery_charge)}`] : []),
    ...(o.tax > 0 ? [`Tax: ${rs(o.tax)}`] : []),
    `Total: ${rs(o.total)}`,
    `Payment: ${PAYMENT_LABEL[o.payment_status]} · Status: ${STATUS_LABEL[o.status]}`,
  ].join('\n');
}

export function receiptHtml(o: OrderJSON, logoUrl: string): string {
  const r = o.receipt;
  const rows = o.items
    .map((i) => `<tr><td>${esc(lineLabel(i))}${i.note ? `<div class="note">${esc(i.note)}</div>` : ''}</td><td class="c">${i.qty}</td><td class="r">${esc(rs(i.unit_price))}</td><td class="r">${esc(rs(i.line_total))}</td></tr>`)
    .join('');
  const tot = (k: string, v: string, cls = '') => `<tr class="${cls}"><td colspan="3">${esc(k)}</td><td class="r">${esc(v)}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.bill_number)}</title><style>
  @page{size:A5;margin:12mm}*{box-sizing:border-box}body{font-family:Georgia,'Times New Roman',serif;color:#14100c;background:#fff;margin:0}
  .card{max-width:520px;margin:0 auto;border:1.5px solid #b8892b;padding:22px 24px;background:#fffaf0}
  .head{text-align:center;border-bottom:1px solid #b8892b;padding-bottom:12px}.head img{width:64px;height:64px;border-radius:50%}
  h1{font-size:20px;margin:6px 0 2px;letter-spacing:.04em}.muted{color:#5c5146;font-size:11px;line-height:1.5}
  .title{font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#8a6516;margin-top:8px}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:12px;margin:14px 0}.meta b{display:block;font-size:10px;color:#8a6516;text-transform:uppercase;letter-spacing:.08em;font-weight:normal}
  table{width:100%;border-collapse:collapse;font-size:12px}th{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#8a6516;border-bottom:1px solid #b8892b;padding:6px 2px;text-align:left}
  td{padding:6px 2px;border-bottom:1px dotted #d9c79e;vertical-align:top}.r{text-align:right}.c{text-align:center}.note{font-size:10px;color:#6b5d4f;font-style:italic}
  .grand td{font-size:15px;font-weight:bold;border-top:1.5px solid #b8892b;border-bottom:none;padding-top:9px}
  .foot{text-align:center;margin-top:16px;font-size:12px}.small{font-size:10px;color:#6b5d4f;margin-top:6px}
  </style></head><body><div class="card">
  <div class="head"><img src="${esc(logoUrl)}" alt=""><h1>${esc(r?.restaurant ?? 'Dawat Biryani House')}</h1>
  <div class="muted">${esc(r?.address ?? '')}<br>Phone: ${esc(r?.phone ?? '')}${r?.gstin ? `<br>GSTIN: ${esc(r.gstin)}` : ''}</div>
  <div class="title">${esc(r?.title ?? 'Order Receipt')}</div></div>
  <div class="meta"><div><b>Bill number</b>${esc(o.bill_number)}</div><div><b>Order date</b>${esc(fmtDateTime(o.created_at))}</div>
  <div><b>Customer</b>${esc(o.customer_name)}</div><div><b>${o.mode === 'pickup' ? 'Pickup' : 'Delivery'}</b>${esc(whenText(o))}</div>
  ${o.mode === 'delivery' && o.delivery_address ? `<div style="grid-column:span 2"><b>Delivery address</b>${esc(o.delivery_address)}</div>` : ''}
  <div><b>Order status</b>${esc(STATUS_LABEL[o.status])}</div><div><b>Payment</b>${esc(PAYMENT_LABEL[o.payment_status])}</div>
  <div style="grid-column:span 2"><b>Order reference</b>${esc(o.id)}</div></div>
  <table><thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>${rows}
  ${tot('Subtotal', rs(o.subtotal))}${o.discount > 0 ? tot(`Discount${o.coupon_code ? ` (${o.coupon_code})` : ''}`, `- ${rs(o.discount)}`) : ''}
  ${o.delivery_charge > 0 ? tot('Delivery charges', rs(o.delivery_charge)) : ''}${o.tax > 0 ? tot('Tax', rs(o.tax)) : ''}
  ${tot('Grand total', rs(o.total), 'grand')}</tbody></table>
  ${o.instructions ? `<p class="small"><b>Instructions:</b> ${esc(o.instructions)}</p>` : ''}
  <div class="foot">${esc(r?.footer ?? 'Thank you!')}<div class="small">This is an order receipt, not a tax invoice. Payment status is recorded by the restaurant.</div></div>
  </div></body></html>`;
}

/** Print through a hidden frame — no pop-up window, the 3D page stays untouched. */
export function printReceipt(o: OrderJSON): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const logo = new URL(asset('assets/images/logo-256.png'), document.baseURI).toString();
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(receiptHtml(o, logo));
    doc.close();
    const go = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } finally {
        window.setTimeout(() => {
          frame.remove();
          resolve();
        }, 1000);
      }
    };
    const img = doc.querySelector('img');
    if (img && !img.complete) {
      img.onload = go;
      img.onerror = go;
    } else go();
  });
}

async function logoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(asset('assets/images/logo-256.png'));
    const blob = await res.blob();
    return await new Promise((ok) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result));
      fr.onerror = () => ok(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function downloadReceiptPdf(o: OrderJSON): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const W = 148, M = 12, gold: [number, number, number] = [184, 137, 43], ink: [number, number, number] = [20, 16, 12];
  const r = o.receipt;
  let y = 12;
  const page = () => {
    doc.setFillColor(255, 250, 240);
    doc.rect(0, 0, W, 210, 'F');
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.5);
    doc.rect(6, 6, W - 12, 198);
  };
  const need = (h: number) => {
    if (y + h > 196) {
      doc.addPage();
      page();
      y = 14;
    }
  };
  page();
  const logo = await logoDataUrl();
  if (logo) doc.addImage(logo, 'PNG', W / 2 - 9, y, 18, 18);
  y += logo ? 23 : 4;
  doc.setTextColor(...ink).setFont('times', 'bold').setFontSize(15).text(r?.restaurant ?? 'Dawat Biryani House', W / 2, y, { align: 'center' });
  y += 5;
  doc.setFont('times', 'normal').setFontSize(8).setTextColor(92, 81, 70);
  const addr = doc.splitTextToSize(r?.address ?? '', W - 2 * M - 10);
  doc.text(addr, W / 2, y, { align: 'center' });
  y += addr.length * 3.4;
  doc.text(`Phone: ${r?.phone ?? ''}${r?.gstin ? `   GSTIN: ${r.gstin}` : ''}`, W / 2, y, { align: 'center' });
  y += 5;
  doc.setTextColor(...gold).setFontSize(8).text((r?.title ?? 'Order Receipt').toUpperCase(), W / 2, y, { align: 'center', charSpace: 1 });
  y += 3;
  doc.setDrawColor(...gold).line(M, y, W - M, y);
  y += 6;
  const meta: [string, string][] = [
    ['Bill number', o.bill_number],
    ['Order date', fmtDateTime(o.created_at)],
    ['Customer', o.customer_name],
    [o.mode === 'pickup' ? 'Pickup' : 'Delivery', whenText(o)],
    ['Order status', STATUS_LABEL[o.status]],
    ['Payment', PAYMENT_LABEL[o.payment_status]],
  ];
  meta.forEach(([k, v], i) => {
    const x = i % 2 === 0 ? M : W / 2 + 2;
    doc.setFontSize(6.5).setTextColor(...gold).text(k.toUpperCase(), x, y);
    doc.setFontSize(9).setTextColor(...ink).text(doc.splitTextToSize(v, W / 2 - M - 2)[0], x, y + 4);
    if (i % 2 === 1) y += 10;
  });
  if (o.mode === 'delivery' && o.delivery_address) {
    doc.setFontSize(6.5).setTextColor(...gold).text('DELIVERY ADDRESS', M, y);
    const a = doc.splitTextToSize(o.delivery_address, W - 2 * M);
    doc.setFontSize(9).setTextColor(...ink).text(a, M, y + 4);
    y += 5 + a.length * 4;
  }
  doc.setFontSize(6.5).setTextColor(...gold).text('ORDER REFERENCE', M, y);
  doc.setFontSize(7.5).setTextColor(...ink).text(o.id, M, y + 4);
  y += 10;
  // items
  doc.setFontSize(7).setTextColor(...gold);
  doc.text('ITEM', M, y);
  doc.text('QTY', 92, y, { align: 'center' });
  doc.text('PRICE', 114, y, { align: 'right' });
  doc.text('AMOUNT', W - M, y, { align: 'right' });
  y += 2;
  doc.line(M, y, W - M, y);
  y += 5;
  doc.setTextColor(...ink).setFontSize(9);
  for (const i of o.items) {
    const name = doc.splitTextToSize(lineLabel(i), 70);
    need(name.length * 4 + (i.note ? 4 : 0) + 3);
    doc.text(name, M, y);
    doc.text(String(i.qty), 92, y, { align: 'center' });
    doc.text(rs(i.unit_price), 114, y, { align: 'right' });
    doc.text(rs(i.line_total), W - M, y, { align: 'right' });
    y += name.length * 4;
    if (i.note) {
      doc.setFontSize(7).setTextColor(107, 93, 79).text(doc.splitTextToSize(`Note: ${i.note}`, 70)[0], M, y);
      doc.setFontSize(9).setTextColor(...ink);
      y += 4;
    }
    y += 1.5;
  }
  need(40);
  doc.setDrawColor(...gold).line(M, y, W - M, y);
  y += 5;
  const tot = (k: string, v: string, bold = false) => {
    doc.setFont('times', bold ? 'bold' : 'normal').setFontSize(bold ? 12 : 9.5);
    doc.text(k, 70, y);
    doc.text(v, W - M, y, { align: 'right' });
    y += bold ? 7 : 5;
  };
  tot('Subtotal', rs(o.subtotal));
  if (o.discount > 0) tot(`Discount${o.coupon_code ? ` (${o.coupon_code})` : ''}`, `- ${rs(o.discount)}`);
  if (o.delivery_charge > 0) tot('Delivery charges', rs(o.delivery_charge));
  if (o.tax > 0) tot('Tax', rs(o.tax));
  y += 1;
  tot('Grand total', rs(o.total), true);
  doc.setFont('times', 'italic').setFontSize(9.5).setTextColor(...ink);
  need(16);
  doc.text(doc.splitTextToSize(r?.footer ?? 'Thank you!', W - 2 * M), W / 2, y + 3, { align: 'center' });
  doc.setFont('times', 'normal').setFontSize(7).setTextColor(107, 93, 79);
  doc.text('This is an order receipt, not a tax invoice. Payment status is recorded by the restaurant.', W / 2, y + 10, { align: 'center' });
  doc.save(`${o.bill_number}.pdf`);
}
