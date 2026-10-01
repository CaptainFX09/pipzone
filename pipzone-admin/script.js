/* =========================================================
   PIPZONE ADMIN PANEL — APP LOGIC
   =========================================================
   Table of contents:
   1. Supabase client setup
   2. Helpers (DOM shortcut, money format, escape, constants)
   3. UI messages (top banner + login banner)
   4. Status pill renderer
   5. Password show/hide toggle
   6. Date helpers
   7. Session / admin auth check
   8. Load all data (main data fetch + dashboard calculations)
   9. Table renderers (deposits, withdrawals, accounts,
      referrals, profit entries, transactions)
   10. Create account action
   11. Record daily result action
   12. Approve / reject deposit actions
   13. Approve / reject withdrawal actions
   14. Login / logout / refresh event handlers
   15. Auth state listener & app start
   16. Referral program — save commission rate action
========================================================= */


/* =========================================================
   1. SUPABASE CLIENT SETUP
========================================================= */

const SUPABASE_URL =
'https://nzasmkplxzirnqeteclv.supabase.co';

const SUPABASE_KEY =
'sb_publishable_ywmF35YANKsFEdZOs8wDdQ__jIezHTF';

const client =
supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);


/* =========================================================
   2. HELPERS (DOM SHORTCUT, MONEY FORMAT, ESCAPE, CONSTANTS)
========================================================= */

const $ =
id => document.getElementById(id);


const money =
n =>
'$' +
Number(n || 0).toLocaleString(
  undefined,
  {
    minimumFractionDigits:2,
    maximumFractionDigits:2
  }
);


const esc =
s =>
String(s ?? '').replace(
  /[&<>'"]/g,
  c =>
  ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    "'":'&#39;',
    '"':'&quot;'
  }[c])
);


const PRINCIPAL_LOCK_DAYS = 40;


/* FIXED WITHDRAWAL FEE */

const WITHDRAWAL_FEE = 2;


/* =========================================================
   3. UI MESSAGES (TOP BANNER + LOGIN BANNER)
========================================================= */

function showMsg(text,error=false){

  const el = $('msg');

  el.textContent = text;

  el.style.display = 'block';

  el.style.borderColor =
    error
    ? '#71343c'
    : '#20324a';

  el.style.color =
    error
    ? '#ffb6b6'
    : '#cfe0f5';

  setTimeout(
    () => el.style.display='none',
    5000
  );
}


function loginMsg(text,error=false){

  const el = $('loginMsg');

  el.textContent = text;

  el.style.display = 'block';

  el.style.color =
    error
    ? '#ffb6b6'
    : '#cfe0f5';
}


/* =========================================================
   4. STATUS PILL RENDERER
========================================================= */

function pill(status){

  return `
    <span class="pill ${esc(status)}">
      ${esc(status)}
    </span>
  `;
}


/* =========================================================
   5. PASSWORD SHOW/HIDE TOGGLE
========================================================= */

function togglePw(id,btn){

  const input = $(id);

  if(!input)return;

  const isHidden =
    input.type === 'password';

  input.type =
    isHidden
    ? 'text'
    : 'password';

  btn.textContent =
    isHidden
    ? '🙈'
    : '👁';

  btn.setAttribute(
    'aria-label',
    isHidden
    ? 'Hide password'
    : 'Show password'
  );
}


/* =========================================================
   6. DATE HELPERS
========================================================= */

function daysSince(dateStr){

  if(!dateStr)return null;

  return (
    Date.now() -
    new Date(dateStr).getTime()
  ) / 86400000;
}


/* =========================================================
   7. SESSION / ADMIN AUTH CHECK
========================================================= */

async function getSession(){

  const {
    data
  } =
  await client.auth.getSession();

  return data.session;
}


/* ADMIN UID — UPDATED FOR NEW ADMIN USER */

const ADMIN_UID =
'f40ac741-d4a0-4320-86ab-f5bedc3d091a';


async function checkAdmin(){

  const session =
    await getSession();

  if(!session){

    $('loginView')
      .classList
      .remove('hidden');

    $('app')
      .classList
      .add('hidden');

    return false;
  }


  if(session.user.id !== ADMIN_UID){

    await client.auth.signOut();

    $('loginView')
      .classList
      .remove('hidden');

    $('app')
      .classList
      .add('hidden');

    loginMsg(
      'This account is not an admin account.',
      true
    );

    return false;
  }


  const {
    data,
    error
  } =
  await client
    .from('profiles')
    .select('role')
    .eq('id',session.user.id)
    .maybeSingle();


  if(error){

    loginMsg(
      error.message,
      true
    );

    return false;
  }


  if(!data){

    await client.auth.signOut();

    $('loginView')
      .classList
      .remove('hidden');

    $('app')
      .classList
      .add('hidden');

    loginMsg(
      'Admin profile was not found in the profiles table.',
      true
    );

    return false;
  }


  if(data.role !== 'admin'){

    await client.auth.signOut();

    $('loginView')
      .classList
      .remove('hidden');

    $('app')
      .classList
      .add('hidden');

    loginMsg(
      'This account is not an admin account.',
      true
    );

    return false;
  }


  $('loginView')
    .classList
    .add('hidden');

  $('app')
    .classList
    .remove('hidden');

  $('adminEmail')
    .textContent =
    session.user.email || '';

  return true;
}


