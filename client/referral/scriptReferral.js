"use strict";

const $=id=>document.getElementById(id);
let supabaseClient=null;
let referralLink="";
let referralUnlocked=false;

const themeToggle=$("themeToggle");
const themeIcon=$("themeIcon");
const copyRefLinkBtn=$("copyRefLinkBtn");
const copyRefBtnLabel=$("copyRefBtnLabel");
const referralLinkText=$("referralLinkText");
const referralUnlockedView=$("referralUnlockedView");
const referralLockedView=$("referralLockedView");
const programStatus=$("programStatus");
const toastContainer=$("toastContainer");

const money=value=>Number(value||0).toLocaleString("en-US",{
minimumFractionDigits:2,
maximumFractionDigits:2
});

function initTheme(){
const savedTheme=localStorage.getItem("pipzone_theme")||"dark";
document.documentElement.setAttribute("data-theme",savedTheme);
if(themeIcon)themeIcon.textContent=savedTheme==="light"?"☀":"☾";
}

function toggleTheme(){
const current=document.documentElement.getAttribute("data-theme")||"dark";
const next=current==="light"?"dark":"light";
document.documentElement.setAttribute("data-theme",next);
localStorage.setItem("pipzone_theme",next);
if(themeIcon)themeIcon.textContent=next==="light"?"☀":"☾";
}

function showToast(message,type="success"){
if(!toastContainer)return;
const toast=document.createElement("div");
toast.className=`toast ${type}`;
toast.textContent=message;
toastContainer.appendChild(toast);
setTimeout(()=>{
toast.style.opacity="0";
toast.style.transform="translateY(8px)";
toast.style.transition=".2s ease";
setTimeout(()=>toast.remove(),220);
},3000);
}

function setReferralState(unlocked){
referralUnlocked=Boolean(unlocked);

if(referralUnlockedView)
referralUnlockedView.classList.toggle("hidden",!referralUnlocked);

if(referralLockedView)
referralLockedView.classList.toggle("hidden",referralUnlocked);

if(programStatus){
programStatus.textContent=referralUnlocked?"ACTIVE":"LOCKED";
programStatus.style.color=referralUnlocked?"var(--profit)":"var(--muted)";
programStatus.style.borderColor=referralUnlocked?"var(--green-border)":"var(--border)";
programStatus.style.background=referralUnlocked?"var(--green-soft)":"rgba(141,154,168,.09)";
}
}

function updateStats({referrals=0,capital=0,rewards=0}={}){
const total=$("totalReferrals");
const capitalElement=document.querySelector(".ref-stat-box:nth-child(2) .ref-stat-num");
const rewardsElement=document.querySelector(".ref-stat-box:nth-child(3) .ref-stat-num");

if(total)total.textContent=Number(referrals||0).toLocaleString("en-US");
if(capitalElement)capitalElement.textContent="$"+money(capital);
if(rewardsElement)rewardsElement.textContent="+$"+money(rewards);
}

function getSignupBase(){
const path=window.location.pathname;

if(path.startsWith("/pipzone/"))
return `${window.location.origin}/pipzone/signup/`;

return `${window.location.origin}/signup/`;
}

function updateReferralLink(code){
referralLink=code?`${getSignupBase()}?ref=${encodeURIComponent(code)}`:"";

if(referralLinkText)
referralLinkText.textContent=referralLink||"Referral code is not available";
}

function updateCommissionRates(lowRate,highRate){
const low=Number(lowRate);
const high=Number(highRate);

const tierRates=document.querySelectorAll(".reward-tier strong");
if(tierRates[0])tierRates[0].textContent=`${low}%`;
if(tierRates[1])tierRates[1].textContent=`${high}%`;

const cardRates=document.querySelectorAll(".reward-percent");
if(cardRates[0])cardRates[0].textContent=`${low}%`;
if(cardRates[1])cardRates[1].textContent=`${high}%`;

const descriptions=document.querySelectorAll(".reward-card p");

if(descriptions[0]){
descriptions[0].textContent=
`When an invited partner makes an approved capital deposit of $499.99 or less, the eligible referral reward is ${low}%.`;
}

if(descriptions[1]){
descriptions[1].textContent=
`When an invited partner makes an approved capital deposit of $500 or more, the eligible referral reward is ${high}%.`;
}

const examples=document.querySelectorAll(".reward-example strong");

if(examples[0])
examples[0].textContent=`$400 deposit → $${money(400*low/100)} reward`;

if(examples[1])
examples[1].textContent=`$1,000 deposit → $${money(1000*high/100)} reward`;

const rules=document.querySelectorAll(".referral-rules li");

if(rules[1])
rules[1].textContent=`Deposits of $499.99 or less qualify for a ${low}% referral reward.`;

if(rules[2])
rules[2].textContent=`Deposits of $500 or more qualify for a ${high}% referral reward.`;
}

