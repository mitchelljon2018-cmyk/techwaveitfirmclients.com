/* ============================================================
   local-store.js — Techwave Client Management System (TCMS)

   Replaces the Firebase layer with plain browser storage, so the
   whole app runs fully offline — no account, no internet connection,
   no external service required. Everything lives in this browser's
   Local Storage.

   This file provides three small building blocks that js/db.js is
   built on top of:
     1. LocalStore   — read/write named "collections" (arrays of
                        records) and single "documents" (objects) in
                        Local Storage, as JSON.
     2. Bus           — a tiny pub/sub used to fake Firestore's live
                        "onSnapshot" behaviour: whenever a collection
                        changes, every active subscriber is re-run.
     3. hashPassword   — a salted, iterated hash so raw passwords are
                        never stored in Local Storage as plain text.
                        (This is NOT bank-grade encryption — it's a
                        reasonable safeguard for an internal offline
                        tool, not a system exposed to the internet.)
   ============================================================ */

const LS_PREFIX = 'tcms_';

/** Some browsers refuse Local Storage on pages opened directly as a file
 *  (file://) instead of through a web server — it throws instead of just
 *  being empty. When that happens we fall back to an in-memory store so
 *  the app still works for this one session, and flag it so the UI can
 *  tell the person their data won't be saved between visits. */
let STORAGE_AVAILABLE = true;
try {
  const testKey = LS_PREFIX + '__probe';
  localStorage.setItem(testKey, '1');
  localStorage.removeItem(testKey);
} catch (e) {
  STORAGE_AVAILABLE = false;
}
const _memoryFallback = {};

const LocalStore = {
  isPersistent() { return STORAGE_AVAILABLE; },
  _read(key, fallback) {
    if (!STORAGE_AVAILABLE) {
      return key in _memoryFallback ? JSON.parse(_memoryFallback[key]) : fallback;
    }
    try {
      const raw = localStorage.getItem(LS_PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  },
  _write(key, value) {
    const raw = JSON.stringify(value);
    if (!STORAGE_AVAILABLE) { _memoryFallback[key] = raw; return; }
    try {
      localStorage.setItem(LS_PREFIX + key, raw);
    } catch (e) {
      // Ran out of quota or storage became unavailable mid-session — keep
      // going in memory rather than crashing the app.
      _memoryFallback[key] = raw;
    }
  },

  /* ---------- collections: arrays of records, each with an `id` ---------- */
  getCollection(name) { return this._read('col_' + name, []); },
  setCollection(name, list) {
    this._write('col_' + name, list);
    Bus.emit(name);
  },
  addRecord(name, record) {
    const list = this.getCollection(name);
    list.push(record);
    this.setCollection(name, list);
    return record;
  },
  updateRecord(name, id, updates) {
    const list = this.getCollection(name);
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) throw new Error('Record not found.');
    list[idx] = { ...list[idx], ...updates };
    this.setCollection(name, list);
    return list[idx];
  },
  deleteRecord(name, id) {
    const list = this.getCollection(name).filter(r => r.id !== id);
    this.setCollection(name, list);
  },

  /* ---------- documents: single named objects ---------- */
  getDoc(name, fallback) { return this._read('doc_' + name, fallback); },
  setDoc(name, value) {
    this._write('doc_' + name, value);
    Bus.emit('doc_' + name);
  }
};

/* ---------- tiny pub/sub, stands in for Firestore's onSnapshot ---------- */
const Bus = {
  _listeners: {},
  on(channel, fn) {
    (this._listeners[channel] = this._listeners[channel] || []).push(fn);
    return () => {
      this._listeners[channel] = (this._listeners[channel] || []).filter(f => f !== fn);
    };
  },
  emit(channel) {
    (this._listeners[channel] || []).forEach(fn => { try { fn(); } catch (e) {} });
  }
};

/** A record's created/updated time is stored as { seconds } so the rest of
 *  the app (which was written expecting Firestore Timestamp-like objects)
 *  keeps working unchanged. */
function localTimestamp() {
  return { seconds: Math.floor(Date.now() / 1000) };
}

function newId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------- password hashing (salted + iterated, dependency-free) ---------- */
function _mix(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}
function hashPassword(password, salt) {
  let h = salt + '::' + password;
  for (let i = 0; i < 3000; i++) h = _mix(h + salt);
  return h;
}
function makeSalt() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
