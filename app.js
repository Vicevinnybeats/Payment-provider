// VVB Sales — log your real sales and track them against weekly / monthly / yearly goals.
// All data stays on this device (localStorage). Use Settings → Backup to save a copy.

const STORE_KEY = 'vvb-sales-v1';
const MILESTONES = [25, 50, 75, 100];
const RING_LEN = 2 * Math.PI * 52;
const PERIOD_NAMES = { week: 'week', month: 'month', year: 'year' };

const $ = (sel) => document.querySelector(sel);

let state = load();
let period = state.period || 'month';
let editingId = null;
let saleType = 'Lease';

function load() {
  const fallback = {
    goals: { week: 250, month: 1000, year: 12000 },
    currency: '$',
    name: '',
    notify: false,
    period: 'month',
    sales: [],
    milestonesHit: {},
  };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return fallback;
    const data = { ...fallback, ...JSON.parse(raw) };
    // migrate the first version, which had a single monthly goal
    if (typeof data.goal === 'number') {
      data.goals = { ...fallback.goals, month: data.goal };
      delete data.goal;
      const hits = {};
      for (const [k, v] of Object.entries(data.milestonesHit)) hits[k.includes(':') ? k : `month:${k}`] = v;
      data.milestonesHit = hits;
    }
    data.goals = { ...fallback.goals, ...data.goals };
    return data;
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

function short(n) {
  if (n >= 10000) return state.currency + (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k';
  return money(n, n % 1 === 0 || n >= 1000 ? 0 : 2);
}

function ymd(d) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function total(list) {
  return list.reduce((t, s) => t + s.amount, 0);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2400);
}

// Start (inclusive) and end (exclusive) of the period containing `ref`.
function range(p, ref = new Date()) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  if (p === 'week') {
    const start = addDays(d, -((d.getDay() + 6) % 7)); // Monday
    return { start, end: addDays(start, 7) };
  }
  if (p === 'month') {
    return { start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth() + 1, 1) };
  }
  return { start: new Date(d.getFullYear(), 0, 1), end: new Date(d.getFullYear() + 1, 0, 1) };
}

function salesIn({ start, end }) {
  const a = ymd(start);
  const b = ymd(end);
  return state.sales.filter((s) => s.date >= a && s.date < b);
}

function periodKey(p, ref = new Date()) {
  return `${p}:${ymd(range(p, ref).start)}`;
}

// ---- render ----

function render() {
  const now = new Date();
  const today = ymd(now);
  const r = range(period, now);
  const list = salesIn(r);
  const sum = total(list);
  const goal = state.goals[period] || 0;

  document.querySelectorAll('#periodTabs button').forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.period === period)));

  const hour = now.getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  $('#hello').textContent = state.name ? `${greet}, ${state.name}` : greet;

  // hero
  $('#periodLabel').textContent = `This ${PERIOD_NAMES[period]}`;
  $('#periodTotal').textContent = money(sum);

  const prevRange = range(period, addDays(r.start, -1));
  const elapsed = now - r.start;
  const prevSameSpan = salesIn({ start: prevRange.start, end: addDays(new Date(prevRange.start.getTime() + elapsed), 1) });
  const prevSum = total(prevSameSpan);
  const delta = $('#delta');
  if (prevSum > 0) {
    const pct = Math.round(((sum - prevSum) / prevSum) * 100);
    delta.textContent = `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs last ${PERIOD_NAMES[period]} so far`;
    delta.className = 'delta ' + (pct >= 0 ? 'up' : 'down');
  } else {
    delta.textContent = sum > 0 ? `First sales this ${PERIOD_NAMES[period]} 🔥` : `No sales yet this ${PERIOD_NAMES[period]}`;
    delta.className = 'delta';
  }

  const hero = $('.hero');
  hero.classList.toggle('no-goal', !goal);
  if (goal) {
    const pct = Math.min(100, (sum / goal) * 100);
    const ring = $('#ringFg');
    ring.style.strokeDasharray = RING_LEN;
    ring.style.strokeDashoffset = RING_LEN * (1 - pct / 100);
    ring.classList.toggle('done', pct >= 100);
    $('#goalPct').textContent = Math.floor(pct) + '%';
    $('#progressFill').style.width = pct + '%';
    $('#goalLine').textContent = `${money(sum, 0)} of ${money(goal, 0)}`;
    const daysLeft = Math.max(1, Math.round((r.end - parseDate(today)) / 864e5));
    const remaining = goal - sum;
    $('#paceLine').textContent = remaining > 0
      ? `${short(remaining / daysLeft)}/day · ${daysLeft}d left`
      : 'Goal reached 🎉';
  } else {
    $('#goalLine').textContent = 'No goal set';
    $('#paceLine').textContent = 'Set one in ⚙';
  }

  // stats
  $('#statCount').textContent = list.length;
  $('#statAvg').textContent = short(list.length ? sum / list.length : 0);
  $('#statToday').textContent = short(total(state.sales.filter((s) => s.date === today)));

  renderChart(r, today);
  renderTopBeats(list);
  renderList();
  renderBeatOptions();
}