async function loadReferralPage(){
if(
typeof supabase==="undefined"||
typeof SUPABASE_URL==="undefined"||
typeof SUPABASE_PUBLISHABLE_KEY==="undefined"
){
showToast("Supabase configuration could not be loaded.","error");
return;
}

supabaseClient=window.supabaseClient;
if(!supabaseClient){
showToast("Supabase client could not be initialized.","error");
return;
}

const {data:authData,error:authError}=await supabaseClient.auth.getUser();
const user=authData?.user;

if(authError||!user){
updateStats();
updateReferralLink("");
setReferralState(false);
showToast("Please sign in to view your referral information.","error");
return;
}

// Load the existing referral dashboard RPC and public commission settings.
const [dashboardResult,settingsResult]=await Promise.all([
supabaseClient.rpc("get_referral_dashboard"),

supabaseClient
  .from("app_settings")
  .select("key,value")
  .in("key",[
    "referral_commission_rate_low",
    "referral_commission_rate_high"
  ])

]);

if(dashboardResult.error){
console.error("Referral dashboard error:",dashboardResult.error);
updateStats();
updateReferralLink("");
setReferralState(false);
showToast("Could not load your referral information.","error");
return;
}

// Support either a single JSON object or a one-row RPC result.
const rawData=dashboardResult.data;
const info=Array.isArray(rawData)?(rawData[0]||{}):(rawData||{});

updateReferralLink(info.referral_code||"");
setReferralState(info.referral_unlocked===true);

// Stats are returned by the existing function; do not query commission
// records or referred profiles directly from the client.
updateStats({
referrals:info.referrals_count,
capital:info.referred_deposits_total,
rewards:info.earnings_total
});

if(settingsResult.error){
console.error("Referral commission settings error:",settingsResult.error);
showToast("Commission rates could not be loaded from settings.","error");
return;
}

const settings=settingsResult.data||[];
const lowSetting=settings.find(item=>item.key==="referral_commission_rate_low");
const highSetting=settings.find(item=>item.key==="referral_commission_rate_high");

const lowRate=Number(lowSetting?.value);
const highRate=Number(highSetting?.value);

if(
lowSetting?.value!==undefined&&
highSetting?.value!==undefined&&
Number.isFinite(lowRate)&&
Number.isFinite(highRate)
){
updateCommissionRates(lowRate,highRate);
}else{
console.error("Referral commission settings are missing:",settings);
showToast("Commission rates could not be loaded from settings.","error");
}
}

async function copyReferralLink(){
if(!referralLink){
showToast("Your referral link is not available yet.","error");
return;
}

try{
await navigator.clipboard.writeText(referralLink);
}catch(error){
const input=document.createElement("textarea");
input.value=referralLink;
input.style.position="fixed";
input.style.opacity="0";
document.body.appendChild(input);
input.select();

```
let copied=false;
try{
  copied=document.execCommand("copy");
}catch(e){}

input.remove();

if(!copied){
  showToast("Unable to copy the referral link.","error");
  return;
}
```

}

if(copyRefBtnLabel)copyRefBtnLabel.textContent="Copied";
showToast("Referral link copied successfully.");

setTimeout(()=>{
if(copyRefBtnLabel)copyRefBtnLabel.textContent="Copy";
},1800);
}

function initReferral(){
initTheme();
setReferralState(false);
updateStats();

if(themeToggle)
themeToggle.addEventListener("click",toggleTheme);

if(copyRefLinkBtn)
copyRefLinkBtn.addEventListener("click",copyReferralLink);

loadReferralPage().catch(error=>{
console.error("Referral page error:",error);
showToast("Unable to load referral information.","error");
});
}

document.addEventListener("DOMContentLoaded",initReferral);
