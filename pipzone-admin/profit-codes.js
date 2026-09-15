const adjustmentType=document.getElementById("adjustmentType");
const percentage=document.getElementById("percentage");
const expiryValue=document.getElementById("expiryValue");
const expiryUnit=document.getElementById("expiryUnit");
const generatedCode=document.getElementById("generatedCode");
const generateBtn=document.getElementById("generateBtn");
const message=document.getElementById("message");
const historyList=document.getElementById("historyList");
const SEQUENCE_KEY="pipzone_trade_code_sequence";
const HISTORY_KEY="pipzone_trade_codes_history";
let history=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");

function getNextSequence(){
let sequence=Number(localStorage.getItem(SEQUENCE_KEY)||"0");
sequence++;
localStorage.setItem(SEQUENCE_KEY,sequence);
return sequence;
}

function formatCode(number){
return "PZ-"+String(number).padStart(6,"0");
}

function calculateExpiry(value,unit){
const now=new Date();
if(unit==="minutes")now.setMinutes(now.getMinutes()+value);
if(unit==="hours")now.setHours(now.getHours()+value);
if(unit==="days")now.setDate(now.getDate()+value);
return now;
}

function formatDate(dateString){
return new Date(dateString).toLocaleString();
}

function showMessage(text,type){
message.textContent=text;
message.className="message "+type;
setTimeout(()=>{
message.textContent="";
message.className="message";
},3000);
}

function isExpired(item){
return new Date()>=new Date(item.expiresAt);
}

function escapeHtml(value){
return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function renderHistory(){
if(!history.length){
historyList.innerHTML='<div class="empty">No codes generated yet.</div>';
return;
}
historyList.innerHTML=history.slice().reverse().map(item=>{
const expired=isExpired(item);
const status=expired?"Expired":"Active";
const statusClass=expired?"expired":"active";
return `<div class="history-item"><div class="history-top"><div class="code">${escapeHtml(item.code)}</div><div class="status ${statusClass}">${status}</div></div><div class="history-details"><div>Type: ${escapeHtml(item.adjustmentType)}</div><div>Percentage: ${escapeHtml(String(item.percentage))}%</div><div>Created: ${formatDate(item.createdAt)}</div><div>Expires: ${formatDate(item.expiresAt)}</div></div></div>`;
}).join("");
}

generateBtn.addEventListener("click",()=>{
const type=adjustmentType.value;
const percent=Number(percentage.value);
const expiry=Number(expiryValue.value);
const unit=expiryUnit.value;

if(!Number.isFinite(percent)||percent<=0||percent>100){
showMessage("Enter a valid percentage.","error");
return;
}

if(!Number.isInteger(expiry)||expiry<1){
showMessage("Enter a valid expiry time.","error");
return;
}

const code=formatCode(getNextSequence());
const createdAt=new Date();
const expiresAt=calculateExpiry(expiry,unit);

const newCode={
code,
adjustmentType:type,
percentage:percent,
expiryValue:expiry,
expiryUnit:unit,
createdAt:createdAt.toISOString(),
expiresAt:expiresAt.toISOString(),
status:"active"
};

history.push(newCode);
localStorage.setItem(HISTORY_KEY,JSON.stringify(history));
generatedCode.value=code;
showMessage(`Code generated. Expires ${formatDate(newCode.expiresAt)}`,"success");
renderHistory();
});

setInterval(renderHistory,30000);
renderHistory();
