'use strict';

// ============================================
// Supabase Configuration
// ============================================

const SUPABASE_URL='https://nzasmkplxzirnqeteclv.supabase.co';
const SUPABASE_KEY='sb_publishable_ywmF35YANKsFEdZOs8wDdQ__jIezHTF';
const client=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);


// ============================================
// Page Elements
// ============================================

const tradeDirection=$('tradeDirection');
const tradeCurrency=$('tradeCurrency');
const addCurrencyBtn=$('addCurrencyBtn');
const deleteCurrencyBtn=$('deleteCurrencyBtn');
const adjustmentType=$('adjustmentType');
const percentage=$('percentage');
const expiryValue=$('expiryValue');
const expiryUnit=$('expiryUnit');
const generatedCode=$('generatedCode');
const generateBtn=$('generateBtn');
const copyBtn=$('copyBtn');
const sendMessageBtn=$('sendMessageBtn');
const refreshBtn=$('refreshBtn');
const message=$('message');
const historyList=$('historyList');
const logoutBtn=$('logoutBtn');

// ============================================
// Helper Functions
// ============================================

function esc(value){
return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
}

function formatDate(value){
return new Date(value).toLocaleString()
}

function showMessage(text,type='success'){
message.textContent=text;
message.className='message '+type
}

function clearMessage(){
message.textContent='';
message.className='message'
}

function getStatus(item){
if(item.status==='used')return'used';
if(new Date()>=new Date(item.expires_at))return'expired';
return'active'
}

// ============================================
// Admin Authentication
// ============================================

async function checkAdmin(){
const {data:{session}}=await client.auth.getSession();

if(!session){
location.href='index.html';
return false;
}

const {data:profile,error}=await client.from('profiles').select('role').eq('id',session.user.id).maybeSingle();

if(error||profile?.role!=='admin'){
await client.auth.signOut();
location.href='index.html';
return false;
}

return true;
}

// ============================================
// Load Currency List
// ============================================

async function loadCurrencies(){
tradeCurrency.disabled=true;
addCurrencyBtn.disabled=true;
deleteCurrencyBtn.disabled=true;

const {data,error}=await client.from('trade_currencies').select('id,name,code,is_active').order('code',{ascending:true});

if(error){
tradeCurrency.innerHTML='<option value="">Unable to load currencies</option>';
showMessage(error.message,'error');
return false;
}

const activeCurrencies=(data||[]).filter(item=>item.is_active);

if(!activeCurrencies.length){
tradeCurrency.innerHTML='<option value="">No currencies available</option>';
return false;
}

tradeCurrency.innerHTML=activeCurrencies.map(item=>{
return`<option value="${esc(item.code)}">${esc(item.code)}${item.name&&item.name!==item.code?' — '+esc(item.name):''}</option>`;
}).join('');

tradeCurrency.disabled=false;
addCurrencyBtn.disabled=false;
deleteCurrencyBtn.disabled=false;

return true;
}

// ============================================
// Add Currency
// ============================================

addCurrencyBtn.addEventListener('click',async()=>{
clearMessage();

const name=prompt('Enter currency / asset name:');

if(name===null)return;

const cleanName=name.trim();

if(!cleanName){
showMessage('Enter a currency or asset name.','error');
return;
}

const codeInput=prompt('Enter currency / asset code (e.g. ADA, SOL, XAU):');

if(codeInput===null)return;

const code=codeInput.trim().toUpperCase();

if(!code||!/^[A-Z0-9._-]{2,20}$/.test(code)){
showMessage('Enter a valid currency code.','error');
return;
}

addCurrencyBtn.disabled=true;
addCurrencyBtn.textContent='Adding...';

try{
const {data:existing,error:existingError}=await client.from('trade_currencies').select('id,is_active').ilike('code',code).maybeSingle();

if(existingError)throw existingError;

if(existing){
if(existing.is_active){
showMessage('This currency already exists.','error');
return;
}

const {error}=await client.from('trade_currencies').update({
name:cleanName,
is_active:true
}).eq('id',existing.id);

if(error)throw error;

showMessage(`${code} currency restored successfully.`,'success');
await loadCurrencies();
return;
}

const {error}=await client.from('trade_currencies').insert({
name:cleanName,
code:code,
is_active:true
});

if(error)throw error;

showMessage(`${code} currency added successfully.`,'success');
await loadCurrencies();

}catch(error){
console.error(error);
showMessage(error.message||'Unable to add currency.','error');
}finally{
addCurrencyBtn.disabled=false;
addCurrencyBtn.textContent='+ Add Currency';
}
});

