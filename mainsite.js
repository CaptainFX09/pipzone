/* ==========================================================================
   MAINSITE.JS — PipZoNe (Managed Forex & Crypto Trading)
   Table of contents:
     1. Config / constants (Supabase keys, deposit addresses, business rules)
     2. Global state
     3. DOM helper + message helpers
     4. Supabase init
     5. Live stats strip (homepage)
     6. Deposit address copy helper
     7. Network selector (deposit + withdrawal)
     8. Auth modal open/close/switch helpers
     9. Password reset flow
    10. Signup / wallet validation helpers
    11. Signup
    12. Login
    13. Dashboard loader (profile + account sync)
    14. Available-to-withdraw calculation (incl. pending withdrawals)
    15. Account summary rendering (balance, profit, unlock progress)
    16. Withdrawal fee calculator (UI)
    17. Deposit / Withdrawal request modals (open/close)
    18. Submit deposit request
    19. Submit withdrawal request
    20. Recent transactions list
    21. Notification bell + popup (server-synced read state, incl. per-item read)
    21.5 Account menu (avatar/name click) + View Profile / Settings / Team / Invite / Support
    22. Contact form submission
    23. Logout
    24. Profit-split calculator (homepage widget)
    25. Page bootstrap / event listeners
    26. Referral program (capture ?ref=, dashboard card, copy/share)
    27. Loading skeletons (dashboard + lists)
    31. Live market widgets (BTC & Gold candlestick charts)
   ========================================================================== */

'use strict';

/* -------------------------- 1. Config / constants -------------------------- */
const SUPABASE_URL='https://nzasmkplxzirnqeteclv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_ywmF35YANKsFEdZOs8wDdQ__jIezHTF';

const DEPOSIT_ADDRESSES={
  TRC20:'TZ1xrSedo6vPVqc6kY2fE7JDunsVoJZUT8',
  BEP20:'0xf4a61fbfc905b5b66077878e12ffa4566374d54d'
};
/* QR code image per network — swapped by selectDepositNetwork() below.
   Scanning it in a wallet app avoids the address being mistyped. */
const DEPOSIT_QR_IMAGES={
  TRC20:'qr-trc20.png',
  BEP20:'qr-bep20.png'
};

const PRINCIPAL_LOCK_DAYS=40;
const WITHDRAWAL_FEE=2;

/* Fallback shown only if the app_settings row hasn't loaded yet / is
   missing. The real, admin-editable rate comes from get_referral_dashboard()
   (SQL side, to be finalized in the next step). */
const DEFAULT_REFERRAL_RATE=0.02;

/* Session-only key used to remember an incoming ?ref=CODE between the
   moment someone lands on the site and the moment they actually submit
   the signup form. */
const REFERRAL_STORAGE_KEY='pz_referral_code';

/* -------------------------- 2. Global state -------------------------- */
let selectedDepositNetwork='TRC20';
let selectedWithdrawalNetwork='TRC20';

let supabaseClient=null;
let supabaseReady=false;
let currentUser=null;
let currentAccount=null;
let currentProfile=null;
let currentNotificationItems=[];

/* -------------------------- 27. Loading skeletons (dashboard + lists) --------------------------
   Two small building blocks used while data is being fetched, so the
   dashboard never flashes stale "$0.00" / empty-list text before the real
   values arrive:
     - showDashboardSkeleton() adds a shimmer look to the balance/stat
       values the instant the dashboard becomes visible (called from
       loadDashboard(), before the profile/account fetch even starts).
       clearAccountSkeleton() / clearReferralSkeleton() remove it again
       once their respective data has actually rendered.
     - skeletonRowsHtml(count) builds placeholder "cards" (icon + two
       shimmer lines) used to pre-fill the transactions and notifications
       lists the moment their container is shown, before the real rows
       come back from Supabase.
   Placed early in the file (next to global state) since these are pure
   DOM helpers with no dependencies of their own — same pattern already
   used for the referral section, which is numbered 26 but sits ahead of
   the (numbered 25) page-bootstrap section further down. */

const SKELETON_VALUE_IDS=['dashBalance','dashDeposit','dashProfit','dashWithdrawn','dashAvailable','unlockDaysText','referralCount','referralDeposits','referralEarnings'];

function showDashboardSkeleton(){
SKELETON_VALUE_IDS.forEach(id=>{
const el=document.getElementById(id);
if(el)el.classList.add('skeleton');
});
}

function clearAccountSkeleton(){
['dashBalance','dashDeposit','dashProfit','dashWithdrawn','dashAvailable','unlockDaysText'].forEach(id=>{
const el=document.getElementById(id);
if(el)el.classList.remove('skeleton');
});
}

function clearReferralSkeleton(){
['referralCount','referralDeposits','referralEarnings'].forEach(id=>{
const el=document.getElementById(id);
if(el)el.classList.remove('skeleton');
});
}

function skeletonRowsHtml(count){
let html='';
for(let i=0;i<count;i++){
html+='<div class="skeleton-row"><div class="skeleton-circle"></div><div class="skeleton-lines"><div class="skeleton-line short"></div><div class="skeleton-line long"></div></div></div>';
}
return html;
}

/* -------------------------- 3. DOM helper + message helpers -------------------------- */
function $(id){return document.getElementById(id)}

const modal=$('authModal');

function showMsg(id,text,error=true){
const e=$(id);
if(!e)return;
e.textContent=text;
e.style.color=error?'var(--loss)':'var(--profit)';
e.classList.add('show');
}

function clearMessages(){
document.querySelectorAll('.msg').forEach(e=>e.classList.remove('show'));
}

/* -------------------------- 4. Supabase init -------------------------- */
function initSupabase(){
try{
if(!window.supabase || typeof window.supabase.createClient!=='function'){
console.error('Supabase library did not load.');
return false;
}
supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
supabaseReady=true;
return true;
}catch(err){
console.error('Supabase initialization error:',err);
supabaseReady=false;
return false;
}
}

/* -------------------------- 5. Live stats strip (homepage) -------------------------- */
async function loadLiveStats(){
if(!supabaseReady)return;
try{
const {data,error}=await supabaseClient.rpc('get_public_stats');
if(error){console.error('Live stats error:',error);return}
const clientsEl=$('liveClients'),depositsEl=$('liveDeposits'),withdrawalsEl=$('liveWithdrawals');
if(clientsEl)clientsEl.textContent=Number(data.total_clients||0).toLocaleString();
if(depositsEl)depositsEl.textContent='$'+Number(data.total_verified_deposits||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0});
if(withdrawalsEl)withdrawalsEl.textContent='$'+Number(data.total_verified_withdrawals||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0});
}catch(err){console.error('Live stats error:',err)}
}

/* -------------------------- 6. Deposit address copy helper -------------------------- */
function copyDepositAddress(){
const field=$('depositAddressField');
if(!field||!field.value)return;
navigator.clipboard?.writeText(field.value).then(()=>{
showMsg('depositMsg','Address copied to clipboard.',false);
}).catch(()=>{});
}

/* -------------------------- 7. Network selector (deposit + withdrawal) -------------------------- */

/* NETWORK SELECTOR FOR DEPOSIT */
function selectDepositNetwork(net){
selectedDepositNetwork=net;
$('tab-TRC20').classList.toggle('active',net==='TRC20');
$('tab-BEP20').classList.toggle('active',net==='BEP20');
$('depositAddressField').value=DEPOSIT_ADDRESSES[net];
$('depositNetworkLabel').textContent='('+net+')';
const qrImg=$('depositQrImage');
if(qrImg)qrImg.src=DEPOSIT_QR_IMAGES[net];
}

/* NETWORK SELECTOR FOR WITHDRAWAL
   Prefills the saved wallet for the chosen network from the client's profile.
   If a wallet is already saved for this network, the field is LOCKED
   (readonly) — a client cannot type a different address into the
   withdrawal form itself. Changing a saved wallet is only possible from
   Settings (see submitProfile()/lockWalletFields() below), which is a
   deliberate extra step so funds can't be silently redirected to a
   different address by mistake or by someone else with access to the
   session. */
function selectWithdrawalNetwork(net){
selectedWithdrawalNetwork=net;
$('wd-tab-TRC20').classList.toggle('active',net==='TRC20');
$('wd-tab-BEP20').classList.toggle('active',net==='BEP20');

const label=$('withdrawalWalletLabel');
const input=$('withdrawalWallet');
const note=$('withdrawalWalletNote');

const savedWallet=net==='TRC20'?currentProfile?.wallet_address:currentProfile?.wallet_address_bep20;

if(net==='TRC20'){
label.textContent='TRC20 Withdrawal Wallet';
input.placeholder='T...';
}else{
label.textContent='BEP20 Withdrawal Wallet';
input.placeholder='0x...';
}

input.value=savedWallet||'';

if(savedWallet){
input.readOnly=true;
note.textContent='This wallet is locked to your account. To change it, go to Settings from your account menu.';
}else{
input.readOnly=false;
note.textContent='No saved '+net+' wallet found on your account. Enter one below — it will be locked to your account once saved.';
}
}
/* -------------------------- 8. Auth modal open/close/switch helpers -------------------------- */
function openAuth(mode){
clearMessages();
modal.classList.add('show');
document.body.classList.add('modal-open');
mode==='signup'?showSignup():showLogin();
}

function closeAuth(){
modal.classList.remove('show');
document.body.classList.remove('modal-open');
clearMessages();
}

function hideAuthForms(){
$('loginForm').style.display='none';
$('signupForm').style.display='none';
$('resetPasswordForm').style.display='none';
$('newPasswordForm').style.display='none';
}

function showSignup(){
hideAuthForms();
$('signupForm').style.display='block';
clearMessages();
showAuthTabs();
setActiveAuthTab('signup');
}

function showLogin(){
hideAuthForms();
$('loginForm').style.display='block';
clearMessages();
showAuthTabs();
setActiveAuthTab('login');
}

function showResetPassword(){
modal.classList.add('show');
document.body.classList.add('modal-open');
hideAuthForms();
$('resetPasswordForm').style.display='block';
clearMessages();
hideAuthTabs();
const loginEmail=$('loginEmail')?.value.trim();
if(loginEmail){$('resetEmail').value=loginEmail}
setTimeout(()=>{$('resetEmail')?.focus()},50);
}

function showNewPasswordForm(){
modal.classList.add('show');
document.body.classList.add('modal-open');
hideAuthForms();
$('newPasswordForm').style.display='block';
clearMessages();
hideAuthTabs();
setTimeout(()=>{$('newPassword')?.focus()},50);
}

