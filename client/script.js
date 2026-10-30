/**
 * PipZoNe — Client Dashboard Portal Logic
 * Page Group 4: /client/
 * Supabase account data, charts, transactions, notifications and dashboard UI.
 */

// ====================================================================
// DOM READY
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initQuickActions();
  initSidebar();
  initTopbarDropdown();

  initClientSession().then(() => {
    initCountUpNumbers();
  });

  initReferralCard();
  initDonutChart();
  initEquityChart();
  initTransactionsList();
});

/* ====================================================================
   Quick action buttons — dedicated pages par le jate hain
==================================================================== */

function initQuickActions() {
  document.querySelectorAll('.open-deposit-modal, #dashDepositBtn').forEach(btn => {
    btn.addEventListener('click', () => { window.location.href = './deposit/indexDeposit.html'; });
  });
  document.querySelectorAll('.open-withdraw-modal, #dashWithdrawBtn').forEach(btn => {
    btn.addEventListener('click', () => { window.location.href = './withdrawal/indexWithdrawal.html'; });
  });
}

/* ====================================================================
   1. Theme Toggle System
==================================================================== */

function initThemeToggle() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (!themeToggleBtn) return;

  const currentTheme = localStorage.getItem('pipzone_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);

  themeToggleBtn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const nextTheme = isDark ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('pipzone_theme', nextTheme);

    setTimeout(() => {
      initDonutChart();
      initEquityChart();
    }, 50);
  });
}

/* ====================================================================
   2. Client Profile Session + Real Account Balances + Principal Cycle
==================================================================== */

async function initClientSession() {
  const topbarClientName = document.getElementById('topbarClientName');
  const userDisplayName = document.getElementById('userDisplayName');
  const userAvatarMark = document.getElementById('userAvatarMark');
  const dropdownName = document.getElementById('dropdownName');
  const dropdownEmail = document.getElementById('dropdownEmail');

  let client = window.supabaseClient || null;

  const setClientName = (name, email = '') => {
    const displayName = name || 'Client';
    const initials = displayName
      .split(/\s+/)
      .filter(Boolean)
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'C';

    if (topbarClientName) {
      topbarClientName.textContent = displayName.split(/\s+/)[0];
    }

    if (userDisplayName) userDisplayName.textContent = displayName;
    if (userAvatarMark) userAvatarMark.textContent = initials;
    if (dropdownName) dropdownName.textContent = displayName;
    if (dropdownEmail) dropdownEmail.textContent = email;
  };

   const handleLogout = async (e) => {
    e.preventDefault();

    try {
      if (client) {
        await Promise.race([
          client.auth.signOut(),
          new Promise(resolve => setTimeout(resolve, 2500))
        ]);
      }
    } catch (error) {
      console.error('Sign out error:', error);
    }

    localStorage.removeItem('pipzone_user');
    Object.keys(localStorage).forEach(key => {
      if (/^sb-.*-auth-token$/.test(key)) localStorage.removeItem(key);
    });

    // client/ se ek folder upar, phir signin/ (XAMPP aur Vercel dono par chalta hai)
    window.location.replace('../signin/index.html');
  };

  const sidebarLogout = document.getElementById('sidebarLogout');
  const dropdownLogout = document.getElementById('dropdownLogout');

  if (sidebarLogout) sidebarLogout.addEventListener('click', handleLogout);
  if (dropdownLogout) dropdownLogout.addEventListener('click', handleLogout);

  try {
    if (!client) {
      throw new Error('Shared Supabase client is missing. Check supabase-config.js.');
    }

    const { data: authData, error: authError } = await client.auth.getUser();

    if (authError) throw authError;

    const authUser = authData?.user;

    if (!authUser) {
      setClientName('Client');
      return false;
    }

    // ----------------------------------------------------
    // Load logged-in client's profile
    // ----------------------------------------------------

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('first_name,last_name,full_name,phone,address,city,state,postal_code,wallet_address,wallet_address_bep20')
      .eq('id', authUser.id)
      .maybeSingle();

    if (profileError) throw profileError;

    const fullName = [
      (profile?.first_name || '').trim(),
      (profile?.last_name || '').trim()
    ].filter(Boolean).join(' ') ||
      (profile?.full_name || '').trim() ||
      (authUser.user_metadata?.full_name || '').trim() ||
      (authUser.user_metadata?.name || '').trim() ||
      'Client';

    setClientName(fullName, authUser.email || '');

    // Verified / Unverified label (profile complete hone par Verified)
    const filled = v => v !== null && v !== undefined && String(v).trim() !== '';
    const p = profile || {};
    const verified = filled(p.first_name) && filled(p.last_name) && filled(p.phone) &&
      filled(p.address) && filled(p.city) && filled(p.state) && filled(p.postal_code) &&
      (filled(p.wallet_address) || filled(p.wallet_address_bep20));
    document.querySelectorAll('.user-tier').forEach(el => {
      el.textContent = verified ? 'Verified Client' : 'Unverified Client';
      el.classList.toggle('is-verified', verified);
      el.classList.toggle('is-unverified', !verified);
    });

    // ----------------------------------------------------
    // Load account data — wait for query before using account
    // ----------------------------------------------------

    const { data: accounts, error: accountError } = await client
      .from('accounts')
      .select('balance,initial_balance,profit,total_withdrawn,first_deposit_at,principal_lock_until,principal_locked_amount')
      .eq('user_id', authUser.id)
      .limit(1);

    if (accountError) throw accountError;

    const account = accounts?.[0] || {};

    const totalProfit = await loadTotalProfit(client, authUser.id);

    startDailyPnlUpdates(client, authUser.id);
    loadEquityPoints(client, authUser.id);
    loadPortfolioAllocation(client, authUser.id);

    // ----------------------------------------------------
    // Update real balance counters
    // ----------------------------------------------------

    const setTarget = (element, value) => {
      if (!element) return;
      element.dataset.target = String(Number(value) || 0);
    };

    setTarget(
      document.getElementById('currentBalanceDisplay'),
      account.balance
    );

    document.querySelectorAll('.stat-card').forEach(card => {
      const label = card.querySelector('.stat-label')?.textContent.trim();
      const counter = card.querySelector('.counter-num');

      if (label === 'Deposited Capital') {
        setTarget(counter, account.initial_balance);
      }

      if (label === 'Total Profit') {
        if (totalProfit !== null) setTarget(counter, totalProfit);
      }

      if (label === 'Total Withdrawn') {
        setTarget(counter, account.total_withdrawn);
      }
    });

    setTarget(
      document.querySelector('.avail-badge .counter-num'),
      Math.max(Number(account.profit) || 0, 0)
    );

    // ----------------------------------------------------
    // Principal Capital Unlock Cycle — 40 days
    // ----------------------------------------------------

	  updatePrincipalUnlockCycle(account);
		await loadReferralStats(client);
		return true;
  } catch (error) {
    console.error('Failed to load client profile/account:', error);
    setClientName('Client');
    return false;
  }
}


