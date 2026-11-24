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

/** Images: JPG / PNG / WebP up to 5 MB (also enforced by the storage bucket). */
export function uploadImage(sb: SupabaseClient, file: File, folder: string) {
  if (!IMG.includes(file.type)) return Promise.resolve({ error: 'Please choose a JPG, PNG or WebP image.' } as const);
  if (file.size > 5 * 1024 * 1024) return Promise.resolve({ error: 'Image is larger than 5 MB.' } as const);
  return put(sb, 'images', file, folder);
}

/** Audio: MP3 / OGG / M4A / AAC / WAV up to 15 MB. */
export function uploadAudio(sb: SupabaseClient, file: File) {
  if (!AUDIO.includes(file.type)) return Promise.resolve({ error: 'Please choose an MP3, OGG, M4A, AAC or WAV file.' } as const);
  if (file.size > 15 * 1024 * 1024) return Promise.resolve({ error: 'Audio file is larger than 15 MB.' } as const);
  return put(sb, 'audio', file, 'music');
}