/* ---- Auth tabs (Sign in / Create account) ----
   Shown above #loginForm/#signupForm, hidden for the reset/new-password
   flows below since those have their own heading instead. */
function showAuthTabs(){
const t=$('authTitle'); if(t)t.style.display='block';
const b=$('authTabs'); if(b)b.style.display='flex';
}

function hideAuthTabs(){
const t=$('authTitle'); if(t)t.style.display='none';
const b=$('authTabs'); if(b)b.style.display='none';
}

function setActiveAuthTab(which){
$('authTabLogin')?.classList.toggle('active',which==='login');
$('authTabSignup')?.classList.toggle('active',which==='signup');
}

/* -------------------------- 9. Password reset flow -------------------------- */
async function sendResetEmail(){
clearMessages();
if(!supabaseReady){showMsg('resetMsg','Connection is not ready. Please refresh the page and try again.');return}
const email=$('resetEmail').value.trim();
if(!email){showMsg('resetMsg','Please enter your account email.');return}
const button=$('resetPasswordForm').querySelector('.form-actions .btn');
if(button){button.disabled=true;button.textContent='Sending...'}
try{
const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});
if(error){console.error('Reset email error:',error);showMsg('resetMsg',error.message);return}
showMsg('resetMsg','Password reset link has been sent to your email. Please check your inbox and spam folder.',false);
}catch(err){console.error(err);showMsg('resetMsg','Unable to send reset email right now. Please try again.')}
finally{if(button){button.disabled=false;button.textContent='Send reset link'}}
}

async function updatePassword(){
clearMessages();
if(!supabaseReady){showMsg('newPasswordMsg','Connection is not ready. Please refresh the page and try again.');return}
const password=$('newPassword').value;
const confirm=$('confirmNewPassword').value;
if(!password){showMsg('newPasswordMsg','Please enter your new password.');return}
if(password.length<6){showMsg('newPasswordMsg','Password must be at least 6 characters.');return}
if(!confirm){showMsg('newPasswordMsg','Please confirm your new password.');return}
if(password!==confirm){showMsg('newPasswordMsg','Passwords do not match.');return}
const button=$('newPasswordForm').querySelector('.form-actions .btn');
if(button){button.disabled=true;button.textContent='Updating...'}
try{
const {error}=await supabaseClient.auth.updateUser({password:password});
if(error){console.error('Password update error:',error);showMsg('newPasswordMsg',error.message);return}
$('newPassword').value='';
$('confirmNewPassword').value='';
showMsg('newPasswordMsg','Password updated successfully. You can now login with your new password.',false);
setTimeout(()=>{
try{window.history.replaceState({},document.title,window.location.pathname)}catch(e){}
showLogin();
},1500);
}catch(err){console.error(err);showMsg('newPasswordMsg','Unable to update password right now. Please try again.')}
finally{if(button){button.disabled=false;button.textContent='Update password'}}
}

/* -------------------------- 10. Signup / wallet validation helpers -------------------------- */
function friendlySignupError(msg){
const m=String(msg||'').toLowerCase();
if(m.includes('profiles_phone_unique')||(m.includes('phone')&&m.includes('duplicate'))){
return 'This phone number is already linked to another account. One account is allowed per phone number.';
}
if(m.includes('profiles_wallet_address_bep20_unique')){
return 'This BEP20 wallet address is already linked to another account. One account is allowed per wallet.';
}
if(m.includes('profiles_wallet_address_unique')||(m.includes('wallet')&&m.includes('duplicate'))){
return 'This TRC20 wallet address is already linked to another account. One account is allowed per wallet.';
}
if(m.includes('duplicate key value')||m.includes('already registered')||m.includes('user already registered')){
return 'An account already exists with these details.';
}
return msg;
}

function validWallet(w){
return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(w)
}

function validBep20Wallet(w){
return /^0x[a-fA-F0-9]{40}$/.test(w)
}

function togglePw(id,btn){
const input=$(id);
if(!input)return;
const isHidden=input.type==='password';
input.type=isHidden?'text':'password';
btn.textContent=isHidden?'🙈':'👁';
btn.setAttribute('aria-label',isHidden?'Hide password':'Show password');
}

/* ---- Signup password strength rules (matches the live checklist under
   the signup password field) ---- */
function passwordRuleStatus(pw){
return{
len: pw.length>=8 && pw.length<=15,
case: /[a-z]/.test(pw) && /[A-Z]/.test(pw),
num: /[0-9]/.test(pw),
special: /[^A-Za-z0-9]/.test(pw)
};
}

function validateSignupPassword(pw){
const s=passwordRuleStatus(pw);
return s.len && s.case && s.num && s.special;
}

function updatePasswordRulesUI(pw){
const s=passwordRuleStatus(pw);
const countEl=$('pwCount');
if(countEl)countEl.textContent=pw.length;
$('ruleLen')?.classList.toggle('valid',s.len);
$('ruleCase')?.classList.toggle('valid',s.case);
$('ruleNum')?.classList.toggle('valid',s.num);
$('ruleSpecial')?.classList.toggle('valid',s.special);
}

/* -------------------------- 11. Signup -------------------------- */
/* ==========================================================================
   START CODE — UPDATED SIGNUP FUNCTION
   Signup now requires only Email and Password.
   Profile details will be added later from Client Dashboard > Profile.
   Existing client profile/database fields remain preserved.
   ========================================================================== */

async function signup() {
  clearMessages();

  if (!supabaseReady) {
    showMsg(
      'signupMsg',
      'Connection is not ready. Please refresh the page and try again.'
    );
    return;
  }

  const email = $('signupEmail')?.value.trim() || '';
  const pass = $('signupPassword')?.value || '';
  const confirm = $('confirmPassword')?.value || '';

  if (!email || !pass) {
    showMsg(
      'signupMsg',
      'Please fill Email and Password.'
    );
    return;
  }

  if (!validateSignupPassword(pass)) {
    showMsg(
      'signupMsg',
      'Password must be 8-15 characters and include an uppercase letter, a lowercase letter, a number, and a special character.'
    );
    return;
  }

  if (pass !== confirm) {
    showMsg(
      'signupMsg',
      'Passwords do not match.'
    );
    return;
  }

  const button = $('signupForm')?.querySelector('.form-actions .btn');

  if (button) {
    button.disabled = true;
    button.textContent = 'Creating...';
  }

  try {
    const manualPartnerCode =
      $('partnerCode')?.value.trim() || '';

    const referredByCode =
      manualPartnerCode || getStoredReferralCode();

    const { data, error } =
      await supabaseClient.auth.signUp({
        email,
        password: pass,

        options: {
          data: {
            referred_by_code: referredByCode || null
          },

          emailRedirectTo: window.location.origin
        }
      });

    if (error) {
      showMsg(
        'signupMsg',
        friendlySignupError(error.message)
      );
      return;
    }

    if (
      data &&
      data.user &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0
    ) {
      showMsg(
        'signupMsg',
        'An account with this email already exists. Please login instead, or use "Forgot password" if you do not remember your password.'
      );
      return;
    }

    if (data && data.session) {
      closeAuth();
      await loadDashboard();
    } else {
      showMsg(
        'signupMsg',
        'Account created. Please check your email to verify your account.',
        false
      );
    }

  } catch (err) {
    console.error('Signup error:', err);

    showMsg(
      'signupMsg',
      err?.message ||
      'Unable to create your account. Please try again.'
    );

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Create Account';
    }
  }
}

/* ==========================================================================
   END CODE — UPDATED SIGNUP FUNCTION
   ========================================================================== */

/* -------------------------- 12. Login -------------------------- */
async function login(){
clearMessages();
if(!supabaseReady){showMsg('loginMsg','Connection is not ready. Please refresh the page and try again.');return}
const email=$('loginEmail').value.trim();
const password=$('loginPassword').value;
if(!email||!password){showMsg('loginMsg','Enter email and password.');return}
const button=$('loginForm').querySelector('.form-actions .btn');
if(button){button.disabled=true;button.textContent='Logging in...'}
try{
const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
if(error){showMsg('loginMsg',error.message);return}
closeAuth();await loadDashboard();
}catch(err){console.error(err);showMsg('loginMsg','Unable to login right now. Please try again.')}
finally{if(button){button.disabled=false;button.textContent='Login'}}
}

/* -------------------------- 13. Dashboard loader (profile + account sync) -------------------------- */
async function loadDashboard(){
if(!supabaseReady)return;

try{

const {data:{user},error:userError}=await supabaseClient.auth.getUser();

if(userError||!user)return;

currentUser=user;

$('home').style.display='none';
$('dashboard').style.display='block';

document.querySelector('footer').style.display='none';
document.querySelector('header').style.display='none';

const contactSection=$('contact');
if(contactSection)contactSection.style.display='none';

/* Show shimmer placeholders on the balance/stat values immediately —
   before the profile/account fetches below even start — so nothing
   flashes stale "$0.00" while data is still loading. Cleared again by
   renderAccountSummary() (balance/stat cards) and loadReferralInfo()
   (referral stats) once their real values are in. */
showDashboardSkeleton();

/* ================= PROFILE ================= */

/* notifications_seen_at is the server-side "last time this client opened
   and cleared their notifications" timestamp (bulk "Mark all as read").
   read_notification_keys is a JSONB array of individually-opened
   notification keys — this is what makes clicking a SINGLE notification
   mark just that one as read (see section 21 below). Storing both on the
   profile row (instead of localStorage) is what makes read/unread state
   follow the client across devices and browsers.

   first_name/last_name/address/city/postal_code/state are the extra
   profile-completion fields (see section 13.5 below) — required before
   a client can submit a deposit. */
const {data:profile,error:profileError}=await supabaseClient
.from('profiles')
.select('full_name,first_name,last_name,phone,address,city,postal_code,state,wallet_address,wallet_address_bep20,notifications_seen_at,read_notification_keys')
.eq('id',user.id)
.maybeSingle();

if(profileError){
console.error('Profile load error:',profileError);
}

currentProfile=profile||null;

/*
Use profile name first.
If profile is missing, use the name stored
inside Supabase Auth user metadata.
*/

const profileName=profile?.first_name?(profile.first_name+' '+(profile.last_name||'')).trim():profile?.full_name?.trim();
const metadataName=user.user_metadata?.full_name?.trim();

const displayName=profileName||metadataName||'Client';

$('welcomeName').textContent=displayName;
$('welcomeEmail').textContent=user.email||'—';
const avatarEl=$('dashAvatar');
if(avatarEl)avatarEl.textContent=(displayName.trim().charAt(0)||'C').toUpperCase();

/* ================= PROFILE SAFETY SYNC ================= */

/*
If Auth already contains the client's information,
make sure the profile row also contains it.
*/

const metadataPhone=user.user_metadata?.phone||'';
const metadataWallet=user.user_metadata?.wallet_address||'';
const metadataWalletBep20=user.user_metadata?.wallet_address_bep20||'';

if(
user.id &&
(
!profile ||
!profile.full_name ||
!profile.phone ||
!profile.wallet_address ||
(profile.wallet_address_bep20!==metadataWalletBep20 && metadataWalletBep20)
)
){

try{

const profileUpdate={};

if(metadataPhone)profileUpdate.phone=metadataPhone;
if(metadataWallet)profileUpdate.wallet_address=metadataWallet;
if(metadataWalletBep20)profileUpdate.wallet_address_bep20=metadataWalletBep20;

if(Object.keys(profileUpdate).length>0){

const {error:syncError}=await supabaseClient
.from('profiles')
.update(profileUpdate)
.eq('id',user.id);

if(syncError){
console.error('Profile sync error:',syncError);
}else{

/* Refresh profile after successful sync */

const {data:updatedProfile}=await supabaseClient
.from('profiles')
.select('full_name,first_name,last_name,phone,address,city,postal_code,state,wallet_address,wallet_address_bep20,notifications_seen_at,read_notification_keys')
.eq('id',user.id)
.maybeSingle();

if(updatedProfile){
currentProfile=updatedProfile;

const updatedName=(updatedProfile.first_name?(updatedProfile.first_name+' '+(updatedProfile.last_name||'')).trim():updatedProfile.full_name?.trim())||displayName;

$('welcomeName').textContent=updatedName;
}

}

}

}catch(syncErr){
console.error('Profile safety sync error:',syncErr);
}

}

/* ================= ACCOUNT ================= */

const {data:accounts,error:accountError}=await supabaseClient
.from('accounts')
.select('balance,initial_balance,profit,first_deposit_at,total_withdrawn')
.eq('user_id',user.id)
.limit(1);

if(accountError){
console.error('Account load error:',accountError);
}

const a=accounts?.[0]||null;

currentAccount=a;

await renderAccountSummary(a);

await loadRequests();

await loadNotifications();

await loadReferralInfo();

}catch(err){

console.error('Dashboard error:',err);

}

}

