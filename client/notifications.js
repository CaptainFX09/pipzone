/* ====================================================================
   PipZoNe — Notifications Module
   Real Supabase data + Realtime updates.
   Original modal behavior preserved.
   Read state is stored locally. No Supabase writes.
==================================================================== */

// notifications.html isi folder mein hai, chahe script kisi bhi page se load ho
const NOTIFICATIONS_BASE = document.currentScript && document.currentScript.src
  ? new URL('./', document.currentScript.src).href
  : './';

let CLIENT_NOTIFICATIONS = [];
let NOTIFICATIONS_USER_ID = null;
let NOTIFICATIONS_FILTER = 'all';
let NOTIFICATIONS_LOADING = false;
let NOTIFICATIONS_REFRESH_QUEUED = false;
let NOTIFICATIONS_REALTIME_CHANNEL = null;
let NOTIFICATIONS_REALTIME_USER_ID = null;
let NOTIFICATIONS_REALTIME_TIMER = null;
let NOTIFICATIONS_REALTIME_REFRESH = null;
let NOTIFICATIONS_INIT_VERSION = 0;

function getNotificationReadKey() {
  return `pipzone_notifications_read_${NOTIFICATIONS_USER_ID || 'guest'}`;
}

function getReadNotificationIds() {
  try {
    const value = JSON.parse(localStorage.getItem(getNotificationReadKey()) || '[]');
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function saveReadNotificationIds(ids) {
  try {
    localStorage.setItem(getNotificationReadKey(), JSON.stringify([...ids]));
  } catch (error) {
    console.error('Could not save notification read state:', error);
  }
}

function escapeNotificationText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function notificationMoney(value) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function notificationDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function notificationTimeGroup(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Earlier';

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);

  if (date >= startToday) return 'Today';
  if (date >= startYesterday) return 'Yesterday';
  return 'Earlier';
}

function addClientNotification(list, record) {
  if (!record || !record.id || !record.title) return;

  const readIds = getReadNotificationIds();
  const id = String(record.id);
  const createdAt = record.created_at || null;
  const date = createdAt ? new Date(createdAt) : null;
  const isRecent = date && !Number.isNaN(date.getTime()) &&
    Date.now() - date.getTime() <= 24 * 60 * 60 * 1000;

  list.push({
    ...record,
    id,
    timeGroup: notificationTimeGroup(createdAt),
    time: notificationDate(createdAt),
    unread: !readIds.has(id) && Boolean(isRecent),
    type: record.type || 'info'
  });
}

async function loadRealClientNotifications() {
  const client = window.supabaseClient;

  if (!client) {
    console.error('Notifications: shared Supabase client is missing.');
    return [];
  }

  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw authError;

  const user = authData?.user;
  if (!user) {
    NOTIFICATIONS_USER_ID = null;
    return [];
  }

  NOTIFICATIONS_USER_ID = user.id;

  const notifications = [];

  async function safeQuery(label, query) {
    try {
      const { data, error } = await query;
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(`Notifications: ${label} query failed:`, error);
      return [];
    }
  }

  const [
    deposits,
    withdrawals,
    transactions,
    accounts,
    referredProfiles,
    reinvests
  ] = await Promise.all([
    safeQuery('deposits', client.from('deposits')
      .select('id,user_id,amount,currency,network,status,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)),

    safeQuery('withdrawals', client.from('withdrawals')
      .select('id,user_id,amount,network,status,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)),

    safeQuery('transactions', client.from('transactions')
      .select('id,user_id,type,amount,description,created_at')
      .eq('user_id', user.id)
      .in('type', ['profit', 'referral_commission', 'trade_code'])
      .order('created_at', { ascending: false })
      .limit(200)),

    safeQuery('accounts', client.from('accounts')
      .select('id,initial_balance,first_deposit_at,principal_lock_until,principal_locked_amount')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)),

    safeQuery('referrals', client.from('profiles')
      .select('id,full_name,first_name,last_name,verified_client_number,created_at')
      .eq('referred_by', user.id)
      .order('created_at', { ascending: false })
      .limit(100)),

    safeQuery('reinvest requests', client.from('reinvest_requests')
      .select('id,user_id,amount,status,created_at,reviewed_at,admin_note,lock_until')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100))
  ]);

  // ----------------------------------------------------
  // Deposit: pending, approved, rejected
  // ----------------------------------------------------
  deposits.forEach(row => {
    const status = String(row.status || '').toLowerCase();
    if (!['pending', 'approved', 'rejected'].includes(status)) return;

    const amount = notificationMoney(row.amount);
    const network = row.network ? ` (${row.network})` : '';
    const currency = row.currency || 'USDT';

    const titles = {
      pending: 'Deposit Under Review',
      approved: 'Deposit Approved Successfully',
      rejected: 'Deposit Request Rejected'
    };

    const messages = {
      pending: `Your deposit of ${amount} ${currency}${network} is awaiting approval.`,
      approved: `Your deposit of ${amount} ${currency}${network} has been approved.`,
      rejected: `Your deposit of ${amount} ${currency}${network} was rejected. Please check your deposit details or contact support.`
    };

    addClientNotification(notifications, {
      id: `deposit-${row.id}`,
      title: titles[status],
      message: messages[status],
      created_at: row.created_at,
      type: status === 'approved' ? 'profit' : 'security'
    });
  });

  // ----------------------------------------------------
  // Withdrawal: pending, approved, rejected
  // ----------------------------------------------------
  withdrawals.forEach(row => {
    const status = String(row.status || '').toLowerCase();
    if (!['pending', 'approved', 'rejected'].includes(status)) return;

    const amount = notificationMoney(row.amount);
    const network = row.network ? ` (${row.network})` : '';

    const titles = {
      pending: 'Withdrawal Request Received',
      approved: 'Withdrawal Approved Successfully',
      rejected: 'Withdrawal Request Rejected'
    };

    const messages = {
      pending: `Your withdrawal request for ${amount} USDT${network} is awaiting review.`,
      approved: `Your withdrawal request for ${amount} USDT${network} has been approved.`,
      rejected: `Your withdrawal request for ${amount} USDT${network} was rejected. Please contact support if you need assistance.`
    };

    addClientNotification(notifications, {
      id: `withdrawal-${row.id}`,
      title: titles[status],
      message: messages[status],
      created_at: row.created_at,
      type: 'security'
    });
  });

  // ----------------------------------------------------
  // Reinvest: pending, approved, rejected
  // Approved / rejected faisle ke waqt (reviewed_at) par dikhte hain,
  // aur id mein status shamil hai taake faisla naya (unread) nazar aaye.
  // ----------------------------------------------------
  reinvests.forEach(row => {
    const status = String(row.status || '').toLowerCase();
    if (!['pending', 'approved', 'rejected'].includes(status)) return;

    const amount = notificationMoney(row.amount);
    const note = String(row.admin_note || '').trim();
    const lockDate = row.lock_until
      ? new Date(row.lock_until).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })
      : null;

    const titles = {
      pending: 'Reinvest Request Under Review',
      approved: 'Reinvest Approved Successfully',
      rejected: 'Reinvest Request Rejected'
    };

    const messages = {
      pending: `Your reinvest request for ${amount} USDT is Under Review. This amount is on hold until it is reviewed.`,
      approved: `Your reinvestment of ${amount} USDT has been approved.` +
        (lockDate
          ? ` The amount is locked until ${lockDate}.`
          : ' The amount is locked for 40 days.'),
      rejected: `Your reinvest request for ${amount} USDT was not approved` +
        (note ? ` (${note})` : '') +
        '. The amount is available to withdraw, or you can submit a new request.'
    };

    addClientNotification(notifications, {
      id: `reinvest-${row.id}-${status}`,
      title: titles[status],
      message: messages[status],
      created_at: status === 'pending'
        ? row.created_at
        : (row.reviewed_at || row.created_at),
      type: status === 'approved' ? 'profit' : 'security'
    });
  });

  // ----------------------------------------------------
  // Profit / loss and referral commission
  // ----------------------------------------------------
  transactions.forEach(row => {
    const type = String(row.type || '').toLowerCase();
    const description = String(row.description || '');

    if (type === 'referral_commission') {
      addClientNotification(notifications, {
        id: `commission-${row.id}`,
        title: 'Referral Commission Credited',
        message: description || `A referral commission of ${notificationMoney(row.amount)} USDT was credited.`,
        created_at: row.created_at,
        type: 'profit'
      });
      return;
    }

    const isTradeResult = type === 'trade_code' &&
      /30 second trade/i.test(description) &&
      /\b(profit|loss)\b/i.test(description);

    const isDailyResult = type === 'profit' &&
      /daily result/i.test(description);

    if (!isTradeResult && !isDailyResult) return;

    const isLoss = /\bloss\b/i.test(description) ||
      /daily result\s*-\s*\$?/i.test(description);

    addClientNotification(notifications, {
      id: `result-${row.id}`,
      title: isLoss ? 'Trading Loss Recorded' : 'Trading Profit Recorded',
      message: description || `Recorded result: ${notificationMoney(row.amount)} USDT.`,
      created_at: row.created_at,
      type: isLoss ? 'info' : 'profit'
    });
  });

  // ----------------------------------------------------
  // Referral signup and referred-client deposit status
  // ----------------------------------------------------
  referredProfiles.forEach(profile => {
    const name = [
      profile.first_name,
      profile.last_name
    ].filter(Boolean).join(' ').trim() ||
      profile.full_name ||
      (profile.verified_client_number
        ? `Client PZ-${profile.verified_client_number}`
        : 'A referred client');

    addClientNotification(notifications, {
      id: `referral-signup-${profile.id}`,
      title: 'A New Client Joined Your Team',
      message: `${name} joined using your referral link.`,
      created_at: profile.created_at,
      type: 'info'
    });
  });

  if (referredProfiles.length) {
    const referredIds = referredProfiles.map(profile => profile.id);

    const referredDeposits = await safeQuery('referred deposits',
      client.from('deposits')
        .select('id,user_id,amount,currency,network,status,created_at')
        .in('user_id', referredIds)
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .limit(200)
    );

    const profilesById = new Map(
      referredProfiles.map(profile => [profile.id, profile])
    );

    referredDeposits.forEach(row => {
      const profile = profilesById.get(row.user_id);

      const name = profile
        ? ([
            profile.first_name,
            profile.last_name
          ].filter(Boolean).join(' ').trim() ||
          profile.full_name ||
          (profile.verified_client_number
            ? `Client PZ-${profile.verified_client_number}`
            : 'Your referred client'))
        : 'Your referred client';

      const status = String(row.status || '').toLowerCase();
      const amount = notificationMoney(row.amount);
      const currency = row.currency || 'USDT';

      addClientNotification(notifications, {
        id: `referral-deposit-${row.id}-${status}`,
        title: status === 'approved'
          ? 'Referred Client Deposit Approved'
          : 'Referred Client Deposit Pending',
        message: `${name}'s deposit of ${amount} ${currency} is ${
          status === 'approved' ? 'approved' : 'awaiting approval'
        }.`,
        created_at: row.created_at,
        type: status === 'approved' ? 'profit' : 'security'
      });
    });
  }

  // ----------------------------------------------------
  // Principal unlock available
  // ----------------------------------------------------
  const account = accounts[0];

  if (account) {
    const unlockDate = account.principal_lock_until
      ? new Date(account.principal_lock_until)
      : account.first_deposit_at
        ? new Date(new Date(account.first_deposit_at).getTime() + 40 * 86400000)
        : null;

    const lockedPrincipal = Number(account.principal_locked_amount || 0);
    const initialBalance = Number(account.initial_balance || 0);
    const principal = lockedPrincipal > 0 ? lockedPrincipal : initialBalance;

    if (unlockDate && !Number.isNaN(unlockDate.getTime()) &&
        unlockDate.getTime() <= Date.now() && principal > 0) {
      addClientNotification(notifications, {
        id: `principal-unlock-${account.id}-${unlockDate.toISOString()}`,
        title: 'Principal Unlock Available',
        message: `Your 40-day principal lock cycle reached its unlock date (${unlockDate.toLocaleDateString('en-US')}). Check your available balance and withdrawal rules.`,
        created_at: account.principal_lock_until || account.first_deposit_at,
        type: 'info'
      });
    }
  }

  return notifications.sort((a, b) => {
    const timeA = new Date(a.created_at || 0).getTime();
    const timeB = new Date(b.created_at || 0).getTime();
    return timeB - timeA;
  });
}

// ----------------------------------------------------
// Realtime subscription
// ----------------------------------------------------
async function startNotificationsRealtime(client, userId, refreshCallback) {
  if (!client || !userId) return;

  if (
    NOTIFICATIONS_REALTIME_CHANNEL &&
    NOTIFICATIONS_REALTIME_USER_ID === userId
  ) {
    NOTIFICATIONS_REALTIME_REFRESH = refreshCallback;
    return;
  }

  if (NOTIFICATIONS_REALTIME_CHANNEL) {
    const oldChannel = NOTIFICATIONS_REALTIME_CHANNEL;
    NOTIFICATIONS_REALTIME_CHANNEL = null;
    NOTIFICATIONS_REALTIME_USER_ID = null;

    try {
      await client.removeChannel(oldChannel);
    } catch (error) {
      console.error('Notifications: previous Realtime cleanup failed:', error);
    }
  }

  NOTIFICATIONS_REALTIME_USER_ID = userId;
  NOTIFICATIONS_REALTIME_REFRESH = refreshCallback;

  const channel = client.channel(`pipzone-notifications-${userId}`);

  const scheduleRefresh = () => {
    if (NOTIFICATIONS_REALTIME_TIMER) {
      clearTimeout(NOTIFICATIONS_REALTIME_TIMER);
    }

    NOTIFICATIONS_REALTIME_TIMER = setTimeout(() => {
      NOTIFICATIONS_REALTIME_TIMER = null;

      if (typeof NOTIFICATIONS_REALTIME_REFRESH === 'function') {
        NOTIFICATIONS_REALTIME_REFRESH();
      }
    }, 500);
  };

  // Client's own records.
  ['deposits', 'withdrawals', 'transactions', 'accounts', 'reinvest_requests'].forEach(table => {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        filter: `user_id=eq.${userId}`
      },
      scheduleRefresh
    );
  });

  // New referral signup.
  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'profiles',
      filter: `referred_by=eq.${userId}`
    },
    scheduleRefresh
  );

  // Read-only lookup of existing referrals for their deposit subscriptions.
  try {
    const { data: referrals, error } = await client
      .from('profiles')
      .select('id')
      .eq('referred_by', userId)
      .limit(100);

    if (error) throw error;

    (referrals || []).forEach(profile => {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deposits',
          filter: `user_id=eq.${profile.id}`
        },
        scheduleRefresh
      );
    });
  } catch (error) {
    console.error('Notifications: referral Realtime setup failed:', error);
  }

  NOTIFICATIONS_REALTIME_CHANNEL = channel;

  channel.subscribe(status => {
    if (status === 'SUBSCRIBED') {
      console.info('Notifications Realtime connected.');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.error('Notifications Realtime connection issue:', status);
    }
  });
}

