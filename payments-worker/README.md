# VKMUSICX — Telegram Stars backend

Bu papkadagi alohida Cloudflare Worker Mini App dizaynini o‘zgartirmaydi va `vkpremiumrus` sayt Worker’iga tegmaydi. Worker PRO — ⭐99/30 kun va PREMIUM — ⭐299/30 kun recurring invoice yaratadi. To‘lov faqat Telegram `successful_payment` update’i kelgach faollashadi; D1’da buyurtma, to‘lov va obuna holati saqlanadi. `/cancel` avtomatik uzaytirishni to‘xtatadi, joriy to‘langan muddat esa tugatib beriladi.

## Ishga tushirish

Faqat bot tokenini Cloudflare’ga qo‘yish yetmaydi. D1 baza, Worker deployment/binding va bot webhook ham sozlanishi shart.

1. Ushbu repozitoriyani kompyuterga clone qiling; Node.js o‘rnatilgan bo‘lsin. Terminalda `payments-worker` papkasiga kiring:

   ```bash
   cd vkpremiumru/payments-worker
   npx wrangler login
   ```

   `npx wrangler login` Cloudflare hisobiga ruxsat so‘raydi.

2. D1 bazasini yarating:

   ```bash
   npx wrangler d1 create vkmusicx_stars
   ```

   Natijada ko‘rsatilgan `database_id` ni `wrangler.toml` ichidagi `REPLACE_WITH_D1_DATABASE_ID` o‘rniga qo‘ying. Bu ID maxfiy token emas.

3. Jadval sxemasini remote D1’ga yuklang:

   ```bash
   npx wrangler d1 execute vkmusicx_stars --remote --file=schema.sql
   ```

4. BotFather tokenini **secret** qilib saqlang — GitHub’ga, `app.js` ga yoki ochiq Cloudflare variable’ga yozmang:

   ```bash
   npx wrangler secret put BOT_TOKEN
   ```

   So‘rov chiqqanda `@VkMuzicXbot` tokenini terminalga kiriting. Yoki Cloudflare Dashboard → Workers & Pages → `vkmusicx-stars-payments` → Settings → Variables and Secrets → **Add secret**: name `BOT_TOKEN`, value BotFather tokeni.

5. Deploy qiling:

   ```bash
   npx wrangler deploy
   ```

   Kutilgan Worker URL: `https://vkmusicx-stars-payments.husniddin2006yil.workers.dev`. Agar Cloudflare boshqa URL bersa, root’dagi `app.js` ichidagi `PAYMENTS_API_URL` ni o‘sha URL’ga moslang va saytni qayta deploy qiling.

6. Webhook’ni ulash uchun `https://vkmusicx-stars-payments.husniddin2006yil.workers.dev/setup` sahifasini oching. Bot tokenini formaga kiriting, avval mavjud webhook holatini tekshiring, keyin tasdiq belgisini qo‘yib **Stars webhook’ni ulash** tugmasini bosing. Sahifa tokenni browserda saqlamaydi; u faqat HTTPS orqali shu Worker’ga yuboriladi. Webhook o‘zgartirilganda avvalgi bot backend’i va uning musiqa qidirish funksiyasi to‘xtashi mumkin. Bu ulanish `@VkMuzicXbot` update oqimini to‘lov Worker’iga yo‘naltiradi.

7. GitHub’dagi `index.html` va `app.js` yangilangach, Mini App’ni hosting qilayotgan Cloudflare loyihani ham qayta deploy qiling. To‘lov faqat Mini App Telegram ichida ochilganda ishlaydi.

## Xavfsizlik

- `BOT_TOKEN` faqat Cloudflare Worker **Secret** bo‘lsin; repoga qo‘shmang.
- `payments-worker/.gitignore` `.dev.vars` va lokal Wrangler fayllarini commit’dan himoya qiladi.
- Worker Telegram `initData` HMAC imzosini serverda tekshiradi; `initDataUnsafe` asosida to‘lov bermaydi.
- Mini App invoice oynasidagi `paid` callback faqat interfeys uchun. Premium holatini faqat botning tasdiqlangan payment update’i yoqadi.

## HTTP endpointlar

- `GET /health` — Worker holati.
- `POST /api/create-invoice` — Telegram Mini App’dan imzolangan initData bilan PRO/PREMIUM invoice yaratadi.
- `POST /api/status` — obuna holatini qaytaradi.
- `POST /api/cancel` — Stars obunasining auto-renew qismini bekor qiladi.
- `POST /telegram/webhook` — Telegram pre-checkout/payment update’lari.
- `GET /setup` — webhook holatini ko‘rish va egasining roziligi bilan sozlash.
- `GET /terms` — tarif va recurring billing ma’lumoti.