/* -------------------------- 13.5 Profile completion (required before deposit) -------------------------- */

/*
Signup only asks for email + password now (see section 11 above) — every
other client detail (name, phone, address, wallets) is collected here
instead, the FIRST time the client tries to make a deposit.

isProfileComplete() is the single gate: openRequest('deposit') below calls
it before showing the deposit modal, and shows this profile-completion
modal instead if anything required is still missing. Withdrawals are not
gated here since a client cannot have profit to withdraw before their
first deposit anyway.

Required: first name, last name, phone, address, city, postal code, state,
and AT LEAST ONE of the two wallets (same "at least one" rule used
elsewhere in this file for wallets).
*/

function isProfileComplete(p){
if(!p)return false;
return !!(
p.first_name && p.last_name && p.phone &&
p.address && p.city && p.postal_code && p.state &&
(p.wallet_address || p.wallet_address_bep20)
);
}
/* Locks (disables) a wallet input in the Complete Profile / Settings
   form once that network's wallet already has a saved value — a client
   can fill in the OTHER network's wallet later, but cannot overwrite one
   that's already set. Called from openCompleteProfile() below. */
function lockWalletFields(){
const trc20Input=$('profileWalletTrc20');
const bep20Input=$('profileWalletBep20');
const trc20Note=trc20Input?.parentElement?.querySelector('.note')||null;

if(trc20Input){
if(currentProfile?.wallet_address){
trc20Input.readOnly=true;
}else{
trc20Input.readOnly=false;
}
}
if(bep20Input){
if(currentProfile?.wallet_address_bep20){
bep20Input.readOnly=true;
}else{
bep20Input.readOnly=false;
}
}
}

/* Remembers which action (currently only 'deposit') should resume
   automatically once the client finishes saving their profile. */
let pendingRequestAfterProfile=null;

/* Opens the profile-completion modal, pre-filled with whatever is
   already on file (so a client fixing ONE missing field, e.g. just the
   postal code, doesn't have to retype everything else). */
function openCompleteProfile(afterType){
pendingRequestAfterProfile=afterType||null;
clearMessages();
$('profileFirstName').value=currentProfile?.first_name||'';
$('profileLastName').value=currentProfile?.last_name||'';
$('profilePhone').value=currentProfile?.phone||'';
$('profileAddress').value=currentProfile?.address||'';
$('profileCity').value=currentProfile?.city||'';
$('profilePostalCode').value=currentProfile?.postal_code||'';
$('profileState').value=currentProfile?.state||'';
$('profileWalletTrc20').value=currentProfile?.wallet_address||'';
$('profileWalletBep20').value=currentProfile?.wallet_address_bep20||'';
$('completeProfileModal').classList.add('show');
document.body.classList.add('modal-open');
lockWalletFields();
}

function closeCompleteProfile(){
$('completeProfileModal').classList.remove('show');
document.body.classList.remove('modal-open');
pendingRequestAfterProfile=null;
}

/* Validates every field, saves the whole profile in one update, keeps
   full_name in sync (still used as a display-name fallback elsewhere),
   then — if this was triggered by clicking "Deposit" — automatically
   re-opens the deposit modal so the client doesn't have to click it
   twice. */
async function submitProfile(){
clearMessages();
if(!supabaseReady){showMsg('profileMsg','Connection is not ready. Please refresh the page and try again.');return}
if(!currentUser){showMsg('profileMsg','Please login again.');return}

const firstName=$('profileFirstName').value.trim();
const lastName=$('profileLastName').value.trim();
const phone=$('profilePhone').value.trim();
const address=$('profileAddress').value.trim();
const city=$('profileCity').value.trim();
const postalCode=$('profilePostalCode').value.trim();
const state=$('profileState').value.trim();
const walletTrc20=$('profileWalletTrc20').value.trim();
const walletBep20=$('profileWalletBep20').value.trim();

if(!firstName||!lastName||!phone||!address||!city||!postalCode||!state){showMsg('profileMsg','Please fill all fields.');return}
if(!walletTrc20&&!walletBep20){showMsg('profileMsg','Please provide at least one withdrawal wallet address (TRC20 or BEP20).');return}
if(walletTrc20&&!validWallet(walletTrc20)){showMsg('profileMsg','Please enter a valid TRC20 wallet address starting with T, or leave it blank.');return}
if(walletBep20&&!validBep20Wallet(walletBep20)){showMsg('profileMsg','Please enter a valid BEP20 wallet address starting with 0x, or leave it blank.');return}

const button=$('completeProfileModal').querySelector('.form-actions .btn');
if(button){button.disabled=true;button.textContent='Saving...'}

try{
const fullName=(firstName+' '+lastName).trim();

const {error}=await supabaseClient.from('profiles').update({
first_name:firstName,
last_name:lastName,
full_name:fullName,
phone:phone,
address:address,
city:city,
postal_code:postalCode,
state:state,
wallet_address:walletTrc20||null,
wallet_address_bep20:walletBep20||null
}).eq('id',currentUser.id);

if(error){console.error(error);showMsg('profileMsg',friendlySignupError(error.message));return}

currentProfile={
...(currentProfile||{}),
first_name:firstName,last_name:lastName,full_name:fullName,phone,
address,city,postal_code:postalCode,state,
wallet_address:walletTrc20||null,wallet_address_bep20:walletBep20||null
};

$('welcomeName').textContent=fullName||'Client';
const avatarEl=$('dashAvatar');
if(avatarEl)avatarEl.textContent=(fullName.trim().charAt(0)||'C').toUpperCase();

showMsg('profileMsg','Profile saved successfully.',false);

const next=pendingRequestAfterProfile;
pendingRequestAfterProfile=null;

setTimeout(()=>{
closeCompleteProfile();
if(next==='deposit')openRequest('deposit');
},700);

}catch(err){console.error(err);showMsg('profileMsg','Unable to save profile right now.')}
finally{if(button){button.disabled=false;button.textContent='Save profile'}}
}

/* -------------------------- 14. Available-to-withdraw calculation (incl. pending withdrawals) -------------------------- */

/*
Sums this user's currently PENDING withdrawal requests.
This is the piece that closes the "double withdrawal" bug: without
subtracting pending requests, a client could submit multiple
withdrawal requests back-to-back, each individually looking valid
against the raw account balance/profit, but together exceeding what
was actually available. (E.g. $110 profit -> $50 pending withdrawal
still leaves the old getWithdrawableAmount() reporting $110
available, letting a second $110 withdrawal slip through when only
$60 was really left.)
*/
async function getPendingWithdrawalsTotal(){
if(!currentUser||!supabaseReady)return 0;
try{
const {data,error}=await supabaseClient
.from('withdrawals')
.select('amount')
.eq('user_id',currentUser.id)
.eq('status','pending');
if(error){console.error('Pending withdrawals fetch error:',error);return 0}
return (data||[]).reduce((sum,r)=>sum+Number(r.amount||0),0);
}catch(err){
console.error('Pending withdrawals fetch error:',err);
return 0;
}
}

/*
Available amount = (profit share, or full balance once principal is
unlocked) minus whatever is already sitting in pending withdrawal
requests. This is async (it queries Supabase), so every caller below
awaits it.
*/
async function getWithdrawableAmount(){
if(!currentAccount)return 0;
const balance=Number(currentAccount.balance||0);
const profit=Number(currentAccount.profit||0);
const days=daysSince(currentAccount.first_deposit_at);
const principalUnlocked=days!==null&&days>=PRINCIPAL_LOCK_DAYS;
const rawAvailable=principalUnlocked?balance:Math.min(profit,balance);
const pending=await getPendingWithdrawalsTotal();
return Math.max(0,rawAvailable-pending);
}

function daysSince(dateStr){
if(!dateStr)return null;
const then=new Date(dateStr).getTime();
return (Date.now()-then)/86400000;
}