/* =========================================================
   8. LOAD ALL DATA (MAIN DATA FETCH + DASHBOARD CALCULATIONS)
   (wrapped so any unexpected error is visible instead of
   silently doing nothing)
========================================================= */

let LATEST_ACCOUNTS_BY_USER = {};

/* Current referral commission rate (%), loaded from app_settings */
let CURRENT_COMMISSION_RATE_LOW = 0;
let CURRENT_COMMISSION_RATE_HIGH = 0;


async function loadAll(){

  try{

    if(!(await checkAdmin()))
      return;


    const [
      profiles,
      accounts,
      deposits,
      withdrawals,
      transactions,
      profitEntries,
      referralCommissions,
      appSettings
    ] =
    await Promise.all([

      client
        .from('profiles')
        .select(
          'id,full_name,phone,wallet_address,role,created_at,referral_code,referred_by,referral_unlocked'
        )
        .order(
          'created_at',
          {ascending:false}
        ),

      client
        .from('accounts')
        .select('*')
        .order(
          'created_at',
          {ascending:false}
        ),

      client
        .from('deposits')
        .select('*')
        .order(
          'created_at',
          {ascending:false}
        ),

      client
        .from('withdrawals')
        .select('*')
        .order(
          'created_at',
          {ascending:false}
        ),

      client
        .from('transactions')
        .select('*')
        .order(
          'created_at',
          {ascending:false}
        ),

      client
        .from('profit_entries')
        .select('*')
        .order(
          'created_at',
          {ascending:false}
        )
        .limit(30),

      client
        .from('referral_commissions')
        .select('*')
        .order(
          'created_at',
          {ascending:false}
        ),

      client
        .from('app_settings')
        .select('*')

    ]);


    const results = [
      profiles,
      accounts,
      deposits,
      withdrawals,
      transactions,
      profitEntries,
      referralCommissions,
      appSettings
    ];


    const bad =
      results.find(
        r => r.error
      );


    if(bad){

      console.error('loadAll query error:', bad.error);

      showMsg(
        bad.error.message,
        true
      );

      return;
    }


    const P =
      profiles.data || [];

    const A =
      accounts.data || [];

    const D =
      deposits.data || [];

    const W =
      withdrawals.data || [];

    const T =
      transactions.data || [];

    const PE =
      profitEntries.data || [];


    /* CLIENT NAMES */

    const names = {};

    P.forEach(
      p =>
      names[p.id] = p
    );


    /* ACCOUNTS */

    const accByUser = {};

    A.forEach(
      a =>
      accByUser[a.user_id] = a
    );


    LATEST_ACCOUNTS_BY_USER =
      accByUser;


    /* =====================================================
       DASHBOARD CALCULATIONS
    ===================================================== */


    /* TOTAL CLIENTS
       Only users with role = client
    */

    const clientProfiles =
      P.filter(
        p => p.role === 'client'
      );


    $('clients').textContent =
      clientProfiles.length;


    /* TOTAL APPROVED DEPOSIT */

    const totalDeposits =
      D
      .filter(
        x => x.status === 'approved'
      )
      .reduce(
        (a,x) =>
        a + Number(x.amount || 0),
        0
      );


    $('deposits').textContent =
      money(totalDeposits);


    /* PENDING DEPOSIT */

    const pendingDeposit =
      D
      .filter(
        x => x.status === 'pending'
      )
      .reduce(
        (a,x) =>
        a + Number(x.amount || 0),
        0
      );


    $('pendingDp').textContent =
      money(pendingDeposit);


    /* PENDING WITHDRAWAL */

    const pendingWithdrawal =
      W
      .filter(
        x => x.status === 'pending'
      )
      .reduce(
        (a,x) =>
        a + Number(x.amount || 0),
        0
      );


    $('pendingWd').textContent =
      money(pendingWithdrawal);


    /* TOTAL CLIENT PROFIT
       60% CLIENT SHARE
    */

    const totalProfit =
      PE.reduce(
        (a,x) =>
        a + Number(x.client_share || 0),
        0
      );


    $('profit').textContent =
      money(totalProfit);


    /* APPROVED WITHDRAWAL COUNT */

    const approvedWithdrawals =
      W.filter(
        x => x.status === 'approved'
      );


    /* TOTAL WITHDRAWAL FEE */

    const withdrawalFee =
      approvedWithdrawals.length *
      WITHDRAWAL_FEE;


    $('withdrawalFee').textContent =
      money(withdrawalFee);


    /* TOTAL WITHDRAWAL PAID (APPROVED)
       Sum of all approved withdrawal amounts —
       what has actually been paid out to clients so far.
    */

    const totalWithdrawalPaid =
      approvedWithdrawals.reduce(
        (a,x) =>
        a + Number(x.amount || 0),
        0
      );


    $('withdrawalpaid').textContent =
      money(totalWithdrawalPaid);


    /* DESK PROFIT
       MANAGER 40%
    */

    const deskProfit =
      PE.reduce(
        (a,x) =>
        a + Number(x.manager_share || 0),
        0
      );


    $('deskProfit').textContent =
      money(deskProfit);


    /* =====================================================
       REFERRAL PROGRAM — DASHBOARD CALCULATIONS
       Uses `referral_commissions` (per-commission rows) and
       `profiles.referred_by` to build summary + client table.
    ===================================================== */

    const RC =
      referralCommissions.data || [];


    /* TOTAL REFERRALS
       Every client profile that has someone in referred_by
    */

    const totalReferrals =
      P.filter(
        p => p.referred_by
      ).length;


    $('totalReferrals').textContent =
      totalReferrals;


    /* ACTIVE REFERRERS
       Distinct clients who have at least one commission entry
       (i.e. someone they referred actually made a deposit)
    */

    const activeReferrerIds =
      new Set(
        RC.map(
          x => x.referrer_user_id
        )
      );


    $('activeReferrers').textContent =
      activeReferrerIds.size;


    /* REFERRED DEPOSITS
       Sum of the underlying deposit amount behind every
       commission row
    */

    const referredDepositsTotal =
      RC.reduce(
        (a,x) =>
        a + Number(x.deposit_amount || 0),
        0
      );


    $('referredDeposits').textContent =
      money(referredDepositsTotal);


    /* TOTAL COMMISSION PAID */

    const totalCommissionPaid =
      RC.reduce(
        (a,x) =>
        a + Number(x.commission_amount || 0),
        0
      );


    $('totalCommissionPaid').textContent =
      money(totalCommissionPaid);


    /* COMMISSION RATE SETTING
       Stored in app_settings as key = 'referral_commission_rate'
    */

const lowRateRow =
  (appSettings.data || []).find(
    x => x.key === 'referral_commission_rate_low'
  );

const highRateRow =
  (appSettings.data || []).find(
    x => x.key === 'referral_commission_rate_high'
  );


CURRENT_COMMISSION_RATE_LOW =
  lowRateRow
  ? Number(lowRateRow.value)
  : 0;


CURRENT_COMMISSION_RATE_HIGH =
  highRateRow
  ? Number(highRateRow.value)
  : 0;


$('commissionRateLowInput').value =
  CURRENT_COMMISSION_RATE_LOW;


$('commissionRateHighInput').value =
  CURRENT_COMMISSION_RATE_HIGH;
    /* =====================================================
       RENDER TABLES
    ===================================================== */

    renderDeposits(
      D,
      names,
      accByUser
    );

    renderWithdrawals(
      W,
      names,
      accByUser
    );

    renderAccounts(
      A,
      names
    );

    renderReferrals(
      P,
      RC
    );

    renderTransactions(
      T,
      names
    );

    renderProfitEntries(
      PE,
      names
    );

  }catch(err){

    console.error('loadAll unexpected error:', err);

    showMsg(
      'Something went wrong while loading data: ' +
      (err && err.message ? err.message : String(err)),
      true
    );

  }
}


