(function () {
"use strict";

// ============================================
// PipZoNe Withdrawal — Supabase Integration
// Available-amount rules: live site (pic 1) getWithdrawableAmount() jaisi hi
// Reinvest: client request bhejta hai (reinvest_account()), admin approve karta hai
// Profile gate: shared/profile-gate.js
// ============================================

const PRINCIPAL_LOCK_DAYS = 40;
const WITHDRAWAL_FEE = 2;
const REINVEST_MIN = 100;   // reinvest_account() ka minimum

const NETWORK_DATA = {
  TRC20: { name: "USDT (Tether) · TRC20", fee: WITHDRAWAL_FEE },
  BEP20: { name: "USDT (Tether) · BEP20", fee: WITHDRAWAL_FEE }
};

const $ = id => document.getElementById(id);

let db = null;
let activeUser = null;
let selectedNetwork = "TRC20";
let currentAccount = null;
let availability = null;      // computeAvailability() ka result
let reinvestInfo = null;      // computeReinvest() ka result
let latestRequest = null;     // reinvest_requests ki sabse nayi row
let reinvestLoadOk = true;    // reinvest_requests padhi ja saki ya nahi
let pendingTotal = 0;         // pending withdrawals ka total
let pendingReinvest = 0;      // pending reinvest request ki rakam (hold)
let availableBalance = 0;     // withdraw ke liye abhi available
let lockedAmount = 0;         // abhi nikalne layak nahi
let savedProfile = null;
let loading = false;
let reinvesting = false;

// null = abhi check ho raha, true = profile complete, false = incomplete/error
let profileReady = null;
let accountReady = false;
let gatePromise = null;

const networkTabs = $("networkTabs");
const withdrawalForm = $("withdrawalForm");
const withdrawalAmount = $("withdrawalAmount");
const maxAmountBtn = $("maxAmountBtn");
const withdrawalWallet = $("withdrawalWallet");
const submitWithdrawalBtn = $("submitWithdrawalBtn");
const availableProfit = $("availableProfit");
const lockedPrincipal = $("lockedPrincipal");
const networkError = $("networkError");
const amountError = $("amountError");
const walletError = $("walletError");
const summaryAmount = $("summaryAmount");
const summaryNetwork = $("summaryNetwork");
const summaryFee = $("summaryFee");
const summaryNet = $("summaryNet");
const feeNetworkLabel = $("feeNetworkLabel");
const feeDisplay = $("feeDisplay");
const toastContainer = $("toastContainer");

// ============================================
// Supabase Client
// ============================================

function getDb() {
  const candidates = [window.supabaseClient, window.client, window.supabase];

  return candidates.find(
    item => item && typeof item.from === "function" &&
      item.auth && typeof item.auth.getUser === "function"
  ) || null;
}

// ============================================
// Helpers
// ============================================

function money(value) {
  return "$" + Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function showError(element, message = "") {
  if (element) element.textContent = message;
}

function clearErrors() {
  [networkError, amountError, walletError].forEach(element => showError(element));
}

function showToast(message, type = "success") {
  if (!toastContainer) {
    alert(message);
    return;
  }

  const toast = document.createElement("div");
  toast.className = "toast toast-" + type;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => toast.remove(), 5000);
}

function daysSince(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return (Date.now() - time) / 86400000;
}

function updateSubmitState() {
  if (withdrawalForm) {
    withdrawalForm.classList.toggle("pz-locked", profileReady === false);
  }

  if (submitWithdrawalBtn) {
    submitWithdrawalBtn.disabled =
      loading || reinvesting || profileReady !== true || !accountReady;
  }
}

function setButtonBusy(busy) {
  loading = busy;

  if (submitWithdrawalBtn) {
    const label = submitWithdrawalBtn.querySelector("span");
    if (label) {
      label.textContent = busy ? "Processing..." : "Request Withdrawal";
    }
  }

  updateSubmitState();
  updateReinvestUI();
}

function walletForNetwork(network) {
  if (!savedProfile) return "";
  return network === "BEP20"
    ? String(savedProfile.wallet_address_bep20 || "").trim()
    : String(savedProfile.wallet_address || "").trim();
}

// Jis network ka wallet saved nahi, wahan se us network par shift jahan saved hai
function preferNetworkWithWallet() {
  if (walletForNetwork(selectedNetwork)) return;

  const other = selectedNetwork === "TRC20" ? "BEP20" : "TRC20";
  if (walletForNetwork(other)) {
    selectedNetwork = other;
    updateNetworkUI();
  }
}

// ============================================
// Profile gate
// ============================================

function refreshProfileGate() {
  if (gatePromise) return gatePromise;

  gatePromise = (async () => {
    const gate = window.PipZoNeProfile;
    const box = $("profileGate");
    let result;

    if (!gate) {
      // profile-gate.js load nahi hui: withdrawal band rakho (safe side)
      result = {
        status: "error",
        missing: [],
        message: "Profile check is unavailable. Please refresh the page."
      };
      if (box) box.textContent = result.message;
    } else {
      result = await gate.check();
      gate.renderBanner(box, result, { purpose: "withdrawal", onRetry: refreshProfileGate });
    }

    profileReady = result.status === "complete";
    updateSubmitState();
    return result;
  })().finally(() => {
    gatePromise = null;
  });

  return gatePromise;
}

// ============================================
// Available amount — live site jaisa hisaab
// ============================================

/*
  - Reinvest lock chalu:  balance - principal_locked_amount
  - Pehle deposit ko 40 din ho gaye:  poora balance
  - Warna:  min(profit, balance)
  Phir pending withdrawals aur pending reinvest minus hote hain.
*/
function computeAvailability(account) {
  const balance = Number(account.balance || 0);
  const profit = Number(account.profit || 0);
  const reinvestLocked = Number(account.principal_locked_amount || 0);
  const lockUntil = account.principal_lock_until
    ? new Date(account.principal_lock_until).getTime()
    : null;

  if (lockUntil && Date.now() < lockUntil && reinvestLocked > 0) {
    return {
      mode: "reinvest",
      rawAvailable: Math.max(0, balance - reinvestLocked),
      lockUntil,
      reinvestLocked
    };
  }

  const days = daysSince(account.first_deposit_at);
  const unlocked = days !== null && days >= PRINCIPAL_LOCK_DAYS;

  return {
    mode: days === null ? "nodeposit" : (unlocked ? "unlocked" : "locked"),
    days,
    rawAvailable: unlocked ? balance : Math.min(profit, balance)
  };
}

// ============================================
// Reinvest — request (admin approval ke baad lock lagta hai)
// ============================================

/*
  Rules (database ke mutabiq):
    - lock (principal_lock_until) khatam ho chuka ho
    - reinvest amount = balance - pending withdrawals, kam az kam $100
    - ek waqt mein sirf ek pending request
  Is page par button isse bhi sakht hai: agar principal_lock_until khali ho to
  pehle deposit ke 40 din poore hone ka intezar bhi karta hai.
*/
function computeReinvest(account, pending, request) {
  const balance = Number(account.balance || 0);
  const count = Number(account.reinvest_count || 0);

  if (request && request.status === "pending") {
    return {
      state: "pending",
      amount: Number(request.amount || 0),
      count,
      requestId: request.id,
      requestedAt: request.created_at
    };
  }

  const amount = Math.max(0, balance - pending);
  const lastRejected = request && request.status === "rejected" ? request : null;

  const lockUntil = account.principal_lock_until
    ? new Date(account.principal_lock_until).getTime()
    : null;

  const firstDeposit = account.first_deposit_at
    ? new Date(account.first_deposit_at).getTime()
    : null;

  const originalUnlockAt = firstDeposit !== null && !Number.isNaN(firstDeposit)
    ? firstDeposit + PRINCIPAL_LOCK_DAYS * 86400000
    : null;

  if (lockUntil && Date.now() < lockUntil) {
    return { state: "locked", unlockAt: lockUntil, amount, count, byReinvest: count > 0 };
  }

  if (!lockUntil && originalUnlockAt === null) {
    return { state: "nodeposit", amount, count };
  }

  if (!lockUntil && Date.now() < originalUnlockAt) {
    return { state: "locked", unlockAt: originalUnlockAt, amount, count, byReinvest: false };
  }

  if (amount < REINVEST_MIN) {
    return { state: "low", amount, count, lastRejected };
  }

  return { state: "ready", amount, count, lastRejected };
}

function reinvestBlockedMessage(info) {
  if (!info) return "Reinvest is not available right now.";

  if (info.state === "pending") {
    return "You already have a reinvest request waiting for admin approval.";
  }
  if (info.state === "locked") {
    return "Your balance is still locked until " + new Date(info.unlockAt).toLocaleDateString() + ".";
  }
  if (info.state === "low") {
    return "Minimum reinvest amount is " + money(REINVEST_MIN) + ".";
  }
  if (info.state === "nodeposit") {
    return "No deposit has been credited to your account yet.";
  }
  return "Reinvest is not available right now.";
}

function rejectedPrefix(info) {
  if (!info || !info.lastRejected) return "";
  const note = String(info.lastRejected.admin_note || "").trim();
  return "Your previous reinvest request was not approved" +
    (note ? " (" + note + ")" : "") + ". ";
}

function updateReinvestUI() {
  const card = $("reinvestCard");
  const btn = $("reinvestBtn");
  if (!card || !btn) return;

  const text = $("reinvestText");
  const amountEl = $("reinvestAmount");
  const statusEl = $("reinvestStatus");
  const countEl = $("reinvestCount");
  const label = $("reinvestBtnLabel");

  const info = reinvestInfo;

  if (!info || !reinvestLoadOk) {
    card.dataset.state = "loading";
    if (text) {
      text.textContent = !accountReady
        ? "Checking your reinvest status..."
        : "Your reinvest status could not be loaded. Please refresh the page.";
    }
    if (amountEl) amountEl.textContent = money(0);
    if (statusEl) statusEl.textContent = "—";
    if (countEl) countEl.textContent = "0";
    if (label) label.textContent = "Request Reinvest";
    btn.disabled = true;
    return;
  }

  card.dataset.state = info.state;
  if (amountEl) amountEl.textContent = money(info.amount);
  if (countEl) countEl.textContent = String(info.count || 0);

  let heading = "—";
  let message = "";

  if (info.state === "pending") {
    const date = info.requestedAt ? new Date(info.requestedAt).toLocaleDateString() : "";
    heading = "PENDING";
    message = "Your reinvest request for " + money(info.amount) +
      (date ? " (submitted " + date + ")" : "") +
      " is waiting for admin approval. This amount is held and cannot be withdrawn until the request is decided.";
  } else if (info.state === "locked") {
    const date = new Date(info.unlockAt).toLocaleDateString();
    const daysLeft = Math.max(1, Math.ceil((info.unlockAt - Date.now()) / 86400000));
    heading = "LOCKED";
    message = info.byReinvest
      ? "Your reinvested balance is locked until " + date + " (" + daysLeft +
        (daysLeft === 1 ? " day" : " days") + " left). You can request another reinvest after the lock ends."
      : "Reinvest unlocks when your 40-day cycle ends on " + date + " (" + daysLeft +
        (daysLeft === 1 ? " day" : " days") + " left).";
  } else if (info.state === "nodeposit") {
    heading = "NO DEPOSIT";
    message = "Reinvest becomes available once your first deposit has completed its 40-day cycle.";
  } else if (info.state === "low") {
    heading = "BELOW MINIMUM";
    message = rejectedPrefix(info) +
      "Your 40-day cycle has ended, but the minimum reinvest amount is " +
      money(REINVEST_MIN) + ". Your reinvestable balance is " + money(info.amount) + ".";
  } else {
    heading = "AVAILABLE";
    message = rejectedPrefix(info) +
      "Your 40-day cycle has ended. You can request to reinvest " + money(info.amount) +
      " for another 40 days instead of withdrawing it. The request is reviewed by the PipZoNe team.";
  }

  if (statusEl) statusEl.textContent = heading;
  if (text) text.textContent = message;

  if (label) {
    if (reinvesting) label.textContent = "Processing...";
    else if (info.state === "pending") label.textContent = "Pending approval";
    else if (info.state === "ready") label.textContent = "Request Reinvest " + money(info.amount);
    else label.textContent = "Request Reinvest";
  }

  btn.disabled = reinvesting || loading || info.state !== "ready";
}

async function handleReinvest() {
  if (reinvesting || loading) return;

  if (!db || !activeUser) {
    showToast("Please sign in first.", "error");
    return;
  }

  reinvesting = true;
  updateReinvestUI();
  updateSubmitState();

  try {
    // Request se pehle taaza account + pending withdrawals + purani requests dekho
    const account = await fetchAccount();
    const pending = await getPendingWithdrawalsTotal();
    const request = await fetchLatestReinvestRequest();

    applyAccount(account, pending, request);
    updateBalanceUI();
    updateReinvestUI();

    const info = reinvestInfo;

    if (!info || info.state !== "ready") {
      showToast(reinvestBlockedMessage(info), "error");
      return;
    }

    const confirmed = window.confirm(
      "Send a reinvest request?\n\n" +
      "Amount: " + money(info.amount) + "\n" +
      "Lock period after approval: " + PRINCIPAL_LOCK_DAYS + " days\n\n" +
      "Your request will be reviewed by the PipZoNe team. While it is pending, this amount " +
      "cannot be withdrawn. Once approved, it stays locked for " + PRINCIPAL_LOCK_DAYS +
      " days and only balance above it can be withdrawn."
    );

    if (!confirmed) return;

     const { data, error } = await db.rpc("request_reinvest");
    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;

    if (!result || !result.success) {
      throw new Error("The server did not confirm your request.");
    }

    if (result.pending) {
      showToast(
        "Reinvest request #" + result.request_id + " for " + money(result.amount) +
        " has been submitted. It is waiting for admin approval.",
        "success"
      );
    } else {
      // purana (turant reinvest) jawab
      const until = result.lock_until
        ? new Date(result.lock_until).toLocaleDateString()
        : "";
      showToast(
        "Reinvestment of " + money(result.amount) + " completed" +
        (until ? ". Locked until " + until : "") + ".",
        "success"
      );
    }

    await loadWithdrawalData();
  } catch (error) {
    console.error("Reinvest error:", error);
    showToast(error.message || "Your reinvest request could not be submitted.", "error");
    try {
      await loadWithdrawalData();
    } catch (e) { /* ignore */ }
  } finally {
    reinvesting = false;
    updateReinvestUI();
    updateSubmitState();
  }
}

async function fetchAccount() {
  const { data, error } = await db
    .from("accounts")
    .select("id,balance,profit,first_deposit_at,principal_lock_until,principal_locked_amount,initial_balance,total_withdrawn,reinvest_count,created_at")
    .eq("user_id", activeUser.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data && data[0]) || null;
}

async function getPendingWithdrawalsTotal() {
  const { data, error } = await db
    .from("withdrawals")
    .select("amount,status")
    .eq("user_id", activeUser.id);

  if (error) throw error;

  return (data || [])
    .filter(row => String(row.status || "").toLowerCase() === "pending")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

// Sabse nayi reinvest request (pending ho to wahi, kyunke ek waqt mein ek hi pending hoti hai)
async function fetchLatestReinvestRequest() {
  const { data, error } = await db
    .from("reinvest_requests")
    .select("id,amount,status,created_at,reviewed_at,admin_note")
    .eq("user_id", activeUser.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.warn("Reinvest requests could not be loaded:", error);
    reinvestLoadOk = false;
    return null;
  }

  reinvestLoadOk = true;
  return (data && data[0]) || null;
}

function applyAccount(account, pending, request) {
  currentAccount = account;
  pendingTotal = pending;
  latestRequest = request || null;
  pendingReinvest = latestRequest && latestRequest.status === "pending"
    ? Number(latestRequest.amount || 0)
    : 0;

  if (!account) {
    availability = null;
    reinvestInfo = null;
    availableBalance = 0;
    lockedAmount = 0;
    return;
  }

  availability = computeAvailability(account);
  reinvestInfo = computeReinvest(account, pending, latestRequest);
  const balance = Number(account.balance || 0);

  availableBalance = Math.max(0, availability.rawAvailable - pending - pendingReinvest);
  lockedAmount = Math.min(
    balance,
    Math.max(0, balance - availability.rawAvailable) + pendingReinvest
  );
}

function limitMessage(max) {
  let message;

  if (max <= 0) {
    message = "You have no available balance to withdraw right now — you may already have a pending withdrawal request awaiting review.";
  } else {
    message = "You can currently withdraw up to " + money(max) +
      " (after accounting for any pending requests).";
  }

  if (pendingReinvest > 0) {
    message += " " + money(pendingReinvest) + " is on hold for your pending reinvest request.";
  }

  if (max > 0 && availability && availability.mode === "locked") {
    const left = Math.max(1, Math.ceil(PRINCIPAL_LOCK_DAYS - availability.days));
    message += " Your deposited capital unlocks in " + left + " day" + (left === 1 ? "" : "s") + ".";
  }

  return message;
}

// ============================================
// Load Profile and Account
// ============================================

async function loadWithdrawalData() {
  db = getDb();
  accountReady = false;
  updateSubmitState();

  if (!db) {
    showToast("Connection is not ready. Please refresh the page.", "error");
    return;
  }

  const { data: authData, error: authError } = await db.auth.getUser();

  if (authError || !authData?.user) {
    showToast("Your session has expired. Please sign in again.", "error");
    return;
  }

  activeUser = authData.user;

  try {
    const profileResult = await db
      .from("profiles")
      .select("id,first_name,last_name,wallet_address,wallet_address_bep20")
      .eq("id", activeUser.id)
      .maybeSingle();

    if (profileResult.error) throw profileResult.error;

    savedProfile = profileResult.data;
    preferNetworkWithWallet();

    const account = await fetchAccount();
    const pending = await getPendingWithdrawalsTotal();
    const request = await fetchLatestReinvestRequest();

    applyAccount(account, pending, request);
    updateBalanceUI();
    updateWallet();
    updateSummary();

    if (!account) {
      updateReinvestUI();
      showToast("Your trading account was not found yet.", "error");
      return;
    }

    accountReady = true;
    updateSubmitState();
    updateReinvestUI();
  } catch (error) {
    console.error("Withdrawal data load error:", error);
    showToast("Could not load your account data: " + (error.message || "unknown error"), "error");
    updateReinvestUI();
  }
}

// ============================================
// Balance and Cycle UI
// ============================================

function updateBalanceUI() {
  if (availableProfit) availableProfit.textContent = money(availableBalance);
  if (lockedPrincipal) lockedPrincipal.textContent = money(lockedAmount);

  const lockBadge = document.querySelector(".locked-card .lock-status");
  const cycleCard = document.querySelector(".cycle-card");
  if (!cycleCard) return;

  const values = cycleCard.querySelectorAll(".balance-card-top span");
  const title = cycleCard.querySelector("strong");
  const description = cycleCard.querySelector("p");

  const setCycle = (badge, heading, text) => {
    if (values[1]) values[1].textContent = badge;
    if (title) title.textContent = heading;
    if (description) description.textContent = text;
  };

  if (!currentAccount || !availability) {
    if (lockBadge) lockBadge.textContent = "—";
    setCycle("NO ACCOUNT", "No Active Cycle", "Cycle information unavailable");
    return;
  }

  // Pending reinvest request: rakam hold par hai
  if (pendingReinvest > 0) {
    if (lockBadge) lockBadge.textContent = "PENDING";
    setCycle(
      "REINVEST PENDING",
      "Awaiting Approval",
      money(pendingReinvest) + " is on hold until the team reviews your reinvest request."
    );
    return;
  }

  if (availability.mode === "reinvest") {
    const daysLeft = Math.max(1, Math.ceil((availability.lockUntil - Date.now()) / 86400000));
    const date = new Date(availability.lockUntil).toLocaleDateString();
    if (lockBadge) lockBadge.textContent = "REINVEST";
    setCycle(
      "REINVEST LOCK",
      daysLeft + (daysLeft === 1 ? " Day Left" : " Days Left"),
      "Reinvested " + money(availability.reinvestLocked) + " is locked until " + date +
        ". Balance above it can be withdrawn."
    );
    return;
  }

  if (availability.mode === "nodeposit") {
    if (lockBadge) lockBadge.textContent = PRINCIPAL_LOCK_DAYS + " DAYS";
    setCycle(
      "NO DEPOSIT",
      "No deposit yet",
      "Your deposit unlocks for withdrawal " + PRINCIPAL_LOCK_DAYS +
        " days after it is credited. Profit can be withdrawn any time."
    );
    return;
  }

  if (availability.mode === "unlocked") {
    if (lockBadge) lockBadge.textContent = "UNLOCKED";
    setCycle(
      "UNLOCKED",
      "Unlocked",
      "Your deposited amount is fully unlocked — your whole balance is available to withdraw."
    );
    return;
  }

  // locked (40 din chal rahe hain)
  const elapsed = Math.min(PRINCIPAL_LOCK_DAYS, Math.max(0, Math.floor(availability.days)));
  const daysLeft = Math.max(1, Math.ceil(PRINCIPAL_LOCK_DAYS - availability.days));
  if (lockBadge) lockBadge.textContent = PRINCIPAL_LOCK_DAYS + " DAYS";
  setCycle(
    elapsed + " / " + PRINCIPAL_LOCK_DAYS + " DAYS",
    daysLeft + (daysLeft === 1 ? " Day Left" : " Days Left"),
    "Principal unlocks after the 40-day cycle. Your profit is available now."
  );
}

// ============================================
// Network and Wallet
// ============================================

function setNetwork(network) {
  if (!NETWORK_DATA[network]) return;
  selectedNetwork = network;
  updateNetworkUI();
  updateWallet();
  updateSummary();
  clearErrors();
}

function updateNetworkUI() {
  if (networkTabs) {
    networkTabs.querySelectorAll("[data-network]").forEach(button => {
      const active = button.dataset.network === selectedNetwork;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  if (summaryNetwork) summaryNetwork.textContent = NETWORK_DATA[selectedNetwork].name;
  if (feeNetworkLabel) feeNetworkLabel.textContent = selectedNetwork;
  if (feeDisplay) feeDisplay.textContent = money(NETWORK_DATA[selectedNetwork].fee);
  if (summaryFee) summaryFee.textContent = money(NETWORK_DATA[selectedNetwork].fee);
}

function missingWalletMessage() {
  return `No ${selectedNetwork} wallet is saved on your account. ` +
    "Select the network that has a saved wallet, or contact support to add one.";
}

function updateWallet() {
  if (!withdrawalWallet) return;

  const wallet = walletForNetwork(selectedNetwork);
  withdrawalWallet.value = wallet;
  withdrawalWallet.placeholder = wallet ? "" : "No wallet saved for this network";

  const verified = document.querySelector(".verified-wallet");
  if (verified) {
    verified.textContent = wallet ? "SAVED WALLET" : "WALLET NOT SET";
    verified.classList.toggle("wallet-missing", !wallet);
  }

  if (walletError) {
    walletError.textContent = wallet ? "" : missingWalletMessage();
  }
}

function validateWallet(wallet) {
  if (!wallet) {
    showError(walletError, missingWalletMessage());
    return false;
  }

  if (selectedNetwork === "TRC20" && (!wallet.startsWith("T") || wallet.length < 20)) {
    showError(walletError, "Your saved TRC20 wallet address looks invalid. Please contact support.");
    return false;
  }

  if (selectedNetwork === "BEP20" && (!/^0x[a-fA-F0-9]{40}$/.test(wallet))) {
    showError(walletError, "Your saved BEP20 wallet address looks invalid. Please contact support.");
    return false;
  }

  showError(walletError);
  return true;
}

// ============================================
// Amount Summary and Validation
// ============================================

function updateSummary() {
  const amount = Math.max(0, Number(withdrawalAmount?.value || 0));
  const fee = NETWORK_DATA[selectedNetwork].fee;
  const net = Math.max(0, amount - fee);

  if (summaryAmount) summaryAmount.textContent = money(amount) + " USDT";
  if (summaryNet) summaryNet.textContent = money(net) + " USDT";
  if (summaryFee) summaryFee.textContent = money(fee);
  if (summaryNetwork) summaryNetwork.textContent = NETWORK_DATA[selectedNetwork].name;
  if (feeNetworkLabel) feeNetworkLabel.textContent = selectedNetwork;
  if (feeDisplay) feeDisplay.textContent = money(fee);
}

function useMaxAmount() {
  // Amount is the gross withdrawal. The fixed fee is deducted from the payout.
  if (availableBalance <= 0) {
    showError(amountError, limitMessage(0));
    return;
  }

  withdrawalAmount.value = availableBalance.toFixed(2);
  showError(amountError);
  updateSummary();
}

function validateAmount() {
  const amount = Number(withdrawalAmount?.value);
  const fee = NETWORK_DATA[selectedNetwork].fee;

  if (!Number.isFinite(amount) || amount <= 0) {
    showError(amountError, "Enter a valid withdrawal amount.");
    return false;
  }

  if (amount <= fee) {
    showError(amountError, "Withdrawal amount must be greater than the " + money(fee) + " fee.");
    return false;
  }

  if (amount > availableBalance + 0.000001) {
    showError(amountError, limitMessage(availableBalance));
    return false;
  }

  showError(amountError);
  return true;
}

// ============================================
// Submit Withdrawal
// ============================================

async function handleSubmit(event) {
  event.preventDefault();
  if (loading || reinvesting) return;

  clearErrors();
  setButtonBusy(true);

  try {
    // 1) Profile complete hai? (har submit par fresh check)
    const gateResult = await refreshProfileGate();

    if (gateResult.status !== "complete") {
      showToast(
        gateResult.status === "incomplete"
          ? "Please complete your profile before requesting a withdrawal."
          : (gateResult.message || "We could not verify your profile."),
        "error"
      );
      const banner = $("profileGate");
      if (banner) banner.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (!db || !activeUser) {
      showToast("Please sign in first.", "error");
      return;
    }

    // 2) Amount + wallet validation
    const amountValid = validateAmount();
    const wallet = walletForNetwork(selectedNetwork);
    const walletValid = validateWallet(wallet);

    if (!amountValid || !walletValid) return;

    if (!currentAccount) {
      showToast("Trading account is not available.", "error");
      return;
    }

    const amount = Number(Number(withdrawalAmount.value).toFixed(2));
    const fee = NETWORK_DATA[selectedNetwork].fee;

    // 3) Confirmation
    const confirmed = window.confirm(
      `Please confirm your withdrawal request.\n\n` +
      `Network: ${selectedNetwork}\n` +
      `Withdrawal: ${money(amount)} USDT\n` +
      `Fee: ${money(fee)}\n` +
      `You receive: ${money(amount - fee)} USDT\n\n` +
      `Saved wallet: ${wallet}`
    );

    if (!confirmed) return;

    // 4) Re-check the current signed-in user before submitting.
    const { data: authData, error: authError } = await db.auth.getUser();

    if (authError || !authData?.user || authData.user.id !== activeUser.id) {
      throw new Error("Your session has expired. Please sign in again.");
    }

    // 5) Account, pending requests aur pending reinvest ko insert se theek pehle dobara nikalo
    const freshAccount = await fetchAccount();
    if (!freshAccount) throw new Error("Trading account is not available.");

    const freshPending = await getPendingWithdrawalsTotal();
    const freshRequest = await fetchLatestReinvestRequest();
    const freshPendingReinvest = freshRequest && freshRequest.status === "pending"
      ? Number(freshRequest.amount || 0)
      : 0;

    const freshBalance = Number(freshAccount.balance || 0);
    if (amount > freshBalance) {
      throw new Error(
        "Withdrawal amount is higher than your available balance of " + money(freshBalance) + "."
      );
    }

    const freshAvailability = computeAvailability(freshAccount);
    const latestAvailable = Math.max(
      0,
      freshAvailability.rawAvailable - freshPending - freshPendingReinvest
    );

    if (amount > latestAvailable + 0.000001) {
      applyAccount(freshAccount, freshPending, freshRequest);
      updateBalanceUI();
      updateReinvestUI();
      throw new Error(limitMessage(latestAvailable));
    }

    // 6) Do not accept a wallet value altered in the browser.
    const freshProfile = await db
      .from("profiles")
      .select("wallet_address,wallet_address_bep20")
      .eq("id", activeUser.id)
      .maybeSingle();

    if (freshProfile.error) throw freshProfile.error;

    const verifiedWallet = selectedNetwork === "BEP20"
      ? String(freshProfile.data?.wallet_address_bep20 || "").trim()
      : String(freshProfile.data?.wallet_address || "").trim();

    if (!verifiedWallet || verifiedWallet !== wallet) {
      throw new Error("Your saved wallet has changed. Please refresh the page and try again.");
    }

    // 7) withdrawals table mein row (live site jaisi hi columns)
    const { data: inserted, error: insertError } = await db
      .from("withdrawals")
      .insert({
        user_id: activeUser.id,
        amount,
        wallet_address: verifiedWallet,
        network: selectedNetwork,
        status: "pending"
      })
      .select("id,amount,network,status,created_at")
      .single();

    if (insertError) throw insertError;

    showToast(
      `Withdrawal request #${inserted.id} submitted. It is pending review. ` +
      `You will receive ${money(amount - fee)} after the ${money(fee)} fee.`,
      "success"
    );

    withdrawalAmount.value = "";
    await loadWithdrawalData();
    updateSummary();

  } catch (error) {
    console.error("Withdrawal submit error:", error);
    showToast(error.message || "Your withdrawal request could not be submitted.", "error");
  } finally {
    setButtonBusy(false);
    updateWallet();
  }
}

// ============================================
// Initialize
// ============================================

async function initWithdrawal() {
  updateNetworkUI();
  updateSummary();
  updateSubmitState();
  updateReinvestUI();

  if (networkTabs) {
    networkTabs.querySelectorAll("[data-network]").forEach(button => {
      button.addEventListener("click", () => setNetwork(button.dataset.network));
    });
  }

  if (withdrawalAmount) {
    withdrawalAmount.addEventListener("input", () => {
      showError(amountError);
      updateSummary();
    });
  }

  if (maxAmountBtn) maxAmountBtn.addEventListener("click", useMaxAmount);
  if (withdrawalForm) withdrawalForm.addEventListener("submit", handleSubmit);

  const reinvestBtn = $("reinvestBtn");
  if (reinvestBtn) reinvestBtn.addEventListener("click", handleReinvest);

  // Edit Profile se wapas aane par / tab switch par dobara check aur status refresh
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !loading && !reinvesting) {
      refreshProfileGate();
      loadWithdrawalData();
    }
  });
  window.addEventListener("pageshow", event => {
    if (event.persisted && !loading && !reinvesting) {
      refreshProfileGate();
      loadWithdrawalData();
    }
  });

  await Promise.all([loadWithdrawalData(), refreshProfileGate()]);
}

document.addEventListener("DOMContentLoaded", initWithdrawal);

})();