/* -------------------------- 15. Account summary rendering (balance, profit, unlock progress) -------------------------- */
async function renderAccountSummary(a){
const balance=Number(a?.balance||0);
const deposit=Number(a?.initial_balance||0);
const profit=Number(a?.profit||0);
const withdrawn=Number(a?.total_withdrawn||0);

$('dashBalance').textContent='$'+balance.toFixed(2);
$('dashDeposit').textContent='$'+deposit.toFixed(2);
$('dashWithdrawn').textContent='$'+withdrawn.toFixed(2);

const profitEl=$('dashProfit');
const profitSubEl=$('dashProfitSub');
const pillEl=$('dashProfitPill');
profitEl.textContent=(profit<0?'-':'')+'$'+Math.abs(profit).toFixed(2);
profitEl.classList.remove('up','down');
pillEl.classList.remove('pos','neg','zero');
if(profit>0){
profitEl.classList.add('up');
pillEl.classList.add('pos');
pillEl.textContent='+$'+profit.toFixed(2)+' profit so far';
if(profitSubEl)profitSubEl.textContent="You're up since you joined";
}else if(profit<0){
profitEl.classList.add('down');
pillEl.classList.add('neg');
pillEl.textContent='-$'+Math.abs(profit).toFixed(2)+' loss so far';
if(profitSubEl)profitSubEl.textContent='Down since you joined';
}else{
pillEl.classList.add('zero');
pillEl.textContent='No profit or loss yet';
if(profitSubEl)profitSubEl.textContent='Nothing to report yet';
}

/* Available to withdraw + principal unlock countdown */
currentAccount=a;
const available=await getWithdrawableAmount();
$('dashAvailable').textContent='$'+available.toFixed(2);

const days=daysSince(a?.first_deposit_at);
const fillEl=$('unlockFill');
const daysTextEl=$('unlockDaysText');
const noteEl=$('unlockNote');

if(days===null){
fillEl.style.width='0%';
fillEl.classList.remove('done');
daysTextEl.textContent='No deposit yet';
noteEl.textContent='Once you make your first deposit, it unlocks for withdrawal after 40 days. Your profit can be withdrawn any time before that.';
}else if(days>=PRINCIPAL_LOCK_DAYS){
fillEl.style.width='100%';
fillEl.classList.add('done');
daysTextEl.textContent='Unlocked ✅';
noteEl.textContent='Your deposited amount is fully unlocked — your whole balance is available to withdraw.';
}else{
const pct=Math.max(0,Math.min(100,(days/PRINCIPAL_LOCK_DAYS)*100));
const daysLeft=Math.max(0,Math.ceil(PRINCIPAL_LOCK_DAYS-days));
fillEl.style.width=pct.toFixed(0)+'%';
fillEl.classList.remove('done');
daysTextEl.textContent=daysLeft+' day'+(daysLeft===1?'':'s')+' left';
noteEl.textContent='Your deposited amount unlocks in '+daysLeft+' day'+(daysLeft===1?'':'s')+'. Your profit share is available to withdraw right now.';
}

/* Balance/stat cards + available/unlock now hold real values — drop the
   shimmer placeholders that showDashboardSkeleton() applied earlier. */
clearAccountSkeleton();
}

/* -------------------------- 16. Withdrawal fee calculator (UI) -------------------------- */
function updateWithdrawalCalc(){
const amtInput=$('withdrawalAmount');
const calc=$('withdrawalCalc');
if(!amtInput||!calc)return;
const amt=Number(amtInput.value);
if(!Number.isFinite(amt)||amt<=0){calc.style.display='none';return}
const fee=WITHDRAWAL_FEE;
const net=Math.max(0,amt-fee);
$('calcAmount').textContent='$'+amt.toFixed(2);
$('calcFee').textContent='$'+fee.toFixed(2);
$('calcReceive').textContent='$'+net.toFixed(2);
calc.style.display='block';
}

/* -------------------------- 17. Deposit / Withdrawal request modals (open/close) -------------------------- */
async function openRequest(type){
clearRequestMessages();

/* Profile-completion gate — see section 13.5. Only deposits are gated:
   a client cannot have any profit to withdraw before their first
   deposit, so there is nothing useful the withdrawal flow needs from
   this form that isn't already covered by the wallet fields inside the
   withdrawal modal itself. */
if(type==='deposit'&&!isProfileComplete(currentProfile)){
openCompleteProfile('deposit');
return;
}

const id=type==='deposit'?'depositModal':'withdrawalModal';
const m=$(id);
if(!m)return;
if(type==='deposit'){
selectDepositNetwork(selectedDepositNetwork);
}
if(type==='withdrawal'){
selectWithdrawalNetwork(selectedWithdrawalNetwork);
const avail=await getWithdrawableAmount();
const days=daysSince(currentAccount?.first_deposit_at);
const principalUnlocked=days!==null&&days>=PRINCIPAL_LOCK_DAYS;
const noteEl=$('withdrawalAvailable');
if(noteEl){
if(principalUnlocked){
noteEl.textContent='Your principal is unlocked. You can withdraw up to $'+avail.toFixed(2)+' now.';
}else{
const daysLeft=Math.max(0,Math.ceil(PRINCIPAL_LOCK_DAYS-(days||0)));
noteEl.textContent='You can withdraw up to $'+avail.toFixed(2)+' now (your profit share, after accounting for any pending requests). Your deposited capital unlocks in '+daysLeft+' day'+(daysLeft===1?'':'s')+'.';
}
noteEl.style.display='block';
}
updateWithdrawalCalc();
}
m.classList.add('show');
document.body.classList.add('modal-open');
setTimeout(()=>{
const e=$(type==='deposit'?'depositAmount':'withdrawalAmount');
if(e)e.focus();
},50);
}

function closeRequest(type){
const m=$(type==='deposit'?'depositModal':'withdrawalModal');
if(m)m.classList.remove('show');
document.body.classList.remove('modal-open');
}

function clearRequestMessages(){
['depositMsg','withdrawalMsg'].forEach(id=>{
const e=$(id);
if(e)e.classList.remove('show');
});
}

/* -------------------------- 18. Submit deposit request -------------------------- */
async function submitDeposit(){
clearRequestMessages();
if(!supabaseReady){showMsg('depositMsg','Connection is not ready. Please refresh the page and try again.');return}
if(!currentUser){showMsg('depositMsg','Please login again.');return}
const amount=Number($('depositAmount').value);
const tx=$('depositTx').value.trim();
const proofFile=$('depositProof')?.files?.[0]||null;
if(!Number.isFinite(amount)||amount<100){showMsg('depositMsg','Minimum deposit is $100.');return}
if(!tx){showMsg('depositMsg','Please enter the transaction hash.');return}
if(!proofFile){showMsg('depositMsg','Please upload a screenshot of your payment.');return}
if(proofFile.size>5*1024*1024){showMsg('depositMsg','Screenshot must be under 5MB.');return}
const button=$('depositModal').querySelector('.form-actions .btn');
if(button){button.disabled=true;button.textContent='Submitting...'}
try{
let proofUrl=null;
const ext=proofFile.name.split('.').pop();
const path=currentUser.id+'/'+Date.now()+'.'+ext;
const {error:uploadError}=await supabaseClient.storage.from('deposit-proofs').upload(path,proofFile);
if(uploadError){console.error(uploadError);showMsg('depositMsg','Screenshot upload failed: '+uploadError.message);return}
const {data:urlData}=supabaseClient.storage.from('deposit-proofs').getPublicUrl(path);
proofUrl=urlData?.publicUrl||null;
const {error}=await supabaseClient.from('deposits').insert({
user_id:currentUser.id,amount,currency:'USDT',network:selectedDepositNetwork,tx_hash:tx,status:'pending',proof_url:proofUrl
});
if(error){console.error(error);showMsg('depositMsg',error.message);return}
showMsg('depositMsg','Deposit request submitted successfully. It is pending verification.',false);
$('depositAmount').value='';
$('depositTx').value='';
$('depositProof').value='';
$('depositProofName').textContent='';
await loadRequests();
await loadNotifications();
setTimeout(()=>closeRequest('deposit'),1200);
}catch(err){console.error(err);showMsg('depositMsg','Unable to submit deposit request right now.')}
finally{if(button){button.disabled=false;button.textContent='Submit deposit request'}}
}

/* -------------------------- 19. Submit withdrawal request -------------------------- */
async function submitWithdrawal(){
clearRequestMessages();
if(!supabaseReady){showMsg('withdrawalMsg','Connection is not ready. Please refresh the page and try again.');return}
if(!currentUser){showMsg('withdrawalMsg','Please login again.');return}
const amount=Number($('withdrawalAmount').value);
const wallet=$('withdrawalWallet').value.trim();
const network=selectedWithdrawalNetwork;

if(!Number.isFinite(amount)||amount<=WITHDRAWAL_FEE){showMsg('withdrawalMsg','Withdrawal amount must be greater than the $'+WITHDRAWAL_FEE.toFixed(2)+' fee.');return}

if(network==='TRC20'){
if(!validWallet(wallet)){showMsg('withdrawalMsg','Please enter a valid TRC20 wallet address starting with T.');return}
}else{
if(!validBep20Wallet(wallet)){showMsg('withdrawalMsg','Please enter a valid BEP20 wallet address starting with 0x.');return}
}

const {data:accounts,error:accountError}=await supabaseClient.from('accounts').select('balance,profit,first_deposit_at').eq('user_id',currentUser.id).limit(1);
if(accountError){showMsg('withdrawalMsg',accountError.message);return}
currentAccount=accounts?.[0]||currentAccount;
const balance=Number(currentAccount?.balance||0);
if(amount>balance){showMsg('withdrawalMsg','Withdrawal amount is higher than your available balance of $'+balance.toFixed(2)+'.');return}

/*
Re-checks pending withdrawals fresh, right before insert, via
getWithdrawableAmount() (which itself queries the withdrawals
table). This closes the double-withdrawal bug: a second submission
made right after a first pending one now correctly sees the first
as "reserved" and can no longer double-spend the same profit/balance.
This is still a client-side guard only — it is paired with a
DB-level trigger (check_withdrawal_amount, in the SQL) so the check
can't be bypassed by calling the API directly.
*/
const maxWithdrawable=await getWithdrawableAmount();
if(amount>maxWithdrawable){
const days=daysSince(currentAccount?.first_deposit_at);
const daysLeft=Math.max(0,Math.ceil(PRINCIPAL_LOCK_DAYS-(days||0)));
if(maxWithdrawable<=0){
showMsg('withdrawalMsg','You have no available balance to withdraw right now — you may already have a pending withdrawal request awaiting review.');
}else{
showMsg('withdrawalMsg','You can currently withdraw up to $'+maxWithdrawable.toFixed(2)+' (after accounting for any pending requests). Your deposited capital unlocks in '+daysLeft+' day'+(daysLeft===1?'':'s')+'.');
}
return;
}
const fee=WITHDRAWAL_FEE;
const netAmount=Math.max(0,amount-fee);
const button=$('withdrawalModal').querySelector('.form-actions .btn');
if(button){button.disabled=true;button.textContent='Submitting...'}
try{
const {error}=await supabaseClient.from('withdrawals').insert({
user_id:currentUser.id,amount,wallet_address:wallet,network:network,status:'pending'
});
if(error){console.error(error);showMsg('withdrawalMsg',error.message);return}
showMsg('withdrawalMsg','Withdrawal request submitted successfully. It is pending review. You will receive $'+netAmount.toFixed(2)+' after the $'+fee.toFixed(2)+' fee.',false);
$('withdrawalAmount').value='';
$('withdrawalCalc').style.display='none';
await loadRequests();
await loadNotifications();
setTimeout(()=>closeRequest('withdrawal'),1800);
}catch(err){console.error(err);showMsg('withdrawalMsg','Unable to submit withdrawal request right now.')}
finally{if(button){button.disabled=false;button.textContent='Submit withdrawal request'}}
}