/* =========================================================
   9. TABLE RENDERERS
========================================================= */

/* ---------- 9a. DEPOSIT TABLE ---------- */

function renderDeposits(
  rows,
  names,
  accByUser
){

  if(!rows.length){

    $('depositTable').innerHTML =
      '<div class="empty">No deposit requests yet.</div>';

    return;
  }


  $('depositTable').innerHTML = `

  <table>

    <thead>

      <tr>

        <th>Date</th>
        <th>Client</th>
        <th>Amount</th>
        <th>Network</th>
        <th>TX Hash</th>
        <th>Proof</th>
        <th>Status</th>
        <th>Action</th>

      </tr>

    </thead>

    <tbody>

      ${rows.map(r => {

        const p =
          names[r.user_id] || {};

        const hasAccount =
          !!accByUser[r.user_id];

        let actionCell = '—';


        if(r.status === 'pending'){

          if(!hasAccount){

            actionCell = `

              <div class="actions">

                <button
                  class="btn createacc"
                  onclick="createAccount('${r.user_id}')"
                >
                  Create Account
                </button>

              </div>

            `;

          }else{

            actionCell = `

              <div class="actions">

                <button
                  class="btn approve"
                  onclick="approveDeposit(${r.id})"
                >
                  Approve
                </button>

                <button
                  class="btn reject"
                  onclick="rejectDeposit(${r.id})"
                >
                  Reject
                </button>

              </div>

            `;
          }
        }


        /* =================================================
           PROOF THUMBNAIL PREVIEW
           Click thumbnail or "View screenshot" to open full image
        ================================================= */

        const proofCell =
          r.proof_url
          ?
          `
          <a
            class="proof-link"
            href="${esc(r.proof_url)}"
            target="_blank"
            rel="noopener"
            style="
              display:inline-block;
              text-decoration:none;
            "
          >

            <img
              src="${esc(r.proof_url)}"
              alt="Proof"
              style="
                width:60px;
                height:60px;
                object-fit:cover;
                border-radius:6px;
                border:1px solid var(--muted);
                display:block;
                margin-bottom:4px;
              "
              onerror="this.style.display='none'"
            >

            <span>
              View screenshot
            </span>

          </a>
          `
          :
          `
          <span style="color:var(--muted)">
            —
          </span>
          `;


        return `

        <tr>

          <td>
            ${new Date(r.created_at).toLocaleString()}
          </td>

          <td>

            ${esc(p.full_name || 'Unknown')}

            <br>

            <small>
              ${esc(p.id || r.user_id)}
            </small>

            ${
              (!hasAccount && r.status === 'pending')
              ?
              '<span class="no-account-tag">No account yet</span>'
              :
              ''
            }

          </td>

          <td>
            ${money(r.amount)}
          </td>

          <td>
            ${esc(r.network || 'TRC20')}
          </td>

          <td class="wallet">
            ${esc(r.tx_hash || '—')}
          </td>

          <td>
            ${proofCell}
          </td>

          <td>
            ${pill(r.status)}
          </td>

          <td>
            ${actionCell}
          </td>

        </tr>

        `;

      }).join('')}

    </tbody>

  </table>

  `;
}


