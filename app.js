// VVB Sales — log your real sales and track them against a monthly goal.
// All data stays on this device (localStorage). Use Settings → Backup to save a copy.

const STORE_KEY = 'vvb-sales-v1';
const MILESTONES = [25, 50, 75, 100];
const RING_LEN = 2 * Math.PI * 52;

const $ = (sel) => document.querySelector(sel);

let state = load();

function load() {
  const fallback = { goal: 1000, currency: '$', notify: false, sales: [], milestonesHit: {} };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save on this device');
  }
}

// ---- helpers ----

function money(n, decimals = 2) {
  return state.currency + n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function ymd(d) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

function sum(list) {
  return list.reduce((t, s) => t + s.amount, 0);
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---- render ----

function render() {
  const now = new Date();
  const today = ymd(now);
  const thisMonth = monthKey(today);

  const monthSales = state.sales.filter((s) => monthKey(s.date) === thisMonth);
  const monthTotal = sum(monthSales);
  const pct = state.goal > 0 ? Math.min(100, (monthTotal / state.goal) * 100) : 0;

  // goal ring
  const ring = $('#ringFg');
  ring.style.strokeDasharray = RING_LEN;
  ring.style.strokeDashoffset = RING_LEN * (1 - pct / 100);
  ring.classList.toggle('done', pct >= 100);
  $('#goalPct').textContent = Math.floor(pct) + '%';
  $('#monthTotal').textContent = money(monthTotal);
  $('#goalLine').textContent = `Goal: ${money(state.goal, 0)}`;

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate() + 1;
  const remaining = state.goal - monthTotal;
  $('#paceLine').textContent = remaining > 0
    ? `${money(remaining / daysLeft, 0)}/day to hit it (${daysLeft}d left)`
    : 'Goal reached this month 🎉';

  // stat tiles
  $('#todayTotal').textContent = money(sum(state.sales.filter((s) => s.date === today)));
  $('#monthCount').textContent = monthSales.length;
  $('#avgSale').textContent = money(monthSales.length ? monthTotal / monthSales.length : 0);
  $('#allTotal').textContent = money(sum(state.sales), 0);

  renderChart(now);
  renderTopBeats(monthSales);
  renderList();
  renderBeatOptions();
}

function renderChart(now) {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(ymd(d));
  }
  const totals = days.map((day) => sum(state.sales.filter((s) => s.date === day)));
  const max = Math.max(...totals, 1);

  const chart = $('#chart');
  chart.innerHTML = '';
  days.forEach((day, i) => {
    const bar = document.createElement('div');
    bar.className = 'bar' + (totals[i] === 0 ? ' empty' : '') + (i === days.length - 1 ? ' today' : '');
    bar.style.height = totals[i] === 0 ? '2px' : `${Math.max(4, (totals[i] / max) * 100)}%`;
    bar.title = `${day}: ${money(totals[i])}`;
    chart.appendChild(bar);
  });
  $('#chartSum').textContent = money(totals.reduce((a, b) => a + b, 0), 0);
}

function renderTopBeats(monthSales) {
  const byBeat = {};
  monthSales.forEach((s) => {
    const k = s.beat || 'Untitled';
    byBeat[k] = byBeat[k] || { total: 0, count: 0 };
    byBeat[k].total += s.amount;
    byBeat[k].count += 1;
  });
  const top = Object.entries(byBeat).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  $('#topBeats').innerHTML = top.length
    ? top.map(([beat, v]) => `
        <li>
          <div><div class="title">${escapeHtml(beat)}</div><div class="muted small">${v.count} sale${v.count > 1 ? 's' : ''}</div></div>
          <div class="amt">${money(v.total)}</div>
        </li>`).join('')
    : '<li class="empty-msg">No sales logged this month yet.</li>';
}

function renderList() {
  const recent = [...state.sales].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 25);
  $('#salesList').innerHTML = recent.length
    ? recent.map((s) => `
        <li>
          <div>
            <div class="title">${escapeHtml(s.beat || 'Untitled')}</div>
            <div class="muted small">${escapeHtml(s.source)} · ${s.date}</div>
          </div>
          <div><span class="amt">${money(s.amount)}</span><button class="del" data-id="${s.id}" aria-label="Delete sale">×</button></div>
        </li>`).join('')
    : '<li class="empty-msg">Tap “Log sale” when you make a sale.</li>';
}