/* ====================================================================
   Referral Card — Real Supabase Statistics
==================================================================== */

async function loadReferralStats(client) {
  const card = document.querySelector('.referral-program-card');
  if (!card || !client) return;

  const boxes = card.querySelectorAll('.ref-stats-grid .ref-stat-box');
  if (boxes.length < 3) return;

  const counters = Array.from(boxes, box => box.querySelector('.counter-num'));

  // Demo values ko real data aane tak zero par set karein
  counters.forEach(counter => {
    if (!counter) return;
    counter.dataset.target = '0';
    counter.textContent = '0';
  });

  try {
    const { data, error } = await client.rpc('get_referred_clients');
    if (error) throw error;

    const members = Array.isArray(data) ? data : [];

    const totalReferrals = members.length;
    const referredCapital = members.reduce(
      (sum, member) => sum + (Number(member.total_deposited) || 0), 0
    );
    const deskCommission = members.reduce(
      (sum, member) => sum + (Number(member.commission_earned) || 0), 0
    );

    const values = [totalReferrals, referredCapital, deskCommission];

    counters.forEach((counter, index) => {
      if (!counter) return;
      counter.dataset.target = String(values[index]);
      counter.textContent = counter.dataset.decimals === '2' ? '0.00' : '0';
    });
  } catch (error) {
    console.error('Referral statistics load error:', error);
  }
}

/* ====================================================================
   2A. Principal Capital Unlock Cycle
==================================================================== */

