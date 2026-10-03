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
const el=$('tradeCodeMsg')||$('tradeMsg');
if(!el)return;
el.textContent=text;
el.style.color=error?'var(--loss)':'var(--profit)';
el.classList.add('show');
el.style.display='block';
}

function clearMessage(){
const el=$('tradeCodeMsg')||$('tradeMsg');
if(!el)return;
el.textContent='';
el.classList.remove('show');
el.style.display='none';
}

function showCountdown(value){
const box=$('tradeCountdownBox');
const text=$('tradeCountdown');
if(box)box.style.display='block';
if(text)text.textContent=String(Math.max(0,value));
}

function hideCountdown(){
const box=$('tradeCountdownBox');
if(box)box.style.display='none';
}

function showResult(text,amount,balance){
const box=$('tradeResultBox');
const result=$('tradeResult');

if(box)box.style.display='block';

if(result){
result.textContent=
text+
' '+
(amount>=0?'+':'-')+
money(Math.abs(amount))+
' — Balance: '+
money(balance);

result.style.color=
text==='PROFIT'
?'var(--profit)'
:'var(--loss)';
}
}

function hideResult(){
const box=$('tradeResultBox');
if(box)box.style.display='none';

const result=$('tradeResult');
if(result){
result.textContent='';
}
}

function setTradeButtonsDisabled(disabled){
const buttons=[
$('tradeBuyBtn'),
$('tradeSellBtn'),
$('buyTradeBtn'),
$('sellTradeBtn')
];

buttons.forEach(button=>{
if(button)button.disabled=disabled;
});
}

function setTradeButtonsVisible(visible){
const box=$('tradeDirectionButtons');
if(box)box.style.display=visible?'flex':'none';
}

async function initSupabase(){
if(client)return true;

if(!window.supabase){
console.error('Supabase library not loaded.');
return false;
}

client=window.supabase.createClient(
SUPABASE_URL,
SUPABASE_KEY
);

return true;
}

async function loadAccount(){
if(!client)return false;

const {
data:{
session
},
error:sessionError
}=await client.auth.getSession();

if(sessionError||!session?.user){
return false;
}

const {
data,
error
}=await client
.from('accounts')
.select('id,balance,initial_balance,profit,first_deposit_at,total_withdrawn')
.eq('user_id',session.user.id)
.limit(1)
.maybeSingle();

if(error){
console.error('Trade account load error:',error);
return false;
}

currentAccount=data||null;

return !!currentAccount;
}

function getBalance(){
return Math.max(
0,
Number(currentAccount?.balance||0)
);
}