function renderBeatOptions() {
  const names = [...new Set(state.sales.map((s) => s.beat).filter(Boolean))];
  $('#beatOptions').innerHTML = names.map((n) => `<option value="${escapeHtml(n)}">`).join('');
}

// ---- milestones ----

async function checkMilestones() {
  const thisMonth = monthKey(ymd(new Date()));
  const total = sum(state.sales.filter((s) => monthKey(s.date) === thisMonth));
  const pct = (total / state.goal) * 100;
  const hit = state.milestonesHit[thisMonth] || [];

  for (const m of MILESTONES) {
    if (pct >= m && !hit.includes(m)) {
      hit.push(m);
      const msg = m === 100
        ? `Monthly goal hit: ${money(total, 0)} 🎉`
        : `${m}% of your monthly goal (${money(total, 0)} / ${money(state.goal, 0)})`;
      toast(msg);
      if (state.notify) await notify('VVB Sales', msg);
    }
  }
  state.milestonesHit[thisMonth] = hit;
  save();
}

async function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
  else new Notification(title, { body });
}

// ---- events ----

function openSheet(id) {
  $(id).showModal();
}

document.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', () => b.closest('dialog').close()));

$('#openAdd').addEventListener('click', () => {
  const f = $('#addForm');
  f.reset();
  f.date.value = ymd(new Date());
  openSheet('#addSheet');
  f.amount.focus();
});

$('#addForm').addEventListener('submit', async (e) => {
  const f = e.target;
  const amount = parseFloat(f.amount.value);
  if (!(amount > 0)) return;
  state.sales.push({
    id: Date.now(),
    amount: Math.round(amount * 100) / 100,
    beat: f.beat.value.trim(),
    source: f.source.value,
    date: f.date.value,
  });
  save();
  render();
  toast(`Logged ${money(amount)}`);
  await checkMilestones();
});

$('#salesList').addEventListener('click', (e) => {
  const btn = e.target.closest('.del');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const sale = state.sales.find((s) => s.id === id);
  if (!sale || !confirm(`Delete ${money(sale.amount)} – ${sale.beat || 'Untitled'}?`)) return;
  state.sales = state.sales.filter((s) => s.id !== id);
  save();
  render();
});

$('#openSettings').addEventListener('click', () => {
  const f = $('#settingsForm');
  f.goal.value = state.goal;
  f.currency.value = state.currency;
  f.notify.checked = state.notify;
  openSheet('#settingsSheet');
});

$('#settingsForm').addEventListener('submit', async (e) => {
  const f = e.target;
  state.goal = Math.max(1, parseFloat(f.goal.value) || state.goal);
  state.currency = f.currency.value.trim() || '$';
  state.notify = f.notify.checked;
  if (state.notify && 'Notification' in window && Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      state.notify = false;
      toast('Notifications blocked in browser settings');
    }
  }
  save();
  render();
});

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('#exportCsv').addEventListener('click', () => {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['date', 'beat', 'source', 'amount'], ...state.sales.map((s) => [s.date, s.beat, s.source, s.amount])];
  download(`vvb-sales-${ymd(new Date())}.csv`, rows.map((r) => r.map(q).join(',')).join('\n'), 'text/csv');
});

$('#exportJson').addEventListener('click', () => {
  download(`vvb-sales-backup-${ymd(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json');
});

$('#importJson').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.sales)) throw new Error('bad file');
    if (!confirm(`Replace current data with ${data.sales.length} sales from backup?`)) return;
    state = { ...load(), ...data };
    save();
    render();
    toast('Backup restored');
  } catch {
    toast('That file is not a VVB Sales backup');
  } finally {
    e.target.value = '';
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
