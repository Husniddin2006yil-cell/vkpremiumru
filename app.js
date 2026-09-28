/*
VKMUSICX — ЛОГИКА MINI APP

Этот файл отвечает за:
- Telegram Mini App
- имя пользователя
- вибрацию
- кнопки
- демо-анимацию
- PRO / PREMIUM

Настоящая оплата ⭐ Stars будет подключена позже.
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


// Сейчас это только визуальная демонстрация
let playing = false;


demoBtn.addEventListener(
    "click",
    () => {

        // Вибрация
        haptic("medium");

        // Меняем состояние
        playing =
            !playing;


        if (playing) {

            // Запускаем анимацию
            visualizer
                .classList
                .add("playing");

            // Меняем текст кнопки
            demoBtn.textContent =
                "■ STOP DEMO";

        } else {

            // Останавливаем анимацию
            visualizer
                .classList
                .remove("playing");

            // Возвращаем текст
            demoBtn.textContent =
                "▶ TAP TO LISTEN";
        }

    }
);


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

const buyButtons =
    document.querySelectorAll(
        ".buy-btn"
    );


buyButtons.forEach(
    button => {

        button.addEventListener(
            "click",
            () => {

                // Вибрация
                haptic("medium");


                // Получаем тариф
                const plan =
                    button.dataset.plan;


                // Получаем цену
                const price =
                    button.dataset.price;


                console.log(
                    "Тариф:",
                    plan
                );


                console.log(
                    "Stars:",
                    price
                );


                /*
                Сейчас показываем только окно.

                Позже здесь будет НАСТОЯЩАЯ
                оплата через Telegram Stars.
                */

                if (tg?.showPopup) {

                    tg.showPopup({

                        title:
                            plan === "pro"
                                ? "PRO"
                                : "PREMIUM",

                        message:
                            `Оплата ⭐${price} Stars будет подключена на следующем этапе.`,

                        buttons: [

                            {
                                id: "continue",
                                type: "default",
                                text: "Продолжить"
                            },

                            {
                                id: "cancel",
                                type: "cancel",
                                text: "Отмена"
                            }

                        ]

                    });

                } else {

                    alert(
                        `⭐${price} Stars`
                    );

                }

            }
        );

    }
);


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
