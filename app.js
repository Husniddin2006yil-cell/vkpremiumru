/*
VKMUSICX — ЛОГИКА MINI APP

Этот файл отвечает за:
- Telegram Mini App
- имя пользователя
- вибрацию
- кнопки
- демо-анимацию
- PRO / PREMIUM

Оплата Telegram Stars подключена через отдельный Cloudflare Worker.
*/


// ==========================================
// TELEGRAM
// ==========================================

const tg =
    window.Telegram?.WebApp;


if (tg) {

    // Сообщаем Telegram,
    // что приложение загрузилось
    tg.ready();

    // Раскрываем Mini App
    tg.expand();

    // Цвет верхней панели
    tg.setHeaderColor("#050507");

    // Цвет фона
    tg.setBackgroundColor("#050507");
}


// ==========================================
// ВИБРАЦИЯ
// ==========================================

function haptic(type = "light") {

    if (!tg?.HapticFeedback) {
        return;
    }

    try {

        tg.HapticFeedback
            .impactOccurred(type);

    } catch (error) {

        console.log(
            "Haptic недоступен"
        );

    }
}


// ==========================================
// ПОЛЬЗОВАТЕЛЬ
// ==========================================

function loadUser() {

    // Получаем пользователя Telegram
    const user =
        tg
            ?.initDataUnsafe
            ?.user;

    const userName =
        document.getElementById(
            "userName"
        );


    // Если приложение открыто не через Telegram
    if (!user) {

        userName.textContent =
            "VKMUSICX USER";

        return;
    }


    // Получаем имя
    let name =
        user.first_name || "";


    // Добавляем фамилию
    if (user.last_name) {

        name +=
            " " +
            user.last_name;
    }


    // Показываем имя
    userName.textContent =
        name ||
        "VKMUSICX USER";
}


// Загружаем пользователя
loadUser();


// ==========================================
// КНОПКА MUSIC LAB
// ==========================================

const startBtn =
    document.getElementById(
        "startBtn"
    );


startBtn.addEventListener(
    "click",
    () => {

        // Вибрация
        haptic("medium");

        // Переход к Audio Demo
        document
            .querySelector(
                ".demo-card"
            )
            .scrollIntoView({
                behavior: "smooth"
            });

    }
);


// ==========================================
// AUDIO DEMO
// ==========================================

const demoBtn =
    document.getElementById(
        "demoBtn"
    );

const visualizer =
    document.getElementById(
        "visualizer"
    );

const audioFile = document.getElementById("audioFile");
const audioPlayer = document.getElementById("audioPlayer");
const trackPanel = document.getElementById("trackPanel");
const trackName = document.getElementById("trackName");
const trackStatus = document.getElementById("trackStatus");
const seekBar = document.getElementById("seekBar");
const timeLabel = document.getElementById("timeLabel");
const volumeControl = document.getElementById("volumeControl");
const speedControl = document.getElementById("speedControl");
const bassToggle = document.getElementById("bassToggle");
const spatialToggle = document.getElementById("spatialToggle");

let audioUrl = null;
let audioContext = null;
let sourceNode = null;
let bassFilter = null;
let stereoPanner = null;
let panDepth = null;
let panOscillator = null;
let bassEnabled = false;
let spatialEnabled = false;

function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function updateTime() {
    const duration = audioPlayer.duration || 0;
    const currentTime = audioPlayer.currentTime || 0;
    timeLabel.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    seekBar.value = duration ? String((currentTime / duration) * 1000) : "0";
}

function setPlayingState(isPlaying) {
    visualizer?.classList.toggle("playing", isPlaying);
    demoBtn.textContent = isPlaying ? "■ ПАУЗА" : "▶ СЛУШАТЬ";
    if (isPlaying) trackStatus.textContent = "Играет";
    else if (audioPlayer.currentTime > 0 && !audioPlayer.ended) trackStatus.textContent = "Пауза";
}

function setupAudioEffects() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || sourceNode) return;

    try {
        audioContext = new AudioContextClass();
        sourceNode = audioContext.createMediaElementSource(audioPlayer);
        bassFilter = audioContext.createBiquadFilter();
        bassFilter.type = "lowshelf";
        bassFilter.frequency.value = 150;
        bassFilter.gain.value = bassEnabled ? 9 : 0;

        sourceNode.connect(bassFilter);
        if (audioContext.createStereoPanner) {
            stereoPanner = audioContext.createStereoPanner();
            stereoPanner.pan.value = 0;
            bassFilter.connect(stereoPanner);
            stereoPanner.connect(audioContext.destination);

            panDepth = audioContext.createGain();
            panDepth.gain.value = spatialEnabled ? 0.75 : 0;
            panOscillator = audioContext.createOscillator();
            panOscillator.type = "sine";
            panOscillator.frequency.value = 0.12;
            panOscillator.connect(panDepth);
            panDepth.connect(stereoPanner.pan);
            panOscillator.start();
        } else {
            bassFilter.connect(audioContext.destination);
        }

        bassToggle.disabled = false;
        spatialToggle.disabled = !stereoPanner;
    } catch (error) {
        console.warn("Audio effects are unavailable:", error);
        trackStatus.textContent = "Играет без эффектов";
        bassToggle.disabled = true;
        spatialToggle.disabled = true;
        if (sourceNode && audioContext) {
            try { sourceNode.connect(audioContext.destination); } catch (_) { /* already connected */ }
        }
    }
}

