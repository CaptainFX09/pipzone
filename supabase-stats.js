/**
 * PipZoNe — Live public stats (deposits / withdrawals) from Supabase RPC
 * Same RPC jo live site use karti hai: get_public_stats
 */
(function () {
  'use strict';

  // ============================================================
  // PipZoNe — Live Public Statistics
  // ============================================================

  const REFRESH_MS = 60000;
  let client = null;
  let firstLoad = true;

  // ============================================================
  // Counter Display
  // ============================================================

  function setCounter(id, value) {
    const el = document.getElementById(id);
    if (!el) return;

    const target = Math.round(Number(value) || 0);
    const previous = Number(el.getAttribute('data-target')) || 0;

    if (!firstLoad && target === previous) return;

    el.setAttribute('data-target', String(target));

    if (firstLoad && typeof startCountUp === 'function') {
      startCountUp(el);
    } else {
      el.textContent = target.toLocaleString('en-US');
    }
  }

  // ============================================================
  // Load Live Statistics
  // ============================================================

  async function loadLiveStats() {
    if (!client) return;

    try {
      const { data, error } = await client.rpc('get_public_stats');

      if (error) {
        console.error('Live stats error:', error);
        return;
      }

      const stats = Array.isArray(data) ? data[0] : data;
      if (!stats) return;

      setCounter('liveDeposits', stats.total_verified_deposits);
      setCounter('liveWithdrawals', stats.total_verified_withdrawals);

      firstLoad = false;
    } catch (err) {
      console.error('Live stats error:', err);
    }
  }

  // ============================================================
  // Initialize Supabase
  // ============================================================

  function init() {
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      console.error('Supabase library load nahi hui.');
      return;
    }

    // Public stats ke liye alag client: koi login session nahi lega.
    // Alag storageKey se "Multiple GoTrueClient instances" warning nahi aati.
    client = supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          storageKey: 'pz-public-stats',
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );

    loadLiveStats();
    setInterval(loadLiveStats, REFRESH_MS);
  }

  // ============================================================
  // Page Ready
  // ============================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();