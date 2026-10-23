/**
 * PipZoNe Admin — Reinvest Requests
 * Admin Approve / Reject karta hai. Approve par database trigger khud:
 *   - 40 din ka naya lock lagata hai
 *   - referrer ko commission deta hai (deposit jaisi hi shartein)
 * Reject par kuch lock nahi lagta, rakam client ke liye wapas withdrawable.
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  let loading = false;
  let fromSelf = false;

  // ---------- helpers ----------
  function money(v) {
    return '$' + Number(v || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  function fmt(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'Asia/Bangkok'
    }) + ' (Thailand)';
  }

  function el(tag, text, style) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (style) node.style.cssText = style;
    return node;
  }

  function setMsg(kind, text) {
    const box = $('reinvestMsg');
    if (!box) return;
    box.textContent = '';
    if (!text) return;

    const bad = kind === 'error';
    box.appendChild(el(
      'div', text,
      'margin:0 0 12px;padding:10px 12px;border-radius:8px;font-size:13px;' +
      'border:1px solid ' + (bad ? 'rgba(242,115,94,.5)' : 'rgba(94,234,176,.5)') + ';' +
      'color:' + (bad ? '#F2735E' : '#5EEAB0') + ';' +
      'background:' + (bad ? 'rgba(242,115,94,.08)' : 'rgba(94,234,176,.08)')
    ));
  }

  function getClient() {
    const list = [];
    try { if (typeof supabaseClient !== 'undefined') list.push(supabaseClient); } catch (e) {}
    try { if (typeof client !== 'undefined') list.push(client); } catch (e) {}
    try { if (typeof sb !== 'undefined') list.push(sb); } catch (e) {}
    try { if (typeof db !== 'undefined') list.push(db); } catch (e) {}
    list.push(window.supabaseClient, window.client, window.sb, window.db);
    return list.find(c => c && typeof c.from === 'function' && c.auth) || null;
  }

  function personName(p) {
    if (!p) return 'Unknown client';
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
      String(p.full_name || '').trim() || 'Client';
    return p.verified_client_number != null ? name + ' (PZ' + p.verified_client_number + ')' : name;
  }

  function badge(status) {
    const colors = { pending: '#E5A93C', approved: '#5EEAB0', rejected: '#F2735E' };
    const color = colors[status] || '#94A3B8';
    return el(
      'span', String(status || '').toUpperCase(),
      'display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;' +
      'border:1px solid ' + color + ';color:' + color
    );
  }

  // ---------- load ----------
  async function loadReinvest() {
    const box = $('reinvestTable');
    if (!box || loading) return;

    const client = getClient();
    if (!client) {
      setMsg('error', 'Could not find the Supabase client used by this admin panel. Send script.js so reinvest-admin.js can be matched to it.');
      return;
    }

    loading = true;
    box.textContent = 'Loading...';

    try {
      const { data, error } = await client
        .from('reinvest_requests')
        .select('id,user_id,amount,status,created_at,reviewed_at,admin_note,lock_until,reinvest_count')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      const rows = data || [];
      const userIds = [...new Set(rows.map(r => r.user_id))];

      const profiles = {};
      const accounts = {};
      let referrers = {};
      let rates = null;

      if (userIds.length) {
        const pr = await client
          .from('profiles')
          .select('id,first_name,last_name,full_name,verified_client_number,referred_by')
          .in('id', userIds);
        if (pr.error) console.warn('Profiles could not be loaded:', pr.error);
        (pr.data || []).forEach(p => { profiles[p.id] = p; });

        const refIds = [...new Set(Object.values(profiles).map(p => p.referred_by).filter(Boolean))];
        if (refIds.length) {
          const rr = await client
            .from('profiles')
            .select('id,first_name,last_name,full_name,verified_client_number')
            .in('id', refIds);
          (rr.data || []).forEach(p => { referrers[p.id] = p; });
        }

        const ac = await client
          .from('accounts')
          .select('user_id,balance,principal_lock_until,reinvest_count')
          .in('user_id', userIds);
        if (ac.error) console.warn('Accounts could not be loaded:', ac.error);
        (ac.data || []).forEach(a => { accounts[a.user_id] = a; });

        const st = await client
          .from('app_settings')
          .select('key,value')
          .in('key', [
            'referral_commission_rate_low',
            'referral_commission_rate_high',
            'referral_commission_threshold'
          ]);
        if (!st.error && st.data) {
          const map = {};
          st.data.forEach(s => { map[s.key] = Number(s.value); });
          rates = {
            low: Number.isFinite(map.referral_commission_rate_low) ? map.referral_commission_rate_low : 1,
            high: Number.isFinite(map.referral_commission_rate_high) ? map.referral_commission_rate_high : 6,
            threshold: Number.isFinite(map.referral_commission_threshold) ? map.referral_commission_threshold : 500
          };
        }
      }

      render(rows, profiles, accounts, referrers, rates);
    } catch (error) {
      console.error('Reinvest requests load error:', error);
      box.textContent = '';
      setMsg('error', 'Could not load reinvest requests: ' + (error.message || 'unknown error') +
        '. If the table was just created, run: notify pgrst, \'reload schema\';');
    } finally {
      loading = false;
    }
  }

  // ---------- render ----------
  function render(rows, profiles, accounts, referrers, rates) {
    const box = $('reinvestTable');
    box.textContent = '';

    const pending = rows.filter(r => r.status === 'pending');
    const counter = $('reinvestPendingCount');
    if (counter) counter.textContent = pending.length ? '(' + pending.length + ' pending)' : '';

    if (!rows.length) {
      box.appendChild(el('div', 'No reinvest requests yet.', 'padding:16px;opacity:.7'));
      return;
    }

    // pending upar, baaki nayi se purani
    const sorted = [...pending, ...rows.filter(r => r.status !== 'pending')];

    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Request', 'Client', 'Amount', 'Balance now', 'Referrer / commission', 'Status', 'Requested', 'Action']
      .forEach(label => headRow.appendChild(el('th', label)));
    head.appendChild(headRow);
    table.appendChild(head);

    const body = document.createElement('tbody');

    sorted.forEach(r => {
      const tr = document.createElement('tr');
      const profile = profiles[r.user_id];
      const account = accounts[r.user_id];
      const amount = Number(r.amount || 0);

      tr.appendChild(el('td', '#' + r.id));
      tr.appendChild(el('td', personName(profile)));
      tr.appendChild(el('td', money(amount)));

      // balance now
      const balanceCell = document.createElement('td');
      if (account) {
        const balance = Number(account.balance || 0);
        balanceCell.appendChild(document.createTextNode(money(balance)));
        if (r.status === 'pending' && balance + 0.005 < amount) {
          balanceCell.appendChild(el(
            'div', 'Lower than request',
            'font-size:11px;color:#F2735E;margin-top:3px'
          ));
        }
      } else {
        balanceCell.textContent = '—';
      }
      tr.appendChild(balanceCell);

      // referrer / commission
      const refCell = document.createElement('td');
      const refId = profile && profile.referred_by;
      if (!refId) {
        refCell.textContent = 'No referrer';
      } else {
        refCell.appendChild(document.createTextNode(personName(referrers[refId])));
        if (rates && r.status === 'pending') {
          const rate = amount < rates.threshold ? rates.low : rates.high;
          const commission = Math.round(amount * rate) / 100;
          refCell.appendChild(el(
            'div', 'Gets ' + money(commission) + ' (' + rate + '%) on approval',
            'font-size:11px;opacity:.8;margin-top:3px'
          ));
        }
      }
      tr.appendChild(refCell);

      // status
      const statusCell = document.createElement('td');
      statusCell.appendChild(badge(r.status));
      if (r.status === 'approved' && r.lock_until) {
        statusCell.appendChild(el('div', 'Locked until ' + fmt(r.lock_until), 'font-size:11px;opacity:.75;margin-top:4px'));
      }
      if (r.status !== 'pending' && r.reviewed_at) {
        statusCell.appendChild(el('div', 'Reviewed ' + fmt(r.reviewed_at), 'font-size:11px;opacity:.75;margin-top:2px'));
      }
      if (r.admin_note) {
        statusCell.appendChild(el('div', 'Note: ' + r.admin_note, 'font-size:11px;opacity:.75;margin-top:2px'));
      }
      tr.appendChild(statusCell);

      tr.appendChild(el('td', fmt(r.created_at)));

      // actions
      const actionCell = document.createElement('td');
      if (r.status === 'pending') {
        const approveBtn = el('button', 'Approve');
        approveBtn.className = 'btn';
        approveBtn.type = 'button';
        approveBtn.addEventListener('click', () => decide(r, 'approved', personName(profile), approveBtn));

        const rejectBtn = el('button', 'Reject', 'margin-left:6px');
        rejectBtn.className = 'btn';
        rejectBtn.type = 'button';
        rejectBtn.addEventListener('click', () => decide(r, 'rejected', personName(profile), rejectBtn));

        actionCell.appendChild(approveBtn);
        actionCell.appendChild(rejectBtn);
      } else {
        actionCell.textContent = '—';
      }
      tr.appendChild(actionCell);

      body.appendChild(tr);
    });

    table.appendChild(body);
    box.appendChild(table);
  }

  // ---------- approve / reject ----------
  async function decide(request, status, clientName, button) {
    const client = getClient();
    if (!client) return;

    const amount = money(request.amount);
    const patch = { status };

    if (status === 'approved') {
      const ok = window.confirm(
        'Approve reinvest request #' + request.id + '?\n\n' +
        'Client: ' + clientName + '\n' +
        'Amount: ' + amount + '\n\n' +
        'This locks the amount for 40 days and pays the referrer commission (if any). ' +
        'It cannot be undone.'
      );
      if (!ok) return;
    } else {
      const note = window.prompt(
        'Reject reinvest request #' + request.id + ' (' + clientName + ', ' + amount + ').\n\n' +
        'Optional reason for the client (leave empty for none). Press Cancel to stop:',
        ''
      );
      if (note === null) return;
      if (note.trim()) patch.admin_note = note.trim();
    }

    const buttons = document.querySelectorAll('#reinvestTable button');
    buttons.forEach(b => { b.disabled = true; });
    setMsg('', '');

    try {
      const { data, error } = await client
        .from('reinvest_requests')
        .update(patch)
        .eq('id', request.id)
        .eq('status', 'pending')
        .select('id,status,lock_until,reinvest_count');

      if (error) throw error;

      if (!data || !data.length) {
        throw new Error('This request is no longer pending. The list has been refreshed.');
      }

      setMsg(
        'ok',
        status === 'approved'
          ? 'Request #' + request.id + ' approved. The balance is locked and any referral commission has been credited.'
          : 'Request #' + request.id + ' rejected. The amount is withdrawable again.'
      );
    } catch (error) {
      console.error('Reinvest decision error:', error);
      setMsg('error', error.message || 'The request could not be updated.');
    } finally {
      await loadReinvest();

      // upar ke summary cards (commission paid wagera) bhi taaza ho jayen
      const refresh = $('refreshBtn');
      if (refresh) {
        fromSelf = true;
        refresh.click();
        fromSelf = false;
      }
    }
  }

  // ---------- start ----------
  function whenAppVisible(callback) {
    const app = $('app');
    if (!app) return;

    const check = () => {
      if (!app.classList.contains('hidden')) {
        callback();
        return true;
      }
      return false;
    };

    if (check()) return;

    const observer = new MutationObserver(() => {
      if (check()) observer.disconnect();
    });
    observer.observe(app, { attributes: true, attributeFilter: ['class'] });
  }

  const refreshBtn = $('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (!fromSelf) loadReinvest();
    });
  }

  whenAppVisible(loadReinvest);
})();