function renderChart(r, today) {
  const buckets = [];
  if (period === 'year') {
    for (let m = 0; m < 12; m++) {
      const start = new Date(r.start.getFullYear(), m, 1);
      const end = new Date(r.start.getFullYear(), m + 1, 1);
      buckets.push({
        label: start.toLocaleDateString(undefined, { month: 'short' }),
        value: total(salesIn({ start, end })),
        now: today >= ymd(start) && today < ymd(end),
      });
    }
  } else {
    for (let d = new Date(r.start); d < r.end; d = addDays(d, 1)) {
      const key = ymd(d);
      buckets.push({
        label: period === 'week' ? d.toLocaleDateString(undefined, { weekday: 'short' }) : String(d.getDate()),
        value: total(state.sales.filter((s) => s.date === key)),
        now: key === today,
      });
    }
  }

  const max = Math.max(...buckets.map((b) => b.value), 1);
  const chart = $('#chart');
  chart.innerHTML = '';
  buckets.forEach((b) => {
    const bar = document.createElement('div');
    bar.className = 'bar' + (b.value ? ' has' : '') + (b.now ? ' now' : '');
    bar.style.height = b.value ? `${Math.max(5, (b.value / max) * 100)}%` : '3px';
    bar.title = `${b.label}: ${money(b.value)}`;
    chart.appendChild(bar);
  });

  $('#chartTitle').textContent = period === 'year' ? 'Monthly sales' : 'Daily sales';
  const best = buckets.reduce((a, b) => (b.value > a.value ? b : a), buckets[0]);
  $('#chartBest').textContent = best.value ? `Best: ${best.label} · ${short(best.value)}` : '';

  const axis = period === 'week'
    ? buckets.map((b) => b.label[0])
    : period === 'year'
      ? buckets.filter((_, i) => i % 3 === 0).map((b) => b.label)
      : ['1', '8', '15', '22', String(buckets.length)];
  $('#chartAxis').innerHTML = axis.map((l) => `<span>${escapeHtml(l)}</span>`).join('');
}

function renderTopBeats(list) {
  const byBeat = {};
  list.forEach((s) => {
    const k = s.beat || 'Untitled';
    byBeat[k] = byBeat[k] || { total: 0, count: 0 };
    byBeat[k].total += s.amount;
    byBeat[k].count += 1;
  });
  const top = Object.entries(byBeat).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  const max = top.length ? top[0][1].total : 1;
  $('#topBeats').innerHTML = top.length
    ? top.map(([beat, v], i) => `
        <li>
          <div class="avatar">${i + 1}</div>
          <div class="grow">
            <div class="title">${escapeHtml(beat)}</div>
            <div class="bar-mini"><div style="width:${(v.total / max) * 100}%"></div></div>
          </div>
          <div style="text-align:right">
            <div class="amt">${money(v.total)}</div>
            <div class="sub">${v.count} sale${v.count > 1 ? 's' : ''}</div>
          </div>
        </li>`).join('')
    : `<li class="empty-msg">No sales logged this ${PERIOD_NAMES[period]} yet.</li>`;
}

function renderList() {
  const recent = [...state.sales].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 30);
  $('#salesList').innerHTML = recent.length
    ? recent.map((s) => {
        const dateLabel = parseDate(s.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        const meta = [s.type, s.source, dateLabel].filter(Boolean).map(escapeHtml).join(' · ');
        const initial = escapeHtml((s.beat || '?').trim()[0].toUpperCase());
        return `
          <li class="sale-row" data-id="${s.id}" tabindex="0" role="button" aria-label="Edit sale">
            <div class="avatar">${initial}</div>
            <div class="grow">
              <div class="title">${escapeHtml(s.beat || 'Untitled')}</div>
              <div class="sub">${meta}${s.note ? ' · ' + escapeHtml(s.note) : ''}</div>
            </div>
            <div class="amt">${money(s.amount)}</div>
          </li>`;
      }).join('')
    : '<li class="empty-msg">Tap “Log sale” when you make a sale.</li>';
}

function renderBeatOptions() {
  const names = [...new Set(state.sales.map((s) => s.beat).filter(Boolean))];
  $('#beatOptions').innerHTML = names.map((n) => `<option value="${escapeHtml(n)}">`).join('');
}

// ---- milestones ----