/* ---------- 9b. WITHDRAWAL TABLE ---------- */

function renderWithdrawals(
  rows,
  names,
  accByUser
){

  if(!rows.length){

    $('withdrawalTable').innerHTML =
      '<div class="empty">No withdrawal requests yet.</div>';

    return;
  }


  $('withdrawalTable').innerHTML = `

  <table>

    <thead>

      <tr>

        <th>Date</th>
        <th>Client</th>
        <th>Requested</th>
        <th>Fee</th>
        <th>Client Receives</th>
        <th>Wallet</th>
        <th>Status</th>
        <th>Action</th>

      </tr>

    </thead>


    <tbody>

      ${rows.map(r => {

        const p =
          names[r.user_id] || {};

        const hasAccount =
          !!accByUser[r.user_id];


        const amount =
          Number(r.amount || 0);

        const fee =
          WITHDRAWAL_FEE;

        const netAmount =
          Math.max(
            0,
            amount - fee
          );


        let actionCell = '—';


        if(r.status === 'pending'){

          if(!hasAccount){

            actionCell = `

              <div class="actions">

                <button
                  class="btn createacc"
                  onclick="createAccount('${r.user_id}')"
                >
                  Create Account
                </button>

              </div>

            `;

          }else{

            const acc =
              accByUser[r.user_id];

            const days =
              daysSince(
                acc?.first_deposit_at
              );

            const principalUnlocked =
              days !== null &&
              days >= PRINCIPAL_LOCK_DAYS;


            const maxAllowed =
              principalUnlocked
              ?
              Number(acc.balance || 0)
              :
              Math.min(
                Number(acc.profit || 0),
                Number(acc.balance || 0)
              );


            const overLimit =
              amount > maxAllowed;


            actionCell = `

              <div class="actions">

                <button
                  class="btn approve"
                  onclick="approveWithdrawal(${r.id})"
                >
                  Approve
                </button>

                <button
                  class="btn reject"
                  onclick="rejectWithdrawal(${r.id})"
                >
                  Reject
                </button>

              </div>

              ${
                overLimit
                ?
                `
                <span class="no-account-tag">
                  Exceeds withdrawable
                  (${money(maxAllowed)})
                </span>
                `
                :
                ''
              }

            `;
          }
        }


        return `

        <tr>

          <td>
            ${new Date(r.created_at).toLocaleString()}
          </td>


          <td>

            ${esc(p.full_name || 'Unknown')}

            <br>

            <small>
              ${esc(p.id || r.user_id)}
            </small>

          </td>


          <td>

            ${money(amount)}

          </td>


          <td>

            ${money(fee)}

            <span class="fee-note">
              Fixed fee
            </span>

          </td>


          <td>

            <b>
              ${money(netAmount)}
            </b>

            <span class="net-note">
              Client receives
            </span>

          </td>


          <td class="wallet">

            ${esc(r.wallet_address)}

          </td>


          <td>

            ${pill(r.status)}

          </td>


          <td>

            ${actionCell}

          </td>

        </tr>

        `;

      }).join('')}

    </tbody>

  </table>

  `;
}


/* ---------- 9c. ACCOUNT TABLE ---------- */

function renderAccounts(
  rows,
  names
){

  if(!rows.length){

    $('accountTable').innerHTML =
      '<div class="empty">No client accounts found. Use "Create Account" next to a deposit request to add one.</div>';

    return;
  }


  $('accountTable').innerHTML = `

  <table>

    <thead>

      <tr>

        <th>Client</th>
        <th>Account</th>
        <th>Initial</th>
        <th>Balance</th>
        <th>Profit</th>
        <th>Withdrawn</th>
        <th>Principal unlock</th>
        <th>Status</th>
        <th>Record today's result</th>

      </tr>

    </thead>


    <tbody>

      ${rows.map(r => {

        const p =
          names[r.user_id] || {};


        const days =
          daysSince(
            r.first_deposit_at
          );


        let lockCell =
          '<span style="color:var(--muted)">No deposit yet</span>';


        if(days !== null){

          if(
            days >= PRINCIPAL_LOCK_DAYS
          ){

            lockCell =
              '<span style="color:var(--green)">Unlocked</span>';

          }else{

            lockCell = `

              <span class="lock-tag">

                ${Math.ceil(
                  PRINCIPAL_LOCK_DAYS - days
                )}
                day(s) left

              </span>

            `;
          }
        }


        return `

        <tr>

          <td>

            ${esc(
              p.full_name || 'Unknown'
            )}

            <br>

            <small>
              ${esc(p.id || r.user_id)}
            </small>

          </td>


          <td>
            ${esc(r.account_name)}
          </td>


          <td>
            ${money(r.initial_balance)}
          </td>


          <td>
            ${money(r.balance)}
          </td>


          <td>
            ${money(r.profit)}
          </td>


          <td>
            ${money(r.total_withdrawn)}
          </td>


          <td>
            ${lockCell}
          </td>


          <td>
            ${pill(r.status)}
          </td>


          <td>

            <div class="pnl-row">

              <input
                class="pnl-input"
                type="number"
                step="0.01"
                id="pnl-${r.id}"
                placeholder="e.g. 40 or -15"
              >

              <button
                class="btn pnl-btn"
                onclick="recordResult(${r.id},'${r.user_id}')"
              >
                Add
              </button>

            </div>

          </td>

        </tr>

        `;

      }).join('')}

    </tbody>

  </table>

  `;
}