function updatePrincipalUnlockCycle(account) {
  const cycleDays = 40;
  const now = new Date();

  const firstDeposit = account.first_deposit_at
    ? new Date(account.first_deposit_at)
    : null;

  const storedUnlockDate = account.principal_lock_until
    ? new Date(account.principal_lock_until)
    : null;

  const unlockDate = storedUnlockDate && !Number.isNaN(storedUnlockDate.getTime())
    ? storedUnlockDate
    : firstDeposit && !Number.isNaN(firstDeposit.getTime())
      ? new Date(firstDeposit.getTime() + cycleDays * 86400000)
      : null;

  const cycleStart = firstDeposit && !Number.isNaN(firstDeposit.getTime())
    ? firstDeposit
    : unlockDate
      ? new Date(unlockDate.getTime() - cycleDays * 86400000)
      : null;

  const validUnlockDate = unlockDate && !Number.isNaN(unlockDate.getTime());
  const validCycleStart = cycleStart && !Number.isNaN(cycleStart.getTime());

  const daysLeft = validUnlockDate
    ? Math.max(0, Math.ceil((unlockDate.getTime() - now.getTime()) / 86400000))
    : null;

  const elapsedDays = validCycleStart
    ? Math.min(
        cycleDays,
        Math.max(0, Math.floor((now.getTime() - cycleStart.getTime()) / 86400000))
      )
    : 0;

  const progress = validUnlockDate
    ? Math.min(100, Math.max(0, (elapsedDays / cycleDays) * 100))
    : 0;

  const principal = Number(
    account.principal_locked_amount ?? account.initial_balance
  ) || 0;

  const money = value => Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const dateText = validUnlockDate
    ? unlockDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    : 'Not available';

  const cycleBox = document.querySelector('.unlock-cycle-box');
  if (!cycleBox) return;
    const depositedCapitalStatus = document.getElementById('depositedCapitalStatus');
  const depositedCapital = Number(account.initial_balance) || 0;

  if (depositedCapitalStatus) {
    depositedCapitalStatus.textContent = depositedCapital <= 0
      ? 'No deposit yet'
      : !validUnlockDate
        ? 'Deposit recorded — lock dates unavailable'
        : daysLeft === 0
          ? '40-day cycle completed'
          : 'Active in 40-day liquidity cycle';
  }

  const cycleLabel = cycleBox.querySelector('.unlock-label strong');
  const cyclePct = cycleBox.querySelector('.unlock-pct');
  const cycleFill = cycleBox.querySelector('.progress-fill');
  const cycleText = cycleBox.querySelector('.unlock-subtext');

  if (cycleLabel) {
    cycleLabel.textContent = daysLeft === null
      ? 'Not started'
      : daysLeft === 0
        ? 'Unlock available'
        : `${daysLeft} days left`;
  }

  if (cyclePct) {
    cyclePct.textContent = validUnlockDate
      ? `${elapsedDays} / ${cycleDays} Days (${progress.toFixed(1)}%)`
      : `0 / ${cycleDays} Days (0.0%)`;
  }

  if (cycleFill) {
    cycleFill.style.width = `${progress}%`;
  }

  if (cycleText) {
    if (!validUnlockDate) {
      cycleText.textContent =
        'Your principal lock cycle has not started yet. The unlock date will appear when your account lock dates are available. Profit withdrawal eligibility remains subject to your account balance and withdrawal rules.';
    } else if (daysLeft === 0) {
      cycleText.innerHTML =
        `Initial principal ($${money(principal)}) reached its unlock date, <strong>${dateText}</strong>. Please check your account balance and applicable withdrawal rules before requesting a payout.`;
    } else {
      cycleText.innerHTML =
        `Initial principal ($${money(principal)}) is locked until <strong>${dateText}</strong> to protect active positions from margin disruption. All profit gains above principal remain 100% withdrawable immediately.`;
    }
  }
}

/* ====================================================================
   3. Sidebar Responsive Drawer
==================================================================== */

function initSidebar() {
  const sidebar = document.getElementById('dashSidebar');
  const toggleBtn = document.getElementById('mobileSidebarToggle');
  const closeBtn = document.getElementById('sidebarCloseBtn');

  if (!sidebar) return;

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.add('mobile-open');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
    });
  }

  const navItems = sidebar.querySelectorAll('.nav-item');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
    });
  });
}

/* ====================================================================
   4. Topbar Dropdown & Notifications
==================================================================== */

function initTopbarDropdown() {
  const trigger = document.getElementById('profileTriggerBtn');
  const dropdown = document.getElementById('profileDropdown');

  if (!trigger || !dropdown) return;

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
    trigger.setAttribute('aria-expanded', !dropdown.classList.contains('hidden'));
  });

  document.addEventListener('click', e => {
    if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
}

/* ====================================================================
   Bade numbers card ke andar fit karna (kat'na / overflow nahi)
==================================================================== */

(function injectFitStyle() {
  const st = document.createElement('style');
  st.textContent =
    '.overview-grid > *, .dash-two-col-grid > *, .dash-charts-grid > *{min-width:0;}' +
    '.stat-value, .curr-amount{white-space:nowrap;}' +
    '.stat-card, .balance-hero-card{overflow:hidden;}' +
    '.balance-main-row{flex-wrap:wrap;row-gap:14px;}' +
    '.balance-left{max-width:100%;min-width:0;}' +
    '.balance-actions-group{flex-wrap:wrap;}';
  document.head.appendChild(st);
})();

function fitBigNumbers() {
  const targets = [
    ['.stat-value', el => el.clientWidth],
    ['.curr-amount', el => {
      const box = el.closest('.balance-left');
      const sign = el.parentElement ? el.parentElement.querySelector('.curr-sign') : null;
      return box ? box.clientWidth - (sign ? sign.offsetWidth : 0) - 6 : 0;
    }]
  ];
  targets.forEach(([selector, getAvail]) => {
    document.querySelectorAll(selector).forEach(el => {
      if (!el.dataset.baseSize) {
        el.dataset.baseSize = parseFloat(getComputedStyle(el).fontSize) || 24;
      }
      let size = parseFloat(el.dataset.baseSize);
      el.style.fontSize = size + 'px';
      const avail = getAvail(el);
      if (!avail) return;
      let guard = 40;
      while (el.scrollWidth > avail + 1 && size > 12 && guard-- > 0) {
        size -= 1;
        el.style.fontSize = size + 'px';
      }
    });
  });
}

let fitTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(fitTimer);
  fitTimer = setTimeout(fitBigNumbers, 120);
});

