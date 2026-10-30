"use strict";

const $=id=>document.getElementById(id);
let transactionsSupabaseClient=null;
let TRANSACTION_DATA=[];
let TRANSACTIONS_LOADING=false;

const tableBody=$("transactionTableBody");
const emptyState=$("transactionEmptyState");
const searchInput=$("transactionSearch");
const typeFilter=$("transactionFilter");
const statusFilter=$("statusFilter");
const toastContainer=$("toastContainer");

const TYPE_LABELS={
  trade:"Trade",
  deposit:"Deposit",
  withdrawal:"Withdrawal",
  reinvest:"Reinvest"
};

function getTransactionsSupabase(){
  // shared client (supabase-config.js) pehle, warna apna bana lo
  if(window.supabaseClient)return window.supabaseClient;
  if(transactionsSupabaseClient)return transactionsSupabaseClient;
  if(
    typeof supabase==="undefined"||
    typeof SUPABASE_URL==="undefined"||
    typeof SUPABASE_PUBLISHABLE_KEY==="undefined"
  )return null;

  transactionsSupabaseClient=supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );
  return transactionsSupabaseClient;
}

function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,char=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  })[char]);
}

function formatMoney(value){
  const amount=Number(value)||0;
  return (amount<0?"-$":"$")+Math.abs(amount).toLocaleString("en-US",{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  });
}

function formatSignedMoney(value){
  const amount=Number(value)||0;
  if(amount>0)return "+"+formatMoney(amount);
  if(amount<0)return "-"+formatMoney(Math.abs(amount));
  return "$0.00";
}

function formatDateTime(value){
  if(!value)return {date:"—",time:"—"};
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return {date:"—",time:"—"};

  const options={timeZone:"Asia/Bangkok"};
  return {
    date:new Intl.DateTimeFormat("en-CA",{
      ...options,year:"numeric",month:"2-digit",day:"2-digit"
    }).format(date),
    time:new Intl.DateTimeFormat("en-GB",{
      ...options,hour:"2-digit",minute:"2-digit",hour12:false
    }).format(date)
  };
}