audioFile.addEventListener("change", () => {
    const file = audioFile.files?.[0];
    if (!file) return;

    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioPlayer.pause();
    audioUrl = URL.createObjectURL(file);
    audioPlayer.src = audioUrl;
    audioPlayer.load();
    trackName.textContent = file.name;
    trackStatus.textContent = "Загружается";
    trackPanel.hidden = false;
    demoBtn.disabled = false;
    seekBar.value = "0";
    timeLabel.textContent = "0:00 / 0:00";
    setupAudioEffects();
    haptic("light");
});

demoBtn.addEventListener("click", async () => {
    haptic("medium");
    if (!audioPlayer.src) return;

    try {
        setupAudioEffects();
        if (audioContext?.state === "suspended") await audioContext.resume();
        if (audioPlayer.paused) await audioPlayer.play();
        else audioPlayer.pause();
    } catch (error) {
        trackStatus.textContent = "Не удалось воспроизвести файл";
        console.error("Audio playback failed:", error);
    }
});

audioPlayer.addEventListener("play", () => setPlayingState(true));
audioPlayer.addEventListener("pause", () => setPlayingState(false));
audioPlayer.addEventListener("ended", () => {
    setPlayingState(false);
    trackStatus.textContent = "Готово";
});
audioPlayer.addEventListener("loadedmetadata", () => {
    trackStatus.textContent = "Готово";
    updateTime();
});
audioPlayer.addEventListener("timeupdate", updateTime);
audioPlayer.addEventListener("error", () => {
    trackStatus.textContent = "Формат файла не поддерживается";
});

seekBar.addEventListener("input", () => {
    if (Number.isFinite(audioPlayer.duration) && audioPlayer.duration > 0) {
        audioPlayer.currentTime = audioPlayer.duration * (Number(seekBar.value) / 1000);
    }
});

volumeControl.addEventListener("input", () => {
    audioPlayer.volume = Number(volumeControl.value);
});

speedControl.addEventListener("change", () => {
    audioPlayer.playbackRate = Number(speedControl.value);
});

bassToggle.addEventListener("click", () => {
    haptic("light");
    bassEnabled = !bassEnabled;
    if (bassFilter) bassFilter.gain.setTargetAtTime(bassEnabled ? 9 : 0, audioContext.currentTime, 0.08);
    bassToggle.textContent = `🔊 Bass Boost: ${bassEnabled ? "ON" : "OFF"}`;
    bassToggle.classList.toggle("active", bassEnabled);
});

spatialToggle.addEventListener("click", () => {
    haptic("light");
    spatialEnabled = !spatialEnabled;
    if (panDepth) panDepth.gain.setTargetAtTime(spatialEnabled ? 0.75 : 0, audioContext.currentTime, 0.12);
    spatialToggle.textContent = `🎧 8D Audio: ${spatialEnabled ? "ON" : "OFF"}`;
    spatialToggle.classList.toggle("active", spatialEnabled);
});

volumeControl.dispatchEvent(new Event("input"));

window.addEventListener("pagehide", () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (audioContext && audioContext.state !== "closed") audioContext.close();
});


// ==========================================
// ПРОФИЛЬ
// ==========================================

document
    .getElementById(
        "profileBtn"
    )
    .addEventListener(
        "click",
        () => {

            // Лёгкая вибрация
            haptic("light");


            // Показываем Telegram popup
            if (tg?.showPopup) {

                tg.showPopup({

                    title:
                        "VKMUSICX",

                    message:
                        "Профиль будет доступен после подключения аккаунта.",

                    buttons: [

                        {
                            id: "ok",
                            type: "ok",
                            text: "OK"
                        }

                    ]

                });

            }

        }
    );


// ==========================================
// PRO / PREMIUM
// ==========================================

const PAYMENTS_API_URL = "https://vkmusicx-stars-payments.husniddin2006yil.workers.dev";