/* ---------- 9d. PROFIT ENTRIES (DAILY RESULTS) TABLE ---------- */

function renderProfitEntries(
  rows,
  names
){

  if(!rows.length){

    $('profitTable').innerHTML =
      '<div class="empty">No daily results recorded yet.</div>';

    return;
  }


  $('profitTable').innerHTML = `

  <table>

    <thead>

      <tr>

        <th>Date</th>
        <th>Client</th>
        <th>Total Result</th>
        <th>Client 60%</th>
        <th>Manager 40%</th>

      </tr>

    </thead>


    <tbody>

      ${rows.map(r => {

        const p =
          names[r.user_id] || {};

        const up =
          Number(r.total_result) >= 0;


        return `

        <tr>

          <td>
            ${new Date(r.created_at).toLocaleString()}
          </td>

          <td>
            ${esc(p.full_name || 'Unknown')}
          </td>

          <td
            style="color:${up ? 'var(--green)' : 'var(--red)'}"
          >
            ${money(r.total_result)}
          </td>

          <td>
            ${money(r.client_share)}
          </td>

          <td>
            ${money(r.manager_share)}
          </td>

        </tr>

        `;

      }).join('')}

    </tbody>

  </table>

  `;
}


/* ---------- 9e. TRANSACTIONS TABLE ---------- */

function renderTransactions(
  rows,
  names
){

  if(!rows.length){

    $('transactionTable').innerHTML =
      '<div class="empty">No transactions yet.</div>';

    return;
  }


  $('transactionTable').innerHTML = `

  <table>

    <thead>

      <tr>

        <th>Date</th>
        <th>Client</th>
        <th>Type</th>
        <th>Amount</th>
        <th>Description</th>

      </tr>

    </thead>


    <tbody>

      ${rows.map(r => {

        const p =
          names[r.user_id] || {};


        return `

        <tr>

          <td>
            ${new Date(r.created_at).toLocaleString()}
          </td>

          <td>
            ${esc(p.full_name || 'Unknown')}
          </td>

          <td>
            ${esc(r.type)}
          </td>

          <td>
            ${money(r.amount)}
          </td>

          <td>
            ${esc(r.description || '')}
          </td>

        </tr>

        `;

      }).join('')}

    </tbody>

  </table>

  `;
}


/* ---------- 9f. REFERRAL PROGRAM TABLE ----------
   Per-client breakdown: referral code, how many people they
   referred (commission rows), total referred deposits, and
   total earnings from those referrals.
*/

function renderReferrals(
  profiles,
  commissions
){

  const clientProfiles =
    profiles.filter(
      p => p.role === 'client'
    );


  if(!clientProfiles.length){

    $('referralTable').innerHTML =
      '<div class="empty">No clients yet.</div>';

    return;
  }


  /* Group commissions by referrer */

  const byReferrer = {};

  commissions.forEach(c => {

    if(!byReferrer[c.referrer_user_id]){

      byReferrer[c.referrer_user_id] = {
        count:0,
        deposits:0,
        earnings:0
      };
    }

    byReferrer[c.referrer_user_id].count += 1;

    byReferrer[c.referrer_user_id].deposits +=
      Number(c.deposit_amount || 0);

    byReferrer[c.referrer_user_id].earnings +=
      Number(c.commission_amount || 0);

  });


  /* Only show clients who have a referral code
     or have referred someone / earned something */

  const rows =
    clientProfiles.filter(
      p =>
      p.referral_code ||
      byReferrer[p.id]
    );


  if(!rows.length){

    $('referralTable').innerHTML =
      '<div class="empty">No referral activity yet.</div>';

    return;
  }


  $('referralTable').innerHTML = `

  <table>

    <thead>

      <tr>

        <th>Client</th>
        <th>Referral Code</th>
        <th>Referrals</th>
        <th>Referred Deposits</th>
        <th>Earnings</th>

      </tr>

    </thead>


    <tbody>

      ${rows.map(p => {

        const stats =
          byReferrer[p.id] ||
          { count:0, deposits:0, earnings:0 };


        return `

        <tr>

          <td>

            ${esc(p.full_name || 'Unknown')}

            <br>

            <small>
              ${esc(p.id)}
            </small>

          </td>

          <td class="wallet">
            ${esc(p.referral_code || '—')}
          </td>

          <td>
            ${stats.count}
          </td>

          <td>
            ${money(stats.deposits)}
          </td>

          <td>
            ${money(stats.earnings)}
          </td>

        </tr>

        `;

      }).join('')}

    </tbody>

  </table>

  `;
}


