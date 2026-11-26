import type { SupabaseClient } from '@supabase/supabase-js';

const IMG = ['image/jpeg', 'image/png', 'image/webp'];
const AUDIO = ['audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/wav'];

async function put(sb: SupabaseClient, bucket: 'images' | 'audio', file: File, folder: string): Promise<{ url: string } | { error: string }> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
  const path = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (error) return { error: `Upload failed: ${error.message}` };
  return { url: sb.storage.from(bucket).getPublicUrl(path).data.publicUrl };
}

const MAX_EDGE = 1600;          // longest side after shrinking — plenty for a menu card, small to download
const SHRINK_ABOVE = 1.2 * 1024 * 1024; // photos under ~1.2 MB are uploaded exactly as chosen

/**
 * Phone photos are often 4–12 MB, more than the 5 MB limit. Big images are shrunk in the browser
 * (longest side 1600 px, WebP/JPEG) so any normal photo can be used. Small images are left untouched.
 */
async function shrinkImage(file: File): Promise<{ file: File } | { error: string }> {
  const bad = { error: 'This photo could not be read. Please choose a JPG, PNG or WebP picture (iPhone “HEIC” photos: share them as JPG first).' } as const;
  if (typeof createImageBitmap !== 'function') return IMG.includes(file.type) ? { file } : bad;   // very old browser: upload as chosen (size is checked below)
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  } catch { return bad; }
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size <= SHRINK_ABOVE && IMG.includes(file.type)) return { file };
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return bad;
    ctx.drawImage(bmp, 0, 0, w, h);
    const toBlob = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
    let blob = await toBlob('image/webp', 0.86);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.86);   // e.g. older Safari cannot write WebP
    if (!blob) return bad;
    const base = (file.name.replace(/\.[^.]+$/, '') || 'photo').slice(0, 40);
    return { file: new File([blob], `${base}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`, { type: blob.type }) };
  } finally { bmp.close(); }
}

/** Images: JPG / PNG / WebP (large photos are shrunk automatically); the 5 MB limit is also enforced by the storage bucket. */
export async function uploadImage(sb: SupabaseClient, file: File, folder: string): Promise<{ url: string } | { error: string }> {
  if (!file.type.startsWith('image/')) return { error: 'Please choose a picture (JPG, PNG or WebP).' };
  const r = await shrinkImage(file);
  if ('error' in r) return r;
  if (!IMG.includes(r.file.type)) return { error: 'Please choose a JPG, PNG or WebP image.' };
  if (r.file.size > 5 * 1024 * 1024) return { error: 'This picture is still larger than 5 MB after shrinking. Please choose a smaller one.' };
  return put(sb, 'images', r.file, folder);
}

/** Audio: MP3 / OGG / M4A / AAC / WAV up to 15 MB. */
export function uploadAudio(sb: SupabaseClient, file: File) {
  if (!AUDIO.includes(file.type)) return Promise.resolve({ error: 'Please choose an MP3, OGG, M4A, AAC or WAV file.' } as const);
  if (file.size > 15 * 1024 * 1024) return Promise.resolve({ error: 'Audio file is larger than 15 MB.' } as const);
  return put(sb, 'audio', file, 'music');
}
