const API_BASE = "http://localhost:3001";

const loginCard = document.getElementById("loginCard");
const adminUI = document.getElementById("adminUI");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const adminPassEl = document.getElementById("adminPass");
const loginMsg = document.getElementById("loginMsg");

const refreshBtn = document.getElementById("refreshBtn");
const searchInput = document.getElementById("searchInput");
const countTag = document.getElementById("countTag");
const bookingsTbody = document.getElementById("bookingsTbody");
const adminMsg = document.getElementById("adminMsg");

const blockRangeEl = document.getElementById("blockRange");
const blockReasonEl = document.getElementById("blockReason");
const blockBtn = document.getElementById("blockBtn");
const blockMsg = document.getElementById("blockMsg");

let adminPassword = localStorage.getItem("adminPassword") || "";
let allBookings = [];

// Flatpickr для блокировки диапазона
flatpickr(blockRangeEl, {
  mode: "range",
  dateFormat: "Y-m-d",
  minDate: "today"
});

function setLoginState(isLoggedIn) {
  loginCard.style.display = isLoggedIn ? "none" : "block";
  adminUI.style.display = isLoggedIn ? "block" : "none";
  logoutBtn.style.display = isLoggedIn ? "inline-flex" : "none";
}

function headers() {
  return {
    "Content-Type": "application/json",
    "x-admin-password": adminPassword
  };
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("ru-RU");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function rowHtml(b) {
  return `
    <tr>
      <td>
        <div><b>${escapeHtml(b.check_in)} → ${escapeHtml(b.check_out)}</b></div>
        <div class="small">Ночей: ${escapeHtml(b.nights)}</div>
        <div class="small">Создано: ${escapeHtml(b.created_at)}</div>
      </td>
      <td>${escapeHtml(b.guests)}</td>
      <td>
        <div><b>${escapeHtml(b.name)}</b></div>
        <div>${escapeHtml(b.phone)}</div>
      </td>
      <td class="small">${escapeHtml(b.comment || "")}</td>
      <td><b>${fmtMoney(b.total_price)}</b></td>
      <td class="mono">${escapeHtml(b.id)}</td>
      <td>
        <button class="btn danger" data-cancel="${escapeHtml(b.id)}" type="button">Отменить</button>
      </td>
    </tr>
  `;
}

function renderTable(rows) {
  countTag.textContent = `${rows.length} броней`;

  if (!rows.length) {
    bookingsTbody.innerHTML = `<tr><td colspan="7" class="small">Брони не найдены</td></tr>`;
    return;
  }

  bookingsTbody.innerHTML = rows.map(rowHtml).join("");

  // навешиваем обработчики на кнопки отмены
  bookingsTbody.querySelectorAll("[data-cancel]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-cancel");
      const ok = confirm(`Отменить бронь?\nID: ${id}`);
      if (!ok) return;
      await cancelBooking(id);
    });
  });
}

function applySearch() {
  const q = (searchInput.value || "").trim().toLowerCase();
  if (!q) return renderTable(allBookings);

  const filtered = allBookings.filter(b => {
    const hay = [
      b.check_in, b.check_out, b.name, b.phone, b.comment, b.id
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });

  renderTable(filtered);
}

async function fetchBookings() {
  adminMsg.textContent = "Загружаем брони…";
  try {
    const r = await fetch(`${API_BASE}/api/admin/bookings`, { headers: headers() });
    if (r.status === 401) throw new Error("unauthorized");
    const data = await r.json();

    allBookings = (data.rows || []);
    adminMsg.textContent = "";

    applySearch();
  } catch (e) {
    if (String(e.message) === "unauthorized") {
      adminMsg.textContent = "Пароль неверный. Выйди и войди заново.";
      adminMsg.style.color = "rgba(239,68,68,.9)";
    } else {
      adminMsg.textContent = "Ошибка загрузки броней.";
    }
  }
}

async function cancelBooking(bookingId) {
  adminMsg.textContent = "Отменяем бронь…";
  adminMsg.style.color = "";

  const r = await fetch(`${API_BASE}/api/admin/cancel`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ bookingId })
  });

  if (!r.ok) {
    adminMsg.textContent = "Не получилось отменить бронь.";
    adminMsg.style.color = "rgba(239,68,68,.9)";
    return;
  }

  adminMsg.textContent = "Бронь отменена ✅";
  adminMsg.style.color = "rgba(34,197,94,.9)";
  await fetchBookings();
}

async function blockDates(startDate, endDate, reason) {
  blockMsg.textContent = "Блокируем…";
  blockMsg.style.color = "";

  const r = await fetch(`${API_BASE}/api/admin/block`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ startDate, endDate, reason })
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    if (data.error === "conflict_with_booking") {
      blockMsg.textContent = "Нельзя: в этом диапазоне есть бронь.";
    } else {
      blockMsg.textContent = "Ошибка блокировки.";
    }
    blockMsg.style.color = "rgba(239,68,68,.9)";
    return;
  }

  blockMsg.textContent = "Готово! Даты заблокированы ✅";
  blockMsg.style.color = "rgba(34,197,94,.9)";
  blockReasonEl.value = "";
  blockRangeEl.value = "";
}

// ----- Login flow -----

loginBtn.addEventListener("click", async () => {
  loginMsg.textContent = "";

  adminPassword = adminPassEl.value.trim();
  if (!adminPassword) {
    loginMsg.textContent = "Введи пароль.";
    return;
  }

  // Быстрая проверка пароля — просто пробуем дернуть список броней
  const r = await fetch(`${API_BASE}/api/admin/bookings`, { headers: headers() });
  if (r.status === 401) {
    loginMsg.textContent = "Неверный пароль.";
    loginMsg.style.color = "rgba(239,68,68,.9)";
    return;
  }

  localStorage.setItem("adminPassword", adminPassword);
  setLoginState(true);
  await fetchBookings();
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("adminPassword");
  adminPassword = "";
  adminPassEl.value = "";
  setLoginState(false);
  allBookings = [];
  bookingsTbody.innerHTML = `<tr><td colspan="7" class="small">Пока пусто…</td></tr>`;
});

// actions
refreshBtn.addEventListener("click", fetchBookings);
searchInput.addEventListener("input", applySearch);

blockBtn.addEventListener("click", async () => {
  blockMsg.textContent = "";

  const raw = (blockRangeEl.value || "").trim();
  // flatpickr range отдаёт "YYYY-MM-DD to YYYY-MM-DD"
  const parts = raw.split(" to ");
  if (parts.length !== 2) {
    blockMsg.textContent = "Выбери диапазон (заезд — выезд).";
    blockMsg.style.color = "rgba(239,68,68,.9)";
    return;
  }

  const startDate = parts[0];
  const endDate = parts[1];
  const reason = (blockReasonEl.value || "").trim();

  await blockDates(startDate, endDate, reason);
});

// автологин если пароль уже сохранён
(function init() {
  if (adminPassword) {
    setLoginState(true);
    fetchBookings();
  } else {
    setLoginState(false);
  }
})();