// ============================================
// Delete Currency Safely
// ============================================

deleteCurrencyBtn.addEventListener('click',async()=>{
clearMessage();

const code=tradeCurrency.value;

if(!code){
showMessage('Select a currency first.','error');
return;
}

if(!confirm(`Remove ${code} from the active currency list? Existing trade records will remain safe.`))return;

deleteCurrencyBtn.disabled=true;
deleteCurrencyBtn.textContent='Removing...';

try{
const {error}=await client.from('trade_currencies').update({
is_active:false
}).eq('code',code);

if(error)throw error;

showMessage(`${code} removed from the active currency list.`,'success');
await loadCurrencies();

}catch(error){
console.error(error);
showMessage(error.message||'Unable to remove currency.','error');
}finally{
deleteCurrencyBtn.disabled=false;
deleteCurrencyBtn.textContent='Delete Currency';
}
});

// ============================================
// Load Trade Code History
// ============================================

async function loadHistory(){
refreshBtn.disabled=true;
refreshBtn.textContent='Refreshing...';

const {data,error}=await client.from('trade_codes').select('id,code,adjustment_type,percentage,expiry_value,expiry_unit,created_at,expires_at,status,target_user_id,used_at,trade_direction,trade_currency').order('created_at',{ascending:false});

if(error){
historyList.innerHTML=`<div class="empty">${esc(error.message)}</div>`;
refreshBtn.disabled=false;
refreshBtn.textContent='Refresh';
return;
}

if(!data?.length){
historyList.innerHTML='<div class="empty">No codes generated yet.</div>';
refreshBtn.disabled=false;
refreshBtn.textContent='Refresh';
return;
}

const ids=[...new Set(data.map(x=>x.target_user_id).filter(Boolean))];
let names={};

if(ids.length){
const {data:profiles}=await client.from('profiles').select('id,full_name,first_name,last_name').in('id',ids);

(profiles||[]).forEach(p=>{
names[p.id]=p.full_name||[p.first_name,p.last_name].filter(Boolean).join(' ')||'Client';
});
}

historyList.innerHTML=data.map(item=>{
const status=getStatus(item);
const direction=item.trade_direction?item.trade_direction.toUpperCase():'BUY';
const currency=item.trade_currency||'BTC';

return`<div class="history-item"><div class="history-top"><div class="code">${esc(item.code)}</div><div class="status ${status}">${status}</div></div><div class="history-details"><div>Client: <strong>${esc(names[item.target_user_id]||'All Clients')}</strong></div><div>Signal: <strong>${esc(direction)} ${esc(currency)}</strong></div><div>Type: <strong>${esc(item.adjustment_type)}</strong></div><div>Percentage: <strong>${esc(item.percentage)}%</strong></div><div>Expiry: <strong>${esc(item.expiry_value)} ${esc(item.expiry_unit)}</strong></div><div>Created: <strong>${esc(formatDate(item.created_at))}</strong></div><div>Expires: <strong>${esc(formatDate(item.expires_at))}</strong></div><div>Used: <strong>${item.used_at?esc(formatDate(item.used_at)):'Not used'}</strong></div></div><div class="history-actions"><button class="delete-btn" type="button" data-delete-code="${esc(item.id)}">Delete</button></div></div>`;
}).join('');

refreshBtn.disabled=false;
refreshBtn.textContent='Refresh';
}

// ============================================
// Generate Trade Code
// ============================================