/* -------------------------- 20. Recent transactions list -------------------------- */
async function loadRequests(){
if(!currentUser||!supabaseReady||!$('requestList'))return;

/* Pre-fill with shimmer placeholder cards so the list never sits blank
   (or shows the old "Loading..." text) while the two queries below are
   in flight — cleared automatically once innerHTML is replaced with the
   real rows (or the empty-state message) further down. */
const listEl=$('requestList');
if(listEl)listEl.innerHTML=skeletonRowsHtml(3);

try{
const [d,w]=await Promise.all([
supabaseClient.from('deposits').select('amount,status,created_at').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(5),
supabaseClient.from('withdrawals').select('amount,status,created_at').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(5)
]);
const rows=[];
(d.data||[]).forEach(x=>rows.push({type:'Deposit',amount:x.amount,status:x.status,date:x.created_at}));
(w.data||[]).forEach(x=>rows.push({type:'Withdrawal',amount:x.amount,status:x.status,date:x.created_at}));
rows.sort((a,b)=>new Date(b.date)-new Date(a.date));
const el=$('requestList');
if(!rows.length){el.innerHTML='<div class="tx-empty">No deposits or withdrawals yet.</div>';return}
const statusWord={pending:'Pending review',approved:'Approved',rejected:'Rejected'};
el.innerHTML=rows.slice(0,8).map(x=>{
const isDeposit=x.type==='Deposit';
const statusKey=String(x.status).toLowerCase();
const statusLabel=statusWord[statusKey]||String(x.status);
return '<div class="tx-card">'
+'<div class="tx-icon '+(isDeposit?'dep':'wd')+'">'+(isDeposit?'⬇':'⬆')+'</div>'
+'<div class="tx-mid"><div class="tx-type">'+x.type+'</div><div class="tx-date">'+new Date(x.date).toLocaleString()+'</div></div>'
+'<div class="tx-right"><div class="tx-amount">'+(isDeposit?'+':'-')+'$'+Number(x.amount).toFixed(2)+'</div><span class="tx-status status-'+statusKey+'">'+statusLabel+'</span></div>'
+'</div>';
}).join('');
}catch(err){console.error('Requests error:',err)}
}

/* -------------------------- 21. Notification bell + popup (server-synced read state, incl. per-item read) -------------------------- */

/*
There is no dedicated notifications table — the feed is built by
combining the client's own deposits, withdrawals and profit_entries
rows into one timeline, newest first.

Read state has TWO layers, both stored server-side (so it follows the
client across devices/browsers instead of resetting per-browser like the
old localStorage approach):

  1) profiles.notifications_seen_at — a bulk "seen up to this time"
     timestamp, set by "Mark all as read".
  2) profiles.read_notification_keys — a JSONB array of individual
     notification "keys" the client has opened one-by-one (via
     openNotifDetail). THIS is the fix for the reported bug: previously,
     clicking a single notification only opened its popup and never
     changed its read-state, so it stayed in the "unread" bucket forever
     until "Mark all as read" was used.

A notification is UNREAD only if BOTH:
  - it is newer than notifications_seen_at, AND
  - its key is not present in read_notification_keys.

Each notification's "key" is a stable id built from its source table and
created_at timestamp, since there is no dedicated notifications table
with row ids to key off of.
*/

async function loadNotifications(){
if(!currentUser||!supabaseReady)return;

/* Same shimmer treatment as loadRequests() above — the notification
   popup shows placeholder cards the instant it's opened / reloaded,
   instead of a plain "Loading..." line. */
const listEl=$('notifList');
if(listEl)listEl.innerHTML=skeletonRowsHtml(3);

try{
const [d,w,p]=await Promise.all([
supabaseClient.from('deposits').select('amount,status,created_at').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(10),
supabaseClient.from('withdrawals').select('amount,status,created_at').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(10),
supabaseClient.from('profit_entries').select('client_share,entry_date,created_at').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(10)
]);

const items=[];

(d.data||[]).forEach(x=>{
const statusText=x.status==='pending'?'Deposit request received':x.status==='approved'?'Deposit approved':'Deposit rejected';
const icon=x.status==='approved'?'✅':x.status==='rejected'?'❌':'📥';
items.push({icon,text:statusText+' — $'+Number(x.amount).toFixed(2),date:x.created_at,key:'deposit-'+x.status+'-'+x.created_at});
});

(w.data||[]).forEach(x=>{
const statusText=x.status==='pending'?'Withdrawal request received':x.status==='approved'?'Withdrawal approved':'Withdrawal rejected';
const icon=x.status==='approved'?'💸':x.status==='rejected'?'❌':'⏳';
items.push({icon,text:statusText+' — $'+Number(x.amount).toFixed(2),date:x.created_at,key:'withdrawal-'+x.status+'-'+x.created_at});
});

(p.data||[]).forEach(x=>{
items.push({icon:'📈',text:'Daily profit updated — +$'+Number(x.client_share||0).toFixed(2),date:x.created_at||x.entry_date,key:'profit-'+(x.created_at||x.entry_date)});
});

items.sort((a,b)=>new Date(b.date)-new Date(a.date));

/* Kept around (module-level) so a click on a row can look itself up by
   index and open its own detail popup — see openNotifDetail(). */
currentNotificationItems=items.slice(0,20);

renderNotifications(currentNotificationItems);

}catch(err){
console.error('Notifications load error:',err);
}
}

/* Returns true if the given notification item is still unread, checking
   BOTH the bulk "seen" timestamp and the individually-read key list. */
function isNotificationUnread(item){
const seenRaw=currentProfile?.notifications_seen_at;
const seenTime=seenRaw?new Date(seenRaw).getTime():0;
const readKeys=currentProfile?.read_notification_keys||[];
const newerThanSeen=new Date(item.date).getTime()>seenTime;
const individuallyRead=readKeys.includes(item.key);
return newerThanSeen && !individuallyRead;
}

function renderNotifications(items){
const list=$('notifList');
const badge=$('notifBadge');
if(!list)return;

const unreadCount=items.filter(isNotificationUnread).length;

if(badge){
if(unreadCount>0){
badge.textContent=unreadCount>9?'9+':String(unreadCount);
badge.style.display='flex';
}else{
badge.style.display='none';
}
}

if(!items.length){
list.innerHTML='<div class="notif-empty">No notifications yet.</div>';
return;
}

const now=new Date();
const todayStr=now.toDateString();
const yestStr=new Date(now.getTime()-86400000).toDateString();

const groups={Today:[],Yesterday:[],Earlier:[]};

items.forEach(x=>{
const dStr=new Date(x.date).toDateString();
if(dStr===todayStr)groups.Today.push(x);
else if(dStr===yestStr)groups.Yesterday.push(x);
else groups.Earlier.push(x);
});

let html='';

Object.keys(groups).forEach(label=>{
const rows=groups[label];
if(!rows.length)return;
html+='<div class="notif-group-label">'+label+'</div>';
rows.forEach(x=>{
const isUnread=isNotificationUnread(x);
const idx=items.indexOf(x);
html+='<div class="notif-item'+(isUnread?' unread':'')+'" onclick="openNotifDetail('+idx+')">'
+'<div class="notif-icon">'+x.icon+'</div>'
+'<div class="notif-body"><div class="notif-text">'+x.text+'</div><div class="notif-time">'+new Date(x.date).toLocaleString()+'</div></div>'
+'</div>';
});
});

list.innerHTML=html;
}

/* Opens/closes the small centered popup (+ its dim backdrop). Reloads
   the feed each time it opens so a freshly-arrived notification is
   reflected immediately. */
function toggleNotifications(){
const dd=$('notifDropdown');
const overlay=$('notifOverlay');
if(!dd)return;
const willShow=!dd.classList.contains('show');
dd.classList.toggle('show',willShow);
overlay?.classList.toggle('show',willShow);
document.body.classList.toggle('modal-open',willShow);
if(willShow)loadNotifications();
}

function closeNotifications(){
$('notifDropdown')?.classList.remove('show');
$('notifOverlay')?.classList.remove('show');
$('notifDetailModal')?.classList.remove('show');
document.body.classList.remove('modal-open');
}

/*
Opens one notification's own small popup on top of the list (X button to
close), so a client can read a single notification in full without the
list closing behind it.

FIX: this now also marks THIS specific notification as individually read
(via markNotificationRead below), instead of leaving it unread until
"Mark all as read" is clicked.
*/
function openNotifDetail(index){
const item=currentNotificationItems[index];
if(!item)return;
const iconEl=$('notifDetailIcon');
const textEl=$('notifDetailText');
const timeEl=$('notifDetailTime');
if(iconEl)iconEl.textContent=item.icon;
if(textEl)textEl.textContent=item.text;
if(timeEl)timeEl.textContent=new Date(item.date).toLocaleString();
$('notifDetailModal')?.classList.add('show');

markNotificationRead(item.key);
}

function closeNotifDetail(){
$('notifDetailModal')?.classList.remove('show');
}

/*
Marks ONE notification (identified by its unique "key") as individually
read. Persists it into profiles.read_notification_keys in Supabase, updates
the local currentProfile copy, and re-renders the list immediately so the
bold/unread styling and the badge count update right away — no full page
reload needed.
*/
async function markNotificationRead(key){
if(!currentUser||!supabaseReady||!key)return;

const existing=Array.isArray(currentProfile?.read_notification_keys)?currentProfile.read_notification_keys:[];
if(existing.includes(key))return; /* already read — nothing to do */

const updated=[...existing,key];

try{
const {error}=await supabaseClient
.from('profiles')
.update({read_notification_keys:updated})
.eq('id',currentUser.id);
if(error){console.error('Mark notification read error:',error);return}
}catch(err){
console.error('Mark notification read error:',err);
return;
}

if(currentProfile)currentProfile.read_notification_keys=updated;
else currentProfile={read_notification_keys:updated};

renderNotifications(currentNotificationItems);
}