/* =========================================================
   10. CREATE ACCOUNT ACTION
========================================================= */

async function createAccount(userId){

  if(LATEST_ACCOUNTS_BY_USER[userId]){

    showMsg(
      'This client already has an account.',
      true
    );

    return;
  }


  if(
    !confirm(
      'Create a new trading account for this client with a starting balance of $0.00?'
    )
  )
    return;


  const {
    error
  } =
  await client
    .from('accounts')
    .insert({

      user_id:userId,

      account_name:'Main Account',

      initial_balance:0,

      balance:0,

      profit:0,

      total_withdrawn:0,

      status:'active'

    });


  if(error){

    showMsg(
      error.message,
      true
    );

    return;
  }


  showMsg(
    'Account created. You can now approve this client\'s pending requests.'
  );


  loadAll();
}


/* =========================================================
   11. RECORD DAILY RESULT ACTION
========================================================= */

async function recordResult(
  accountId,
  userId
){

  const inputEl =
    $('pnl-' + accountId);


  const amt =
    parseFloat(
      inputEl.value
    );


  if(
    isNaN(amt) ||
    amt === 0
  ){

    showMsg(
      'Enter a non-zero trading result first.',
      true
    );

    return;
  }


  const clientShare =
    Math.round(
      amt * 0.6 * 100
    ) / 100;


  const managerShare =
    Math.round(
      amt * 0.4 * 100
    ) / 100;


  if(
    !confirm(
      `Record today's result of ${money(amt)}?

Client share (60%): ${money(clientShare)} will be added to their balance.

Manager share (40%): ${money(managerShare)} recorded only.`
    )
  )
    return;


  const {
    data:accRow,
    error:ae
  } =
  await client
    .from('accounts')
    .select('*')
    .eq('id',accountId)
    .single();


  if(ae){

    showMsg(
      ae.message,
      true
    );

    return;
  }


  const {
    error:pe
  } =
  await client
    .from('profit_entries')
    .insert({

      user_id:userId,

      account_id:accountId,

      total_result:amt,

      client_share:clientShare,

      manager_share:managerShare

    });


  if(pe){

    showMsg(
      pe.message,
      true
    );

    return;
  }


  const {
    error:ue
  } =
  await client
    .from('accounts')
    .update({

      balance:
        Number(accRow.balance || 0)
        +
        clientShare,

      profit:
        Number(accRow.profit || 0)
        +
        clientShare

    })
    .eq(
      'id',
      accountId
    );


  if(ue){

    showMsg(
      ue.message,
      true
    );

    return;
  }


  await client
    .from('transactions')
    .insert({

      user_id:userId,

      account_id:accountId,

      type:'profit',

      amount:clientShare,

      description:
        `Daily result ${money(amt)} — client share added`

    });


  inputEl.value='';


  showMsg(
    'Result recorded and client balance updated.'
  );


  loadAll();
}


/* =========================================================
   12. APPROVE / REJECT DEPOSIT ACTIONS
========================================================= */

/* ---------- 12a. APPROVE DEPOSIT ---------- */

async function approveDeposit(id){

  if(
    !confirm(
      'Approve this deposit? This will add the deposit amount to the client account balance.'
    )
  )
    return;


  const {
    data:d,
    error:e
  } =
  await client
    .from('deposits')
    .select('*')
    .eq('id',id)
    .single();


  if(e){

    showMsg(
      e.message,
      true
    );

    return;
  }


  if(d.status !== 'pending'){

    showMsg(
      'This request is no longer pending.',
      true
    );

    return;
  }


  const {
    data:accs,
    error:ae
  } =
  await client
    .from('accounts')
    .select('*')
    .eq('user_id',d.user_id)
    .limit(1);


  if(ae){

    showMsg(
      ae.message,
      true
    );

    return;
  }


  if(
    !accs ||
    !accs.length
  ){

    showMsg(
      'Client has no account row. Create the account first, then approve this deposit.',
      true
    );

    return;
  }


  const acc =
    accs[0];


  const updates = {

    balance:
      Number(acc.balance || 0)
      +
      Number(d.amount || 0),

    initial_balance:
      Number(acc.initial_balance || 0)
      +
      Number(d.amount || 0)

  };


  if(!acc.first_deposit_at){

    updates.first_deposit_at =
      new Date().toISOString();

  }


  const {
    error:ue
  } =
  await client
    .from('accounts')
    .update(updates)
    .eq(
      'id',
      acc.id
    );


  if(ue){

    showMsg(
      ue.message,
      true
    );

    return;
  }


  const {
    error:de
  } =
  await client
    .from('deposits')
    .update({
      status:'approved'
    })
    .eq(
      'id',
      id
    )
    .eq(
      'status',
      'pending'
    );


  if(de){

    showMsg(
      de.message,
      true
    );

    return;
  }


  await client
    .from('transactions')
    .insert({

      user_id:d.user_id,

      account_id:acc.id,

      type:'deposit',

      amount:d.amount,

      description:
        'Deposit approved by admin'

    });


  showMsg(
    'Deposit approved.'
  );


  loadAll();
}


