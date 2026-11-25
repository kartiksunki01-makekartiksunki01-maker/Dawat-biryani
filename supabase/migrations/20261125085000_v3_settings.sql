-- Dawat Biryani House — V3 settings (data-only, safe to re-run; never overwrites a value the admin chose).
-- 1. Owner-confirmed WhatsApp number (25 Nov 2026): +91 97668 88897. Changed ONLY if it is still the old
--    default or empty. The phone number used for calls (+91 98233 24553) is not changed.
update public.restaurant_settings
   set whatsapp_number = '919766888897',
       whatsapp_confirmed = true
 where id = 1
   and (whatsapp_number is null or whatsapp_number = '919823324553');

-- 2. The new logo intro runs 2–3 s. Lift the old 1.8 s default to 2.4 s (only if still below 2 s).
update public.website_settings
   set intro_duration_ms = 2400
 where id = 1
   and intro_duration_ms < 2000;
-- (Both tables have audit triggers, so these changes appear in Admin → Activity log.)