/* The dim backdrop behind the notification popup is shared by both the
   list and the single-notification detail popup. Clicking it should only
   close whichever layer is currently on top. */
function handleNotifOverlayClick(){
const detail=$('notifDetailModal');
if(detail&&detail.classList.contains('show')){
closeNotifDetail();
}else{
closeNotifications();
}
}

/*
Persists the bulk "seen" timestamp to the client's profile row in
Supabase (instead of localStorage), so read state is shared across every
device and browser the client logs in from. Also resets
read_notification_keys back to [] — everything up to "now" is already
covered by the new notifications_seen_at, so the individually-read-keys
list doesn't need to keep growing forever. Also flips the UI instantly
and locally — unread items lose their bold weight and highlight right
away — without waiting for a full reload.
*/
async function markAllNotificationsRead(){
if(!currentUser||!supabaseReady)return;
const now=new Date().toISOString();
try{
const {error}=await supabaseClient
.from('profiles')
.update({notifications_seen_at:now,read_notification_keys:[]})
.eq('id',currentUser.id);
if(error){console.error('Mark notifications read error:',error);return}
}catch(err){
console.error('Mark notifications read error:',err);
return;
}
if(currentProfile){
currentProfile.notifications_seen_at=now;
currentProfile.read_notification_keys=[];
}else{
currentProfile={notifications_seen_at:now,read_notification_keys:[]};
}
const badge=$('notifBadge');
if(badge)badge.style.display='none';
document.querySelectorAll('.notif-item.unread').forEach(el=>el.classList.remove('unread'));
}

/* -------------------------- 21.5 Account menu (avatar/name click) + its sub-views -------------------------- */

/*
Opened by clicking the avatar/name block in the dashboard topbar.
- View Profile  → read-only summary, built straight from currentProfile.
- Settings      → re-opens the existing profile-completion form
                  (#completeProfileModal / openCompleteProfile()), just
                  with no pending deposit to resume and a settings-
                  appropriate subtitle instead of the "before you can
                  deposit" one.
- Team          → list of clients this client referred, fetched via the
                  get_referred_clients() RPC (SQL side).
- Invite Members→ opens #inviteModal, which holds the referral link,
                  Copy/Share buttons, live stats and the referral
                  program terms (moved here from the dashboard body).
- Support       → a message form that inserts into contact_messages,
                  same table the public Contact page uses, with the
                  client's name/email filled in automatically.
- Sign Out      → reuses the existing logout().
*/

function toggleAccountMenu(){
const popup=$('accountMenuPopup');
const overlay=$('accountMenuOverlay');
if(!popup)return;
const willShow=!popup.classList.contains('show');
if(willShow){
const name=$('welcomeName')?.textContent||'Client';
const headName=$('menuHeadName'); if(headName)headName.textContent=name;
const headEmail=$('menuHeadEmail'); if(headEmail)headEmail.textContent=currentUser?.email||'—';
const headAvatar=$('menuHeadAvatar'); if(headAvatar)headAvatar.textContent=(name.trim().charAt(0)||'C').toUpperCase();
}
popup.classList.toggle('show',willShow);
overlay?.classList.toggle('show',willShow);
document.body.classList.toggle('modal-open',willShow);
}

function closeAccountMenu(){
$('accountMenuPopup')?.classList.remove('show');
$('accountMenuOverlay')?.classList.remove('show');
document.body.classList.remove('modal-open');
}

/* Small helper — every value rendered into these popups comes from data
   the client themselves typed in (name, address, message text, etc), so
   it's escaped before being inserted via innerHTML. */