function syncAmount(value){
const max=getBalance();

const numericValue=Number(value);

const safe=Math.max(
0,
Math.min(
max,
Number.isFinite(numericValue)?numericValue:0
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

if(min)min.textContent='$0.00';
if(maxEl)maxEl.textContent=money(max);
}

function getTradeCode(){
return $('tradeCodeInput')?.value.trim()||'';
}

function getSelectedAmount(){
return Number(
$('tradeBalanceAmount')?.value
);
}

function updateSignalDisplay(direction,currency){
const directionText=
String(direction||'')
.toUpperCase();

const currencyText=
String(currency||'')
.toUpperCase();

const text=
currencyText
?directionText+' '+currencyText
:directionText;

const candidates=[
$('tradeSignal'),
$('tradeDirection'),
$('tradeSignalText'),
$('tradeCurrencySignal')
];

for(const el of candidates){
if(el){
el.textContent=text;
el.style.display='block';
break;
}
}
}

function updateCountdownFrom(settleAt){
const settleTime=Date.parse(settleAt);

if(!Number.isFinite(settleTime)){
return false;
}

const update=()=>{
if(!activeCycleId)return;

const secondsLeft=Math.ceil(
(settleTime-Date.now())/1000
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

if(countdownTimer){
clearInterval(countdownTimer);
}

countdownTimer=setInterval(
update,
250
);

return true;
}

async function settleTradeCycle(cycleId){
if(settling)return;

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

if(error)throw error;

const result=data||{};

const success=
result.success===undefined
?true
:Boolean(result.success);

if(!success){
throw new Error(
'Trade could not be settled.'
);
}

const resultText=
String(
result.result||''
)
.toLowerCase();

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

if(result.profit_after!==undefined){
currentAccount.profit=
Number(result.profit_after||0);
}

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

setTradeButtonsDisabled(true);

if(typeof window.renderAccountSummary==='function'){
await window.renderAccountSummary(
currentAccount
);
}

if(typeof window.loadNotifications==='function'){
try{
await window.loadNotifications();
}catch(e){
console.warn(
'Notification refresh failed:',
e
);
}
}

}catch(error){

console.error(
'Trade settlement error:',
error
);

const errorText=
error.message?.toLowerCase()||'';

if(
errorText.includes('too early')||
errorText.includes('not ready')||
errorText.includes('30')
){
setTimeout(
()=>{
settling=false;
settleTradeCycle(cycleId);
},
1000
);
return;
}

showMessage(
'Unable to settle trade. Please try again.',
true
);

setTradeButtonsDisabled(false);

}finally{

if(activeCycleId===cycleId){
settling=false;
}

}
}

async function startTradeCycle(clientDirection){
if(syncing)return;

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

if(!Number.isFinite(amount)||amount<=0){
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
String(clientDirection||'')
.toLowerCase();

if(direction!=='buy'&&direction!=='sell'){
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

if(error)throw error;

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

activeCycleId=cycleId;
settling=false;

updateSignalDisplay(
result.trade_direction||
result.signal_direction||
result.direction||
'',
result.trade_currency||
result.currency||
''
);

showCountdown(30);
setTradeButtonsDisabled(true);

if(!updateCountdownFrom(settleAt)){
throw new Error(
'Unable to start trade timer.'
);
}

const settleLoop=async()=>{
if(activeCycleId!==cycleId)return;

const settleTime=Date.parse(
settleAt
);

if(
Number.isFinite(settleTime) &&
Date.now()<settleTime
){
setTimeout(
settleLoop,
250
);
return;
}

await new Promise(
resolve=>setTimeout(
resolve,
500
)
);

if(activeCycleId===cycleId){
await settleTradeCycle(
cycleId
);
}
};

settleLoop();

}catch(error){

console.error(
'Trade cycle error:',
error
);

const errorText=
error.message?.toLowerCase()||'';

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

window.applyTradeCode=async function(){
showMessage(
'Select BUY or SELL to start the trade.',
true
);
};

async function init(){
if(initialized)return true;

if(
!$('tradeBalanceAmount')||
!$('tradeBalanceSlider')||
!$('tradeCodeInput')
){
return false;
}

const ready=await initSupabase();

if(!ready)return false;

const accountLoaded=await loadAccount();

if(!accountLoaded){
console.warn(
'Unable to load trading account.'
);
return false;
}

initialized=true;

syncAmount(getBalance());

hideCountdown();
hideResult();
setTradeButtonsDisabled(false);

const amountInput=$('tradeBalanceAmount');
const slider=$('tradeBalanceSlider');

amountInput.addEventListener(
'input',
function(){
syncAmount(this.value);
}
);

slider.addEventListener(
'input',
function(){
syncAmount(this.value);
}
);

const buyButtons=[
$('tradeBuyBtn'),
$('buyTradeBtn')
];

const sellButtons=[
$('tradeSellBtn'),
$('sellTradeBtn')
];

buyButtons.forEach(button=>{
if(button){
button.addEventListener(
'click',
()=>{
startTradeCycle('buy');
}
);
}
});

sellButtons.forEach(button=>{
if(button){
button.addEventListener(
'click',
()=>{
startTradeCycle('sell');
}
);
}
});

return true;
}

async function boot(){

const ready=await init();

if(ready)return;

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