/* ---------- 12b. REJECT DEPOSIT ---------- */

async function rejectDeposit(id){

  if(
    !confirm(
      'Reject this deposit request?'
    )
  )
    return;


  const {
    error
  } =
  await client
    .from('deposits')
    .update({
      status:'rejected'
    })
    .eq(
      'id',
      id
    )
    .eq(
      'status',
      'pending'
    );


  if(error){

    showMsg(
      error.message,
      true
    );

    return;
  }


  showMsg(
    'Deposit rejected.'
  );


  loadAll();
}


/* =========================================================
   13. APPROVE / REJECT WITHDRAWAL ACTIONS
========================================================= */

/* ---------- 13a. APPROVE WITHDRAWAL ---------- */

async function approveWithdrawal(id){

  const {
    data:w,
    error:e
  } =
  await client
    .from('withdrawals')
    .select('*')
    .eq('id',id)
    .single();


  if(e){

    showMsg(
      e.message,
      true
    );

    return;
  }


  if(w.status !== 'pending'){

    showMsg(
      'This request is no longer pending.',
      true
    );

    return;
  }


  const amt =
    Number(w.amount || 0);


  const fee =
    WITHDRAWAL_FEE;


  const netAmount =
    Math.max(
      0,
      amt - fee
    );


  /* CONFIRMATION */

  if(
    !confirm(
      `Approve this withdrawal?

Requested Amount: ${money(amt)}
Withdrawal Fee: ${money(fee)}
Client Receives: ${money(netAmount)}

Client balance will be reduced by ${money(amt)}.`
    )
  )
    return;


  /* GET ACCOUNT */

  const {
    data:accs,
    error:ae
  } =
  await client
    .from('accounts')
    .select('*')
    .eq('user_id',w.user_id)
    .limit(1);


  if(ae){

    showMsg(
      ae.message,
      true
    );

    return;
  }


  if(
    !accs ||
    !accs.length
  ){

    showMsg(
      'Client has no account row.',
      true
    );

    return;
  }


  const acc =
    accs[0];


  const bal =
    Number(acc.balance || 0);


  /* BALANCE CHECK */

  if(amt > bal){

    showMsg(
      'Insufficient client balance. Withdrawal not approved.',
      true
    );

    return;
  }


  /* PRINCIPAL LOCK */

  const days =
    daysSince(
      acc.first_deposit_at
    );


  const principalUnlocked =
    days !== null &&
    days >= PRINCIPAL_LOCK_DAYS;


  const maxAllowed =
    principalUnlocked
    ?
    bal
    :
    Math.min(
      Number(acc.profit || 0),
      bal
    );


  /* LIMIT CHECK */

  if(amt > maxAllowed){

    const remainingDays =
      Math.max(
        0,
        Math.ceil(
          PRINCIPAL_LOCK_DAYS -
          (days || 0)
        )
      );


    if(
      !confirm(
        `Warning!

This withdrawal (${money(amt)}) exceeds the client's currently withdrawable amount (${money(maxAllowed)}).

Principal is still locked.

Days remaining: ${remainingDays}

Approve anyway?`
      )
    )
      return;
  }


  /* NEW PROFIT */

  const newProfit =
    Math.max(
      0,
      Number(acc.profit || 0)
      -
      amt
    );


  /* UPDATE ACCOUNT */

  const {
    error:ue
  } =
  await client
    .from('accounts')
    .update({

      balance:
        bal - amt,

      profit:
        newProfit,

      total_withdrawn:
        Number(acc.total_withdrawn || 0)
        +
        amt

    })
    .eq(
      'id',
      acc.id
    );


  if(ue){

    showMsg(
      ue.message,
      true
    );

    return;
  }


  /* UPDATE WITHDRAWAL */

  const {
    error:we
  } =
  await client
    .from('withdrawals')
    .update({

      status:'approved'

    })
    .eq(
      'id',
      id
    )
    .eq(
      'status',
      'pending'
    );


  if(we){

    showMsg(
      we.message,
      true
    );

    return;
  }


  /* WITHDRAWAL TRANSACTION */

  await client
    .from('transactions')
    .insert({

      user_id:w.user_id,

      account_id:acc.id,

      type:'withdrawal',

      amount:amt,

      description:
        `Withdrawal approved — ${money(fee)} fee, client receives ${money(netAmount)}`

    });


  showMsg(
    `Withdrawal approved. Client receives ${money(netAmount)} after ${money(fee)} fee.`
  );


  loadAll();
}


/* ---------- 13b. REJECT WITHDRAWAL ---------- */

async function rejectWithdrawal(id){

  if(
    !confirm(
      'Reject this withdrawal request?'
    )
  )
    return;


  const {
    error
  } =
  await client
    .from('withdrawals')
    .update({
      status:'rejected'
    })
    .eq(
      'id',id
    )
    .eq(
      'status','pending'
    );


  if(error){

    showMsg(
      error.message,
      true
    );

    return;
  }


  showMsg(
    'Withdrawal rejected.'
  );


  loadAll();
}


