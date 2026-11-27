import { Camera, Loader2 } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { asset } from '../utils/format';
import { uploadImage } from './sections/upload';
import { useAdmin } from './ui';

/** Picks a photo (gallery or camera on a phone/tablet), shrinks big photos, uploads, then hands back the public link. */
export function usePhotoUpload(folder: string, onDone: (url: string) => void | Promise<void>) {
  const { sb, toast } = useAdmin();
  const [uploading, setUploading] = useState(false);
  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = ''; // lets the same picture be chosen again
    if (!file) return;
    setUploading(true);
    const r = await uploadImage(sb, file, folder);
    if ('error' in r) { setUploading(false); toast(r.error, 'err'); return; }
    try { await onDone(r.url); } finally { setUploading(false); }
  };
  return { uploading, onChange };
}

/** Small photo with a camera strip: tap it, choose a picture, and it is saved straight away. */
export function PhotoTile({ src, name, disabled, folder, onSaved }: { src: string | null; name: string; disabled?: boolean; folder: string; onSaved: (url: string) => Promise<void> }) {
  const { uploading, onChange } = usePhotoUpload(folder, onSaved);
  return (
    <label className={`group relative block h-14 w-14 shrink-0 overflow-hidden rounded-lg ${disabled ? 'pointer-events-none opacity-60' : 'cursor-pointer'} focus-within:ring-2 focus-within:ring-gold`} title={src ? 'Change photo' : 'Add photo'}>
      {src ? <img src={asset(src)} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center bg-white/5 text-[9px] font-semibold uppercase tracking-wide text-ivory/50">No photo</div>}
      <span className="absolute inset-x-0 bottom-0 grid h-5 place-items-center bg-black/65 text-gold">
        {uploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
      </span>
      <input type="file" accept="image/*" className="sr-only" aria-label={`${src ? 'Change' : 'Add'} photo for ${name}`} disabled={uploading || disabled} onChange={(e) => void onChange(e)} />
    </label>
  );
}
