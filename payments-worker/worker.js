const PLANS = {
  pro: { name: "PRO", stars: 99 },
  premium: { name: "PREMIUM", stars: 299 },
};
const SUBSCRIPTION_PERIOD = 2_592_000; // Telegram requires 30 days for bot subscriptions.
const INIT_DATA_MAX_AGE = 86_400;
const PAYMENT_BOT_API = "https://api.telegram.org/bot";
const TERMS_TEXT = [
  "VKMUSICX — raqamli obuna ma’lumoti",
  "PRO: ⭐99 / 30 kun. PREMIUM: ⭐299 / 30 kun.",
  "Obuna Telegram Stars orqali har 30 kunda avtomatik uzayadi. Keyingi yechimlarni to‘xtatish uchun botga /cancel yuboring; bekor qilingandan keyin joriy to‘langan muddat tugaguncha kirish saqlanadi.",
  "To‘lov faqat Telegram invoice oynasida tasdiqlangandan keyin faollashadi. To‘lov, bekor qilish yoki refund bo‘yicha yordam uchun @Husnijan_Axi ga murojaat qiling yoki /paysupport yuboring."
].join("\n\n");
const SUPPORT_TEXT = "VKMUSICX to‘lov yordami: @Husnijan_Axi. Muammoni va Telegram invoice/receipt ma’lumotini yuboring; hech qachon bot tokeni yoki karta ma’lumotlarini yubormang.";

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function textResponse(body, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function signHmac(keyBytes, data) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

async function verifyInitData(initData, botToken) {
  if (typeof initData !== "string" || initData.length < 20 || initData.length > 12_000) return null;
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) return null;

  // Bot-token HMAC verification uses every received field except `hash`.
  const checkString = Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = await signHmac(new TextEncoder().encode("WebAppData"), botToken);
  const expectedHash = toHex(await signHmac(secret, checkString));
  if (!safeEqual(expectedHash.toLowerCase(), receivedHash.toLowerCase())) return null;

  const authDate = Number(params.get("auth_date"));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate > now + 60 || now - authDate > INIT_DATA_MAX_AGE) return null;

  let user;
  try { user = JSON.parse(params.get("user") || "null"); } catch { return null; }
  if (!user || !Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0) return null;
  return { user, userId: String(user.id), authDate };
}

