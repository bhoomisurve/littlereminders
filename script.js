(() => {
  'use strict';
  const REMINDERS = window.REMINDERS;
  const XP_PER_LEVEL = 100;
  const LEVELS = ['Seedling', 'Sprout', 'Bloom', 'Glow', 'Radiant', 'Luminary'];
  const KEY = { xp: 'lr-xp', saved: 'lr-saved', paid: 'lr-save-paid', quotes: 'lr-quotes' };
  const $ = (id) => document.getElementById(id);

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } }
  };

  const state = {
    index: Math.floor(Math.random() * REMINDERS.length),
    filter: 'all',
    xp: Number(store.get(KEY.xp, 0)) || 0,
    saved: new Set(store.get(KEY.saved, [])),
    client: null,
    user: null
  };

  const current = () => REMINDERS[state.index];
  const pool = () => state.filter === 'all' ? REMINDERS : REMINDERS.filter((r) => r.category === state.filter);
  const escapeHtml = (v) => String(v).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

  /* ---------- UI ---------- */
  function renderLevel() {
    const level = Math.floor(state.xp / XP_PER_LEVEL);
    const into = state.xp % XP_PER_LEVEL;
    $('levelNum').textContent = `LVL ${level + 1}`;
    $('levelName').textContent = LEVELS[Math.min(level, LEVELS.length - 1)];
    $('xpText').textContent = `${into} / ${XP_PER_LEVEL} XP`;
    $('xpBar').style.width = `${into}%`;
  }

  function render() {
    const r = current();
    const isSaved = state.saved.has(r.number);
    $('reminderNumber').textContent = `Reminder #${r.number}`;
    $('techQuote').textContent = r.tech;
    $('techBody').textContent = r.techBody;
    $('humanQuote').textContent = r.human;
    $('humanBody').textContent = r.humanBody;
    $('modalQuote').textContent = r.tech;
    $('modalHuman').textContent = r.human;
    $('saveButton').classList.toggle('saved', isSaved);
    $('saveButton').textContent = isSaved ? '♥' : '♡';
    renderLevel();
  }

  let toastTimer;
  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2200);
  }

  function celebrate(amount) {
    const pop = $('xpPop');
    pop.querySelector('span').textContent = `+${amount} XP`;
    pop.classList.remove('show');
    void pop.offsetWidth;
    pop.classList.add('show');
    setTimeout(() => pop.classList.remove('show'), 1900);
  }

  const overlays = ['welcomeOverlay', 'savedOverlay', 'communityOverlay'];
  const anyModalOpen = () => $('welcomeOverlay').matches(':not(.hidden)') || $('savedOverlay').classList.contains('open') || $('communityOverlay').classList.contains('open');
  function closeAll() {
    $('welcomeOverlay').classList.add('hidden');
    $('savedOverlay').classList.remove('open');
    $('communityOverlay').classList.remove('open');
  }

  /* ---------- XP ---------- */
  // Online: the server decides how much XP is awarded (record_event in schema.sql).
  // Offline: the same rules are applied locally so the app still works.
  async function recordEvent(event) {
    const number = current().number;
    if (state.client && state.user) {
      const { data, error } = await state.client.rpc('record_event', { p_reminder: number, p_event: event });
      if (!error && data) { const gained = data.awarded; state.xp = data.xp; store.set(KEY.xp, state.xp); return gained; }
      console.warn('record_event failed:', error && error.message);
    }
    let gained = 0;
    const paid = store.get(KEY.paid, []);
    if (event === 'next') gained = 10;
    if (event === 'save' && !paid.includes(number)) { gained = 10; store.set(KEY.paid, [...paid, number]); }
    state.xp += gained;
    store.set(KEY.xp, state.xp);
    return gained;
  }

  /* ---------- Actions ---------- */
  async function next() {
    const list = pool();
    const pos = list.indexOf(current());
    state.index = REMINDERS.indexOf(list[(pos + 1) % list.length]);
    render();
    toast('A fresh reminder has arrived ✦');
    await recordEvent('next');
    render();
  }

  async function toggleSave() {
    const number = current().number;
    const nowSaved = !state.saved.has(number);
    if (nowSaved) state.saved.add(number); else state.saved.delete(number);
    store.set(KEY.saved, [...state.saved]);
    render();
    toast(nowSaved ? 'Reminder saved to your space ♡' : 'Removed from saved reminders');
    if (state.client && state.user) {
      const table = state.client.from('saved_reminders');
      const op = nowSaved
        ? table.upsert({ user_id: state.user.id, reminder_number: number }, { onConflict: 'user_id,reminder_number' })
        : table.delete().match({ user_id: state.user.id, reminder_number: number });
      const { error } = await op;
      if (error) console.warn(error.message);
    }
    const gained = await recordEvent(nowSaved ? 'save' : 'unsave');
    if (gained > 0) celebrate(gained);
    render();
  }

  function setFilter(category, label) {
    state.filter = category;
    document.querySelectorAll('.filter').forEach((el) => el.classList.toggle('active', el.dataset.filter === category));
    const list = pool();
    state.index = REMINDERS.indexOf(list[Math.floor(Math.random() * list.length)]);
    render();
    toast(`${label} selected`);
  }

  function openSaved() {
    const items = REMINDERS.filter((r) => state.saved.has(r.number));
    $('savedItems').innerHTML = items.length
      ? items.map((r) => `<div class="saved-item"><strong>${escapeHtml(r.human)}</strong><small>REMINDER #${r.number} · ${r.category.toUpperCase()}</small></div>`).join('')
      : '<div class="empty-saved">No saved reminders yet.<br>Tap the ♡ on a reminder to keep it here.</div>';
    $('savedOverlay').classList.add('open');
  }

  /* ---------- Community quotes ---------- */
  function renderCommunity(quotes) {
    $('communityQuotes').innerHTML = quotes.length
      ? quotes.map((q) => `<article class="community-quote"><p>“${escapeHtml(q.quote)}”</p><small>SHARED BY SOMEONE IN THE COMMUNITY · ${new Date(q.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small></article>`).join('')
      : '<div class="empty-saved">No community quotes yet.<br>Be the first person to leave one.</div>';
  }

  async function loadCommunityQuotes() {
    let quotes = store.get(KEY.quotes, []);
    if (state.client) {
      const { data, error } = await state.client.from('public_quotes').select('id,quote,created_at').order('created_at', { ascending: false }).limit(20);
      if (!error) quotes = data;
    }
    renderCommunity(quotes);
  }

  async function shareQuote(event) {
    event.preventDefault();
    const quote = $('quoteInput').value.trim();
    if (quote.length < 2) return;
    if (state.client) {
      const { error } = await state.client.from('public_quotes').insert({ quote });
      if (error) { toast('Could not share yet — please try again'); return; }
      toast('Your quote is now part of the community ✦');
    } else {
      store.set(KEY.quotes, [{ quote, created_at: new Date().toISOString() }, ...store.get(KEY.quotes, [])].slice(0, 20));
      toast('Your quote was saved on this device ✦');
    }
    $('quoteInput').value = '';
    $('quoteCount').textContent = '0 / 240';
  }

  /* ---------- Supabase ---------- */
  async function setupSupabase() {
    const cfg = window.LITTLE_REMINDERS_SUPABASE;
    if (!window.supabase || !cfg || !cfg.url || cfg.url.includes('YOUR-')) return;
    try {
      state.client = window.supabase.createClient(cfg.url, cfg.anonKey);
    } catch (e) { console.warn(e.message); return; }
    $('syncStatus').innerHTML = '<i></i> COMMUNITY LIVE';
    $('syncStatus').classList.add('live');
    try {
      const auth = await state.client.auth.signInAnonymously();
      if (auth.error) throw auth.error;
      state.user = auth.data.user;
      const { data } = await state.client.from('profiles').select('xp').eq('id', state.user.id).maybeSingle();
      if (data) state.xp = data.xp;
      const saved = await state.client.from('saved_reminders').select('reminder_number').eq('user_id', state.user.id);
      if (!saved.error) state.saved = new Set([...state.saved, ...saved.data.map((s) => s.reminder_number)]);
      $('syncStatus').innerHTML = '<i></i> LIVE SYNC';
      render();
      await recordEvent('view');
    } catch (e) {
      console.warn('Anonymous sign-in unavailable, running without profile sync:', e.message);
    }
  }

  /* ---------- Wiring ---------- */
  $('currentDate').textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  $('anotherButton').addEventListener('click', next);
  $('saveButton').addEventListener('click', toggleSave);
  $('savedButton').addEventListener('click', openSaved);
  $('closeSaved').addEventListener('click', closeAll);
  $('backToReminders').addEventListener('click', closeAll);
  $('closeWelcome').addEventListener('click', closeAll);
  $('closeCommunity').addEventListener('click', closeAll);
  $('closeCommunityButton').addEventListener('click', closeAll);
  overlays.forEach((id) => $(id).addEventListener('click', (e) => { if (e.target.id === id) closeAll(); }));
  $('startButton').addEventListener('click', () => {
    closeAll();
    setTimeout(() => $('reminderCard').scrollIntoView({ behavior: 'smooth', block: 'start' }), 180);
  });
  $('clearFilter').addEventListener('click', () => setFilter('all', 'All reminders'));
  document.querySelectorAll('.filter').forEach((btn) => btn.addEventListener('click', () => setFilter(btn.dataset.filter, btn.textContent.replace(/[^A-Za-z& ]/g, '').trim())));
  $('quoteInput').addEventListener('input', (e) => { $('quoteCount').textContent = `${e.target.value.length} / 240`; });
  $('quoteForm').addEventListener('submit', shareQuote);
  $('readQuotesButton').addEventListener('click', async () => { $('communityOverlay').classList.add('open'); await loadCommunityQuotes(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
    const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
    if (e.key.toLowerCase() === 'r' && !typing && !anyModalOpen() && !e.metaKey && !e.ctrlKey) next();
  });

  render();
  setupSupabase();
})();