/* ====================================================================
   5. Number Count-Up Animations
==================================================================== */

function initCountUpNumbers() {
  const counters = document.querySelectorAll('.counter-num');

  counters.forEach(counter => {
    const target = parseFloat(counter.getAttribute('data-target')) || 0;
    const decimals = parseInt(counter.getAttribute('data-decimals'), 10) || 0;

    animateCountUp(counter, target, decimals, 1600);
  });
}

function animateCountUp(element, target, decimals = 0, duration = 1600) {
  const start = 0;
  const startTime = performance.now();

  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    const val = start + (target - start) * ease;

    if (decimals > 0) {
      element.textContent = val.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    } else {
      element.textContent = Math.floor(val).toLocaleString('en-US');
    }

    if (progress < 1) {
      requestAnimationFrame(step);
    } else if (decimals > 0) {
      element.textContent = target.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    } else {
      element.textContent = target.toLocaleString('en-US');
    }
    if (progress === 1) { clearTimeout(fitTimer); fitTimer = setTimeout(fitBigNumbers, 30); }
  }

  requestAnimationFrame(step);
}

/* ====================================================================
   6. Referral Card State & Copy System
==================================================================== */

async function initReferralCard() {
  const toggleBtn = document.getElementById('toggleReferralStateBtn');
  const stateLabel = document.getElementById('referralStateLabel');
  const unlockedView = document.getElementById('referralUnlockedView');
  const lockedView = document.getElementById('referralLockedView');
  const copyBtn = document.getElementById('copyRefLinkBtn');
  const copyLabel = document.getElementById('copyRefBtnLabel');
  const linkText = document.getElementById('referralLinkText');

  let isActuallyUnlocked = false;
  let isPreviewingLocked = false;
  let actualReferralLink = '';

  const renderState = () => {
    const showLocked = isActuallyUnlocked
      ? isPreviewingLocked
      : !isPreviewingLocked;

    if (unlockedView) unlockedView.classList.toggle('hidden', showLocked);
    if (lockedView) lockedView.classList.toggle('hidden', !showLocked);

    if (stateLabel) {
      stateLabel.textContent = showLocked
        ? 'View Unlocked State'
        : 'Preview Locked State';
    }

    if (linkText) {
      linkText.textContent = isActuallyUnlocked
        ? actualReferralLink
        : 'Available after your first approved deposit';
    }

    const canCopy = isActuallyUnlocked && !showLocked && Boolean(actualReferralLink);
    if (copyBtn) copyBtn.disabled = !canCopy;
    if (copyLabel) copyLabel.textContent = 'Copy';
  };

  if (toggleBtn && unlockedView && lockedView) {
    toggleBtn.addEventListener('click', () => {
      isPreviewingLocked = !isPreviewingLocked;
      renderState();
    });
  }

  const client = window.supabaseClient;

  try {
    if (!client) throw new Error('Supabase client is unavailable.');

    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) throw authError;

    const user = authData?.user;
    if (!user) {
      renderState();
      return;
    }

    const [profileResult, depositResult] = await Promise.all([
      client.from('profiles')
        .select('referral_code,referral_unlocked')
        .eq('id', user.id)
        .maybeSingle(),
      client.from('deposits')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .gte('amount', 100)
        .limit(1)
    ]);

    if (profileResult.error) throw profileResult.error;
    if (depositResult.error) throw depositResult.error;

    const profile = profileResult.data;
    const hasApprovedDeposit = Array.isArray(depositResult.data)
      && depositResult.data.length > 0;

    isActuallyUnlocked = hasApprovedDeposit
      && profile?.referral_unlocked === true
      && Boolean(profile?.referral_code);

    if (isActuallyUnlocked) {
      const signupPath = window.location.pathname.startsWith('/pipzone/')
        ? '/pipzone/signup/'
        : '/signup/';

      actualReferralLink = `${window.location.origin}${signupPath}?ref=${encodeURIComponent(profile.referral_code)}`;
    }
  } catch (error) {
    isActuallyUnlocked = false;
    actualReferralLink = '';
    console.error('Failed to load referral access:', error);
  }

  renderState();

  if (copyBtn && linkText) {
    copyBtn.addEventListener('click', async () => {
      if (!isActuallyUnlocked || isPreviewingLocked || !actualReferralLink) {
        return;
      }

      try {
        await navigator.clipboard.writeText(actualReferralLink);
        if (copyLabel) copyLabel.textContent = 'Copied!';
        showToast('Referral link copied to clipboard.');
        setTimeout(() => {
          if (copyLabel) copyLabel.textContent = 'Copy';
        }, 2000);
      } catch (error) {
        showToast('Copy this link: ' + actualReferralLink);
      }
    });
  }
}
/* ====================================================================
   7. Portfolio Allocation (Donut) — real trades, market segment ke hisab se
==================================================================== */

