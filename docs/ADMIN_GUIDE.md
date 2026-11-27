# Admin panel — aasaan guide (Dawat Biryani House)

Kholo: `https://<aapki-site>/admin` → apna email + password → **Sign in**.
Phone par upar-left ☰ button se menu khulta hai.

## Roz ka kaam (sabse zaroori)
1. **Orders** kholo. Naye order pe sona (gold) border aur **NEW** likha hota hai.
2. **Accept** dabao → order "Confirmed" ho jata hai (customer apne track page par dekh leta hai).
3. Khana banne lage → **Start preparing**. Taiyaar → **Ready for pickup** (ya delivery ho to **Out for delivery**).
4. Customer le gaya → **Complete**.
5. Paisa mila to **Details** → Payment status **Paid** + method (Cash/UPI) → **Save payment**.
   - Sirf tab "Paid" karo jab paisa sach mein mil gaya ho.
6. Kuch khatam ho gaya? **Details → Reject** → reason likho (customer ko dikhta hai).

Bill number (jaise `DBH-20261124-0001`) apne aap banta hai, kabhi repeat nahi hota, aur badla nahi ja sakta.

## Menu Management
- **Mark sold out** — aaj ke liye khatam. Customer add nahi kar payega.
- Price badalna: dish ke naam par tap → price likho → **Save**. Purane bills par purana price hi rahega.
- **Add dish** → naam → phir price/photo bharo → "Show on website" on karo.
- **Dish photo:** Menu list mein har dish ke photo par camera wala chhota patti hai — us par tap karo, gallery se photo chuno ya camera se kheecho, photo turant save ho jaati hai. Dish ke Edit mein bhi upar bada "Add photo / Change photo" button hai. Badi (5 MB se zyada) phone photos apne aap chhoti ho jaati hain.
- **Orders badge:** "Open orders" mein kisi bhi din ke woh saare orders dikhte hain jo abhi tak complete/cancel nahi hue; red number bhi unhi ko ginta hai.
- ⋮ (teen dots) se: chhupana, chef's special, archive, delete.

## Coupons & Discounts
- **Create coupon** → title, % ya ₹, coupon code (ya khaali = automatic), minimum order, end date → "Active" on → **Save offer**.
- Galat/expired coupon customer ko reason ke saath mana ho jata hai.
- Jo offer use ho chuka hai wo delete nahi hota — archive karo.

## Bulk & Special Orders
Is section mein do tab hain:

**1. Bulk Menu & Pricing** (per-kg bulk menu — regular plate prices se bilkul alag)
- Har dish ka **₹/kg**, category, veg/non-veg, photo, min/max kg aur advance notice yahin se badlo → **Edit** → **Save changes**. Naya price turant nayi enquiries par lagta hai; purani enquiries aur bills apne purane price par rehte hain.
- **On website** switch = dish website par dikhe ya chhupe. **Sold out** = dikhegi par order nahi hogi.
- Photo: list mein photo par tap karo (camera patti) → photo chuno → turant save. Jis dish ki photo nahi hai, website par “photo coming soon” dikhta hai — kisi doosri dish ki photo kabhi nahi.
- **Add bulk dish** → naam, category, ₹/kg → dish chhupi hui banti hai → photo/rules bharo → “Show on website” on karo.
- Upar ka **Maximum total per online enquiry** (abhi 20 kg) = customer ek enquiry mein kul kitne kg tak online bhej sakta hai.
- **Apply one rule to every bulk dish** = sab dishes par ek saath min/max kg aur notice ka rule.
- ↑ ↓ = website par order badlo. **Archive** = hata do (record rehta hai, “Archived” filter se wapas la sakte ho).
- Gold “Note” = sirf aapke liye private note. Abhi teen dishes par confirm karne wali baat likhi hai:
  - **Chicken Malai Tikka Biryani**: ₹1,400 per kg WhatsApp screenshot se padha gaya tha. Unit confirm karo, tab “On website” on karo (abhi chhupi hai).
  - **Prawns Biryani**, **Chicken Sukha Lapeta**: spelling confirm karo.

**2. Bulk Order Enquiries**
- Har enquiry mein dish-wise kg, us waqt ka ₹/kg, total kg, estimate, event, date/time, pickup/delivery aur instructions dikhte hain.
- Customer ko **Call / WhatsApp** karo → **Final quotation (₹)** likho (ya **Use estimate**) → **Save quote** → **Confirm quotation**.
- Customer maan gaya → **Convert to order** → bill number + receipt banega + ek private link milega. Wo link customer ko bhejo. Ek enquiry sirf ek baar order banti hai.
- Mana karna ho → **Reject…** (rejected enquiry order nahi ban sakti, jab tak status wapas na badlo).
- Notes: ⋮ → “Show message & notes”. **Export CSV** = har dish ki alag line.

## Customers
- Sab orders se apne aap banta hai. ⋮ se: history, notes, archive, ya **Delete personal data** (naam/phone hat jata hai, bills aur amount rehte hain).

