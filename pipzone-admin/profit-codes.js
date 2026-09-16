'use strict';

const SUPABASE_URL='https://nzasmkplxzirnqeteclv.supabase.co';
const SUPABASE_KEY='sb_publishable_ywmF35YANKsFEdZOs8wDdQ__jIezHTF';
const client=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);

const adjustmentType=$('adjustmentType');
const percentage=$('percentage');
const expiryValue=$('expiryValue');
const expiryUnit=$('expiryUnit');
const generatedCode=$('generatedCode');
const generateBtn=$('generateBtn');
const copyBtn=$('copyBtn');
const refreshBtn=$('refreshBtn');
const message=$('message');
const historyList=$('historyList');
const logoutBtn=$('logoutBtn');

function esc(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function formatDate(value){return new Date(value).toLocaleString()}
function showMessage(text,type='success'){message.textContent=text;message.className='message '+type}
function clearMessage(){message.textContent='';message.className='message'}
function getStatus(item){if(item.status==='used')return'used';if(new Date()>=new Date(item.expires_at))return'expired';return'active'}

async function checkAdmin(){
const {data:{session}}=await client.auth.getSession();

if(!session){
location.href='admin.html';
return false;
}

const {data:profile,error}=await client.from('profiles').select('role').eq('id',session.user.id).maybeSingle();

if(error||profile?.role!=='admin'){
await client.auth.signOut();
location.href='admin.html';
return false;
}

return true;
}

async function loadHistory(){
refreshBtn.disabled=true;
refreshBtn.textContent='Refreshing...';

const {data,error}=await client.from('trade_codes').select('id,code,adjustment_type,percentage,expiry_value,expiry_unit,created_at,expires_at,status,target_user_id,used_at').order('created_at',{ascending:false});

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

return`<div class="history-item"><div class="history-top"><div class="code">${esc(item.code)}</div><div class="status ${status}">${status}</div></div><div class="history-details"><div>Client: <strong>${esc(names[item.target_user_id]||'All Clients')}</strong></div><div>Type: <strong>${esc(item.adjustment_type)}</strong></div><div>Percentage: <strong>${esc(item.percentage)}%</strong></div><div>Expiry: <strong>${esc(item.expiry_value)} ${esc(item.expiry_unit)}</strong></div><div>Created: <strong>${esc(formatDate(item.created_at))}</strong></div><div>Expires: <strong>${esc(formatDate(item.expires_at))}</strong></div><div>Used: <strong>${item.used_at?esc(formatDate(item.used_at)):'Not used'}</strong></div></div><div class="history-actions"><button class="delete-btn" type="button" data-delete-code="${esc(item.id)}">Delete</button></div></div>`;
}).join('');

refreshBtn.disabled=false;
refreshBtn.textContent='Refresh';
}

generateBtn.addEventListener('click',async()=>{
clearMessage();

const type=adjustmentType.value;
const percent=Number(percentage.value);
const expiry=Number(expiryValue.value);
const unit=expiryUnit.value;

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
p_expiry_unit:unit
});

if(error)throw error;

generatedCode.value=data.code;
copyBtn.disabled=false;
copyBtn.classList.remove('copied');
copyBtn.textContent='Copy Code';

showMessage(`Code ${data.code} generated. Expires ${formatDate(data.expires_at)}.`,'success');

await loadHistory();

}catch(error){
console.error(error);
showMessage(error.message||'Unable to generate code.','error');
}finally{
generateBtn.disabled=false;
generateBtn.textContent='Generate Code';
}
});

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

refreshBtn.addEventListener('click',async()=>{
await loadHistory();
});

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

(async()=>{
if(!(await checkAdmin()))return;
await loadHistory();
})();

setInterval(loadHistory,30000);