let allocationSegments = [];
let allocationTotal = 0;

const CRYPTO_CODES = ['BTC','ETH','SOL','XRP','BNB','ADA','DOGE','LTC','DOT','AVAX','MATIC','TRX','LINK','SHIB','TON','BCH'];
const METAL_CODES = ['XAU','XAUUSD','GOLD','XAG','XAGUSD','SILVER','XPT','PLATINUM','XPD','PALLADIUM'];

function getSegmentForPair(pair) {
  const p = String(pair || '').toUpperCase();
  if (CRYPTO_CODES.includes(p)) return 'crypto';
  if (METAL_CODES.includes(p)) return 'metals';
  if (p) return 'forex';
  return 'other';
}

const SEGMENT_META = {
  forex:  { label: 'Forex',            color: '#2FBF83' },
  metals: { label: 'Precious Metals',  color: '#E5A93C' },
  crypto: { label: 'Cryptocurrencies', color: '#3B82F6' },
  other:  { label: 'Other',            color: '#64748B' }
};

async function loadPortfolioAllocation(client, userId) {
  try {
    const rows = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await client
        .from('trade_code_applications')
        .select('code_snapshot')
        .eq('user_id', userId)
        .not('applied_at', 'is', null)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const page = data || [];
      rows.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    const groups = {};
    rows.forEach(row => {
      const pair = String(row.code_snapshot || '').replace(/^PZ-/i, '').split('-')[0].toUpperCase();
      const key = getSegmentForPair(pair);
      if (!groups[key]) groups[key] = { count: 0, pairs: new Set() };
      groups[key].count += 1;
      if (pair) groups[key].pairs.add(pair);
    });

    allocationTotal = rows.length;
    allocationSegments = Object.keys(groups)
      .map(key => ({
        key,
        label: SEGMENT_META[key].label,
        color: SEGMENT_META[key].color,
        count: groups[key].count,
        pct: allocationTotal ? groups[key].count / allocationTotal : 0,
        pairs: Array.from(groups[key].pairs).slice(0, 4)
      }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('Portfolio allocation load failed:', error);
    allocationSegments = [];
    allocationTotal = 0;
  }

  renderAllocationLegend();
  initDonutChart();
}

function renderAllocationLegend() {
  const legend = document.getElementById('allocationLegend');
  if (!legend) return;
  legend.replaceChildren();

  if (!allocationSegments.length) {
    const empty = document.createElement('div');
    empty.className = 'legend-row';
    empty.textContent = 'No trading activity yet.';
    empty.style.color = 'var(--text-muted)';
    legend.appendChild(empty);
    return;
  }

  allocationSegments.forEach(seg => {
    const row = document.createElement('div');
    row.className = 'legend-row';

    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.background = seg.color;

    const label = document.createElement('span');
    label.className = 'legend-label';
    label.textContent = seg.pairs.length ? `${seg.label} (${seg.pairs.join(', ')})` : seg.label;

    const pct = document.createElement('span');
    pct.className = 'legend-pct mono';
    pct.textContent = `${Math.round(seg.pct * 100)}%`;

    row.append(dot, label, pct);
    legend.appendChild(row);
  });
}

function initDonutChart() {
  const canvas = document.getElementById('clientDonutCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const size = 160;

  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = 68;
  const innerR = 48;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  ctx.clearRect(0, 0, size, size);

  const data = allocationSegments.length
    ? allocationSegments
    : [{ pct: 1, color: isLight ? '#E2E8F0' : '#1d293b' }];

  let startAngle = -Math.PI / 2;

  data.forEach(item => {
    const endAngle = startAngle + item.pct * Math.PI * 2;

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startAngle, endAngle);
    ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
    ctx.closePath();

    ctx.fillStyle = item.color;
    ctx.fill();

    ctx.strokeStyle = isLight ? '#FFFFFF' : '#131b26';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    startAngle = endAngle;
  });

  ctx.fillStyle = isLight ? '#0F172A' : '#F1F6F3';
  ctx.font = 'bold 15px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(allocationTotal), cx, cy - 4);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '10px "IBM Plex Sans", sans-serif';
  ctx.fillText('Trades', cx, cy + 12);
}

/* ====================================================================
   8. Equity Curve (Canvas) — real cumulative profit from transactions
==================================================================== */

let equityPoints = [];

async function loadEquityPoints(client, userId) {
  try {
    const rows = await fetchProfitRows(client, userId);

    const byDay = new Map();
    rows.forEach(row => {
      const d = new Date(row.created_at);
      if (Number.isNaN(d.getTime())) return;
      const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
      byDay.set(key, (byDay.get(key) || 0) + (Number(row.amount) || 0));
    });

    let running = 0;
    const points = Array.from(byDay.keys()).sort().map(key => {
      running += byDay.get(key);
      const d = new Date(key + 'T00:00:00');
      return {
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        val: running
      };
    });

    equityPoints = points.slice(-14);
  } catch (error) {
    console.error('Equity curve load failed:', error);
    equityPoints = [];
  }

  const meta = document.getElementById('equityMeta');
  if (meta) {
    const last = equityPoints.length ? equityPoints[equityPoints.length - 1].val : 0;
    meta.textContent = `Total Profit: $${last.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  initEquityChart();
}

function initEquityChart() {
  const canvas = document.getElementById('clientEquityCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const W = rect.width || 680;
  const H = rect.height || 220;

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const points = equityPoints;

  if (!points.length) {
    ctx.fillStyle = '#94A3B8';
    ctx.font = '13px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No performance data yet', W / 2, H / 2);
    return;
  }

  const vals = points.map(p => p.val);
  let minVal = Math.min(0, ...vals);
  let maxVal = Math.max(...vals);
  if (maxVal === minVal) maxVal = minVal + 1;
  const pad = (maxVal - minVal) * 0.12;
  maxVal += pad;
  if (minVal < 0) minVal -= pad;

  const padLeft = 40;
  const padRight = 30;
  const padTop = 20;
  const padBottom = 35;

  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;

  const getX = idx => points.length === 1
    ? padLeft + chartW / 2
    : padLeft + (idx / (points.length - 1)) * chartW;
  const getY = val => padTop + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;

  ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padTop + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(W - padRight, y);
    ctx.stroke();
  }

  const tracePath = () => {
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = getX(i);
      const y = getY(p.val);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        const prevX = getX(i - 1);
        const prevY = getY(points[i - 1].val);
        const midX = (prevX + x) / 2;
        ctx.bezierCurveTo(midX, prevY, midX, y, x, y);
      }
    });
  };

  if (points.length > 1) {
    tracePath();
    ctx.lineTo(getX(points.length - 1), padTop + chartH);
    ctx.lineTo(getX(0), padTop + chartH);
    ctx.closePath();

    const areaGradient = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
    areaGradient.addColorStop(0, 'rgba(47, 191, 131, 0.32)');
    areaGradient.addColorStop(1, 'rgba(47, 191, 131, 0.0)');
    ctx.fillStyle = areaGradient;
    ctx.fill();

    tracePath();
    ctx.strokeStyle = '#2FBF83';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // x labels: zyada points hon to har dusra/teesra label
  const step = Math.ceil(points.length / 7);
  points.forEach((p, i) => {
    const x = getX(i);
    const y = getY(p.val);

    ctx.fillStyle = isLight ? '#FFFFFF' : '#131b26';
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#2FBF83';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.stroke();

    if (i % step === 0 || i === points.length - 1) {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '11px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.label, x, H - 10);
    }
  });
}

/* ====================================================================
   9. Recent Transactions & Skeleton Pulse — still demo data
==================================================================== */

async function initTransactionsList() {
  const skeleton = document.getElementById('txSkeletonLoader');
  const realList = document.getElementById('txRealList');
  const filterSelect = document.getElementById('txFilterSelect');
  let transactions = [];

  function formatDate(value) {
    if (!value) return 'Date unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date unavailable';
    return date.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'Asia/Bangkok'
    }) + ' Thailand Time';
  }

  function formatAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 'Amount unavailable';
    return `${amount >= 0 ? '+' : '-'}${Math.abs(amount).toLocaleString('en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    })} USDT`;
  }

  function normalizeStatus(status) {
    const value = String(status || 'unknown').toLowerCase();
    const labels = {
      approved: 'Approved',
      completed: 'Completed',
      pending: 'Pending',
      processing: 'Processing',
      rejected: 'Rejected',
      failed: 'Failed'
    };
    return { status: value.replace(/[^a-z0-9_-]/g, ''), label: labels[value] || value };
  }

  function renderRows(filter = 'all') {
    if (!realList) return;
    realList.replaceChildren();

    const list = transactions.filter(tx => filter === 'all' || tx.type === filter);

    if (!list.length) {
      realList.textContent = 'No transactions match the selected filter.';
      realList.style.cssText = 'text-align:center;padding:24px;color:var(--text-muted);font-size:0.88rem;';
      return;
    }

    realList.style.cssText = '';
    list.forEach(tx => {
      const row = document.createElement('div');
      row.className = 'tx-row';

      const left = document.createElement('div');
      left.className = 'tx-left';

      const icon = document.createElement('div');
      icon.className = `tx-icon ${tx.type}`;
      icon.innerHTML = getTransactionIcon(tx.type);

      const info = document.createElement('div');
      info.className = 'tx-info';

      const title = document.createElement('span');
      title.className = 'tx-title';
      title.textContent = tx.typeName;

      const date = document.createElement('span');
      date.className = 'tx-date mono';
      date.textContent = `${formatDate(tx.date)} · ${tx.reference}`;

      info.append(title, date);
      left.append(icon, info);

      const right = document.createElement('div');
      right.className = 'tx-right';

      const amount = document.createElement('div');
      amount.className = `tx-amount ${tx.amountClass} mono`;
      amount.textContent = formatAmount(tx.amount);

      const pill = document.createElement('span');
      pill.className = `tx-pill ${tx.status}`;
      pill.textContent = tx.statusLabel;

      right.append(amount, pill);
      row.append(left, right);
      realList.appendChild(row);
    });
  }

  function getTransactionIcon(type) {
    if (type === 'deposit') {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>';
    }
    if (type === 'withdrawal') {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>';
    }
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>';
  }

  try {
    const client = window.supabaseClient;
    if (!client) throw new Error('Shared Supabase client is missing.');

    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    const user = authData?.user;

    if (!user) {
      transactions = [];
      renderRows(filterSelect?.value || 'all');
      return;
    }

    const [depositsResult, withdrawalsResult, profitsResult, tradesResult] = await Promise.all([
      client.from('deposits')
        .select('id,amount,currency,network,tx_hash,status,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),
      client.from('withdrawals')
        .select('id,amount,network,tx_hash,status,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),
      client.from('transactions')
        .select('id,amount,description,created_at,type')
        .eq('user_id', user.id)
        .eq('type', 'profit')
        .order('created_at', { ascending: false })
        .limit(100),
      client.from('trade_code_applications')
        .select('adjustment_amount,code_snapshot,applied_at,selected_direction')
        .eq('user_id', user.id)
        .order('applied_at', { ascending: false })
        .limit(100)
    ]);

    for (const result of [depositsResult, withdrawalsResult, profitsResult, tradesResult]) {
      if (result.error) throw result.error;
    }

    const depositRows = (depositsResult.data || []).map(item => {
      const status = normalizeStatus(item.status);
      const network = item.network ? ` (${item.network})` : '';
      return {
        id: item.id,
        type: 'deposit',
        typeName: `Capital Deposit${network}`,
        date: item.created_at,
        reference: item.tx_hash || `Deposit #${item.id}`,
        amount: item.amount,
        amountClass: 'profit',
        status: status.status,
        statusLabel: status.label
      };
    });

    const withdrawalRows = (withdrawalsResult.data || []).map(item => {
      const status = normalizeStatus(item.status);
      const network = item.network ? ` (${item.network})` : '';
      return {
        id: item.id,
        type: 'withdrawal',
        typeName: `Profit Withdrawal${network}`,
        date: item.created_at,
        reference: item.tx_hash || `Withdrawal #${item.id}`,
        amount: -Math.abs(Number(item.amount) || 0),
        amountClass: 'loss',
        status: status.status,
        statusLabel: status.label
      };
    });

    const profitRows = (profitsResult.data || [])
      .filter(item => /daily result|client share added/i.test(item.description || ''))
      .map(item => {
        const status = normalizeStatus('completed');
        return {
          id: item.id,
          type: 'settlement',
          typeName: 'Daily Profit Settlement',
          date: item.created_at,
          reference: `Settlement #${item.id}`,
          amount: item.amount,
          amountClass: Number(item.amount) < 0 ? 'loss' : 'profit',
          status: status.status,
          statusLabel: 'Recorded'
        };
      });

    const tradeRows = (tradesResult.data || [])
      .filter(item => item.applied_at)
      .map((item, index) => {
        const pair = String(item.code_snapshot || '').replace(/^PZ-/i, '').split('-')[0].toUpperCase() || '';
        const dir = String(item.selected_direction || '').trim().toUpperCase();
        const direction = ['BUY', 'SELL'].includes(dir) ? dir : '';
        const pnl = Number(item.adjustment_amount) || 0;
        return {
          id: `trade-${index}`,
          type: 'settlement',
          typeName: `${direction} ${pair} Trade`.trim() || 'Trade Result',
          date: item.applied_at,
          reference: String(item.code_snapshot || `Trade ${index + 1}`),
          amount: pnl,
          amountClass: pnl < 0 ? 'loss' : 'profit',
          status: 'completed',
          statusLabel: 'Completed'
        };
      });

    // Recent list: sab se naye 30 records
    transactions = [...depositRows, ...withdrawalRows, ...profitRows, ...tradeRows]
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 30);

    renderRows(filterSelect?.value || 'all');
  } catch (error) {
    console.error('Dashboard transactions load failed:', error);
    if (realList) {
      realList.textContent = 'Unable to load transactions. Please refresh and try again.';
    }
  } finally {
    if (skeleton) skeleton.classList.add('hidden');
    if (realList) realList.classList.remove('hidden');
  }

  if (filterSelect && !filterSelect.dataset.txListenerAdded) {
    filterSelect.addEventListener('change', () => renderRows(filterSelect.value));
    filterSelect.dataset.txListenerAdded = 'true';
  }
}
/* ====================================================================
   12. Helper Utilities & Toast System
==================================================================== */

function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';

  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

  const text = document.createElement('span');
  text.textContent = message;

  toast.appendChild(icon);
  toast.appendChild(text);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';

    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function showFeedback(element, type, message) {
  if (!element) return;

  element.className = `form-feedback ${type === 'error' ? 'text-loss' : 'text-profit'}`;
  element.textContent = message;
  element.classList.remove('hidden');
}

// ====================================================================
// Total Profit — all recorded earnings; deposits and withdrawals excluded.
async function fetchProfitRows(client, userId) {
  const loadRows = async (type, pattern = null) => {
    const rows = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      let query = client.from('transactions').select('amount,description,created_at').eq('user_id', userId).eq('type', type);
      if (pattern) query = query.ilike('description', pattern);
      const { data, error } = await query.order('created_at', { ascending: true }).range(from, from + pageSize - 1);
      if (error) throw error;
      const page = data || [];
      rows.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    return rows;
  };
  const [trades, settlements, adjustments, referrals] = await Promise.all([
    loadRows('trade_code', '%30 Second Trade%'),
    loadRows('profit', '%Daily result%'),
    loadRows('trade_code', '%Trade Code Adjustment%'),
    loadRows('referral_commission')
  ]);
  return [...trades, ...settlements, ...adjustments, ...referrals];
}

async function loadTotalProfit(client, userId) {
  try {
    const rows = await fetchProfitRows(client, userId);
    return rows.reduce((total, row) => total + (Number(row.amount) || 0), 0);
  } catch (error) {
    console.error('Total Profit load failed:', error);
    return null;
  }
}
// Daily P/L — logged-in user, Thailand calendar day
// Includes daily-result settlements and completed 30-second trades.
// ====================================================================
function startDailyPnlUpdates(client, userId) {
  if (!client || !userId) return;
  if (window.__pipzoneDailyPnlTimer) {
    clearInterval(window.__pipzoneDailyPnlTimer);
  }
  if (window.__pipzoneDailyPnlVisibilityHandler) {
    document.removeEventListener('visibilitychange', window.__pipzoneDailyPnlVisibilityHandler);
  }
  const refresh = () => loadDailyPnl(client, userId);
  refresh();
  window.__pipzoneDailyPnlTimer = setInterval(() => {
    if (document.visibilityState !== 'hidden') refresh();
  }, 8000);
  window.__pipzoneDailyPnlVisibilityHandler = () => {
    if (document.visibilityState === 'visible') refresh();
  };
  document.addEventListener('visibilitychange', window.__pipzoneDailyPnlVisibilityHandler);
}

function getThailandDayRange() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const thailandMidnightUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day)
  ) - 7 * 60 * 60 * 1000;
  return {
    start: new Date(thailandMidnightUtc).toISOString(),
    end: new Date(thailandMidnightUtc + 24 * 60 * 60 * 1000).toISOString()
  };
}

async function loadDailyPnl(client, userId) {
  const display = document.getElementById('dailyPnlValue');
  if (!display || !client || !userId) return;

  try {
    const range = getThailandDayRange();
    const { data, error } = await client
      .from('transactions')
      .select('type,amount,description,created_at')
      .eq('user_id', userId)
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .in('type', ['profit', 'trade_code']);

    if (error) throw error;

    const pnl = (data || []).reduce((total, row) => {
      const type = String(row.type || '').toLowerCase();
      const description = String(row.description || '').toLowerCase();

      const isPnlEntry =
        type === 'profit' ||
        type === 'trade_code' ||
        /profit|loss|adjustment|trade/.test(description);

      return isPnlEntry ? total + (Number(row.amount) || 0) : total;
    }, 0);

    const sign = pnl > 0 ? '+' : pnl < 0 ? '-' : '';
    display.textContent = `${sign}${Math.abs(pnl).toFixed(2)}`;
    display.dataset.value = pnl.toFixed(2);

    const pill = display.closest('.pnl-pill');
    if (pill) {
      pill.classList.toggle('profit', pnl > 0);
      pill.classList.toggle('loss', pnl < 0);
    }
  } catch (error) {
    console.error('Current-day PnL load failed:', error);
  }
}