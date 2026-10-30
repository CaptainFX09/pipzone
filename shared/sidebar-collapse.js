/**
 * PipZoNe — Sidebar collapse (icon-only rail)
 * Kisi bhi page par kaam karta hai jis mein #dashSidebar ho. layout.js isay khud load karta hai;
 * dashboard (client/index.html) mein is script ko seedha add karein.
 */
(function () {
  'use strict';
  if (window.__pzSidebarCollapse) return;
  function init() {
    const sidebar = document.getElementById('dashSidebar');
    if (!sidebar || window.__pzSidebarCollapse) return;
    window.__pzSidebarCollapse = true;
    // ---- Desktop: sidebar icon-only rail me collapse hoti hai («  /  ») ----
    const W_MINI = 76;
    const css = document.createElement('style');
    css.textContent =
      '.sidebar-collapse-btn{margin-left:auto;flex:0 0 auto;width:30px;height:30px;padding:0;border-radius:8px;display:none;align-items:center;justify-content:center;cursor:pointer;' +
        'border:1px solid var(--border,rgba(128,128,128,.3));background:transparent;color:var(--text-muted,var(--text,#666));transition:background .15s,color .15s;}' +
      '.sidebar-collapse-btn:hover{color:var(--green,#16a06b);border-color:var(--green,#16a06b);}' +
      '.sidebar-collapse-btn svg{transition:transform .25s ease;}' +
      'body.pz-mini .dash-sidebar{width:' + W_MINI + 'px !important;min-width:' + W_MINI + 'px !important;max-width:' + W_MINI + 'px !important;overflow-x:hidden;transition:width .2s ease;}' +
      'body.pz-mini .sidebar-header{flex-direction:column;align-items:center;gap:10px;padding-left:0 !important;padding-right:0 !important;}' +
      'body.pz-mini .sidebar-header .brand-logo{justify-content:center;}' +
      'body.pz-mini .brand-name,body.pz-mini .sidebar-help-card{display:none !important;}' +
      'body.pz-mini .sidebar-collapse-btn{margin-left:0;}' +
      'body.pz-mini .sidebar-collapse-btn svg{transform:rotate(180deg);}' +
      'body.pz-mini .nav-item{justify-content:center;padding-left:0 !important;padding-right:0 !important;gap:0 !important;}' +
      'body.pz-mini .nav-item span:not(.nav-icon){display:none !important;}' +
      'body.pz-mini .nav-item .nav-icon{display:inline-flex !important;margin:0 !important;}' +
      'body.pz-mini .nav-section-label{font-size:0 !important;height:1px;margin:10px 14px !important;padding:0 !important;background:var(--border,rgba(128,128,128,.25));}';
    document.head.appendChild(css);

    // nav items par tooltip (collapsed me label nazar nahi aata)
    sidebar.querySelectorAll('.nav-item').forEach(function (a) {
      const sp = a.querySelector('span:not(.nav-icon)');
      if (sp && !a.title) a.title = sp.textContent.trim();
    });

    // collapse button, logo ke saath
    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'sidebar-collapse-btn';
    collapseBtn.id = 'sidebarCollapseBtn';
    collapseBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>';
    const headerEl = sidebar.querySelector('.sidebar-header');
    const closeEl = document.getElementById('sidebarCloseBtn');
    if (headerEl) headerEl.insertBefore(collapseBtn, closeEl || null);

    const mainArea = document.querySelector('.dash-main-area');
    const layoutEl = document.querySelector('.app-layout');
    let want = false;
    try { want = localStorage.getItem('pz_sidebar_collapsed') === '1'; } catch (e) {}

    function isMobileSidebar() {
      const cs = getComputedStyle(sidebar);
      const t = cs.transform;
      const moved = t && t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)';
      return moved || (cs.position === 'fixed' && parseFloat(cs.left) < 0);
    }
    let baseML = null, baseW = '', baseGrid = '';
    function applyMini() {
      const mobile = isMobileSidebar() && !document.body.classList.contains('pz-mini');
      const on = want && !mobile;
      collapseBtn.style.display = mobile ? 'none' : 'inline-flex';
      collapseBtn.title = on ? 'Open sidebar' : 'Close sidebar';
      collapseBtn.setAttribute('aria-label', collapseBtn.title);
      if (on === document.body.classList.contains('pz-mini')) return;
      if (on && mainArea && baseML === null) {
        const cs = getComputedStyle(mainArea);
        baseML = parseFloat(cs.marginLeft) || 0;
        baseW = mainArea.style.width; baseGrid = layoutEl ? layoutEl.style.gridTemplateColumns : '';
      }
      document.body.classList.toggle('pz-mini', on);
      if (mainArea && baseML) {
        // sidebar fixed ho aur main-area margin-left se hat'ti ho
        mainArea.style.marginLeft = on ? W_MINI + 'px' : '';
        mainArea.style.width = on ? 'calc(100% - ' + W_MINI + 'px)' : baseW;
      }
      if (layoutEl && getComputedStyle(layoutEl).display === 'grid') {
        layoutEl.style.gridTemplateColumns = on ? W_MINI + 'px 1fr' : baseGrid;
      }
    }
    collapseBtn.addEventListener('click', function () {
      want = !document.body.classList.contains('pz-mini');
      try { localStorage.setItem('pz_sidebar_collapsed', want ? '1' : '0'); } catch (e) {}
      applyMini();
      setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 260);
    });
    window.addEventListener('resize', applyMini);
    applyMini();

  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();