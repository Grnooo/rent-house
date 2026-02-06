require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

let fetchFn = global.fetch;
if (!fetchFn) {
  // node-fetch v3 is ESM, поэтому динамический import
  fetchFn = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
}

const { initDb, get, all, run } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(checkIn, checkOut) {
  const a = parseISODate(checkIn);
  const b = parseISODate(checkOut);
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

function eachNightDates(checkIn, checkOut) {
  // ночи: checkIn .. checkOut-1
  const nights = [];
  const start = parseISODate(checkIn);
  const end = parseISODate(checkOut);
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    nights.push(isoDate(d));
  }
  return nights;
}

function isWeekendNight(yyyyMmDd) {
  // выходные ночи: пятница и суббота
  // 0=Sun, 5=Fri, 6=Sat
  const dt = parseISODate(yyyyMmDd);
  const day = dt.getDay();
  return day === 5 || day === 6;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function sendTelegram(textHtml) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: textHtml,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });
}

function adminAuth(req, res, next) {
  const pass = req.headers["x-admin-password"];
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: "ADMIN_PASSWORD_not_set" });
  }
  if (pass !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

let db;

// ---------- API ----------

// Availability: booked + blocked в диапазоне
app.get("/api/availability", async (req, res) => {
  try {
    const { from, to } = req.query;

    const hasRange = Boolean(from && to);

    const booked = await all(
      db,
      `SELECT check_in as start, check_out as end
       FROM bookings
       ${hasRange ? "WHERE NOT (check_out <= ? OR check_in >= ?)" : ""}
       ORDER BY check_in ASC`,
      hasRange ? [from, to] : []
    );

    const blocked = await all(
      db,
      `SELECT start_date as start, end_date as end, reason
       FROM blocked_ranges
       ${hasRange ? "WHERE NOT (end_date <= ? OR start_date >= ?)" : ""}
       ORDER BY start_date ASC`,
      hasRange ? [from, to] : []
    );

    res.json({ booked, blocked });
  } catch (e) {
    res.status(500).json({ error: "availability_failed" });
  }
});

// Создать бронь (автобронь confirmed сразу)
app.post("/api/bookings", async (req, res) => {
  try {
    const { checkIn, checkOut, guests, name, phone, comment } = req.body || {};

    if (!checkIn || !checkOut || !name || !phone || !guests) {
      return res.status(400).json({ error: "missing_fields" });
    }

    const nightsCount = daysBetween(checkIn, checkOut);
    if (!Number.isFinite(nightsCount) || nightsCount <= 0) {
      return res.status(400).json({ error: "invalid_dates" });
    }

    const settings = await get(
      db,
      `SELECT weekday_price, weekend_price, min_nights FROM settings WHERE id=1`
    );

    if (nightsCount < settings.min_nights) {
      return res.status(400).json({ error: "min_nights", minNights: settings.min_nights });
    }

    // Проверка конфликтов с бронями и блокировками: пересечение [newIn, newOut)
    const conflictBooking = await get(
      db,
      `SELECT id FROM bookings
       WHERE NOT (check_out <= ? OR check_in >= ?)
       LIMIT 1`,
      [checkIn, checkOut]
    );

    const conflictBlocked = await get(
      db,
      `SELECT id FROM blocked_ranges
       WHERE NOT (end_date <= ? OR start_date >= ?)
       LIMIT 1`,
      [checkIn, checkOut]
    );

    if (conflictBooking || conflictBlocked) {
      return res.status(409).json({ error: "dates_unavailable" });
    }

    // Расчёт цены
    const nights = eachNightDates(checkIn, checkOut);
    let total = 0;
    for (const n of nights) {
      total += isWeekendNight(n) ? settings.weekend_price : settings.weekday_price;
    }

    const bookingId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await run(
      db,
      `INSERT INTO bookings (id, check_in, check_out, name, phone, guests, comment, nights, total_price, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bookingId, checkIn, checkOut, name, phone, Number(guests), comment || "", nightsCount, total, createdAt]
    );

    // Telegram
    const msg =
      `🏡 <b>Новая бронь (авто)</b>\n\n` +
      `📅 <b>Даты:</b> ${checkIn} → ${checkOut} (${nightsCount} ноч.)\n` +
      `👥 <b>Гостей:</b> ${Number(guests)}\n` +
      `👤 <b>Имя:</b> ${escapeHtml(name)}\n` +
      `📞 <b>Телефон:</b> ${escapeHtml(phone)}\n` +
      (comment ? `💬 <b>Комментарий:</b> ${escapeHtml(comment)}\n` : "") +
      `\n💰 <b>Итого:</b> ${total}\n` +
      `🆔 <b>ID:</b> ${bookingId}`;

    await sendTelegram(msg);

    res.json({ bookingId, nights: nightsCount, totalPrice: total });
  } catch (e) {
    res.status(500).json({ error: "booking_failed" });
  }
});

// --- Admin API (для блокировок/просмотра) ---

app.post("/api/admin/block", adminAuth, async (req, res) => {
  try {
    const { startDate, endDate, reason } = req.body || {};
    if (!startDate || !endDate) return res.status(400).json({ error: "missing_fields" });

    const nightsCount = daysBetween(startDate, endDate);
    if (!Number.isFinite(nightsCount) || nightsCount <= 0) {
      return res.status(400).json({ error: "invalid_dates" });
    }

    const conflictBooking = await get(
      db,
      `SELECT id FROM bookings WHERE NOT (check_out <= ? OR check_in >= ?) LIMIT 1`,
      [startDate, endDate]
    );
    if (conflictBooking) return res.status(409).json({ error: "conflict_with_booking" });

    const id = crypto.randomUUID();
    await run(
      db,
      `INSERT INTO blocked_ranges (id, start_date, end_date, reason, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, startDate, endDate, reason || "", new Date().toISOString()]
    );

    res.json({ ok: true, id });
  } catch {
    res.status(500).json({ error: "block_failed" });
  }
});

app.get("/api/admin/bookings", adminAuth, async (req, res) => {
  const rows = await all(db, `SELECT * FROM bookings ORDER BY created_at DESC LIMIT 200`);
  res.json({ rows });
});

app.post("/api/admin/cancel", adminAuth, async (req, res) => {
  try {
    const { bookingId } = req.body || {};
    if (!bookingId) return res.status(400).json({ error: "missing_bookingId" });
    await run(db, `DELETE FROM bookings WHERE id=?`, [bookingId]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "cancel_failed" });
  }
});

(async () => {
  db = await initDb();
  app.listen(PORT, () => console.log(`API running: http://localhost:${PORT}`));
})();