/* =========================================================
   14. LOGIN / LOGOUT / REFRESH EVENT HANDLERS
========================================================= */

/* ---------- 14a. LOGIN ---------- */

$('loginBtn').addEventListener('click', async()=>{

  const email =
    $('email')
    .value
    .trim();


  const password =
    $('password')
    .value;


  if(
    !email ||
    !password
  ){

    loginMsg(
      'Enter email and password.',
      true
    );

    return;
  }


  $('loginBtn')
    .disabled = true;


  try{

    const {
      error
    } =
    await client.auth.signInWithPassword({
      email,

      password

    });


    if(error){

      loginMsg(
        error.message,
        true
      );

      return;
    }


    loginMsg(
      'Login successful.'
    );


    await loadAll();


  }catch(err){

    console.error('Login error:', err);

    loginMsg(
      'Something went wrong logging in: ' +
      (err && err.message ? err.message : String(err)),
      true
    );


  }finally{

    $('loginBtn')
      .disabled = false;

  }

});


/* ---------- 14b. ENTER KEY LOGIN ---------- */

$('password')
.addEventListener(
  'keydown',
  e => {

    if(e.key === 'Enter')
      $('loginBtn').click();

  }
);


/* ---------- 14c. LOGOUT ---------- */

$('logoutBtn').addEventListener('click', async()=>{

  await client.auth.signOut();

  location.reload();

});


/* ---------- 14d. REFRESH ----------
   (uses addEventListener + visible "Refreshing..." state so
   it's obvious the click registered, and any error surfaces
   instead of failing silently)
*/

$('refreshBtn').addEventListener('click', async()=>{

  const btn = $('refreshBtn');

  const originalText = btn.textContent;

  btn.disabled = true;

  btn.textContent = 'Refreshing...';


  try{

    await loadAll();


  }catch(err){

    console.error('Refresh error:', err);

    showMsg(
      'Refresh failed: ' +
      (err && err.message ? err.message : String(err)),
      true
    );


  }finally{

    btn.disabled = false;

    btn.textContent = originalText;

  }

});


/* =========================================================
   15. AUTH STATE LISTENER & APP START
========================================================= */

client.auth.onAuthStateChange(
  (_event)=>{
    setTimeout(
      loadAll,
      0
    );
  }
);


loadAll();

/* =========================================================
   16. REFERRAL PROGRAM — SAVE TIERED COMMISSION RATES
========================================================= */


/* ---------- 16a. SAVE $100 → $499.99 RATE ---------- */

$('saveLowRateBtn').addEventListener('click', async()=>{

  const input =
    $('commissionRateLowInput');

  const newRate =
    parseFloat(input.value);


  if(
    isNaN(newRate) ||
    newRate < 0 ||
    newRate > 100
  ){

    showMsg(
      'Enter a valid commission rate between 0 and 100.',
      true
    );

    return;
  }


  const btn =
    $('saveLowRateBtn');

  btn.disabled = true;


  try{

    const {
      error
    } =
    await client
      .from('app_settings')
      .upsert(
        {
          key:'referral_commission_rate_low',
          value:String(newRate)
        },
        {onConflict:'key'}
      );


    if(error){

      showMsg(
        error.message,
        true
      );

      return;
    }


    CURRENT_COMMISSION_RATE_LOW =
      newRate;


    const note =
      $('lowRateSavedNote');

    note.textContent =
      'Saved ✓';


    setTimeout(
      () => note.textContent = '',
      3000
    );


    showMsg(
      '$100–$499.99 commission rate updated to ' +
      newRate +
      '%.'
    );


  }catch(err){

    console.error(
      'Save low referral rate error:',
      err
    );


    showMsg(
      'Failed to save commission rate: ' +
      (
        err && err.message
        ? err.message
        : String(err)
      ),
      true
    );


  }finally{

    btn.disabled = false;

  }

});


/* ---------- 16b. SAVE $500+ RATE ---------- */

$('saveHighRateBtn').addEventListener('click', async()=>{

  const input =
    $('commissionRateHighInput');

  const newRate =
    parseFloat(input.value);


  if(
    isNaN(newRate) ||
    newRate < 0 ||
    newRate > 100
  ){

    showMsg(
      'Enter a valid commission rate between 0 and 100.',
      true
    );

    return;
  }


  const btn =
    $('saveHighRateBtn');

  btn.disabled = true;


  try{

    const {
      error
    } =
    await client
      .from('app_settings')
      .upsert(
        {
          key:'referral_commission_rate_high',
          value:String(newRate)
        },
        {onConflict:'key'}
      );


    if(error){

      showMsg(
        error.message,
        true
      );

      return;
    }


    CURRENT_COMMISSION_RATE_HIGH =
      newRate;


    const note =
      $('highRateSavedNote');

    note.textContent =
      'Saved ✓';


    setTimeout(
      () => note.textContent = '',
      3000
    );


    showMsg(
      '$500+ commission rate updated to ' +
      newRate +
      '%.'
    );


  }catch(err){

    console.error(
      'Save high referral rate error:',
      err
    );


    showMsg(
      'Failed to save commission rate: ' +
      (
        err && err.message
        ? err.message
        : String(err)
      ),
      true
    );


  }finally{

    btn.disabled = false;

  }

});
