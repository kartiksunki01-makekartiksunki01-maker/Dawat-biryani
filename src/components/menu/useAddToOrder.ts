import { useCallback } from 'react';
import { menu } from '../../data/restaurant';
import { useCart } from '../../stores/cartStore';
import { useHost } from '../../stores/hostStore';
import { useUI } from '../../stores/uiStore';
import { sound } from '../../utils/sound';

export function useAddToOrder() {
  const add = useCart((s) => s.add);
  const showToast = useUI((s) => s.showToast);
  const say = useHost((s) => s.say);
  return useCallback(
    (itemId: string, variantId: string, qty: number, note?: string) => {
      const item = menu.find((m) => m.id === itemId);
      const variant = item?.variants.find((v) => v.id === variantId);
      if (!item || !variant) return;
      add(itemId, variantId, qty, note);
      sound.play('add');
      const v = item.variants.length > 1 ? ` (${variant.label})` : '';
      showToast(`Added ${item.name}${v} × ${qty}`);
      say('added');
    },
    [add, showToast, say],
  );
}
