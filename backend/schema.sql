PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  weekday_price INTEGER NOT NULL DEFAULT 10000,
  weekend_price INTEGER NOT NULL DEFAULT 15000,
  min_nights INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO settings (id, weekday_price, weekend_price, min_nights)
VALUES (1, 10000, 15000, 1);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  check_in TEXT NOT NULL,   -- YYYY-MM-DD
  check_out TEXT NOT NULL,  -- YYYY-MM-DD
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  guests INTEGER NOT NULL,
  comment TEXT,
  nights INTEGER NOT NULL,
  total_price INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blocked_ranges (
  id TEXT PRIMARY KEY,
  start_date TEXT NOT NULL, -- YYYY-MM-DD
  end_date TEXT NOT NULL,   -- YYYY-MM-DD (exclusive)
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_blocked_dates ON blocked_ranges(start_date, end_date);