function formatDisplayDate(value){
  const parts=formatDateTime(value);
  if(parts.date==="—")return "—";
  const [year,month,day]=parts.date.split("-");
  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${day} ${months[Number(month)-1]||"—"} ${year}`;
}

function normalizeStatus(value){
  const status=String(value||"pending").trim().toLowerCase();
  if(["approved","completed","success","successful","paid"].includes(status))return "completed";
  if(["rejected","failed","cancelled","canceled","declined"].includes(status))return "failed";
  return "pending";
}

// Reinvest ke apne teen status: Pending / Approved / Rejected
function normalizeReinvestStatus(value){
  const status=String(value||"pending").trim().toLowerCase();
  if(status==="approved")return "approved";
  if(status==="rejected")return "rejected";
  return "pending";
}

function statusLabel(status){
  return ({
    completed:"Completed",
    approved:"Approved",
    pending:"Pending",
    rejected:"Rejected",
    failed:"Failed"
  })[status]||"Pending";
}

function getPair(code){
  return String(code||"").replace(/^PZ-/i,"").split("-")[0].toUpperCase()||"—";
}

function getDirection(value){
  const direction=String(value||"").trim().toUpperCase();
  return ["BUY","SELL"].includes(direction)?direction:"—";
}

function getReference(type,date,index){
  const timestamp=date?new Date(date).getTime():0;
  const suffix=Number.isFinite(timestamp)&&timestamp>0?String(timestamp).slice(-8):String(index+1).padStart(8,"0");
  return `${type==="deposit"?"DEP":type==="withdrawal"?"WD":"TRADE"}-${suffix}`;
}

function showToast(message,type="error"){
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
  },3500);
}

function setLoading(){
  if(tableBody){
    tableBody.innerHTML='<tr><td colspan="6" class="loading-cell">Loading transactions...</td></tr>';
  }
  if(emptyState)emptyState.classList.add("hidden");
}

function renderSummary(){
  const completed=TRANSACTION_DATA.filter(x=>x.status==="completed");
  const deposited=completed
    .filter(x=>x.type==="deposit")
    .reduce((sum,x)=>sum+x.amount,0);
  const withdrawn=completed
    .filter(x=>x.type==="withdrawal")
    .reduce((sum,x)=>sum+x.amount,0);
  const trading=completed
    .filter(x=>x.type==="trade")
    .reduce((sum,x)=>sum+x.amount,0);

  if($("totalDeposited"))$("totalDeposited").textContent=formatMoney(deposited);
  if($("totalWithdrawn"))$("totalWithdrawn").textContent=formatMoney(withdrawn);
  if($("tradingProfit")){
    $("tradingProfit").textContent=formatSignedMoney(trading);
    $("tradingProfit").classList.toggle("profit-text",trading>=0);
    $("tradingProfit").classList.toggle("loss-text",trading<0);
  }
  if($("totalRecords"))$("totalRecords").textContent=String(TRANSACTION_DATA.length);
}

function getFilteredTransactions(){
  const query=String(searchInput?.value||"").trim().toLowerCase();
  const type=typeFilter?.value||"all";
  const status=statusFilter?.value||"all";

  return TRANSACTION_DATA.filter(item=>{
    if(type!=="all"&&item.type!==type)return false;
    if(status!=="all"&&item.status!==status)return false;
    if(!query)return true;

    const searchable=[
      item.date,item.time,item.type,item.reference,item.detail,
      item.amount,item.status,item.direction,item.pair
    ].join(" ").toLowerCase();

    return searchable.includes(query);
  });
}

function renderTransactions(){
  if(!tableBody)return;
  const rows=getFilteredTransactions();

  if(!rows.length){
    tableBody.innerHTML="";
    if(emptyState){
      emptyState.classList.remove("hidden");
      const heading=emptyState.querySelector("h3");
      const paragraph=emptyState.querySelector("p");
      if(heading)heading.textContent=TRANSACTION_DATA.length?"No matching transactions":"No transactions yet";
      if(paragraph)paragraph.textContent=TRANSACTION_DATA.length
        ?"Try changing the search text or filters."
        :"Your deposits, withdrawals, reinvestments and trade results will appear here.";
    }
    return;
  }

  if(emptyState)emptyState.classList.add("hidden");

  tableBody.innerHTML=rows.map(item=>{
    const date=formatDisplayDate(item.date);
    const time=item.time||"—";
    const typeLabel=TYPE_LABELS[item.type]||"Activity";

    // Reinvest ka amount neutral rang mein (paisa aata ya jaata nahi, lock hota hai)
    const amountClass=item.type==="reinvest"
      ?""
      :(item.amount>0?"amount-positive":item.amount<0?"amount-negative":"");

    const amountText=item.type==="trade"
      ?formatSignedMoney(item.amount)
      :(item.type==="withdrawal"?"-":"")+formatMoney(Math.abs(item.amount));

    const statusClass=`status-${item.status}`;

    return `<tr>
      <td><span class="transaction-date">${escapeHtml(date)}</span><small class="transaction-time">${escapeHtml(time)} Thailand Time</small></td>
      <td><span class="type-badge type-${escapeHtml(item.type)}">${typeLabel}</span></td>
      <td class="transaction-reference">${escapeHtml(item.reference)}</td>
      <td>${escapeHtml(item.detail)}</td>
      <td class="transaction-amount ${amountClass}">${escapeHtml(amountText)}</td>
      <td><span class="status-badge ${statusClass}">${statusLabel(item.status)}</span></td>
    </tr>`;
  }).join("");
}

async function loadTransactions(){
  if(TRANSACTIONS_LOADING)return;
  TRANSACTIONS_LOADING=true;
  setLoading();

  try{
    const client=getTransactionsSupabase();
    if(!client)throw new Error("Supabase configuration is missing.");

    const {data:authData,error:authError}=await client.auth.getUser();
    if(authError)throw authError;
    const currentUser=authData?.user;

    if(!currentUser){
      TRANSACTION_DATA=[];
      renderSummary();
      if(tableBody)tableBody.innerHTML='<tr><td colspan="6" class="loading-cell">Please sign in to view your transactions.</td></tr>';
      if(emptyState)emptyState.classList.add("hidden");
      return;
    }

    const [tradeResult,depositResult,withdrawalResult,profitResult,reinvestResult]=await Promise.all([
      client.from("trade_code_applications")
        .select("adjustment_amount,code_snapshot,applied_at,selected_direction")
        .eq("user_id",currentUser.id)
        .order("applied_at",{ascending:false}),

      client.from("deposits")
        .select("amount,status,created_at")
        .eq("user_id",currentUser.id)
        .order("created_at",{ascending:false}),

      client.from("withdrawals")
        .select("amount,status,created_at")
        .eq("user_id",currentUser.id)
        .order("created_at",{ascending:false}),

      client.from("transactions")
        .select("id,amount,description,created_at,type")
        .eq("user_id",currentUser.id)
        .eq("type","profit")
        .ilike("description","%Daily result%")
        .order("created_at",{ascending:false}),

      client.from("reinvest_requests")
        .select("id,amount,status,created_at,reviewed_at,admin_note,lock_until")
        .eq("user_id",currentUser.id)
        .order("created_at",{ascending:false})
    ]);

    if(tradeResult.error)throw tradeResult.error;
    if(depositResult.error)throw depositResult.error;
    if(withdrawalResult.error)throw withdrawalResult.error;
    if(profitResult.error)throw profitResult.error;

    // Reinvest na padh sakein to baqi ledger phir bhi dikhao
    if(reinvestResult.error){
      console.warn("Reinvest requests could not be loaded:",reinvestResult.error);
    }

    const trades=(tradeResult.data||[]).filter(x=>x.applied_at).map((x,index)=>{
      const pair=getPair(x.code_snapshot);
      const direction=getDirection(x.selected_direction);
      const pnl=Number(x.adjustment_amount)||0;
      return {
        date:x.applied_at,
        time:formatDateTime(x.applied_at).time,
        type:"trade",
        reference:String(x.code_snapshot||`Trade ${index+1}`),
        detail:`${direction} ${pair} · Client P/L`,
        amount:pnl,
        status:"completed",
        pair,
        direction
      };
    });

    const deposits=(depositResult.data||[]).filter(x=>x.created_at).map((x,index)=>{
      const date=x.created_at;
      const status=normalizeStatus(x.status);
      const amount=Math.abs(Number(x.amount)||0);
      return {
        date,
        time:formatDateTime(date).time,
        type:"deposit",
        reference:getReference("deposit",date,index),
        detail:"USDT · Deposit",
        amount,
        status
      };
    });

    const withdrawals=(withdrawalResult.data||[]).filter(x=>x.created_at).map((x,index)=>{
      const date=x.created_at;
      const status=normalizeStatus(x.status);
      const amount=Math.abs(Number(x.amount)||0);
      return {
        date,
        time:formatDateTime(date).time,
        type:"withdrawal",
        reference:getReference("withdrawal",date,index),
        detail:"USDT · Withdrawal",
        amount,
        status
      };
    });

    const manualResults=(profitResult.data||[]).filter(x=>x.created_at).map(x=>({
      date:x.created_at,
      time:formatDateTime(x.created_at).time,
      type:"trade",
      reference:`Settlement #${x.id}`,
      detail:x.description||"Manual Client P/L",
      amount:Number(x.amount)||0,
      status:"completed",
      pair:"Manual P/L",
      direction:""
    }));

    const reinvests=(reinvestResult.error?[]:(reinvestResult.data||[]))
      .filter(x=>x.created_at)
      .map(x=>{
        const status=normalizeReinvestStatus(x.status);
        let detail;

        if(status==="approved"){
          detail=x.lock_until
            ?`Reinvest approved · locked until ${formatDisplayDate(x.lock_until)}`
            :"Reinvest approved · locked for 40 days";
        }else if(status==="rejected"){
          const note=String(x.admin_note||"").trim();
          detail="Reinvest request not approved"+(note?` · ${note}`:"");
        }else{
          detail="Reinvest request · waiting for admin approval";
        }

        return {
          date:x.created_at,
          time:formatDateTime(x.created_at).time,
          type:"reinvest",
          reference:`REINVEST-${x.id}`,
          detail,
          amount:Math.abs(Number(x.amount)||0),
          status
        };
      });

    TRANSACTION_DATA=[...trades,...manualResults,...deposits,...withdrawals,...reinvests]
      .sort((a,b)=>new Date(b.date)-new Date(a.date));

    renderSummary();
    renderTransactions();

  }catch(error){
    console.error("Transactions load error:",error);
    TRANSACTION_DATA=[];
    renderSummary();
    if(tableBody)tableBody.innerHTML='<tr><td colspan="6" class="loading-cell">Unable to load transactions. Please refresh the page.</td></tr>';
    if(emptyState)emptyState.classList.add("hidden");
    showToast("Unable to load transactions. Check the console for details.","error");
  }finally{
    TRANSACTIONS_LOADING=false;
  }
}

function initTransactions(){
  if(searchInput)searchInput.addEventListener("input",renderTransactions);
  if(typeFilter)typeFilter.addEventListener("change",renderTransactions);
  if(statusFilter)statusFilter.addEventListener("change",renderTransactions);

  // topbar ka search box (layout.js) bhi is list ko filter kare
  document.addEventListener("pz:search",e=>{
    if(searchInput)searchInput.value=(e.detail&&e.detail.query)||"";
    renderTransactions();
  });

  loadTransactions();
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",initTransactions);
}else{
  initTransactions();
}