async function checkMilestones() {
  for (const p of ['week', 'month', 'year']) {
    const goal = state.goals[p];
    if (!goal) continue;
    const key = periodKey(p);
    const sum = total(salesIn(range(p)));
    const pct = (sum / goal) * 100;
    const hit = state.milestonesHit[key] || [];
    const newHits = MILESTONES.filter((m) => pct >= m && !hit.includes(m));
    if (!newHits.length) continue;
    const m = Math.max(...newHits);
    state.milestonesHit[key] = [...hit, ...newHits];
    const msg = m === 100
      ? `${PERIOD_NAMES[p][0].toUpperCase() + PERIOD_NAMES[p].slice(1)}ly goal hit: ${money(sum, 0)} 🎉`
      : `${m}% of your ${PERIOD_NAMES[p]}ly goal (${money(sum, 0)} / ${money(goal, 0)})`;
    toast(msg);
    if (state.notify) await notify('VVB Sales', msg);
  }
  save();
}

async function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
  else new Notification(title, { body });
}

// ---- add / edit sale ----

function setType(v) {
  saleType = v;
  document.querySelectorAll('#typeChips button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
}

function openSale(sale) {
  const f = $('#saleForm');
  f.reset();
  editingId = sale ? sale.id : null;
  $('#saleTitle').textContent = sale ? 'Edit sale' : 'Log a sale';
  $('#saleSubmit').textContent = 'Save';
  $('#deleteSale').hidden = !sale;
  $('#saleCur').textContent = state.currency;
  f.amount.value = sale ? sale.amount : '';
  f.beat.value = sale ? sale.beat : '';
  f.source.value = sale ? sale.source : (state.lastSource || 'BeatStars');
  f.date.value = sale ? sale.date : ymd(new Date());
  f.note.value = sale ? sale.note || '' : '';
  setType(sale ? sale.type || 'Other' : 'Lease');
  $('#saleSheet').showModal();
  if (!sale) f.amount.focus();
}

$('#typeChips').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) setType(b.dataset.v);
});

$('#openAdd').addEventListener('click', () => openSale(null));

$('#salesList').addEventListener('click', (e) => {
  const row = e.target.closest('.sale-row');
  if (!row) return;
  openSale(state.sales.find((s) => s.id === Number(row.dataset.id)));
});
$('#salesList').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('sale-row')) e.target.click();
});

$('#saleForm').addEventListener('submit', async (e) => {
  const f = e.target;
  const amount = Math.round(parseFloat(f.amount.value) * 100) / 100;
  if (!(amount > 0)) return;
  const data = {
    amount,
    beat: f.beat.value.trim(),
    type: saleType,
    source: f.source.value,
    date: f.date.value,
    note: f.note.value.trim(),
  };
  state.lastSource = data.source;
  if (editingId) {
    state.sales = state.sales.map((s) => (s.id === editingId ? { ...s, ...data } : s));
    toast('Sale updated');
  } else {
    state.sales.push({ id: Date.now(), ...data });
    toast(`Logged ${money(amount)}`);
  }
  save();
  render();
  await checkMilestones();
});

$('#deleteSale').addEventListener('click', () => {
  const sale = state.sales.find((s) => s.id === editingId);
  if (!sale || !confirm(`Delete ${money(sale.amount)} – ${sale.beat || 'Untitled'}?`)) return;
  state.sales = state.sales.filter((s) => s.id !== editingId);
  save();
  render();
  $('#saleSheet').close();
  toast('Sale deleted');
});

// ---- period tabs ----

$('#periodTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  period = b.dataset.period;
  state.period = period;
  save();
  render();
});

// ---- settings ----

document.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', () => b.closest('dialog').close()));

// tap outside a sheet to close it
document.querySelectorAll('dialog').forEach((d) =>
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

$('#openSettings').addEventListener('click', () => {
  const f = $('#settingsForm');
  f.goalWeek.value = state.goals.week;
  f.goalMonth.value = state.goals.month;
  f.goalYear.value = state.goals.year;
  f.name.value = state.name;
  f.currency.value = state.currency;
  f.notify.checked = state.notify;
  $('#settingsSheet').showModal();
});

$('#settingsForm').addEventListener('submit', async (e) => {
  const f = e.target;
  const num = (v) => Math.max(0, parseFloat(v) || 0);
  state.goals = { week: num(f.goalWeek.value), month: num(f.goalMonth.value), year: num(f.goalYear.value) };
  state.name = f.name.value.trim();
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
  toast('Settings saved');
});

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('#exportCsv').addEventListener('click', () => {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [
    ['date', 'beat', 'type', 'source', 'amount', 'note'],
    ...state.sales.map((s) => [s.date, s.beat, s.type, s.source, s.amount, s.note]),
  ];
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
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
    state = load();
    period = state.period || 'month';
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