function showPaymentMessage(title, message) {
    if (tg?.showPopup) {
        tg.showPopup({
            title,
            message,
            buttons: [{ id: "ok", type: "ok", text: "OK" }]
        });
        return;
    }
    window.alert(`${title}\n\n${message}`);
}

function confirmPlanPurchase(plan, price) {
    const planName = plan === "pro" ? "PRO" : "PREMIUM";
    const message = `${planName}: ⭐${price} har 30 kunda. Obuna avtomatik uzayadi; istalgan payt botga /cancel yuborib to‘xtatishingiz mumkin.`;

    if (tg?.showPopup) {
        return new Promise(resolve => {
            tg.showPopup({
                title: `${planName} obunasi`,
                message,
                buttons: [
                    { id: "confirm", type: "default", text: "Davom etish" },
                    { id: "cancel", type: "cancel", text: "Bekor qilish" }
                ]
            }, buttonId => resolve(buttonId === "confirm"));
        });
    }

    return Promise.resolve(window.confirm(`${message}\n\nTo‘lovni Telegram ichida oching.`));
}

async function refreshSubscriptionStatus() {
    if (!tg?.initData) return null;

    try {
        const response = await fetch(`${PAYMENTS_API_URL}/api/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData: tg.initData })
        });
        if (!response.ok) return null;

        const status = await response.json();
        const statusElement = document.querySelector(".user-status");
        if (statusElement) {
            if (status.active) {
                const until = new Date(status.expiresAt * 1000).toLocaleDateString("ru-RU");
                statusElement.textContent = `${status.plan.toUpperCase()} · ДО ${until}`;
            } else {
                statusElement.textContent = "FREE PLAN";
            }
        }
        return status;
    } catch (error) {
        console.warn("Subscription status is temporarily unavailable:", error);
        return null;
    }
}

async function waitForPaymentActivation() {
    for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        const status = await refreshSubscriptionStatus();
        if (status?.active) return status;
    }
    return null;
}

async function startStarsPurchase(plan, price, button) {
    if (!tg?.initData || typeof tg.openInvoice !== "function") {
        showPaymentMessage("Telegram ichida oching", "Haqiqiy Stars to‘lovi Telegram Mini App ichida ishlaydi.");
        return;
    }

    const confirmed = await confirmPlanPurchase(plan, price);
    if (!confirmed) return;

    button.disabled = true;
    try {
        const response = await fetch(`${PAYMENTS_API_URL}/api/create-invoice`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan, initData: tg.initData })
        });
        const invoice = await response.json().catch(() => ({}));
        if (!response.ok || !invoice.invoiceUrl) {
            throw new Error(invoice.error || "Invoice yaratilmadi. Keyinroq qayta urinib ko‘ring.");
        }

        tg.openInvoice(invoice.invoiceUrl, async status => {
            if (status === "paid" || status === "pending") {
                const activated = await waitForPaymentActivation();
                if (activated?.active) {
                    const until = new Date(activated.expiresAt * 1000).toLocaleDateString("ru-RU");
                    showPaymentMessage("To‘lov qabul qilindi", `${activated.plan.toUpperCase()} ${until} gacha faollashtirildi.`);
                } else {
                    showPaymentMessage("To‘lov tekshirilmoqda", "Telegram to‘lovni tasdiqlashi bilan obuna avtomatik faollashadi. Birozdan keyin profilni yangilang.");
                }
            } else if (status === "failed") {
                showPaymentMessage("To‘lov bajarilmadi", "Telegram invoice oynasida qayta urinib ko‘ring yoki /paysupport ga murojaat qiling.");
            }
        });
    } catch (error) {
        showPaymentMessage("To‘lovni ochib bo‘lmadi", error.message || "Keyinroq qayta urinib ko‘ring.");
    } finally {
        setTimeout(() => { button.disabled = false; }, 1500);
    }
}

const buyButtons =
    document.querySelectorAll(
        ".buy-btn"
    );


buyButtons.forEach(
    button => {

        button.addEventListener(
            "click",
            () => {
                haptic("medium");
                const plan =
                    button.dataset.plan;
                const price =
                    button.dataset.price;
                void startStarsPurchase(plan, price, button);
            }
        );

    }
);

void refreshSubscriptionStatus();


// ==========================================
// ОБЩАЯ ВИБРАЦИЯ КНОПОК
// ==========================================

document
    .querySelectorAll("button")
    .forEach(
        button => {

            button.addEventListener(
                "touchstart",
                () => {

                    haptic("light");

                },
                {
                    passive: true
                }
            );

        }
    );


// ==========================================
// ГОТОВО
// ==========================================

console.log(
    "VKMUSICX Mini App запущен"
);

console.log(
    "Telegram:",
    tg
);

console.log(
    "Пользователь:",
    tg
        ?.initDataUnsafe
        ?.user
);