## Notifications
- 🔔 par naya order/enquiry. **Mark all as read**.
- Chaho to "Sound" ya "Browser notifications" on karo (ek baar hi bajta hai, refresh par dobara nahi).

## Settings (Restaurant Settings)
- **Accept online orders** off = ordering band (customer ko "call karo" dikhega).
- Pickup/Delivery, delivery charge, free delivery above, minimum order, khulne-band hone ka time, chhutti ke din, special closing dates.
- WhatsApp number abhi **+91 97668 88897** hai (owner ne confirm kiya). Badalna ho to yahin digits likho, country code ke saath (jaise 919766888897) → Save. Website ke saare WhatsApp buttons turant naye number par chalenge.
- Tax/GST tabhi on karo jab accountant bole. Jhootha GSTIN kabhi mat daalo.

## Website Appearance / Music & Animations
- Announcement banner (jaise "25 Dec ko band").
- Music upload (sirf apna ya licensed music), volume, aur **Intro video** on/off. Intro ab Dawat ki ~10 sec ki brand video hai (muted shuru hoti hai, "Sound" button se awaaz on). "Skip intro" kabhi bhi daba sakte ho; ek session mein sirf ek baar aati hai. Video ki lambai video se hi aati hai, isliye time wala slider hata diya. "Preview intro" se dekh lo.

## Account & Security
- Password badlo (10+ characters).
- Phone kho gaya? **Sign out on all devices**.
- **Activity log** mein dikhta hai kisne kya badla.

## Kuch gadbad ho to
- Error message laal box mein aata hai — usme likha hota hai kya hua. Dobara try karo.
- Internet chala gaya ho to "Network problem" aayega — kuch save nahi hua hota, dobara karo.

## Live Chat (naya)
- Sidebar → **Live Chat**. Upar "Available for chat" ON karo — tabhi website par "Online" dikhega (admin panel khula rehna chahiye; panel band karne ke 5 minute baad website khud "Offline" dikhati hai).
- Messages turant aate-jaate hain (live). Upar "Live updates connected." likha ho to sab theek hai.
- Customer ka message aate hi list mein red number dikhta hai. Click karo → reply likho → Enter.
- **Resolve** = kaam ho gaya, **Archive** = list se hata do. Customer dobara likhe to chat khud wapas khul jaati hai.
- **Chat settings**: welcome message, offline message, chat widget on/off, chats kitne din rakhne hain.
- Coupon: **Coupons & Discounts** → Create coupon → code (jaise DAWAT10), % ya ₹, minimum order, maximum discount, last date, total limit / ek phone kitni baar → Active ON → Save. "View usage" se dekho kis bill par use hua.
- Jo coupon ek baar bhi use ho chuka hai wo **delete nahi hota, archive hota hai** — taaki purane bills sahi rahein.

## Delete karna, Select all (V3.7)
- Har list (Orders, Customers, Enquiries, Bulk, Menu, Coupons, Live Chat, Notifications, Media) me har row ke aage **checkbox** hai. Upar **Select all** aur **Delete selected** aata hai.
- Delete se pehle ek box khulta hai: kya hoga woh likha hota hai, **Download CSV first** button hota hai (pehle backup le lo), aur 5 se zyada items pe **DELETE** type karna padta hai. Delete **hamesha ke liye** hota hai — wapas nahi aata.
- **Chalu orders (pending, confirmed, preparing, ready, out for delivery) delete nahi ho sakte.** Sirf completed / cancelled / rejected.
- Order delete karne par bill number, date, amount aur payment **Bills & Receipts → Deleted bills register** me reh jaata hai (hisaab ke liye). Customer ka naam/phone hat jaata hai. Bill number kabhi dobara use nahi hota.
- Customer delete karne par uska record hat jaata hai, par uske orders "Deleted customer" naam se bache rehte hain (hisaab ke liye). Jis customer ka order abhi chal raha hai, woh skip hota hai.
- Order ke andar **Edit details**: naam, phone, address, instructions badal sakte ho. Amount aur items lock rehte hain.
- Coupon jo abhi Live hai aur use ho chuka hai: delete karne par pehle band hota hai, phir delete. Purane bills me coupon code aur discount bacha rehta hai.

## Media & Storage (naya)
- Saari upload ki hui photos/audio, size aur **kahan use ho rahi hai** dikhata hai.
- Jo file kahin use ho rahi hai, use tick nahi kar sakte. **Unused** filter se bekaar files dekh ke delete karo.
- 400 KB se badi photo pe **Make smaller** dabao: chhoti copy ban jaati hai aur dish/coupon apne aap nayi photo pe chala jaata hai.

## Data Cleanup (naya)
- Har cheez ke liye "Remove after" (Never / 30 / 60 / 90 / 180 / 365 din) chuno, **Save settings** dabao.
- Har line ke aage "N now" batata hai abhi kitne records hatenge. **Download CSV** se pehle list le lo, phir **Clean up now…**.
- **Automatic clean-up** switch shuru me **OFF** hai. ON karoge to din me ek baar, jab aap admin panel khologe, purane records apne aap hat jaayenge. Chalu orders, naye enquiries aur open chats kabhi nahi hat-te.