function escapeHtml(str){
return String(str).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---- View Profile ---- */
function openViewProfile(){
closeAccountMenu();
const rows=[
['First name',currentProfile?.first_name],
['Last name',currentProfile?.last_name],
['Phone / WhatsApp',currentProfile?.phone],
['Address',currentProfile?.address],
['City',currentProfile?.city],
['Postal code',currentProfile?.postal_code],
['State',currentProfile?.state],
['TRC20 wallet',currentProfile?.wallet_address],
['BEP20 wallet',currentProfile?.wallet_address_bep20]
];
const list=$('profileViewList');
if(list){
list.innerHTML=rows.map(([label,value])=>
'<div class="profile-view-row"><span class="profile-view-label">'+label+'</span><span class="profile-view-value">'+(value?escapeHtml(value):'—')+'</span></div>'
).join('');
}
$('viewProfileModal')?.classList.add('show');
document.body.classList.add('modal-open');
}

function closeViewProfile(){
$('viewProfileModal')?.classList.remove('show');
document.body.classList.remove('modal-open');
}

/* ---- Settings (mobile number / wallets / other profile details) ---- */
function openSettings(){
closeAccountMenu();
openCompleteProfile(null);
const sub=$('completeProfileModal')?.querySelector('.auth-sub');
if(sub)sub.textContent='Update your mobile number, wallets, or other profile details.';
}

/* ---- Team ---- */
async function openTeam(){
closeAccountMenu();
$('teamModal')?.classList.add('show');
document.body.classList.add('modal-open');
const list=$('teamList');
if(list)list.innerHTML=skeletonRowsHtml(3);
if(!supabaseReady)return;
try{
const {data,error}=await supabaseClient.rpc('get_referred_clients');
if(error){
console.error('Team load error:',error);
if(list)list.innerHTML='<div class="tx-empty">Unable to load your team right now.</div>';
return;
}
const rows=data||[];
if(!rows.length){
if(list)list.innerHTML='<div class="tx-empty">No referrals yet — share your link from Invite Members.</div>';
return;
}
if(list)list.innerHTML=rows.map(r=>
'<div class="team-item">'
+'<div><div class="team-item-name">'+escapeHtml(r.name||'Client')+'</div>'
+'<div class="team-item-date">Joined '+new Date(r.joined_at).toLocaleDateString()+'</div>'
+'<div class="team-item-earn">Deposited $'+Number(r.total_deposited||0).toFixed(2)+' · Commission $'+Number(r.commission_earned||0).toFixed(2)+'</div>'
+'</div>'
+'<span class="tx-status '+(r.deposit_approved?'status-approved':'status-pending')+'">'+(r.deposit_approved?'Deposited':'No deposit yet')+'</span>'
+'</div>'
).join('');
}catch(err){
console.error('Team load error:',err);
if(list)list.innerHTML='<div class="tx-empty">Unable to load your team right now.</div>';
}
}

function closeTeam(){
$('teamModal')?.classList.remove('show');
document.body.classList.remove('modal-open');
}

/* ---- Invite Members ---- */
function openInviteMembers(){
closeAccountMenu();
$('inviteModal')?.classList.add('show');
document.body.classList.add('modal-open');
}

function closeInviteMembers(){
$('inviteModal')?.classList.remove('show');
document.body.classList.remove('modal-open');
}

/* ---- Support ---- */
function openSupport(){
closeAccountMenu();
$('supportMsg')?.classList.remove('show');
$('supportModal')?.classList.add('show');
document.body.classList.add('modal-open');
}

function closeSupport(){
$('supportModal')?.classList.remove('show');
document.body.classList.remove('modal-open');
}

async function submitSupportMessage(){
if(!supabaseReady){showMsg('supportMsg','Connection is not ready. Please refresh the page and try again.');return}
if(!currentUser){showMsg('supportMsg','Please login again.');return}
const subject=$('supportSubject').value.trim();
const message=$('supportMessage').value.trim();
const attachmentFile=$('supportAttachment')?.files?.[0]||null;
if(!subject||!message){showMsg('supportMsg','Please fill both subject and message.');return}
if(attachmentFile&&attachmentFile.size>5*1024*1024){showMsg('supportMsg','Attachment must be under 5MB.');return}
const btn=$('supportModal').querySelector('.form-actions .btn');
if(btn){btn.disabled=true;btn.textContent='Sending...'}
try{
let attachmentUrl=null;
if(attachmentFile){
const ext=attachmentFile.name.split('.').pop();
const path='contact/'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.'+ext;
const {error:uploadError}=await supabaseClient.storage.from('contact-attachments').upload(path,attachmentFile);
if(uploadError){console.error(uploadError);showMsg('supportMsg','Attachment upload failed: '+uploadError.message);return}
const {data:urlData}=supabaseClient.storage.from('contact-attachments').getPublicUrl(path);
attachmentUrl=urlData?.publicUrl||null;
}
const displayName=$('welcomeName')?.textContent||'Client';
const {error}=await supabaseClient.from('contact_messages').insert({
name:displayName,email:currentUser.email,subject,message,attachment_url:attachmentUrl,status:'new'
});
if(error){console.error(error);showMsg('supportMsg',error.message);return}
showMsg('supportMsg','Your message has been sent to our support team.',false);
$('supportSubject').value='';
$('supportMessage').value='';
$('supportAttachment').value='';
$('supportAttachmentName').textContent='';
setTimeout(()=>closeSupport(),1400);
}catch(err){console.error(err);showMsg('supportMsg','Unable to send your message right now.')}
finally{if(btn){btn.disabled=false;btn.textContent='Send message'}}
}

/* -------------------------- 22. Contact form submission -------------------------- */
/* CONTACT FORM — direct Supabase submission with optional attachment */
async function submitContact(event){
event.preventDefault();

const btn=$('contactSubmitBtn');
const name=$('contactName').value.trim();
const email=$('contactEmail').value.trim();
const subject=$('contactSubject').value.trim();
const message=$('contactMessage').value.trim();
const attachmentFile=$('contactAttachment')?.files?.[0]||null;

if(!name||!email||!subject||!message){
alert('Please fill all fields.');
return;
}

if(attachmentFile&&attachmentFile.size>5*1024*1024){
alert('Attachment must be under 5MB.');
return;
}

if(!supabaseReady){
alert('Connection is not ready. Please refresh the page and try again.');
return;
}

if(btn){btn.disabled=true;btn.textContent='Sending...'}

try{
let attachmentUrl=null;

if(attachmentFile){
const ext=attachmentFile.name.split('.').pop();
const path='contact/'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.'+ext;
const {error:uploadError}=await supabaseClient.storage.from('contact-attachments').upload(path,attachmentFile);
if(uploadError){
console.error(uploadError);
alert('Attachment upload failed: '+uploadError.message);
if(btn){btn.disabled=false;btn.textContent='Submit'}
return;
}
const {data:urlData}=supabaseClient.storage.from('contact-attachments').getPublicUrl(path);
attachmentUrl=urlData?.publicUrl||null;
}

const {error}=await supabaseClient.from('contact_messages').insert({
name,email,subject,message,attachment_url:attachmentUrl,status:'new'
});

if(error){
console.error(error);
alert('Unable to send message right now. Please email support.pipzone@gmail.com directly.');
return;
}

$('contactSuccess').style.display='block';
$('contactName').value='';
$('contactEmail').value='';
$('contactSubject').value='';
$('contactMessage').value='';
$('contactAttachment').value='';
$('contactAttachmentName').textContent='';

setTimeout(()=>{$('contactSuccess').style.display='none'},5000);

}catch(err){
console.error(err);
alert('Unable to send message right now. Please email support.pipzone@gmail.com directly.');
}finally{
if(btn){btn.disabled=false;btn.textContent='Submit'}
}
}

/* -------------------------- 23. Logout -------------------------- */
async function logout(){
if(supabaseReady)await supabaseClient.auth.signOut();
location.reload();
}

/* -------------------------- 24. Profit-split calculator (homepage widget) -------------------------- */
function updateCalculator(){
const slider=$('amtSlider');
if(!slider)return;
const v=Number(slider.value);
$('amtOut').textContent=v.toLocaleString();
$('outResult').textContent=(v<0?'-':'')+'$'+Math.abs(v).toFixed(2);
$('outClient').textContent=(v<0?'-':'')+'$'+Math.abs(v*.6).toFixed(2);
$('outMgr').textContent=(v<0?'-':'')+'$'+Math.abs(v*.4).toFixed(2);
}

/* -------------------------- 26. Referral program (capture ?ref=, dashboard card, copy/share) -------------------------- */

/*
FINAL REFERRAL FLOW (agreed):
  1. Signup does NOT unlock referrals — the card stays locked.
  2. Referral link/earnings unlock only after the client's OWN first
     deposit is APPROVED (profiles.referral_unlocked, flipped by a DB
     trigger on the SQL side — next step).
  3. Pending / rejected deposits never generate commission.
  4. A referred client's APPROVED deposit generates commission for the
     referrer (deposit amount × current commission rate). One commission
     per deposit, ever (enforced by a unique constraint on the SQL side).
  5. Self-referral and multiple referrers per client are not allowed
     (enforced by the DB trigger that sets profiles.referred_by).
  6. Commission rate is a single admin-editable setting, not hardcoded
     per client — DEFAULT_REFERRAL_RATE above is only a display fallback
     until the real rate loads from get_referral_dashboard().

This section only handles the CLIENT-facing half: capturing an incoming
?ref=CODE, sending it along at signup, and rendering the dashboard card
(locked vs unlocked) with the client's own link, stats, and
copy/share actions. The unlock flag, referrals count, deposit totals and
earnings themselves are all computed server-side by get_referral_dashboard(),
so this file never has to compute money totals itself.
*/

/* Reads ?ref=CODE from the current URL (if present) and remembers it in
   sessionStorage so it survives from landing page -> scrolling down ->
   opening the signup modal -> submitting the form. Called once on
   page load. */
function captureReferralCodeFromUrl(){
try{
const params=new URLSearchParams(window.location.search);
const ref=params.get('ref');
if(ref){
sessionStorage.setItem(REFERRAL_STORAGE_KEY,ref.trim());
/* Pre-fill the signup form's Partner code field too, so a visitor who
   arrived via a referral link sees their code already in place instead
   of having to type it manually. */
const field=$('partnerCode');
if(field&&!field.value)field.value=ref.trim();
/* Referral code alone shouldn't be treated as an ask to log in —
   just remember it and let the visitor browse normally. */
}
}catch(err){
console.error('Referral code capture error:',err);
}
}

function getStoredReferralCode(){
try{
return sessionStorage.getItem(REFERRAL_STORAGE_KEY)||'';
}catch(err){
return '';
}
}

/*
Loads this client's referral dashboard data via a single RPC
(get_referral_dashboard, SQL side) and renders the locked/unlocked
card. Expected shape (finalized alongside the SQL step):
  {
    referral_code: 'PZ8K4M2',
    referral_unlocked: true|false,
    referrals_count: 5,
    referred_deposits_total: 1200.00,
    earnings_total: 24.00,
    commission_rate: 0.02
  }
*/
async function loadReferralInfo(){
if(!currentUser||!supabaseReady)return;
const lockedEl=$('referralLocked');
const unlockedEl=$('referralUnlocked');
if(!lockedEl||!unlockedEl)return;

try{
const {data,error}=await supabaseClient.rpc('get_referral_dashboard');
if(error){console.error('Referral dashboard error:',error);return}

const info=data||{};
const unlocked=!!info.referral_unlocked;

lockedEl.style.display=unlocked?'none':'block';
unlockedEl.style.display=unlocked?'block':'none';

if(unlocked){
const code=info.referral_code||'';
const link=window.location.origin+window.location.pathname+'?ref='+encodeURIComponent(code);
const linkField=$('referralLinkField');
if(linkField)linkField.value=link;

const countEl=$('referralCount');
const depositsEl=$('referralDeposits');
const earningsEl=$('referralEarnings');
if(countEl)countEl.textContent=Number(info.referrals_count||0).toLocaleString();
if(depositsEl)depositsEl.textContent='$'+Number(info.referred_deposits_total||0).toFixed(2);
if(earningsEl)earningsEl.textContent='$'+Number(info.earnings_total||0).toFixed(2);
}
}catch(err){
console.error('Referral dashboard error:',err);
}finally{
/* Whether the card ended up locked or unlocked (or the RPC failed),
   the referral stat values are no longer "still loading" — drop their
   shimmer placeholders either way so nothing shimmers forever. */
clearReferralSkeleton();
}
}

function copyReferralLink(){
const field=$('referralLinkField');
if(!field||!field.value)return;
navigator.clipboard?.writeText(field.value).then(()=>{
showMsg('referralMsg','Referral link copied to clipboard.',false);
}).catch(()=>{});
}

function shareReferralLink(){
const field=$('referralLinkField');
if(!field||!field.value)return;
if(navigator.share){
navigator.share({title:'PipZoNe',text:'Join PipZoNe using my referral link:',url:field.value}).catch(()=>{});
}else{
copyReferralLink();
}
}

/* -------------------------- 31. Live market widgets (BTC & Gold candlestick charts) --------------------------
   Renders real candlestick charts using the free TradingView
   "lightweight-charts" library (loaded via CDN in index.html <head>).

   • BTC/USDT candles come straight from Binance's public klines endpoint
     — no API key needed, real historical OHLC candles, CORS-enabled, so
     the chart is fully populated the instant it loads, and every visitor
     (phone or desktop) sees the exact same candles because they all pull
     from the same public feed.

   • XAU/USD (Gold) candles are built LIVE from GoldAPI.io. GoldAPI's
     endpoint used here only returns the CURRENT price (not a full
     intraday candle history on the free/standard plan), so instead of
     faking historical candles, this polls the live price on an interval
     and builds real candles client-side as new prices arrive. The chart
     starts with a single flat candle and fills in as time passes — this
     is the honest tradeoff of using a live spot-price feed instead of a
     dedicated OHLC history provider.

   ⚠️ SETUP REQUIRED — fill in GOLDAPI_KEY below with your real key.

   ⚠️ SECURITY NOTE — this key is called directly from the browser, which
   means anyone can see it via their browser's dev tools (Network tab).
   That's an accepted tradeoff for a static site with no backend, but if
   you want the key fully hidden, route this fetch through a small
   server-side proxy (e.g. a Supabase Edge Function) instead of calling
   goldapi.io directly from here — happy to build that if wanted.

   ⚠️ RATE LIMITS — GoldAPI plans have a limited number of requests. This
   polls once every GOLD_POLL_MS regardless of how many gold charts are
   on screen (hero + big section share one poll), so raise GOLD_POLL_MS
   if you're on a lower-tier plan. */

const GOLDAPI_KEY='YOUR_GOLDAPI_KEY_HERE';
const GOLDAPI_URL='https://www.goldapi.io/api/XAU/USD';
const BINANCE_KLINES_URL='https://api.binance.com/api/v3/klines';
const GOLD_POLL_MS=20000; // how often to poll GoldAPI for a new live price tick
const BTC_REFRESH_MS=4000; // how often to re-pull the latest BTC candles from Binance

const TF_CONFIG={
'1m':{binanceInterval:'1m',bucketMs:60*1000},
'5m':{binanceInterval:'5m',bucketMs:5*60*1000},
'15m':{binanceInterval:'15m',bucketMs:15*60*1000},
'1h':{binanceInterval:'1h',bucketMs:60*60*1000},
'4h':{binanceInterval:'4h',bucketMs:4*60*60*1000}
};

/* Mirrors the --profit/--loss/--soft/--muted CSS variables in mainsite.css
   so the charts match the site's dark green/gold theme. Hardcoded here
   because the charting library needs literal color values, not CSS vars. */
const CHART_COLORS={up:'#5EEAB0',down:'#F2735E',grid:'#1F2622',text:'#8B9992'};

let heroAsset='BTC';
let heroTf='1m';
let bigTf='1m';

let goldTickTimer=null;

/* Every rendered chart lives in this array as one entry:
   {chart, series, kind:'BTC'|'XAU', tf, priceEl, changeEl, pollTimer, lastCandle, firstPrice} */
const liveCharts=[];

function makeCandleChart(containerId){
const el=$(containerId);
if(!el||typeof LightweightCharts==='undefined')return null;
el.innerHTML='';
const chart=LightweightCharts.createChart(el,{
width:el.clientWidth,
height:el.clientHeight,
layout:{background:{type:'solid',color:'transparent'},textColor:CHART_COLORS.text,fontFamily:"'IBM Plex Mono',monospace",fontSize:11},
grid:{vertLines:{color:CHART_COLORS.grid},horzLines:{color:CHART_COLORS.grid}},
rightPriceScale:{borderColor:CHART_COLORS.grid},
timeScale:{borderColor:CHART_COLORS.grid,timeVisible:true,secondsVisible:false},
crosshair:{mode:0}
});
const series=chart.addCandlestickSeries({
upColor:CHART_COLORS.up,downColor:CHART_COLORS.down,
borderUpColor:CHART_COLORS.up,borderDownColor:CHART_COLORS.down,
wickUpColor:CHART_COLORS.up,wickDownColor:CHART_COLORS.down
});
const resizeHandler=()=>chart.applyOptions({width:el.clientWidth,height:el.clientHeight});
window.addEventListener('resize',resizeHandler);
return {chart,series,resizeHandler};
}

function destroyChartEntry(entry){
if(!entry)return;
if(entry.pollTimer)clearInterval(entry.pollTimer);
if(entry.resizeHandler)window.removeEventListener('resize',entry.resizeHandler);
try{entry.chart.remove()}catch(e){}
const idx=liveCharts.indexOf(entry);
if(idx>-1)liveCharts.splice(idx,1);
}

/* ---- BTC: real historical candles from Binance ---- */
async function loadBinanceCandles(tf,limit=120){
try{
const res=await fetch(BINANCE_KLINES_URL+'?symbol=BTCUSDT&interval='+TF_CONFIG[tf].binanceInterval+'&limit='+limit);
if(!res.ok)throw new Error('Binance request failed: '+res.status);
const rows=await res.json();
return rows.map(r=>({time:Math.floor(r[0]/1000),open:+r[1],high:+r[2],low:+r[3],close:+r[4]}));
}catch(err){
console.error('Binance candles error:',err);
return [];
}
}

async function refreshBtcChart(entry){
const candles=await loadBinanceCandles(entry.tf);
if(!candles.length)return;
entry.series.setData(candles);
entry.chart.timeScale().fitContent();
const last=candles[candles.length-1];
const first=candles[0];
updatePriceDisplay(entry.priceEl,entry.changeEl,last.close,first.open);
}

/* Re-fetches the full candle set from Binance every BTC_REFRESH_MS so the
   last (still-forming) candle keeps updating live rather than only
   showing closed candles. */
function startBtcPolling(entry){
refreshBtcChart(entry);
entry.pollTimer=setInterval(()=>refreshBtcChart(entry),BTC_REFRESH_MS);
}

/* ---- Gold: live candles built tick-by-tick from GoldAPI ---- */
async function fetchGoldPrice(){
try{
const res=await fetch(GOLDAPI_URL,{headers:{'x-access-token':GOLDAPI_KEY}});
if(!res.ok)throw new Error('GoldAPI request failed: '+res.status);
const data=await res.json();
return Number(data.price);
}catch(err){
console.error('GoldAPI price error:',err);
return null;
}
}

function upsertGoldCandle(entry,price){
if(!Number.isFinite(price))return;
const bucketMs=TF_CONFIG[entry.tf].bucketMs;
const bucketTime=Math.floor(Date.now()/bucketMs)*bucketMs/1000; // seconds, aligned to the timeframe bucket

if(!entry.lastCandle||entry.lastCandle.time!==bucketTime){
entry.lastCandle={time:bucketTime,open:price,high:price,low:price,close:price};
}else{
entry.lastCandle.high=Math.max(entry.lastCandle.high,price);
entry.lastCandle.low=Math.min(entry.lastCandle.low,price);
entry.lastCandle.close=price;
}
entry.series.update(entry.lastCandle);

if(!entry.firstPrice)entry.firstPrice=price;
updatePriceDisplay(entry.priceEl,entry.changeEl,price,entry.firstPrice);
}

/* Every currently-visible gold chart shares one poll loop, so only one
   GoldAPI request goes out at a time no matter how many gold charts are
   on screen (hero card + the big Markets section). */
function goldEntries(){return liveCharts.filter(e=>e.kind==='XAU')}

async function pollGold(){
const price=await fetchGoldPrice();
if(price===null)return;
goldEntries().forEach(entry=>upsertGoldCandle(entry,price));
}

function ensureGoldPolling(){
if(goldTickTimer)return;
pollGold();
goldTickTimer=setInterval(pollGold,GOLD_POLL_MS);
}

function updatePriceDisplay(priceEl,changeEl,price,refPrice){
if(priceEl)priceEl.textContent='$'+price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
if(changeEl&&Number.isFinite(refPrice)&&refPrice>0){
const diff=price-refPrice;
const pct=(diff/refPrice)*100;
changeEl.textContent=(diff>=0?'+':'')+diff.toFixed(2)+' ('+(diff>=0?'+':'')+pct.toFixed(2)+'%)';
changeEl.classList.toggle('up',diff>=0);
changeEl.classList.toggle('down',diff<0);
}
}

/* ---- Wiring: hero mini card (asset tabs + timeframe chips) ---- */
let heroEntry=null;

function buildHeroChart(){
destroyChartEntry(heroEntry);
const built=makeCandleChart('heroChart');
if(!built)return;
heroEntry={...built,kind:heroAsset,tf:heroTf,priceEl:$('heroPrice'),changeEl:$('heroChange'),lastCandle:null,firstPrice:null};
liveCharts.push(heroEntry);
if(heroAsset==='BTC'){
startBtcPolling(heroEntry);
}else{
ensureGoldPolling();
}
}

function switchHeroAsset(asset){
heroAsset=asset;
document.querySelectorAll('#heroAssetTabs .market-tab').forEach(b=>b.classList.toggle('active',b.dataset.asset===asset));
buildHeroChart();
}

/* ---- Wiring: big Markets section (two permanent panels) ---- */
let bigBtcEntry=null;
let bigGoldEntry=null;

function buildBigCharts(){
destroyChartEntry(bigBtcEntry);
destroyChartEntry(bigGoldEntry);

const builtBtc=makeCandleChart('bigBtcChart');
if(builtBtc){
bigBtcEntry={...builtBtc,kind:'BTC',tf:bigTf,priceEl:$('bigBtcPrice'),changeEl:$('bigBtcChange')};
liveCharts.push(bigBtcEntry);
startBtcPolling(bigBtcEntry);
}

const builtGold=makeCandleChart('bigGoldChart');
if(builtGold){
bigGoldEntry={...builtGold,kind:'XAU',tf:bigTf,priceEl:$('bigGoldPrice'),changeEl:$('bigGoldChange'),lastCandle:null,firstPrice:null};
liveCharts.push(bigGoldEntry);
ensureGoldPolling();
}
}

function wireTfRow(containerId,onChange){
const row=$(containerId);
if(!row)return;
row.querySelectorAll('.tf-chip').forEach(btn=>{
btn.addEventListener('click',()=>{
row.querySelectorAll('.tf-chip').forEach(b=>b.classList.remove('active'));
btn.classList.add('active');
onChange(btn.dataset.tf);
});
});
}

function initLiveMarkets(){
if(typeof LightweightCharts==='undefined'){
console.error('lightweight-charts failed to load — live market charts disabled.');
return;
}
wireTfRow('heroTfRow',(tf)=>{heroTf=tf;buildHeroChart()});
wireTfRow('marketsTfRow',(tf)=>{bigTf=tf;buildBigCharts()});
buildHeroChart();
buildBigCharts();
}

/* -------------------------- 25. Page bootstrap / event listeners -------------------------- */
document.addEventListener('DOMContentLoaded',async function(){
if(!initSupabase())return;
captureReferralCodeFromUrl();
updateCalculator();
loadLiveStats();
selectDepositNetwork('TRC20');
initLiveMarkets();

const slider=$('amtSlider');
if(slider)slider.addEventListener('input',updateCalculator);

const proofInput=$('depositProof');
if(proofInput)proofInput.addEventListener('change',()=>{
const f=proofInput.files?.[0];
$('depositProofName').textContent=f?f.name:'';
});

const attachmentInput=$('contactAttachment');
if(attachmentInput)attachmentInput.addEventListener('change',()=>{
const f=attachmentInput.files?.[0];
$('contactAttachmentName').textContent=f?f.name:'';
});

const supportAttachmentInput=$('supportAttachment');
if(supportAttachmentInput)supportAttachmentInput.addEventListener('change',()=>{
const f=supportAttachmentInput.files?.[0];
$('supportAttachmentName').textContent=f?f.name:'';
});

const wAmtInput=$('withdrawalAmount');
const signupPasswordInput=$('signupPassword');
if(signupPasswordInput)signupPasswordInput.addEventListener('input',()=>{
updatePasswordRulesUI(signupPasswordInput.value);
});
if(wAmtInput)wAmtInput.addEventListener('input',updateWithdrawalCalc);

document.querySelectorAll('.faq-q').forEach(q=>q.addEventListener('click',()=>q.parentElement.classList.toggle('open')));

document.querySelectorAll('#loginForm input,#signupForm input,#resetPasswordForm input,#newPasswordForm input').forEach(input=>input.addEventListener('keydown',e=>{
if(e.key==='Enter'){
e.preventDefault();
if($('loginForm').style.display!=='none'){login()}
else if($('signupForm').style.display!=='none'){signup()}
else if($('resetPasswordForm').style.display!=='none'){sendResetEmail()}
else if($('newPasswordForm').style.display!=='none'){updatePassword()}
}
}));

supabaseClient.auth.onAuthStateChange((event,session)=>{
if(event==='PASSWORD_RECOVERY'){
setTimeout(()=>{showNewPasswordForm()},0);
}
});

document.addEventListener('keydown',e=>{
if(e.key==='Escape'){
if(modal.classList.contains('show'))closeAuth();
if($('depositModal')?.classList.contains('show'))closeRequest('deposit');
if($('withdrawalModal')?.classList.contains('show'))closeRequest('withdrawal');
if($('completeProfileModal')?.classList.contains('show'))closeCompleteProfile();
if($('accountMenuPopup')?.classList.contains('show'))closeAccountMenu();
if($('viewProfileModal')?.classList.contains('show'))closeViewProfile();
if($('teamModal')?.classList.contains('show'))closeTeam();
if($('inviteModal')?.classList.contains('show'))closeInviteMembers();
if($('supportModal')?.classList.contains('show'))closeSupport();
if($('notifDetailModal')?.classList.contains('show')){closeNotifDetail()}
else{closeNotifications()}
}
});

document.querySelectorAll('.modal,.request-modal').forEach(m=>m.addEventListener('click',e=>{
if(e.target!==m)return;
if(m.id==='authModal')closeAuth();
if(m.id==='depositModal')closeRequest('deposit');
if(m.id==='withdrawalModal')closeRequest('withdrawal');
if(m.id==='completeProfileModal')closeCompleteProfile();
if(m.id==='viewProfileModal')closeViewProfile();
if(m.id==='teamModal')closeTeam();
if(m.id==='inviteModal')closeInviteMembers();
if(m.id==='supportModal')closeSupport();
}));

try{
const {data}=await supabaseClient.auth.getSession();
const recoveryHash=window.location.hash.includes('type=recovery');
const recoverySearch=window.location.search.includes('type=recovery');
const isRecovery=recoveryHash||recoverySearch;
if(isRecovery&&data?.session){showNewPasswordForm()}
else if(data?.session){await loadDashboard()}
}catch(err){console.error('Session check error:',err)}
});
