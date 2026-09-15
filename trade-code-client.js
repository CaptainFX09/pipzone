'use strict';

(function(){
const $=id=>document.getElementById(id);
let initialized=false;
let syncing=false;

function money(value){
return '$'+Number(value||0).toFixed(2);
}

function showMessage(text,error=false){
const el=$('tradeCodeMsg');
if(!el)return;
el.textContent=text;
el.style.color=error?'var(--loss)':'var(--profit)';
el.classList.add('show');
el.style.display='block';
}

function clearMessage(){
const el=$('tradeCodeMsg');
if(!el)return;
el.textContent='';
el.classList.remove('show');
el.style.display='none';
}

function getBalance(){
return Math.max(0,Number(window.currentAccount?.balance||0));
}

function syncAmount(value){
const max=getBalance();
const safe=Math.max(0,Math.min(max,Number(value)||0));

const input=$('tradeBalanceAmount');
const slider=$('tradeBalanceSlider');

if(input)input.value=safe.toFixed(2);

if(slider){
slider.max=max.toFixed(2);
slider.value=safe.toFixed(2);
}

const min=$('tradeBalanceMin');
const maxEl=$('tradeBalanceMax');

if(min)min.textContent='$0.00';
if(maxEl)maxEl.textContent=money(max);
}

function init(){
if(
initialized||
!$('tradeBalanceAmount')||
!$('tradeBalanceSlider')||
!$('tradeCodeInput')||
!$('applyTradeCodeBtn')
)return false;

initialized=true;

syncAmount(getBalance());

$('tradeBalanceAmount').addEventListener('input',e=>{
syncAmount(e.target.value);
});

$('tradeBalanceSlider').addEventListener('input',e=>{
syncAmount(e.target.value);
});

return true;
}

window.applyTradeCode=async function(){
if(syncing)return;

clearMessage();

if(!window.supabaseClient||!window.currentUser){
showMessage('Please log in again.',true);
return;
}

const amount=Number($('tradeBalanceAmount')?.value);
const code=$('tradeCodeInput')?.value.trim();
const max=getBalance();

if(!Number.isFinite(amount)||amount<=0){
showMessage('Enter a valid balance amount.',true);
return;
}

if(amount>max+0.001){
showMessage('Selected amount cannot exceed your current balance.',true);
syncAmount(max);
return;
}

if(!code){
showMessage('Enter your trade code.',true);
return;
}

const button=$('applyTradeCodeBtn');

syncing=true;

if(button){
button.disabled=true;
button.textContent='Applying...';
}

try{
const {data,error}=await window.supabaseClient.rpc(
'apply_trade_code',
{
p_code:code,
p_selected_amount:Number(amount.toFixed(2))
}
);

if(error)throw error;

const result=data||{};

if(window.currentAccount){
window.currentAccount.balance=Number(
result.balance_after||0
);

window.currentAccount.profit=Number(
result.profit_after||
window.currentAccount.profit||
0
);
}

const adjustment=Number(
result.adjustment_amount||0
);

const label=adjustment>=0
?'profit added'
:'loss applied';

showMessage(
`Trade code applied successfully: ${money(Math.abs(adjustment))} ${label}. New balance: ${money(result.balance_after)}.`
);

$('tradeCodeInput').value='';

syncAmount(
Number(result.balance_after||0)
);

if(typeof renderAccountSummary==='function'){
await renderAccountSummary(window.currentAccount);
}

if(typeof loadRequests==='function'){
await loadRequests();
}

}catch(error){
console.error(error);

showMessage(
error.message||'Unable to apply trade code.',
true
);

}finally{

syncing=false;

if(button){
button.disabled=false;
button.textContent='Apply Trade Code';
}

}
};

function boot(){
if(init())return;
setTimeout(boot,400);
}

if(document.readyState==='loading'){
document.addEventListener('DOMContentLoaded',boot);
}else{
boot();
}

})();
