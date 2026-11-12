
// Простой сервер для приёма оплаты Telegram Stars в игре Lemon Clicker.
// Что он делает:
// 1. По запросу от игры создаёт счёт (invoice link) через твоего бота.
// 2. Принимает подтверждение оплаты от Телеграма (pre_checkout_query и successful_payment).
// 3. Отмечает, что пользователь купил товар, в простом хранилище в памяти.
//
// ВАЖНО: токен бота хранится только в переменной окружения BOT_TOKEN на Render,
// никогда не пиши его прямо в код и никому не присылай.
 
const express = require('express');
const app = express();
app.use(express.json());
 
// Разрешаем запросы от игры, которая живёт на другом домене (Netlify / Telegram WebApp)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
 
const BOT_TOKEN = process.env.BOT_TOKEN; // задаётся в настройках Render (Environment)
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
 
// Список товаров за звёзды — цены в XTR (Stars). Держи в синхроне с игрой.
const PRODUCTS = {
  p_pass:    { title: 'Лимон-пасс (платная дорожка)', desc: 'Открывает вторую дорожку наград', stars: 250 },
  p_noads:   { title: 'Отключить рекламу',             desc: 'Убирает баннер и показы навсегда', stars: 150 },
  p_x2:      { title: 'Постоянный x2',                 desc: 'Все очки умножаются на 2 навсегда', stars: 300 },
  p_gold:    { title: 'Золотой лимон',                  desc: 'Скин + 25% к очкам',                stars: 100 },
  p_boost1:  { title: 'Ускоритель x5 на 10 минут',      desc: 'Все очки x5 на 10 минут',            stars: 50  },
  p_pack1:   { title: 'Мешок очков',                    desc: '+10 минут дохода',                   stars: 30  },
  p_pack2:   { title: 'Сундук очков',                   desc: '+2 часа дохода',                     stars: 120 },
};
 
// Очень простое хранилище покупок в памяти: { "userId:productId": true }
// Для настоящего проекта лучше заменить на базу данных (например, SQLite или Postgres),
// иначе при перезапуске сервера записи о покупках пропадут.
const purchases = new Set();
 
// 1) Игра вызывает этот адрес, когда игрок жмёт "Купить"
app.post('/create-invoice', async (req, res) => {
  try {
    const { productId, userId } = req.body;
    const product = PRODUCTS[productId];
    if (!product) return res.status(400).json({ error: 'Unknown product' });
 
    const payload = JSON.stringify({ productId, userId, ts: Date.now() });
 
    const r = await fetch(`${API}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: product.title,
        description: product.desc,
        payload,
        currency: 'XTR', // валюта Telegram Stars
        prices: [{ label: product.title, amount: product.stars }],
      }),
    });
    const data = await r.json();
    if (!data.ok) return res.status(500).json({ error: data.description });
 
    res.json({ link: data.result });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
 
// 2) Телеграм спрашивает подтверждение перед оплатой — всегда отвечаем "ок"
//    (можно добавить проверки, например что товар ещё существует)
app.post('/webhook', async (req, res) => {
  const update = req.body;
 
  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    await fetch(`${API}/answerPreCheckoutQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pre_checkout_query_id: q.id, ok: true }),
    });
  }
 
  if (update.message && update.message.successful_payment) {
    const sp = update.message.successful_payment;
    const payload = JSON.parse(sp.invoice_payload);
    purchases.add(`${payload.userId}:${payload.productId}`);
    // Тут можно также отправить пользователю сообщение "Спасибо за покупку!"
  }
 
  res.sendStatus(200);
});
 
// 3) Игра может спросить, что уже куплено (например, при открытии)
app.get('/owned/:userId', (req, res) => {
  const userId = req.params.userId;
  const owned = Object.keys(PRODUCTS).filter(id => purchases.has(`${userId}:${id}`));
  res.json({ owned });
});
 
app.get('/', (req, res) => res.send('Lemon Clicker payment server is running'));
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server started on port ' + PORT));



