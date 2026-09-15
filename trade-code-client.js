(function(){
const SUPABASE_URL='https://nzasmkplxzirnqeteclv.supabase.co';
const SUPABASE_KEY='sb_publishable_ywmF35YANKsFEdZOs8wDdQ__jIezHTF';

const $=id=>document.getElementById(id);

let client=null;
let currentAccount=null;
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

if(min){
min.textContent='$0.00';
}

if(maxEl){
maxEl.textContent=money(max);
}
}

async function init(){
if(initialized)return true;

if(
!$('tradeBalanceAmount')||
!$('tradeBalanceSlider')||
!$('tradeCodeInput')||
!$('applyTradeCodeBtn')
){
return false;
}

const ready=await initSupabase();

if(!ready)return false;

const accountLoaded=await loadAccount();

if(!accountLoaded){
console.warn('Unable to load trading account.');
return false;
}

initialized=true;

syncAmount(getBalance());

const amountInput=$('tradeBalanceAmount');
const slider=$('tradeBalanceSlider');

amountInput.addEventListener('input',function(){
syncAmount(this.value);
});

slider.addEventListener('input',function(){
syncAmount(this.value);
});

return true;
}

window.applyTradeCode=async function(){
if(syncing)return;

clearMessage();

if(!client){
showMessage('Please log in again.',true);
return;
}

const amount=Number(
$('tradeBalanceAmount')?.value
);

const code=$('tradeCodeInput')?.value.trim();

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

const button=$('applyTradeCodeBtn');

syncing=true;

if(button){
button.disabled=true;
button.textContent='Applying...';
}

try{

const {
data,
error
}=await client.rpc(
'apply_trade_code',
{
p_code:code,
p_selected_amount:Number(
amount.toFixed(2)
)
}
);

if(error)throw error;

const result=data||{};

currentAccount.balance=Number(
result.balance_after||0
);

if(result.profit_after!==undefined){
currentAccount.profit=Number(
result.profit_after
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

if(typeof window.renderAccountSummary==='function'){
await window.renderAccountSummary(
currentAccount
);
}

}catch(error){

console.error(
'Trade code error:',
error
);

showMessage(
error.message||
'Unable to apply trade code.',
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
