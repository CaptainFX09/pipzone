'use strict';
(function(){
const SUPABASE_URL='https://nzasmkplxzirnqeteclv.supabase.co';
const SUPABASE_KEY='sb_publishable_ywmF35YANKsFEdZOs8wDdQ__jIezHTF';

const $=id=>document.getElementById(id);

let client=null;
let currentAccount=null;
let initialized=false;
let syncing=false;
let activeCycleId=null;
let countdownTimer=null;
let settling=false;

function money(value){
return '$'+Number(value||0).toFixed(2);
}

function showMessage(text,error=false){
const el=$('tradeMsg')||$('tradeCodeMsg');

if(!el)return;

el.textContent=text;
el.style.color=error?'var(--loss)':'var(--profit)';
el.classList.add('show');
el.style.display='block';
}

function clearMessage(){
const el=$('tradeMsg')||$('tradeCodeMsg');

if(!el)return;

el.textContent='';
el.classList.remove('show');
el.style.display='none';
}

function showCountdown(value){
const box=$('tradeCountdownBox');
const text=$('tradeCountdown');

if(box){
box.style.display='block';
}

if(text){
text.textContent=String(
Math.max(0,Number(value)||0)
);
}
}

function hideCountdown(){
const box=$('tradeCountdownBox');

if(box){
box.style.display='none';
}
}

function showResult(text,amount,balance){
const box=$('tradeResultBox');
const result=$('tradeResult');

if(box){
box.style.display='block';
}

if(!result)return;

const numericAmount=Math.abs(
Number(amount)||0
);

const numericBalance=Number(balance)||0;

result.textContent=
text+
' '+
(amount>=0?'+':'-')+
money(numericAmount)+
' — Balance: '+
money(numericBalance);

result.style.color=
text==='PROFIT'
?'var(--profit)'
:'var(--loss)';
}

function hideResult(){
const box=$('tradeResultBox');
const result=$('tradeResult');

if(box){
box.style.display='none';
}

if(result){
result.textContent='';
}
}

function setTradeButtonsDisabled(disabled){
const buttons=[
$('buyTradeBtn'),
$('sellTradeBtn')
];

buttons.forEach(button=>{
if(button){
button.disabled=disabled;
}
});
}

async function initSupabase(){
if(client){
return true;
}

if(!window.supabase){
console.error(
'Supabase library not loaded.'
);
return false;
}

client=window.supabase.createClient(
SUPABASE_URL,
SUPABASE_KEY
);

return true;
}

async function loadAccount(){
if(!client){
return false;
}

const {
data:{
session
},
error:sessionError
}=await client.auth.getSession();

if(
sessionError||
!session||
!session.user
){
return false;
}

const {
data,
error
}=await client
.from('accounts')
.select(
'id,balance,initial_balance,profit,first_deposit_at,total_withdrawn'
)
.eq(
'user_id',
session.user.id
)
.limit(1)
.maybeSingle();

if(error){
console.error(
'Trade account load error:',
error
);
return false;
}

currentAccount=data||null;

return !!currentAccount;
}

function getBalance(){
return Math.max(
0,
Number(
currentAccount?.balance||0
)
);
}

function syncAmount(value){
const max=getBalance();

const numericValue=Number(value);

const safe=Math.max(
0,
Math.min(
max,
Number.isFinite(numericValue)
?numericValue
:0
)
);

const input=$('tradeBalanceAmount');
const slider=$('tradeBalanceSlider');

if(input){
input.max=max.toFixed(2);
input.value=safe.toFixed(2);
}

if(slider){
slider.min='0';
slider.max=max.toFixed(2);
slider.step='0.01';
slider.value=safe.toFixed(2);
slider.disabled=max<=0;
}

const min=$('tradeBalanceMin');
const maxEl=$('tradeBalanceMax');

if(min){
min.textContent='$0.00';
}

if(maxEl){
maxEl.textContent=money(max);
}
}

function getTradeCode(){
return $('tradeCodeInput')?.value.trim()||'';
}

function getSelectedAmount(){
return Number(
$('tradeBalanceAmount')?.value
);
}

function startCountdown(settleAt,cycleId){
const settleTime=Date.parse(settleAt);

if(!Number.isFinite(settleTime)){
return false;
}

if(countdownTimer){
clearInterval(countdownTimer);
countdownTimer=null;
}

const update=()=>{
if(activeCycleId!==cycleId){
if(countdownTimer){
clearInterval(countdownTimer);
countdownTimer=null;
}
return;
}

const millisecondsLeft=
settleTime-Date.now();

const secondsLeft=Math.ceil(
millisecondsLeft/1000
);

if(secondsLeft<=0){
showCountdown(0);

if(countdownTimer){
clearInterval(countdownTimer);
countdownTimer=null;
}

return;
}

showCountdown(
Math.min(30,secondsLeft)
);
};

update();

countdownTimer=setInterval(
update,
250
);

return true;
}

function stopCountdown(){
if(countdownTimer){
clearInterval(countdownTimer);
countdownTimer=null;
}
}

async function settleTradeCycle(cycleId){
if(settling){
return;
}

settling=true;

try{

const {
data,
error
}=await client.rpc(
'settle_trade_cycle',
{
p_cycle_id:cycleId
}
);

if(error){
throw error;
}

const result=data||{};

const success=
result.success===undefined
?true
:Boolean(result.success);

if(!success){
showMessage(
'Trade could not be settled.',
true
);

settling=false;
return;
}

const resultText=
String(
result.result||''
).toLowerCase();

const adjustment=
Number(
result.adjustment_amount||0
);

const balanceAfter=
Number(
result.balance_after||0
);

currentAccount.balance=
balanceAfter;

if(
result.profit_after!==undefined
){
currentAccount.profit=
Number(
result.profit_after||0
);
}

stopCountdown();

showCountdown(0);

showResult(
resultText==='profit'
?'PROFIT'
:'LOSS',
adjustment,
balanceAfter
);

if($('tradeCodeInput')){
$('tradeCodeInput').value='';
}

syncAmount(0);

activeCycleId=null;

setTradeButtonsDisabled(false);

if(
typeof window.renderAccountSummary==='function'
){
try{
await window.renderAccountSummary(
currentAccount
);
}catch(e){
console.warn(
'Account summary refresh failed:',
e
);
}
}

if(
typeof window.loadNotifications==='function'
){
try{
await window.loadNotifications();
}catch(e){
console.warn(
'Notification refresh failed:',
e
);
}
}

settling=false;

}catch(error){

console.error(
'Trade settlement error:',
error
);

const errorText=
error?.message?.toLowerCase()||'';

if(
errorText.includes('too early')||
errorText.includes('not ready')||
errorText.includes('30')
){

settling=false;

setTimeout(
()=>{
if(
activeCycleId===cycleId
){
settleTradeCycle(cycleId);
}
},
1000
);

return;
}

showMessage(
'Unable to settle trade. Please try again.',
true
);

settling=false;
}
}

async function startTradeCycle(clientDirection){
if(syncing){
return;
}

clearMessage();
hideResult();

if(activeCycleId){
showMessage(
'Another trade is already running.',
true
);
return;
}

if(!client){
showMessage(
'Please log in again.',
true
);
return;
}

const amount=getSelectedAmount();
const code=getTradeCode();
const max=getBalance();

if(
!Number.isFinite(amount)||
amount<=0
){
showMessage(
'Enter a valid balance amount.',
true
);
return;
}

if(amount>max+0.001){
showMessage(
'Selected amount cannot exceed your current balance.',
true
);

syncAmount(max);
return;
}

if(!code){
showMessage(
'Enter your trade code.',
true
);
return;
}

const direction=
String(
clientDirection||''
).toLowerCase();

if(
direction!=='buy'&&
direction!=='sell'
){
showMessage(
'Invalid trade direction.',
true
);
return;
}

syncing=true;

setTradeButtonsDisabled(true);

try{

const {
data,
error
}=await client.rpc(
'start_trade_cycle',
{
p_code:code,
p_selected_amount:Number(
amount.toFixed(2)
),
p_client_direction:direction
}
);

if(error){
throw error;
}

const result=data||{};

const cycleId=
Number(
result.cycle_id
);

const settleAt=
result.settle_at;

if(
!Number.isFinite(cycleId)||
!settleAt
){
throw new Error(
'Unable to start trade. Please try again.'
);
}

const settleTime=
Date.parse(settleAt);

if(!Number.isFinite(settleTime)){
throw new Error(
'Unable to start trade timer.'
);
}

activeCycleId=cycleId;
settling=false;

showCountdown(30);

if(
!startCountdown(
settleAt,
cycleId
)
){
throw new Error(
'Unable to start trade timer.'
);
}

const waitAndSettle=async()=>{
if(
activeCycleId!==cycleId
){
return;
}

const remaining=
settleTime-Date.now();

if(remaining>0){
setTimeout(
waitAndSettle,
Math.min(250,remaining)
);
return;
}

await new Promise(
resolve=>{
setTimeout(
resolve,
500
);
}
);

if(
activeCycleId===cycleId
){
await settleTradeCycle(
cycleId
);
}
};

waitAndSettle();

}catch(error){

console.error(
'Trade cycle error:',
error
);

stopCountdown();

activeCycleId=null;

const errorText=
error?.message?.toLowerCase()||'';

if(
errorText.includes('expired')
){
showMessage(
'Trade code has expired.',
true
);

}else if(
errorText.includes('already been used')||
errorText.includes('already used')
){
showMessage(
'This trade code has already been used.',
true
);

}else if(
errorText.includes('trade code not found')||
errorText.includes('code not found')||
errorText.includes('invalid trade code')
){
showMessage(
'Invalid trade code.',
true
);

}else if(
errorText.includes('selected amount exceeds')
){
showMessage(
'Selected amount exceeds your current balance.',
true
);

}else if(
errorText.includes('no trading account')
){
showMessage(
'No trading account found.',
true
);

}else if(
errorText.includes('another trade cycle')||
errorText.includes('trade cycle is already running')
){
showMessage(
'Another trade is already running.',
true
);

}else{
showMessage(
'Unable to start trade. Please try again later.',
true
);
}

setTradeButtonsDisabled(false);

}finally{

syncing=false;

}
}

window.startTradeCycle=
startTradeCycle;

window.startBuyTrade=function(){
startTradeCycle('buy');
};

window.startSellTrade=function(){
startTradeCycle('sell');
};

async function init(){
if(initialized){
return true;
}

if(
!$('tradeBalanceAmount')||
!$('tradeBalanceSlider')||
!$('tradeCodeInput')||
!$('buyTradeBtn')||
!$('sellTradeBtn')
){
return false;
}

const ready=
await initSupabase();

if(!ready){
return false;
}

const accountLoaded=
await loadAccount();

if(!accountLoaded){
console.warn(
'Unable to load trading account.'
);
return false;
}

initialized=true;

syncAmount(
getBalance()
);

hideCountdown();
hideResult();
clearMessage();

setTradeButtonsDisabled(false);

const amountInput=
$('tradeBalanceAmount');

const slider=
$('tradeBalanceSlider');

amountInput.addEventListener(
'input',
function(){
syncAmount(
this.value
);
}
);

slider.addEventListener(
'input',
function(){
syncAmount(
this.value
);
}
);

$('buyTradeBtn').addEventListener(
'click',
function(){
startTradeCycle('buy');
}
);

$('sellTradeBtn').addEventListener(
'click',
function(){
startTradeCycle('sell');
}
);

return true;
}

async function boot(){
const ready=await init();

if(ready){
return;
}

setTimeout(
boot,
500
);
}

if(
document.readyState==='loading'
){
document.addEventListener(
'DOMContentLoaded',
boot
);
}else{
boot();
}

})();