async function telegramApi(env, method, body = {}) {
  if (!env.BOT_TOKEN) throw new Error("BOT_TOKEN is not configured");
  const response = await fetch(`${PAYMENT_BOT_API}${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    const description = result?.description || `Telegram API ${method} failed (${response.status})`;
    throw new Error(description);
  }
  return result.result;
}

async function createInvoice(env, userId, planKey) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error("Noto‘g‘ri tarif.");

  const now = Math.floor(Date.now() / 1000);
  const current = await env.DB.prepare(
    "SELECT plan, status, expires_at, auto_renew FROM subscriptions WHERE tg_user_id = ?"
  ).bind(userId).first();
  if (current && current.status === "active" && Number(current.expires_at) > now) {
    throw new Error(`Sizda ${String(current.plan).toUpperCase()} obunasi ${new Date(Number(current.expires_at) * 1000).toLocaleDateString("uz-UZ")} gacha faol.`);
  }

  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM orders WHERE tg_user_id = ? AND created_at > ?"
  ).bind(userId, now - 600).first();
  if (Number(recent?.total || 0) >= 5) throw new Error("Juda ko‘p invoice so‘rovi. Birozdan keyin qayta urinib ko‘ring.");

  const previous = await env.DB.prepare(
    "SELECT order_id, invoice_url FROM orders WHERE tg_user_id = ? AND plan = ? AND status = 'pending' AND created_at > ? ORDER BY created_at DESC LIMIT 1"
  ).bind(userId, planKey, now - 600).first();
  if (previous?.invoice_url) return { invoiceUrl: previous.invoice_url, orderId: previous.order_id, plan: planKey, stars: plan.stars };

  const orderId = crypto.randomUUID().replaceAll("-", "");
  await env.DB.prepare(
    "INSERT INTO orders (order_id, tg_user_id, plan, amount, currency, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'XTR', 'pending', ?, ?)"
  ).bind(orderId, userId, planKey, plan.stars, now, now).run();

  try {
    const invoiceUrl = await telegramApi(env, "createInvoiceLink", {
      title: `VKMUSICX ${plan.name}`,
      description: `${plan.name} obunasi — har 30 kunda avtomatik uzayadi. Bekor qilish uchun botga /cancel yuboring.`,
      payload: orderId,
      provider_token: "",
      currency: "XTR",
      prices: [{ label: `${plan.name} / 30 kun`, amount: plan.stars }],
      subscription_period: SUBSCRIPTION_PERIOD,
    });
    await env.DB.prepare("UPDATE orders SET invoice_url = ?, updated_at = ? WHERE order_id = ?")
      .bind(invoiceUrl, now, orderId).run();
    return { invoiceUrl, orderId, plan: planKey, stars: plan.stars };
  } catch (error) {
    await env.DB.prepare("UPDATE orders SET status = 'failed', updated_at = ? WHERE order_id = ?")
      .bind(Math.floor(Date.now() / 1000), orderId).run();
    throw error;
  }
}

async function getSubscription(env, userId) {
  const row = await env.DB.prepare(
    "SELECT plan, status, expires_at, auto_renew FROM subscriptions WHERE tg_user_id = ?"
  ).bind(userId).first();
  if (!row) return { active: false, plan: "free", expiresAt: null, autoRenew: false };
  const active = row.status === "active" && Number(row.expires_at) > Math.floor(Date.now() / 1000);
  return {
    active,
    plan: active ? row.plan : "free",
    expiresAt: active ? Number(row.expires_at) : null,
    autoRenew: active && Boolean(row.auto_renew),
  };
}

async function cancelSubscription(env, userId) {
  const row = await env.DB.prepare(
    "SELECT plan, status, expires_at, auto_renew, subscription_charge_id FROM subscriptions WHERE tg_user_id = ?"
  ).bind(userId).first();
  if (!row || row.status !== "active" || Number(row.expires_at) <= Math.floor(Date.now() / 1000)) {
    return { ok: false, message: "Faol obuna topilmadi." };
  }
  if (!row.subscription_charge_id) throw new Error("Obuna to‘lovi identifikatori topilmadi; /paysupport ga yozing.");
  await telegramApi(env, "editUserStarSubscription", {
    user_id: Number(userId),
    telegram_payment_charge_id: row.subscription_charge_id,
    is_canceled: true,
  });
  await env.DB.prepare("UPDATE subscriptions SET auto_renew = 0, updated_at = ? WHERE tg_user_id = ?")
    .bind(Math.floor(Date.now() / 1000), userId).run();
  const date = new Date(Number(row.expires_at) * 1000).toLocaleDateString("uz-UZ");
  return { ok: true, message: `Avtomatik uzaytirish bekor qilindi. ${String(row.plan).toUpperCase()} ${date} gacha faol qoladi.` };
}

async function answerPreCheckout(env, query) {
  const order = await env.DB.prepare(
    "SELECT tg_user_id, plan, amount, currency, status FROM orders WHERE order_id = ?"
  ).bind(query.invoice_payload || "").first();
  const valid = order
    && order.tg_user_id === String(query.from?.id)
    && query.currency === "XTR"
    && Number(query.total_amount) === Number(order.amount)
    && order.currency === "XTR"
    && order.status === "pending";
  await telegramApi(env, "answerPreCheckoutQuery", valid
    ? { pre_checkout_query_id: query.id, ok: true }
    : { pre_checkout_query_id: query.id, ok: false, error_message: "Invoice yaroqsiz yoki muddati tugagan. Mini App’dan yangi invoice oling." });
}

async function recordSuccessfulPayment(env, message, updateId) {
  const payment = message.successful_payment;
  const userId = String(message.from?.id || "");
  const orderId = String(payment.invoice_payload || "");
  const order = await env.DB.prepare(
    "SELECT order_id, tg_user_id, plan, amount, currency FROM orders WHERE order_id = ?"
  ).bind(orderId).first();
  const chargeId = String(payment.telegram_payment_charge_id || "");
  const now = Math.floor(Date.now() / 1000);
  if (!order || !chargeId || order.tg_user_id !== userId || payment.currency !== "XTR" || Number(payment.total_amount) !== Number(order.amount)) {
    console.error("Unmatched successful_payment update", updateId, orderId, userId);
    await telegramApi(env, "sendMessage", { chat_id: message.chat.id, text: `To‘lov qaydi avtomatik topilmadi. Iltimos, ${SUPPORT_TEXT}` }).catch(() => {});
    return;
  }

  const existing = await env.DB.prepare(
    "SELECT subscription_charge_id FROM subscriptions WHERE tg_user_id = ?"
  ).bind(userId).first();
  const expiry = Number(payment.subscription_expiration_date) || (now + SUBSCRIPTION_PERIOD);
  const isFirst = payment.is_first_recurring === true || !existing?.subscription_charge_id;
  const subscriptionChargeId = isFirst ? chargeId : existing.subscription_charge_id;

  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO payments (charge_id, order_id, tg_user_id, plan, amount, currency, paid_at, is_recurring, is_first_recurring, subscription_expires_at, update_id) VALUES (?, ?, ?, ?, ?, 'XTR', ?, ?, ?, ?, ?)"
    ).bind(chargeId, orderId, userId, order.plan, Number(payment.total_amount), now, payment.is_recurring ? 1 : 0, payment.is_first_recurring ? 1 : 0, expiry, updateId),
    env.DB.prepare(
      "INSERT INTO subscriptions (tg_user_id, plan, status, expires_at, auto_renew, subscription_charge_id, last_charge_id, updated_at) VALUES (?, ?, 'active', ?, 1, ?, ?, ?) ON CONFLICT(tg_user_id) DO UPDATE SET plan = excluded.plan, status = 'active', expires_at = excluded.expires_at, auto_renew = 1, subscription_charge_id = excluded.subscription_charge_id, last_charge_id = excluded.last_charge_id, updated_at = excluded.updated_at"
    ).bind(userId, order.plan, expiry, subscriptionChargeId, chargeId, now),
    env.DB.prepare("UPDATE orders SET status = 'paid', updated_at = ? WHERE order_id = ?")
      .bind(now, orderId),
  ]);

  const plan = PLANS[order.plan];
  const date = new Date(expiry * 1000).toLocaleDateString("uz-UZ");
  await telegramApi(env, "sendMessage", {
    chat_id: message.chat.id,
    text: `To‘lov tasdiqlandi. ${plan?.name || order.plan.toUpperCase()} ${date} gacha faol. Obunani avtomatik uzaytirishni to‘xtatish uchun /cancel yuboring.`,
  }).catch(error => console.error("Could not send payment receipt message", error.message));
}

async function handleMessage(env, message) {
  if (!message?.text || !message.from?.id || !message.chat?.id) return;
  const text = message.text.trim();
  const command = text.split(/\s+/, 1)[0].split("@")[0].toLowerCase();
  const userId = String(message.from.id);

  if (command === "/terms") {
    await telegramApi(env, "sendMessage", { chat_id: message.chat.id, text: TERMS_TEXT });
    return;
  }
  if (command === "/support" || command === "/paysupport") {
    await telegramApi(env, "sendMessage", { chat_id: message.chat.id, text: SUPPORT_TEXT });
    return;
  }
  if (command === "/cancel") {
    const result = await cancelSubscription(env, userId);
    await telegramApi(env, "sendMessage", { chat_id: message.chat.id, text: result.message });
    return;
  }
  if (command === "/plan") {
    const sub = await getSubscription(env, userId);
    const text = sub.active
      ? `${String(sub.plan).toUpperCase()} faol, ${new Date(sub.expiresAt * 1000).toLocaleDateString("uz-UZ")} gacha. Auto-renew: ${sub.autoRenew ? "yoqilgan" : "o‘chirilgan"}.`
      : "Hozir faol obuna yo‘q.";
    await telegramApi(env, "sendMessage", { chat_id: message.chat.id, text });
    return;
  }

  const start = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  if (start) {
    const payload = (start[1] || "").trim().toLowerCase();
    const planKey = payload === "buy_pro" ? "pro" : payload === "buy_premium" ? "premium" : null;
    if (planKey) {
      try {
        const invoice = await createInvoice(env, userId, planKey);
        await telegramApi(env, "sendMessage", {
          chat_id: message.chat.id,
          text: `${PLANS[planKey].name}: ⭐${invoice.stars} / 30 kun. Obuna har 30 kunda avtomatik uzayadi. Bekor qilish: /cancel.`,
          reply_markup: { inline_keyboard: [[{ text: `To‘lash — ⭐${invoice.stars}`, url: invoice.invoiceUrl }]] },
        });
      } catch (error) {
        await telegramApi(env, "sendMessage", { chat_id: message.chat.id, text: error.message || "Invoice yaratilmadi. /paysupport ga yozing." });
      }
      return;
    }
    await telegramApi(env, "sendMessage", {
      chat_id: message.chat.id,
      text: "VKMUSICX obunalari: PRO ⭐99/30 kun yoki PREMIUM ⭐299/30 kun. To‘lov Mini App’da amalga oshiriladi. /terms — shartlar, /support — yordam.",
    });
  }
}

async function deriveWebhookSecret(botToken) {
  const digest = await signHmac(new TextEncoder().encode("VKMUSICX Telegram webhook v1"), botToken);
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function setupPage() {
  const html = `<!doctype html><html lang="uz"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VKMUSICX Stars setup</title><style>body{font:16px system-ui;background:#09090d;color:#f6f6f8;max-width:680px;margin:40px auto;padding:20px}input,button{font:inherit;padding:12px;border-radius:10px;border:1px solid #444;background:#17171d;color:white}input[type=password]{width:min(95%,520px);display:block;margin:12px 0}button{cursor:pointer;margin:8px 8px 8px 0}button:disabled{opacity:.45;cursor:not-allowed}.warning{color:#ffd27a;line-height:1.5}pre{white-space:pre-wrap;word-break:break-word;background:#15151b;padding:14px;border-radius:10px}</style><body><h1>VKMUSICX Stars — webhook setup</h1><p>Bu sahifa bot tokenini chatga yubormaydi yoki brauzerda saqlamaydi. Token faqat HTTPS orqali shu Worker’ga authorization header sifatida yuboriladi. Avval tokenni Cloudflare Worker’ning <b>BOT_TOKEN</b> Secret’iga qo‘shing.</p><label for="token">@VkMuzicXbot tokeni</label><input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="BotFather tokeni"><button id="inspect">Hozirgi webhookni tekshirish</button><p class="warning">Diqqat: webhook almashtirilsa, mavjud bot backendi va musiqa-qidirish funksiyalari to‘xtashi mumkin. Siz shu botdan Stars to‘lovlari uchun foydalanishni tanlagansiz.</p><label><input id="confirm" type="checkbox"> Webhook almashtirilishiga roziman.</label><br><button id="activate" disabled>Stars webhook’ni ulash</button><pre id="result">Token kiritib, avval webhook holatini tekshiring.</pre><script>const token=document.getElementById('token'),out=document.getElementById('result'),confirmBox=document.getElementById('confirm'),activate=document.getElementById('activate');let inspected=false;async function call(path,method){const response=await fetch(path,{method,headers:{'Authorization':'Bearer '+token.value,'Content-Type':'application/json'},body:method==='POST'?JSON.stringify({confirm:true}):undefined,cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Xatolik '+response.status);return data;}document.getElementById('inspect').onclick=async()=>{try{const d=await call('/_admin/webhook-info','GET');out.textContent='Hozirgi webhook: '+(d.url||'(o‘rnatilmagan)')+'\nNavbatdagi update: '+d.pending_update_count+(d.last_error_message?'\nOxirgi xato: '+d.last_error_message:'');inspected=true;activate.disabled=!confirmBox.checked;}catch(e){out.textContent='Tekshirib bo‘lmadi: '+e.message;inspected=false;activate.disabled=true;}};confirmBox.onchange=()=>{activate.disabled=!(inspected&&confirmBox.checked);};activate.onclick=async()=>{if(!inspected||!confirmBox.checked)return;activate.disabled=true;try{const d=await call('/_admin/set-webhook','POST');out.textContent='Tayyor. Stars webhook ulandi: '+d.webhook_url+'\nOld webhook: '+(d.previous_url||'(o‘rnatilmagan)')+'\nNavbatdagi update: '+d.previous_pending_updates;token.value='';}catch(e){out.textContent='Ulashda xatolik: '+e.message;activate.disabled=false;}};</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}

function adminAuthorized(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(env.BOT_TOKEN) && safeEqual(token, env.BOT_TOKEN);
}

async function handleAdmin(request, env, url) {
  if (!adminAuthorized(request, env)) return textResponse("Unauthorized", 401);
  if (url.pathname === "/_admin/webhook-info" && request.method === "GET") {
    const info = await telegramApi(env, "getWebhookInfo", {});
    return Response.json({ url: info.url || "", pending_update_count: info.pending_update_count || 0, allowed_updates: info.allowed_updates || [], last_error_date: info.last_error_date || null, last_error_message: info.last_error_message || null });
  }
  if (url.pathname === "/_admin/set-webhook" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (body.confirm !== true) return Response.json({ ok: false, error: "confirm:true required" }, { status: 400 });
    const previous = await telegramApi(env, "getWebhookInfo", {});
    const webhookUrl = `${url.origin}/telegram/webhook`;
    const result = await telegramApi(env, "setWebhook", {
      url: webhookUrl,
      secret_token: await deriveWebhookSecret(env.BOT_TOKEN),
      allowed_updates: ["message", "pre_checkout_query"],
      drop_pending_updates: false,
    });
    return Response.json({ ok: Boolean(result), webhook_url: webhookUrl, previous_url: previous.url || "", previous_pending_updates: previous.pending_update_count || 0 });
  }
  return textResponse("Not found", 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });

    try {
      if (url.pathname === "/health" && request.method === "GET") {
        return jsonResponse(request, { ok: true, service: "vkmusicx-stars-payments", configured: Boolean(env.DB && env.BOT_TOKEN) });
      }
      if (url.pathname === "/setup" && request.method === "GET") return setupPage();
      if (url.pathname.startsWith("/_admin/")) return await handleAdmin(request, env, url);
      if (url.pathname === "/terms" && request.method === "GET") return textResponse(TERMS_TEXT);
      if (url.pathname === "/api/create-invoice" && request.method === "POST") {
        if (!env.BOT_TOKEN || !env.DB) return jsonResponse(request, { error: "To‘lov xizmati sozlanmagan." }, 503);
        const body = await request.json();
        const auth = await verifyInitData(body.initData, env.BOT_TOKEN);
        if (!auth) return jsonResponse(request, { error: "Telegram sessiyasi yaroqsiz. Mini App’ni Telegram ichidan qayta oching." }, 401);
        try {
          const invoice = await createInvoice(env, auth.userId, String(body.plan || "").toLowerCase());
          return jsonResponse(request, invoice);
        } catch (error) {
          return jsonResponse(request, { error: error.message || "Invoice yaratilmadi." }, 409);
        }
      }
      if (url.pathname === "/api/status" && request.method === "POST") {
        if (!env.BOT_TOKEN || !env.DB) return jsonResponse(request, { error: "To‘lov xizmati sozlanmagan." }, 503);
        const body = await request.json();
        const auth = await verifyInitData(body.initData, env.BOT_TOKEN);
        if (!auth) return jsonResponse(request, { error: "Telegram sessiyasi yaroqsiz." }, 401);
        return jsonResponse(request, await getSubscription(env, auth.userId));
      }
      if (url.pathname === "/api/cancel" && request.method === "POST") {
        if (!env.BOT_TOKEN || !env.DB) return jsonResponse(request, { error: "To‘lov xizmati sozlanmagan." }, 503);
        const body = await request.json();
        const auth = await verifyInitData(body.initData, env.BOT_TOKEN);
        if (!auth) return jsonResponse(request, { error: "Telegram sessiyasi yaroqsiz." }, 401);
        return jsonResponse(request, await cancelSubscription(env, auth.userId));
      }
      if (url.pathname === "/telegram/webhook" && request.method === "POST") {
        const webhookSecret = env.BOT_TOKEN ? await deriveWebhookSecret(env.BOT_TOKEN) : "";
        if (!webhookSecret || !safeEqual(request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "", webhookSecret)) {
          return textResponse("Unauthorized", 401);
        }
        const update = await request.json();
        const updateId = Number(update.update_id);
        if (Number.isSafeInteger(updateId)) {
          const seen = await env.DB.prepare("SELECT update_id FROM webhook_updates WHERE update_id = ?")
            .bind(updateId).first();
          if (seen) return textResponse("ok");
        }
        if (update.pre_checkout_query) await answerPreCheckout(env, update.pre_checkout_query);
        else if (update.message?.successful_payment) await recordSuccessfulPayment(env, update.message, updateId);
        else if (update.message) await handleMessage(env, update.message);
        if (Number.isSafeInteger(updateId)) {
          await env.DB.prepare("INSERT OR IGNORE INTO webhook_updates (update_id, processed_at) VALUES (?, ?)")
            .bind(updateId, Math.floor(Date.now() / 1000)).run();
        }
        return textResponse("ok");
      }
      return jsonResponse(request, { error: "Not found" }, 404);
    } catch (error) {
      console.error("Worker request failed", error?.message || "unknown error");
      if (url.pathname === "/telegram/webhook") return textResponse("Retry", 500);
      return jsonResponse(request, { error: "Xizmatda vaqtinchalik xatolik. Keyinroq urinib ko‘ring." }, 500);
    }
  },
};
