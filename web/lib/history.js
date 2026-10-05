// History lives in this browser only (localStorage). Swap for a database later.
const KEY = "hush.history.v1";
const LIMIT = 50;

export function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked: history is a convenience, ignore */
  }
  return list;
}

export function addHistory(entry) {
  return write([entry, ...readHistory()].slice(0, LIMIT));
}

export function removeHistory(id) {
  return write(readHistory().filter((e) => e.id !== id));
}

export function clearHistory() {
  return write([]);
}
