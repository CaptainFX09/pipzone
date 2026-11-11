/**
 * PipZoNe — Profile gate
 * Deposit / Withdrawal se pehle check ke profile complete hai.
 * Rule scriptprofile.js jaisa hi hai:
 *   personal = first_name + last_name + phone
 *   address  = address + city + state + postal_code
 *   wallet   = wallet_address (TRC20) YA wallet_address_bep20
 *
 * Use:
 *   const result = await PipZoNeProfile.check();
 *   result.status: "complete" | "incomplete" | "signed_out" | "error"
 *   PipZoNeProfile.renderBanner(element, result, { purpose:"deposit", onRetry })
 */
(function () {
  'use strict';

  const scriptEl = document.currentScript;
  const ROOT = new URL('../', scriptEl.src).href;
  const EDIT_URL = ROOT + 'client/settings/edit-profile/indexedit-profile.html';
  const SIGNIN_URL = ROOT + 'signin/index.html';

  const COLUMNS =
    'first_name,last_name,phone,address,city,state,postal_code,wallet_address,wallet_address_bep20';

  let fallbackClient = null;

  const filled = (v) => String(v == null ? '' : v).trim() !== '';

  function getClient() {
    if (window.supabaseClient) return window.supabaseClient;
    if (
      typeof supabase !== 'undefined' &&
      typeof SUPABASE_URL !== 'undefined' &&
      typeof SUPABASE_PUBLISHABLE_KEY !== 'undefined'
    ) {
      if (!fallbackClient) {
        fallbackClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
      }
      return fallbackClient;
    }
    return null;
  }

  function evaluate(p) {
    const missing = [];

    const personal = [];
    if (!filled(p.first_name)) personal.push('first name');
    if (!filled(p.last_name)) personal.push('last name');
    if (!filled(p.phone)) personal.push('phone number');
    if (personal.length) {
      missing.push({ key: 'personal', label: 'Personal information', detail: personal.join(', ') });
    }

    const addr = [];
    if (!filled(p.address)) addr.push('address');
    if (!filled(p.city)) addr.push('city');
    if (!filled(p.state)) addr.push('state / province');
    if (!filled(p.postal_code)) addr.push('postal code');
    if (addr.length) {
      missing.push({ key: 'address', label: 'Address information', detail: addr.join(', ') });
    }

    if (!filled(p.wallet_address) && !filled(p.wallet_address_bep20)) {
      missing.push({
        key: 'wallet',
        label: 'Withdrawal wallet',
        detail: 'add at least one TRC20 or BEP20 wallet'
      });
    }

    return missing;
  }

  async function check() {
    const client = getClient();
    if (!client) {
      return { status: 'error', missing: [], message: 'Connection is not ready. Please refresh the page.' };
    }

    try {
      const authRes = await client.auth.getUser();
      if (authRes.error) throw authRes.error;

      const user = authRes.data && authRes.data.user;
      if (!user) {
        return { status: 'signed_out', missing: [], message: 'Please sign in to continue.' };
      }

      const profRes = await client.from('profiles').select(COLUMNS).eq('id', user.id).maybeSingle();
      if (profRes.error) throw profRes.error;

      // Profile row na ho to bhi sab kuch "missing" maano, client Edit Profile par jaye
      const profile = profRes.data || {};
      const missing = evaluate(profile);

      return {
        status: missing.length ? 'incomplete' : 'complete',
        missing,
        profile: profRes.data,
        noRecord: !profRes.data
      };
    } catch (err) {
      console.error('Profile gate error:', err);
      if (/expired|invalid jwt|jwt expired/i.test((err && err.message) || '')) {
        return { status: 'signed_out', missing: [], message: 'Your session has expired. Please sign in again.' };
      }
      return {
        status: 'error',
        missing: [],
        message: 'We could not verify your profile right now. Please try again.'
      };
    }
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderBanner(box, result, opts) {
    if (!box) return;
    opts = opts || {};
    box.textContent = '';
    if (!result || result.status === 'complete') return;

    const action = opts.purpose === 'withdrawal' ? 'requesting a withdrawal' : 'making a deposit';

    const wrap = el('div', 'pz-gate-banner');
    wrap.setAttribute('role', 'alert');
    wrap.appendChild(el('div', 'pz-gate-icon', '!'));

    const body = el('div', 'pz-gate-body');
    let action_el;

    if (result.status === 'incomplete') {
      body.appendChild(el('strong', null, 'Complete your profile before ' + action));
      body.appendChild(el('p', null, 'These details are still missing from your profile:'));

      const list = el('ul');
      result.missing.forEach((item) => {
        const li = el('li');
        li.appendChild(el('b', null, item.label));
        li.appendChild(document.createTextNode(' — ' + item.detail));
        list.appendChild(li);
      });
      body.appendChild(list);

            action_el = el('a', 'pz-gate-btn', 'Edit Profile');
      action_el.href = EDIT_URL + '?return=' + encodeURIComponent(location.href);
    } else if (result.status === 'signed_out') {
      body.appendChild(el('strong', null, 'Please sign in'));
      body.appendChild(el('p', null, result.message || 'You need to be signed in to continue.'));

      action_el = el('a', 'pz-gate-btn', 'Sign in');
      action_el.href = SIGNIN_URL;
    } else {
      body.appendChild(el('strong', null, 'We could not verify your profile'));
      body.appendChild(el('p', null, result.message || 'Please try again.'));

      action_el = el('button', 'pz-gate-btn', 'Try again');
      action_el.type = 'button';
      action_el.addEventListener('click', () => {
        if (typeof opts.onRetry === 'function') opts.onRetry();
      });
    }

    wrap.appendChild(body);
    wrap.appendChild(action_el);
    box.appendChild(wrap);
  }

  window.PipZoNeProfile = { check, evaluate, renderBanner, EDIT_URL };
})();