function initNotificationsModal() {
  const bellBtn = document.getElementById('notifBellBtn');
  const modal = document.getElementById('notifModal');
  const closeBtn = document.getElementById('closeNotifBtn');
  const listContainer = document.getElementById('notifListContainer');
  const markAllBtn = document.getElementById('markAllReadBtn');
  const unreadBadge = document.getElementById('unreadNotifBadge');
  const modalTotalBadge = document.getElementById('notifTotalBadge');

  if (!bellBtn || !modal) return;

  const initVersion = ++NOTIFICATIONS_INIT_VERSION;

  function renderNotifications(filter = NOTIFICATIONS_FILTER) {
    if (!listContainer) return;

    NOTIFICATIONS_FILTER = filter;
    listContainer.innerHTML = '';

    const groups = ['Today', 'Yesterday', 'Earlier'];

    groups.forEach(groupName => {
      let filtered = CLIENT_NOTIFICATIONS.filter(n => n.timeGroup === groupName);

      if (filter === 'settlements') {
        filtered = filtered.filter(n =>
          n.title.includes('Profit') ||
          n.title.includes('Loss') ||
          n.title.includes('Commission')
        );
      } else if (filter === 'security') {
        filtered = filtered.filter(n =>
          !n.title.includes('Profit Recorded') &&
          !n.title.includes('Commission Credited')
        );
      }

      if (!filtered.length) return;

      const groupEl = document.createElement('div');
      const groupTitle = document.createElement('div');
      groupTitle.className = 'notif-group-title';
      groupTitle.textContent = groupName;
      groupEl.appendChild(groupTitle);

      filtered.forEach(notif => {
        const itemEl = document.createElement('div');
        itemEl.className = `notif-item ${notif.unread ? 'unread' : ''}`;

        itemEl.innerHTML = `
          <div class="notif-icon ${notif.type === 'profit' ? '' : 'alert'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${notif.type === 'profit'
                ? '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline>'
                : '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>'}
            </svg>
          </div>
          <div class="notif-text">
            <div class="notif-headline">${escapeNotificationText(notif.title)}</div>
            <div class="notif-message">${escapeNotificationText(notif.message)}</div>
            <div class="notif-time mono">${escapeNotificationText(notif.time)}</div>
          </div>
        `;

        itemEl.addEventListener('click', () => {
          const readIds = getReadNotificationIds();
          readIds.add(notif.id);
          saveReadNotificationIds(readIds);
          notif.unread = false;
          renderNotifications(NOTIFICATIONS_FILTER);
        });

        groupEl.appendChild(itemEl);
      });

      listContainer.appendChild(groupEl);
    });

    if (!listContainer.children.length) {
      const empty = document.createElement('div');
      empty.className = 'notif-message';
      empty.textContent = NOTIFICATIONS_LOADING
        ? 'Loading notifications...'
        : 'No notifications found.';
      listContainer.appendChild(empty);
    }

    const activeUnread = CLIENT_NOTIFICATIONS.filter(n => n.unread).length;

    if (unreadBadge) {
      unreadBadge.textContent = activeUnread;
      unreadBadge.style.display = activeUnread > 0 ? 'flex' : 'none';
    }

    if (modalTotalBadge) {
      modalTotalBadge.textContent = `${activeUnread} new`;
    }
  }

  async function refreshNotifications() {
    if (initVersion !== NOTIFICATIONS_INIT_VERSION) return;

    if (NOTIFICATIONS_LOADING) {
      NOTIFICATIONS_REFRESH_QUEUED = true;
      return;
    }

    NOTIFICATIONS_LOADING = true;
    renderNotifications(NOTIFICATIONS_FILTER);

    try {
      const newNotifications = await loadRealClientNotifications();

      if (initVersion === NOTIFICATIONS_INIT_VERSION) {
        CLIENT_NOTIFICATIONS = newNotifications;
      }
    } catch (error) {
      console.error('Could not load client notifications:', error);
    } finally {
      NOTIFICATIONS_LOADING = false;
      renderNotifications(NOTIFICATIONS_FILTER);

      if (NOTIFICATIONS_REFRESH_QUEUED) {
        NOTIFICATIONS_REFRESH_QUEUED = false;
        refreshNotifications();
      }
    }
  }

  bellBtn.addEventListener('click', async () => {
    modal.classList.remove('hidden');
    await refreshNotifications();
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  modal.addEventListener('click', event => {
    if (event.target === modal) modal.classList.add('hidden');
  });

  if (markAllBtn) {
    markAllBtn.addEventListener('click', () => {
      const readIds = getReadNotificationIds();

      CLIENT_NOTIFICATIONS.forEach(notif => {
        readIds.add(notif.id);
        notif.unread = false;
      });

      saveReadNotificationIds(readIds);
      renderNotifications(NOTIFICATIONS_FILTER);

      if (typeof showToast === 'function') {
        showToast('All notifications marked as read.');
      }
    });
  }

  const tabs = modal.querySelectorAll('.notif-tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(item => item.classList.remove('active'));
      tab.classList.add('active');
      renderNotifications(tab.getAttribute('data-tab') || 'all');
    });
  });

  renderNotifications();
  refreshNotifications();

  (async () => {
    try {
      const client = window.supabaseClient;
      if (!client) {
        console.error('Notifications: shared Supabase client is missing.');
        return;
      }

      const { data, error } = await client.auth.getUser();
      if (error) throw error;

      if (data?.user && initVersion === NOTIFICATIONS_INIT_VERSION) {
        await startNotificationsRealtime(
          client,
          data.user.id,
          refreshNotifications
        );
      }
    } catch (error) {
      console.error('Notifications Realtime could not start:', error);
    }
  })();
}

async function loadNotificationsModal() {
  const mount = document.getElementById('notificationsModalMount');
  if (!mount) return;

  try {
    const response = await fetch(NOTIFICATIONS_BASE + 'notifications.html');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    mount.innerHTML = await response.text();
    initNotificationsModal();
  } catch (error) {
    console.error('Could not load notifications.html:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadNotificationsModal);
} else {
  loadNotificationsModal();
}