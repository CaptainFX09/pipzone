/**
 * PipZoNe — Shared Client Layout (Sidebar + Topbar)
 * Page mein sirf <main id="pageContent"> chahiye, baqi sab yeh khud bana deta hai.
 */
(function () {
  'use strict';

  // ---------- Paths (script ki apni jagah se, kisi bhi folder depth par chalta hai) ----------
  const scriptEl = document.currentScript;
  const ROOT = new URL('../', scriptEl.src).href;   // .../pipzone/
  const CLIENT = ROOT + 'client/';
  const SIGNIN = ROOT + 'signin/index.html';

  // ---------- Sidebar menu: yahan ek jagah badlein, sab pages update ho jayenge ----------
  const ICON_DASH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>';
  const ICON_BARS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>';
  const ICON_HELP = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
  const glyph = (code) => '<span class="nav-icon">' + code + '</span>';

  const NAV = [
    { section: 'Trading Operations' },
    { label: 'Dashboard',        href: 'index.html',                             match: 'index.html',      icon: ICON_DASH },
    { label: 'Trading Activity', href: 'trading/indextrading.html',              match: 'trading/',        icon: glyph('&#8599;') },
    { label: 'Transactions',     href: 'transactions/indextransactions.html',    match: 'transactions/',   icon: glyph('&#9636;') },
    { label: 'Deposit Capital',  href: 'deposit/indexDeposit.html',              match: 'deposit/',        icon: glyph('&#8595;') },
    { label: 'Withdrawals',      href: 'withdrawal/indexWithdrawal.html',        match: 'withdrawal/',     icon: glyph('&#8593;') },
    { label: 'Refer &amp; Earn', href: 'referral/indexReferral.html',            match: 'referral/',       icon: glyph('&#9831;') },
    { label: 'My Team',          href: 'team/indexteam.html',                    match: 'team/',           icon: glyph('&#9817;') },
    { label: 'Messages',         href: 'messages/indexmessages.html',            match: 'messages/',       icon: glyph('&#9993;') },
    { label: 'Announcements',    href: 'announcements/indexannouncements.html',  match: 'announcements/',  icon: glyph('&#9673;') },
    { label: 'Updates',          href: 'updates/indexupdates.html',              match: 'updates/',        icon: glyph('&#8635;') },
    { section: 'Partnership' },
    { section: 'Account' },
    { label: 'Analytics',        href: 'index.html#performance',                 match: null,              icon: ICON_BARS },
    { label: 'Settings',         href: 'settings/profile/indexprofile.html',     match: 'settings/',       icon: glyph('&#9881;'), exclude: 'settings/support/' },
    { label: 'Support',          href: 'settings/support/indexsupport.html',     match: 'settings/support/', icon: glyph('&#9742;') }
  ];

  // ---------- Active link: current URL se ----------
  const clientPath = new URL(CLIENT).pathname.toLowerCase();
  const here = location.pathname.toLowerCase();
  const rel = here.startsWith(clientPath) ? here.slice(clientPath.length) : here;

  function isActive(item) {
    if (!item.match) return false;
    if (item.match === 'index.html') return rel === '' || rel === 'index.html';
    if (item.exclude && rel.startsWith(item.exclude)) return false;
    return rel.startsWith(item.match);
  }

  const navHTML = NAV.map((item) => {
    if (item.section) return '<div class="nav-section-label">' + item.section + '</div>';
    return '<a href="' + CLIENT + item.href + '" class="nav-item' + (isActive(item) ? ' active' : '') + '">' +
           item.icon + '<span>' + item.label + '</span></a>';
  }).join('');

  const ICON_LOGOUT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>';

  // ---------- HTML ----------
  const sidebarHTML =
    '<aside class="dash-sidebar" id="dashSidebar">' +
      '<div class="sidebar-header">' +
        '<a href="' + CLIENT + 'index.html" class="brand-logo" aria-label="PipZoNe client">' +
          '<img src="' + ROOT + 'assets/logo/Logo.png" alt="PipZoNe logo" class="logo-img" />' +
          '<span class="brand-name">Pip<span class="brand-accent">ZoNe</span></span>' +
        '</a>' +
        '<button class="sidebar-close-btn" id="sidebarCloseBtn" aria-label="Close sidebar">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
        '</button>' +
      '</div>' +
      '<nav class="sidebar-nav">' + navHTML +
        '<a href="' + SIGNIN + '" class="nav-item logout-link" id="sidebarLogout">' + ICON_LOGOUT + '<span>Sign out</span></a>' +
      '</nav>' +
      '<div class="sidebar-help-card">' +
        '<div class="help-title">Desk Support</div>' +
        '<div class="help-desc">Questions regarding daily settlements or rollover covenants?</div>' +
        '<a href="' + CLIENT + 'settings/support/indexsupport.html" class="help-link">Contact Execution Officer &rarr;</a>' +
      '</div>' +
    '</aside>';

  const topbarHTML =
    '<header class="dash-topbar">' +
      '<div class="topbar-left">' +
        '<button class="mobile-sidebar-toggle" id="mobileSidebarToggle" aria-label="Open sidebar menu">' +
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>' +
        '</button>' +
        '<div class="greeting-wrap">' +
          '<div class="client-greeting">Welcome back, <span class="client-name" id="topbarClientName">Client</span></div>' +
          '<div class="client-subline">Institutional execution pool &middot; Real-time equity accounting</div>' +
        '</div>' +
      '</div>' +
      '<div class="topbar-right">' +
        '<div class="search-box-wrap">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>' +
          '<input type="text" placeholder="Search orders, hashes, dates..." class="search-input" id="dashSearchInput" />' +
        '</div>' +
        '<button id="themeToggleBtn" class="topbar-icon-btn" aria-label="Toggle light or dark theme" title="Toggle theme">' +
          '<svg class="theme-icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>' +
          '<svg class="theme-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>' +
        '</button>' +
        '<div class="notification-wrap">' +
          '<button class="topbar-icon-btn" id="notifBellBtn" aria-label="Notifications" title="Notifications">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>' +
            '<span class="unread-badge" id="unreadNotifBadge" style="display:none">0</span>' +
          '</button>' +
        '</div>' +
        '<div class="profile-menu-wrap" id="profileMenuWrap">' +
          '<button class="profile-trigger" id="profileTriggerBtn" aria-expanded="false">' +
            '<div class="user-avatar" id="userAvatarMark">CD</div>' +
            '<div class="profile-info-text">' +
              '<div class="user-name" id="userDisplayName">Client Dashboard</div>' +
              '<div class="user-tier" id="userTier">Client</div>' +
            '</div>' +
            '<svg class="chevron-down" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
          '</button>' +
          '<div class="profile-dropdown hidden" id="profileDropdown">' +
            '<div class="dropdown-header">' +
              '<strong id="dropdownName">Client</strong>' +
              '<span class="dropdown-email mono" id="dropdownEmail"></span>' +
            '</div>' +
            '<div class="dropdown-divider"></div>' +
            '<a href="' + CLIENT + 'settings/profile/indexprofile.html" class="dropdown-item"><span>Profile &amp; Security</span></a>' +
            '<a href="' + CLIENT + 'referral/indexReferral.html" class="dropdown-item"><span>Invite &amp; Earn Program</span></a>' +
            '<a href="' + CLIENT + 'settings/support/indexsupport.html" class="dropdown-item"><span>Trading Desk Support</span></a>' +
            '<div class="dropdown-divider"></div>' +
            '<a href="' + SIGNIN + '" class="dropdown-item text-loss" id="dropdownLogout"><span>Sign out</span></a>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</header>';

  // ---------- Shell banana: page ka #pageContent topbar ke neeche chala jata hai ----------
  const page = document.getElementById('pageContent');
  if (!page) {
    console.error('layout.js: <main id="pageContent"> nahi mila. Page ka content us mein rakhein.');
    return;
  }

  const shell = document.createElement('div');
  shell.className = 'app-layout';
  shell.innerHTML = sidebarHTML + '<div class="dash-main-area">' + topbarHTML + '</div>';
  page.parentNode.insertBefore(shell, page);
  shell.querySelector('.dash-main-area').appendChild(page);

  // ---------- Theme toggle ----------
  (function initTheme() {
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    const root = document.documentElement;
    root.setAttribute('data-theme', localStorage.getItem('pipzone_theme') || 'dark');

    btn.addEventListener('click', function (e) {
      // page ki apni script agar isi button par listener lagaye to double toggle na ho
      e.stopImmediatePropagation();
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.classList.add('theme-switching');
      root.setAttribute('data-theme', next);
      localStorage.setItem('pipzone_theme', next);
      window.getComputedStyle(root).getPropertyValue('background-color');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { root.classList.remove('theme-switching'); });
      });
      // charts wali pages is event par dobara draw kar sakti hain
      document.dispatchEvent(new CustomEvent('pz:themechange', { detail: { theme: next } }));
    });
  })();

  // ---------- Mobile sidebar ----------
  (function initSidebar() {
    const sidebar = document.getElementById('dashSidebar');
    const openBtn = document.getElementById('mobileSidebarToggle');
    const closeBtn = document.getElementById('sidebarCloseBtn');
    // ---- Sidebar badges (Updates / Announcements): shared/nav-badges.js ----
    if (!document.querySelector('script[src*="nav-badges.js"]')) {
      var nb = document.createElement('script');
      nb.src = ROOT + 'shared/nav-badges.js';
      document.head.appendChild(nb);
    }

    // ---- Desktop collapse: shared/sidebar-collapse.js ----
    if (!document.querySelector('script[src*="sidebar-collapse.js"]')) {
      const sc = document.createElement('script');
      sc.src = ROOT + 'shared/sidebar-collapse.js';
      document.body.appendChild(sc);
    }
    if (openBtn) openBtn.addEventListener('click', function () { sidebar.classList.add('mobile-open'); });
    if (closeBtn) closeBtn.addEventListener('click', function () { sidebar.classList.remove('mobile-open'); });
    sidebar.querySelectorAll('.nav-item').forEach(function (a) {
      a.addEventListener('click', function () { sidebar.classList.remove('mobile-open'); });
    });
  })();

  // ---------- Profile dropdown ----------
  (function initDropdown() {
    const trigger = document.getElementById('profileTriggerBtn');
    const dropdown = document.getElementById('profileDropdown');
    if (!trigger || !dropdown) return;

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
      trigger.setAttribute('aria-expanded', String(!dropdown.classList.contains('hidden')));
    });

    document.addEventListener('click', function (e) {
      if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
  })();

  // ---------- Search: page 'pz:search' event sun kar apni list filter kar sakti hai ----------
  (function initSearch() {
    const input = document.getElementById('dashSearchInput');
    if (!input) return;
    input.addEventListener('input', function () {
      document.dispatchEvent(new CustomEvent('pz:search', { detail: { query: input.value.trim() } }));
    });
  })();

  // ---------- Notifications (bell): har page par chale ----------
  // Page ne mount pehle se rakha ho to wahi use hota hai; script/CSS sirf ek baar load hoti hain.
  (function initNotifications() {
    if (window.__pzNotificationsLoader) return;
    window.__pzNotificationsLoader = true;

    let mount = document.getElementById('notificationsModalMount');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'notificationsModalMount';
      document.body.appendChild(mount);
    }

    function addCss(href, key) {
      if (document.querySelector('link[href*="' + key + '"]')) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }
    addCss(CLIENT + 'notifications.css', 'notifications.css');
    addCss(ROOT + 'shared/notifications-shared.css', 'notifications-shared.css');

    // Page ne notifications.js khud laga rakhi ho to dobara load nahi karte
    if (document.querySelector('script[src*="notifications.js"]')) return;

    const script = document.createElement('script');
    script.src = CLIENT + 'notifications.js';
    document.body.appendChild(script);
  })();

  // ---------- Sign out ----------
  async function handleLogout(e) {
    e.preventDefault();
    try {
      if (window.supabaseClient) await window.supabaseClient.auth.signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
    localStorage.removeItem('pipzone_user');
    window.location.href = SIGNIN;
  }
  document.getElementById('sidebarLogout').addEventListener('click', handleLogout);
  document.getElementById('dropdownLogout').addEventListener('click', handleLogout);

  // ---------- Verified / Unverified label ----------
  (function injectTierStyle() {
    const st = document.createElement('style');
    st.textContent =
      '.user-tier.is-unverified{color:#d9962b !important}' +
      '.user-tier.is-verified{color:var(--green,#2fbf83) !important}';
    document.head.appendChild(st);
  })();

  // Verified: personal info + address + kam az kam ek wallet bhara ho (Deposit page ki shart wali hi)
  function filled(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }

  function isProfileComplete(p) {
    if (!p) return false;
    return filled(p.first_name) && filled(p.last_name) && filled(p.phone) &&
           filled(p.address) && filled(p.city) && filled(p.state) && filled(p.postal_code) &&
           (filled(p.wallet_address) || filled(p.wallet_address_bep20));
  }

  function setTier(verified) {
    const el = document.getElementById('userTier');
    if (!el) return;
    el.textContent = verified ? 'Verified Client' : 'Unverified Client';
    el.classList.toggle('is-verified', verified);
    el.classList.toggle('is-unverified', !verified);
  }

  // ---------- Client ka naam / email (Supabase se) ----------
  async function loadUser() {
    const client = window.supabaseClient;
    if (!client) return;

    function setName(name, email) {
      const displayName = name || 'Client';
      const initials = displayName.split(/\s+/).filter(Boolean).map(function (p) { return p[0]; })
        .join('').substring(0, 2).toUpperCase() || 'C';
      const set = function (id, text) { const el = document.getElementById(id); if (el) el.textContent = text; };
      set('topbarClientName', displayName.split(/\s+/)[0]);
      set('userDisplayName', displayName);
      set('userAvatarMark', initials);
      set('dropdownName', displayName);
      set('dropdownEmail', email || '');
    }

    try {
      const authRes = await client.auth.getUser();
      if (authRes.error) throw authRes.error;
      const user = authRes.data && authRes.data.user;
      if (!user) return;

      const profRes = await client.from('profiles')
        .select('first_name,last_name,full_name,phone,address,city,state,postal_code,wallet_address,wallet_address_bep20')
        .eq('id', user.id)
        .maybeSingle();
      if (profRes.error) throw profRes.error;
      const profile = profRes.data || {};

      const meta = user.user_metadata || {};
      const fullName =
        [(profile.first_name || '').trim(), (profile.last_name || '').trim()].filter(Boolean).join(' ') ||
        (profile.full_name || '').trim() ||
        (meta.full_name || '').trim() ||
        (meta.name || '').trim() ||
        'Client';

      setName(fullName, user.email || '');
      setTier(isProfileComplete(profile));
    } catch (err) {
      console.error('layout.js: user load failed:', err);
    }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const sc = document.createElement('script');
      sc.src = src; sc.onload = resolve; sc.onerror = reject;
      document.head.appendChild(sc);
    });
  }

  async function startUser() {
    if (!window.supabaseClient) {
      try {
        if (!window.supabase) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
        await loadScript(ROOT + 'supabase-config.js');
      } catch (e) { console.error('layout.js: supabase load failed', e); }
    }
    loadUser();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startUser);
  } else {
    startUser();
  }
})();