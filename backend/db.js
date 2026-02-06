const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = path.join(__dirname, "data.sqlite");

function openDb() {
  return new sqlite3.Database(DB_PATH);
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDb() {
  const db = openDb();
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await new Promise((resolve, reject) => {
    db.exec(schema, (err) => (err ? reject(err) : resolve()));
  });
  return db;
}

module.exports = { initDb, run, get, all };