/**
 * PipZoNe — Sidebar badges (Updates / Announcements), live bina refresh ke.
 * Dashboard aur shared layout dono pages par chalta hai (sidebar links ko href se dhoondta hai).
 */
(function () {
  'use strict';

  var KINDS = {
    updates: { table: 'client_updates', match: 'updates/indexupdates.html' },
    notices: { table: 'client_notices', match: 'announcements/indexannouncements.html' }
  };

  var uid = 'anon';
  var primed = { updates: false, notices: false };
  var ids = { updates: [], notices: [] };

  function key(kind) { return 'pz_seen_' + kind + '_' + uid; }

  function getSeen(kind) {
    try { return JSON.parse(localStorage.getItem(key(kind)) || '[]'); } catch (e) { return []; }
  }
  function setSeen(kind, arr) {
    try { localStorage.setItem(key(kind), JSON.stringify(arr)); } catch (e) {}
  }

  function injectCss() {
    if (document.getElementById('pzBadgeCss')) return;
    var st = document.createElement('style');
    st.id = 'pzBadgeCss';
    st.textContent =
      '.nav-item.pz-badge-host{position:relative;}' +
      '.pz-badge{font-style:normal;margin-left:auto;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#e5484d;color:#fff;font-size:11px;font-weight:700;line-height:20px;text-align:center;display:inline-block;box-sizing:border-box;}' +
      '.pz-badge[hidden]{display:none !important;}' +
      'body.pz-mini .nav-item .pz-badge{position:absolute;top:4px;right:10px;margin:0;min-width:16px;height:16px;line-height:16px;font-size:10px;padding:0 4px;}';
    document.head.appendChild(st);
  }

  function hostFor(kind) {
    var m = KINDS[kind].match.toLowerCase();
    var links = document.querySelectorAll('.dash-sidebar a.nav-item, a.nav-item');
    for (var i = 0; i < links.length; i++) {
      var h = (links[i].getAttribute('href') || '').toLowerCase();
      if (h.indexOf(m) !== -1) return links[i];
    }
    return null;
  }

  function paint(kind) {
    var host = hostFor(kind);
    if (!host) return;
    var seen = getSeen(kind);
    var count = ids[kind].filter(function (id) { return seen.indexOf(id) === -1; }).length;
    var badge = host.querySelector('.pz-badge');
    if (!badge) {
      badge = document.createElement('i');
      badge.className = 'pz-badge';
      host.classList.add('pz-badge-host');
      host.appendChild(badge);
    }
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count === 0;
  }

  function paintAll() { paint('updates'); paint('notices'); }

  async function refetch(kind) {
    var c = window.supabaseClient;
    if (!c) return;
    try {
      var res = await c.from(KINDS[kind].table).select('id');
      if (res.error) return;
      var next = (res.data || []).map(function (r) { return r.id; });
      var changed = next.length !== ids[kind].length ||
        next.some(function (id) { return ids[kind].indexOf(id) === -1; });
      ids[kind] = next;
      paint(kind);
      if (changed && primed[kind]) {
        document.dispatchEvent(new CustomEvent('pz:feed-changed', { detail: { kind: kind } }));
      }
      primed[kind] = true;
    } catch (e) { /* silent */ }
  }

  function subscribe() {
    var c = window.supabaseClient;
    if (!c || !c.channel) return;
    Object.keys(KINDS).forEach(function (kind) {
      c.channel('pz-badge-' + kind)
        .on('postgres_changes', { event: '*', schema: 'public', table: KINDS[kind].table }, function () {
          refetch(kind);
        })
        .subscribe(function (status) {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('nav-badges: realtime ' + status + ' (' + kind + ') — polling fallback active');
          }
        });
    });
  }

  // Pages yahan se "dekha hua" mark karte hain
  window.PZNavBadges = {
    getSeen: function (kind) { return getSeen(kind); },
    markSeen: function (kind, list) {
      var seen = getSeen(kind);
      (list || []).forEach(function (id) { if (seen.indexOf(id) === -1) seen.push(id); });
      setSeen(kind, seen);
      paint(kind);
    },
    refresh: function () { refetch('updates'); refetch('notices'); }
  };


  // ---------- Popup (modal) + "Mark all as read" helper ----------
  window.PZFeedUI = (function () {
    function esc(v) {
      return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function css() {
      if (document.getElementById('pzModalCss')) return;
      var st = document.createElement('style');
      st.id = 'pzModalCss';
      st.textContent =
        '.pz-modal-ov{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px)}' +
        '.pz-modal{width:min(560px,100%);max-height:85vh;overflow:auto;background:var(--bg-card,#131b26);color:var(--text-primary,#f1f6f3);border:1px solid var(--border-medium,rgba(255,255,255,.14));border-radius:18px;padding:24px;box-shadow:0 24px 60px rgba(0,0,0,.5);position:relative}' +
        '.pz-modal-meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:11px;letter-spacing:.06em;color:var(--text-secondary,#94a3b8);margin-bottom:10px}' +
        '.pz-modal-cat{padding:3px 8px;border-radius:6px;background:rgba(47,191,131,.15);color:var(--accent-primary,#2fbf83);font-weight:600}' +
        '.pz-modal h3{margin:0 0 12px;font-size:20px;padding-right:32px}' +
        '.pz-modal-body{font-size:14px;line-height:1.7;color:var(--text-secondary,#94a3b8);white-space:normal;word-break:break-word}' +
        '.pz-modal-x{position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;border:1px solid var(--border-subtle,rgba(255,255,255,.1));background:transparent;color:inherit;font-size:18px;cursor:pointer;line-height:1}' +
        '.pz-modal-foot{margin-top:18px;display:flex;justify-content:flex-end}' +
        '.pz-modal-ok{padding:9px 18px;border-radius:10px;border:0;background:var(--accent-primary,#2fbf83);color:#06140e;font-weight:600;cursor:pointer}' +
        '.pz-markall{margin-left:10px;padding:6px 12px;border-radius:999px;border:1px solid var(--border-accent,rgba(47,191,131,.35));background:transparent;color:var(--accent-primary,#2fbf83);font-size:12px;font-weight:600;cursor:pointer}' +
        '.pz-markall:disabled{opacity:.45;cursor:default}';
      document.head.appendChild(st);
    }
    function openModal(item) {
      css();
      var old = document.querySelector('.pz-modal-ov');
      if (old) old.remove();
      var ov = document.createElement('div');
      ov.className = 'pz-modal-ov';
      var d = new Date(item.date);
      var dateTxt = isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      ov.innerHTML =
        '<div class="pz-modal" role="dialog" aria-modal="true">' +
          '<button class="pz-modal-x" type="button" aria-label="Close">&times;</button>' +
          '<div class="pz-modal-meta"><span class="pz-modal-cat">' + esc(item.category) + '</span>' +
            '<span>' + esc(dateTxt) + '</span>' + (item.version ? '<span>v' + esc(item.version) + '</span>' : '') + '</div>' +
          '<h3>' + esc(item.title) + '</h3>' +
          '<div class="pz-modal-body">' + esc(item.message).replace(/\n/g, '<br>') + '</div>' +
          '<div class="pz-modal-foot"><button class="pz-modal-ok" type="button">Close</button></div>' +
        '</div>';
      function close() { ov.remove(); document.removeEventListener('keydown', onKey); }
      function onKey(e) { if (e.key === 'Escape') close(); }
      ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
      ov.querySelector('.pz-modal-x').addEventListener('click', close);
      ov.querySelector('.pz-modal-ok').addEventListener('click', close);
      document.addEventListener('keydown', onKey);
      document.body.appendChild(ov);
    }
    function addMarkAll(afterEl, onClick) {
      css();
      if (!afterEl || document.querySelector('.pz-markall')) return null;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pz-markall';
      b.textContent = 'Mark all as read';
      b.addEventListener('click', onClick);
      afterEl.insertAdjacentElement('afterend', b);
      return b;
    }
    return { openModal: openModal, addMarkAll: addMarkAll };
  })();

  async function start() {
    injectCss();
    var tries = 0;
    while (!window.supabaseClient && tries < 50) {
      await new Promise(function (r) { setTimeout(r, 200); });
      tries++;
    }
    var c = window.supabaseClient;
    if (!c) return;
    try {
      var u = await c.auth.getUser();
      if (u && u.data && u.data.user) uid = u.data.user.id;
      else return; // login nahi hai
    } catch (e) { return; }

    // layout.js sidebar thori der baad bana sakta hai — ek baar dono fetch karo
    await Promise.all([refetch('updates'), refetch('notices')]);
    paintAll();
    subscribe();
    window.addEventListener('storage', paintAll);
    // Fallback: realtime na chale to bhi 15 sec mein ya tab wapas kholne par update aa jaye
    setInterval(function () { if (!document.hidden) window.PZNavBadges.refresh(); }, 15000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) window.PZNavBadges.refresh();
    });
    // Sidebar baad mein render ho to dobara paint
    setTimeout(paintAll, 800);
    setTimeout(paintAll, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();