generateBtn.addEventListener('click',async()=>{
clearMessage();

const direction=tradeDirection.value;
const currency=tradeCurrency.value;
const type=adjustmentType.value;
const percent=Number(percentage.value);
const expiry=Number(expiryValue.value);
const unit=expiryUnit.value;

if(!direction||!['buy','sell'].includes(direction)){
showMessage('Select a valid trade direction.','error');
return;
}

if(!currency){
showMessage('Select a currency or asset.','error');
return;
}

if(!Number.isFinite(percent)||percent<=0||percent>100){
showMessage('Enter a valid percentage.','error');
return;
}

if(!Number.isInteger(expiry)||expiry<1){
showMessage('Enter a valid expiry time.','error');
return;
}

generateBtn.disabled=true;
generateBtn.textContent='Generating...';

try{
const {data,error}=await client.rpc('create_trade_code',{
p_adjustment_type:type,
p_percentage:percent,
p_expiry_value:expiry,
p_expiry_unit:unit,
p_recipient_type:'all',
p_recipient_ids:[],
p_trade_direction:direction,
p_trade_currency:currency
});

if(error)throw error;

generatedCode.value=data.code;
copyBtn.disabled=false;
copyBtn.classList.remove('copied');
copyBtn.textContent='Copy Code';

localStorage.setItem('pipzone_trade_expiry',`${expiry} ${unit}`);

showMessage(`${direction.toUpperCase()} ${currency} code ${data.code} generated. Expires ${formatDate(data.expires_at)}.`,'success');

await loadHistory();

}catch(error){
console.error(error);
showMessage(error.message||'Unable to generate code.','error');
}finally{
generateBtn.disabled=false;
generateBtn.textContent='Generate Code';
}
});

// ============================================
// Send Latest Trade Code Message
// ============================================

sendMessageBtn.addEventListener('click',async()=>{
clearMessage();

if(!confirm('Send the latest generated trade code to all clients?'))return;

sendMessageBtn.disabled=true;
sendMessageBtn.textContent='Sending...';

try{
const {data,error}=await client.rpc('send_latest_trade_code_message');

if(error)throw error;

const code=data?.trade_code||'';
const count=data?.messages_inserted||0;

showMessage(
`Trade code ${code} message sent to ${count} client${count===1?'':'s'}.`,
'success'
);

}catch(error){
console.error(error);
showMessage(error.message||'Unable to send trade code message.','error');
}finally{
sendMessageBtn.disabled=false;
sendMessageBtn.textContent='Send Message';
}
});

// ============================================
// Copy Trade Code
// ============================================

copyBtn.addEventListener('click',async()=>{
const code=generatedCode.value.trim();

if(!code){
showMessage('Generate a code first.','error');
return;
}

try{
await navigator.clipboard.writeText(code);
copyBtn.textContent='Copied!';
copyBtn.classList.add('copied');
showMessage('Trade code copied to clipboard.','success');

setTimeout(()=>{
copyBtn.textContent='Copy Code';
copyBtn.classList.remove('copied');
},2000);

}catch(error){
generatedCode.select();
document.execCommand('copy');
copyBtn.textContent='Copied!';
copyBtn.classList.add('copied');
showMessage('Trade code copied to clipboard.','success');

setTimeout(()=>{
copyBtn.textContent='Copy Code';
copyBtn.classList.remove('copied');
},2000);
}
});

// ============================================
// Delete Trade Code History
// ============================================

historyList.addEventListener('click',async event=>{
const button=event.target.closest('[data-delete-code]');

if(!button)return;

const id=button.dataset.deleteCode;

if(!confirm('Delete this trade code history record?'))return;

button.disabled=true;

const {data,error}=await client.rpc('delete_trade_code',{
p_trade_code_id:id
});

if(error){
showMessage(error.message,'error');
button.disabled=false;
return;
}

showMessage(data?'Trade code deleted.':'Trade code was already deleted.','success');
await loadHistory();
});

// ============================================
// Refresh
// ============================================

refreshBtn.addEventListener('click',async()=>{
await loadHistory();
});

// ============================================
// Logout
// ============================================

logoutBtn.addEventListener('click',async()=>{
logoutBtn.disabled=true;
logoutBtn.textContent='Logging out...';

try{
const {error}=await client.auth.signOut();

if(error)throw error;

location.reload();

}catch(error){
console.error(error);
logoutBtn.disabled=false;
logoutBtn.textContent='Logout';
showMessage(error.message||'Unable to logout.','error');
}
});

// ============================================
// Page Initialization
// ============================================

(async()=>{
if(!(await checkAdmin()))return;
await loadCurrencies();
await loadHistory();
})();

// ============================================
// Automatic History Refresh
// ============================================

setInterval(loadHistory,30000);
