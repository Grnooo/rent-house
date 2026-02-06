const API_BASE = "http://localhost:3001";

const WEEKDAY_PRICE = 10000;
const WEEKEND_PRICE = 15000;
const MIN_NIGHTS = 1;

const dateRangeEl = document.getElementById("dateRange");
const nightsEl = document.getElementById("nights");
const totalEl = document.getElementById("total");
const hintEl = document.getElementById("availabilityHint");
const bookBtn = document.getElementById("bookBtn");
const resultEl = document.getElementById("result");

const nameEl = document.getElementById("name");
const phoneEl = document.getElementById("phone");
const guestsEl = document.getElementById("guests");
const commentEl = document.getElementById("comment");

let picker;
let bookedRanges = [];
let blockedRanges = [];
let selected = { checkIn: null, checkOut: null };

// Карусель
new Swiper(".swiper", {
  loop: true,
  pagination: { el: ".swiper-pagination" },
  navigation: { nextEl: ".swiper-button-next", prevEl: ".swiper-button-prev" },
});

// Helpers
function parseISO(s){
  const [y,m,d] = s.split("-").map(Number);
  return new Date(y, m-1, d);
}
function iso(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function daysBetween(a,b){
  return Math.floor((parseISO(b)-parseISO(a))/(24*60*60*1000));
}
function eachNightDates(checkIn, checkOut){
  const out=[];
  for (let d=new Date(parseISO(checkIn)); d < parseISO(checkOut); d.setDate(d.getDate()+1)){
    out.push(iso(d));
  }
  return out;
}
function isWeekendNight(yyyyMmDd){
  // выходные ночи: пятница и суббота
  const day = parseISO(yyyyMmDd).getDay(); // 0 Sun, 5 Fri, 6 Sat
  return day === 5 || day === 6;
}
function calcTotal(checkIn, checkOut){
  const nights = eachNightDates(checkIn, checkOut);
  let total = 0;
  for (const n of nights) total += isWeekendNight(n) ? WEEKEND_PRICE : WEEKDAY_PRICE;
  return total;
}

function normalizeRanges(ranges){
  return (ranges || []).map(r => ({ start: r.start, end: r.end })); // end EXCLUSIVE
}

function isDisabled(date){
  // date disabled if inside any range [start, end)
  const d = iso(date);
  const inRange = (r) => (d >= r.start && d < r.end);
  return bookedRanges.some(inRange) || blockedRanges.some(inRange);
}

async function loadAvailability(){
  hintEl.textContent = "Загружаем занятость…";
  const from = iso(new Date());
  const toDate = new Date(); toDate.setMonth(toDate.getMonth()+6);
  const to = iso(toDate);

  const r = await fetch(`${API_BASE}/api/availability?from=${from}&to=${to}`);
  const data = await r.json();

  bookedRanges = normalizeRanges(data.booked);
  blockedRanges = normalizeRanges(data.blocked);

  hintEl.textContent = "Выбери даты — занятые дни недоступны.";
}

// Календарь
function initPicker(){
  picker = flatpickr(dateRangeEl, {
    mode: "range",
    dateFormat: "Y-m-d",
    minDate: "today",
    disable: [ isDisabled ],
    onChange: (selectedDates, dateStr) => {
      resultEl.hidden = true;
      const parts = dateStr.split(" to ");
      if (parts.length === 2) {
        selected.checkIn = parts[0];
        selected.checkOut = parts[1];

        const nights = daysBetween(selected.checkIn, selected.checkOut);
        nightsEl.textContent = String(nights);

        const total = calcTotal(selected.checkIn, selected.checkOut);
        totalEl.textContent = total.toLocaleString("ru-RU");

        bookBtn.disabled = !(nights >= MIN_NIGHTS);
      } else {
        selected.checkIn = null;
        selected.checkOut = null;
        nightsEl.textContent = "—";
        totalEl.textContent = "—";
        bookBtn.disabled = true;
      }
    }
  });
}

function setLoading(isLoading){
  bookBtn.disabled = isLoading;
  bookBtn.textContent = isLoading ? "Бронируем…" : "Забронировать";
}

bookBtn.addEventListener("click", async () => {
  const checkIn = selected.checkIn;
  const checkOut = selected.checkOut;

  const payload = {
    checkIn, checkOut,
    guests: Number(guestsEl.value),
    name: nameEl.value.trim(),
    phone: phoneEl.value.trim(),
    comment: commentEl.value.trim()
  };

  if (!payload.name || !payload.phone) {
    resultEl.hidden = false;
    resultEl.textContent = "Заполни имя и телефон 🙂";
    return;
  }

  setLoading(true);
  resultEl.hidden = true;

  try {
    const resp = await fetch(`${API_BASE}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();

    if (!resp.ok) {
      if (data.error === "dates_unavailable") {
        resultEl.hidden = false;
        resultEl.textContent = "Эти даты уже заняты. Выбери другие 🙌";
        await refreshPicker();
        return;
      }
      if (data.error === "min_nights") {
        resultEl.hidden = false;
        resultEl.textContent = `Минимум ночей: ${data.minNights}`;
        return;
      }
      resultEl.hidden = false;
      resultEl.textContent = "Ошибка бронирования. Попробуй ещё раз.";
      return;
    }

    resultEl.hidden = false;
    resultEl.innerHTML =
      `Готово! Бронь подтверждена ✅<br>` +
      `ID: <b>${data.bookingId}</b><br>` +
      `Итого: <b>${Number(data.totalPrice).toLocaleString("ru-RU")}</b>`;

    await refreshPicker();

  } finally {
    setLoading(false);
  }
});

async function refreshPicker(){
  await loadAvailability();
  const current = picker.selectedDates;
  picker.destroy();
  initPicker();
  if (current && current.length) picker.setDate(current, true);
}

(async function start(){
  await loadAvailability();
  initPicker();
})();
