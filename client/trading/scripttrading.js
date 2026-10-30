
"use strict";

// ==========================================================
// 01. PAGE ELEMENTS & TRADING STATE
// ==========================================================

const $=id=>document.getElementById(id);

const TRADING_DATA={
  availableBalance:null,
  todayPnl:null,
  totalProfit:null,
  totalCycles:null,
  winningCycles:null,
  losingCycles:null,
  trades:[]
};

const themeToggle=$("themeToggle");
const themeIcon=$("themeIcon");
const tradeSearch=$("tradeSearch");
const tradeFilter=$("tradeFilter");
const tradeTableBody=$("tradeTableBody");
const tradeEmptyState=$("tradeEmptyState");
const toastContainer=$("toastContainer");
const tradeCodeInput=$("tradeCodeInput");
const balanceInput=$("balanceInput");
const balanceSlider=$("balanceSlider");
const buyTradeBtn=$("buyTradeBtn");
const sellTradeBtn=$("sellTradeBtn");

let countdownTimer=null;
let tradeRunning=false;
let activeCycleId=null;
let tradePopup=null;
let popupCloseTimer=null;

// ==========================================================
// 02. THEME
// ==========================================================

function initTheme(){
  const savedTheme=localStorage.getItem("pipzone_theme")||"dark";
  document.documentElement.setAttribute("data-theme",savedTheme);
  if(themeIcon) themeIcon.textContent=savedTheme==="light"?"☀":"☾";
}

function toggleTheme(){
  const currentTheme=document.documentElement.getAttribute("data-theme")||"dark";
  const newTheme=currentTheme==="light"?"dark":"light";
  document.documentElement.setAttribute("data-theme",newTheme);
  localStorage.setItem("pipzone_theme",newTheme);
  if(themeIcon) themeIcon.textContent=newTheme==="light"?"☀":"☾";
}

// ==========================================================
// 03. TOAST NOTIFICATIONS
// ==========================================================

function showToast(message){
  if(!toastContainer) return;
  const toast=document.createElement("div");
  toast.className="toast";
  toast.textContent=message;
  toastContainer.appendChild(toast);
  setTimeout(()=>{
    toast.style.opacity="0";
    toast.style.transform="translateY(8px)";
    toast.style.transition=".2s ease";
    setTimeout(()=>toast.remove(),220);
  },2800);
}

// ==========================================================
// 04. FORMATTERS
// ==========================================================

function formatMoney(amount){
  const number=Number(amount)||0;
  return (number>=0?"+":"-")+"$"+Math.abs(number).toLocaleString("en-US",{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  });
}

function formatAmount(amount){
  return "$"+Number(amount||0).toLocaleString("en-US",{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  });
}

function formatDate(dateString){
  const date=new Date(dateString);
  if(Number.isNaN(date.getTime())) return dateString||"—";
  return date.toLocaleDateString("en-US",{
    month:"short",
    day:"numeric",
    year:"numeric",
    timeZone:"Asia/Bangkok"
  });
}

function formatThailandTime(dateString){
  const date=new Date(dateString);
  if(Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-GB",{
    hour:"2-digit",
    minute:"2-digit",
    timeZone:"Asia/Bangkok"
  });
}

function thailandDate(dateString){
  const date=new Date(dateString);
  if(Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA",{
    timeZone:"Asia/Bangkok",
    year:"numeric",
    month:"2-digit",
    day:"2-digit"
  }).format(date);
}

// ==========================================================
// 05. BALANCE INPUT & SLIDER
// ==========================================================

function updateAmountControls(){
  const balance=Number(TRADING_DATA.availableBalance)||0;
  const max=Math.max(0,balance);
  if(balanceInput){
    balanceInput.max=max.toFixed(2);
    if(Number(balanceInput.value)>max) balanceInput.value=max.toFixed(2);
  }
  if(balanceSlider){
    balanceSlider.max=max.toFixed(2);
    if(Number(balanceSlider.value)>max) balanceSlider.value=max.toFixed(2);
  }
  updateSelectedAmountDisplay();
}

function updateSelectedAmountDisplay(){
  const inputValue=Number(balanceInput?.value)||0;
  const sliderValue=Number(balanceSlider?.value)||0;
  const amount=balanceInput&&document.activeElement===balanceInput
    ?inputValue
    :sliderValue;

  const selectedDisplay=$("selectedBalanceDisplay");
  const maxDisplay=$("maxBalanceDisplay");

  if(selectedDisplay) selectedDisplay.textContent=formatAmount(amount);
  if(maxDisplay) maxDisplay.textContent=formatAmount(TRADING_DATA.availableBalance||0);

  if(balanceInput&&document.activeElement!==balanceInput){
    balanceInput.value=String(sliderValue);
  }
  if(balanceSlider&&document.activeElement===balanceInput){
    balanceSlider.value=String(Math.min(
      Math.max(0,inputValue),
      Number(balanceSlider.max)||0
    ));
  }
}

function initAmountControls(){
  if(balanceInput){
    balanceInput.addEventListener("input",()=>{
      const max=Number(balanceInput.max)||0;
      let value=Number(balanceInput.value);
      if(!Number.isFinite(value)||value<0) value=0;
      if(value>max) value=max;
      balanceInput.value=String(value);
      if(balanceSlider) balanceSlider.value=String(value);
      updateSelectedAmountDisplay();
    });
  }

  if(balanceSlider){
    balanceSlider.addEventListener("input",()=>{
      if(balanceInput) balanceInput.value=balanceSlider.value;
      updateSelectedAmountDisplay();
    });
  }

  updateAmountControls();
}

// ==========================================================
// 06. TRADE HISTORY SEARCH & FILTER
// ==========================================================


function getFilteredTrades(){
  const search=(tradeSearch?.value||"").trim().toLowerCase();
  const filter=tradeFilter?.value||"all";

  return TRADING_DATA.trades.filter(trade=>{
    const currency=String(trade.currency||"").toLowerCase();
    const direction=String(trade.direction||"").toLowerCase();
    const result=String(trade.result||"").toLowerCase();
    const date=String(trade.date||"").toLowerCase();
    const code=String(trade.code||"").toLowerCase();

    const matchesSearch=!search||
      currency.includes(search)||
      direction.includes(search)||
      result.includes(search)||
      date.includes(search)||
      code.includes(search);

    let matchesFilter=true;
    if(filter==="profit") matchesFilter=result==="profit";
    if(filter==="loss") matchesFilter=result==="loss";
    if(filter==="buy") matchesFilter=direction==="buy";
    if(filter==="sell") matchesFilter=direction==="sell";

    return matchesSearch&&matchesFilter;
  });
}


function renderTrades(){
  if(!tradeTableBody) return;

  const trades=getFilteredTrades();
  tradeTableBody.innerHTML="";

  if(tradeEmptyState){
    tradeEmptyState.classList.toggle("hidden",trades.length>0);
  }

  trades.forEach(trade=>{
    const row=document.createElement("tr");
    const direction=String(trade.direction||"").toUpperCase();
    const result=String(trade.result||"").toLowerCase();
    const status=String(trade.status||"").toLowerCase();
    const directionClass=direction==="BUY"?"direction-buy":"direction-sell";
    const resultClass=result==="profit"?"result-profit":result==="loss"?"result-loss":"";
    const resultLabel=result?result.charAt(0).toUpperCase()+result.slice(1):"Pending";
    const statusClass=status==="settled"?"status-settled":"status-pending";
    const statusLabel=status==="settled"?"Settled":"Pending";

    row.innerHTML=`
      <td>
        <div>${formatDate(trade.date)}</div>
        <div class="mono">${trade.time||"—"} Thailand Time</div>
      </td>
      <td>
  <div class="trade-main">
    <span class="direction-badge ${directionClass}">${direction||"—"}</span>
    <div class="mono" style="font-size:11px;margin-top:5px;overflow-wrap:anywhere">${trade.code||"—"}</div>
  </div>
</td>
      <td><span class="currency-name"></span></td>
      <td class="mono">${formatAmount(trade.amount)}</td>
      <td class="${resultClass}">${resultLabel}</td>
      <td class="${resultClass}">${trade.pnl==null?"—":formatMoney(trade.pnl)}</td>
      <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
    `;
    row.querySelector(".currency-name").textContent=trade.currency||"—";
    tradeTableBody.appendChild(row);
  });
}

function initHistory(){
  if(tradeSearch) tradeSearch.addEventListener("input",renderTrades);
  if(tradeFilter) tradeFilter.addEventListener("change",renderTrades);
}

// ==========================================================
// 07. DASHBOARD STATISTICS
// ==========================================================

function updateStats(){
  const money=value=>value==null||!Number.isFinite(Number(value))
    ?"—":formatMoney(Number(value));
  const count=value=>value==null||!Number.isFinite(Number(value))
    ?"—":Number(value).toLocaleString("en-US");

  if($("availableBalance")){
    $("availableBalance").textContent=money(TRADING_DATA.availableBalance);
  }
  if($("todayPnl")) $("todayPnl").textContent=money(TRADING_DATA.todayPnl);
  if($("totalProfit")) $("totalProfit").textContent=money(TRADING_DATA.totalProfit);
  if($("totalCycles")) $("totalCycles").textContent=count(TRADING_DATA.totalCycles);
  if($("winningCycles")) $("winningCycles").textContent=count(TRADING_DATA.winningCycles);
  if($("losingCycles")) $("losingCycles").textContent=count(TRADING_DATA.losingCycles);

  const cycles=Number(TRADING_DATA.totalCycles);
  const wins=Number(TRADING_DATA.winningCycles);

  if($("winRate")){
    $("winRate").textContent=Number.isFinite(cycles)&&cycles>0&&Number.isFinite(wins)
      ?((wins/cycles)*100).toFixed(1)+"%":"—";
  }

  if($("averageCycle")){
    $("averageCycle").textContent=Number.isFinite(cycles)&&cycles>0&&TRADING_DATA.totalProfit!=null
      ?money(Number(TRADING_DATA.totalProfit)/cycles):"—";
  }
}

// ==========================================================
// 08. SUPABASE ACCOUNT BALANCE
// ==========================================================

async function loadTradingAccountBalance(){
  try{
    const client=window.supabaseClient;
    if(!client) throw new Error("Supabase client unavailable");

    const {data:authData,error:authError}=await client.auth.getUser();
    if(authError) throw authError;

    const user=authData?.user;
    if(!user){
      TRADING_DATA.availableBalance=null;
      updateStats();
      updateAmountControls();
      return;
    }

    const {data,error}=await client
      .from("accounts")
      .select("balance")
      .eq("user_id",user.id)
      .limit(1);

    if(error) throw error;

    const account=data?.[0];
    TRADING_DATA.availableBalance=
      account?.balance!=null&&Number.isFinite(Number(account.balance))
        ?Number(account.balance):null;
  }catch(error){
    console.error("Unable to load trading account balance:",error);
    TRADING_DATA.availableBalance=null;
    showToast("Unable to load your current balance.");
  }

  updateStats();
  updateAmountControls();
}

// ==========================================================
// 09. LOAD REAL TRADE CYCLES & STATISTICS
// ==========================================================



async function loadTradeHistory(){
  try{
    const client=window.supabaseClient;
    if(!client)throw new Error("Supabase client unavailable");

    const {data:authData,error:authError}=await client.auth.getUser();
    if(authError)throw authError;

    if(!authData?.user){
      TRADING_DATA.trades=[];
      TRADING_DATA.totalCycles=0;
      TRADING_DATA.winningCycles=0;
      TRADING_DATA.losingCycles=0;
      TRADING_DATA.totalProfit=0;
      TRADING_DATA.todayPnl=0;
      renderTrades();
      updateStats();
      return;
    }

    const {data:applications,error}=await client
      .from("trade_code_applications")
      .select("id,trade_code_id,user_id,selected_amount,adjustment_amount,selected_direction,code_snapshot,applied_at")
      .eq("user_id",authData.user.id)
      .order("applied_at",{ascending:false});

    if(error)throw error;

    const allTrades=(applications||[])
      .filter(row=>row.applied_at&&String(row.code_snapshot||"").trim())
      .map(row=>{
        const code=String(row.code_snapshot).trim();
        const pnl=row.adjustment_amount==null?null:Number(row.adjustment_amount);
        const currency=code
          .replace(/^PZ-/i,"")
          .replace(/-\d+[A-Z]\d+$/i,"")
          .replace(/-\d+$/,"");

        return {
          id:"application-"+row.id,
          source:"application",
          tradeCodeId:row.trade_code_id,
          date:row.applied_at,
          time:formatThailandTime(row.applied_at),
          direction:String(row.selected_direction||"").toUpperCase(),
          currency:currency||"—",
          code,
          amount:Number(row.selected_amount)||0,
          result:pnl==null?"":pnl>0?"profit":pnl<0?"loss":"",
          pnl,
          status:"settled",
          settledAt:row.applied_at
        };
      })
      .sort((a,b)=>new Date(b.date)-new Date(a.date));

    const settled=allTrades.filter(row=>row.status==="settled");
    const wins=settled.filter(row=>row.result==="profit");
    const losses=settled.filter(row=>row.result==="loss");
    const today=thailandDate(new Date().toISOString());

    TRADING_DATA.trades=allTrades;
    TRADING_DATA.totalCycles=settled.length;
    TRADING_DATA.winningCycles=wins.length;
    TRADING_DATA.losingCycles=losses.length;
    TRADING_DATA.totalProfit=settled.reduce(
      (sum,row)=>sum+(Number(row.pnl)||0),0
    );
    TRADING_DATA.todayPnl=settled
      .filter(row=>row.settledAt&&thailandDate(row.settledAt)===today)
      .reduce((sum,row)=>sum+(Number(row.pnl)||0),0);

    renderTrades();
    updateStats();
  }catch(error){
    console.error("Unable to load trade history:",{
      message:error?.message,
      details:error?.details,
      hint:error?.hint,
      code:error?.code
    });
    showToast("Trade history could not be refreshed.");
  }
}



// ==========================================================
// 10. CIRCULAR 30-SECOND TRADE POPUP
// ==========================================================

function injectTradePopupStyles(){
  if($("tradeCyclePopupStyles")) return;

  const style=document.createElement("style");
  style.id="tradeCyclePopupStyles";
  style.textContent=`
    .pz-cycle-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.72);backdrop-filter:blur(7px)}
    .pz-cycle-modal{width:min(100%,390px);padding:30px 24px;border:1px solid var(--green-border,#2FBF83);border-radius:22px;background:var(--panel,#101513);color:var(--text,#fff);text-align:center;box-shadow:0 24px 90px rgba(0,0,0,.42)}
    .pz-cycle-title{font-size:20px;font-weight:700;margin:0 0 8px}
    .pz-cycle-subtitle{font-size:13px;color:var(--muted,#9aa7a0);margin:0 0 24px;line-height:1.6}
    .pz-cycle-ring{--cycle-progress:0deg;width:174px;height:174px;margin:0 auto 22px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--green,#2FBF83) var(--cycle-progress),var(--border,#28342e) 0deg);position:relative}
    .pz-cycle-ring:before{content:"";position:absolute;inset:9px;border-radius:50%;background:var(--panel,#101513);border:1px solid var(--border,#28342e)}
    .pz-cycle-ring-inner{position:relative;z-index:1}
    .pz-cycle-number{font-size:43px;font-weight:750;line-height:1.1;font-variant-numeric:tabular-nums}
    .pz-cycle-seconds{font-size:12px;color:var(--muted,#9aa7a0);margin-top:5px}
    .pz-cycle-meta{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--border,#28342e);font-size:13px;text-align:left}
    .pz-cycle-meta span:first-child{color:var(--muted,#9aa7a0)}
    .pz-cycle-meta span:last-child{font-weight:650;text-align:right;overflow-wrap:anywhere}
    .pz-cycle-result{font-size:29px;font-weight:800;margin:12px 0}
    .pz-cycle-result.profit{color:var(--green,#2FBF83)}
    .pz-cycle-result.loss{color:var(--loss,#ff6464)}
    .pz-cycle-close{width:100%;margin-top:18px;padding:13px;border:0;border-radius:11px;background:var(--green,#2FBF83);color:#07120c;font-weight:750;cursor:pointer}
    .pz-cycle-close:disabled{opacity:.5;cursor:not-allowed}
    .pz-cycle-note{font-size:12px;color:var(--muted,#9aa7a0);margin-top:14px;line-height:1.5}
    body.pz-cycle-open{overflow:hidden}
    @media(max-width:420px){.pz-cycle-modal{padding:25px 18px}.pz-cycle-ring{width:155px;height:155px}.pz-cycle-number{font-size:39px}}
  `;
  document.head.appendChild(style);
}

function createTradePopup(direction,amount){
  injectTradePopupStyles();

  if(tradePopup) tradePopup.remove();

  const overlay=document.createElement("div");
  overlay.className="pz-cycle-overlay";
  overlay.setAttribute("role","dialog");
  overlay.setAttribute("aria-modal","true");
  overlay.setAttribute("aria-label","Trade cycle status");

  overlay.innerHTML=`
    <div class="pz-cycle-modal">
      <h2 class="pz-cycle-title" data-pz-title>Trade Cycle Running</h2>
      <p class="pz-cycle-subtitle" data-pz-subtitle>Your trade is being processed securely.</p>
      <div class="pz-cycle-ring" data-pz-ring>
        <div class="pz-cycle-ring-inner">
          <div class="pz-cycle-number" data-pz-countdown>30</div>
          <div class="pz-cycle-seconds" data-pz-seconds>SECONDS LEFT</div>
        </div>
      </div>
      <div class="pz-cycle-meta"><span>Direction</span><span data-pz-direction></span></div>
      <div class="pz-cycle-meta"><span>Trade Amount</span><span data-pz-amount></span></div>
      <div class="pz-cycle-meta"><span>Result</span><span data-pz-result>Waiting for settlement</span></div>
      <div class="pz-cycle-result" data-pz-adjustment hidden></div>
      <div class="pz-cycle-meta" data-pz-balance-row hidden><span>Updated Balance</span><span data-pz-balance></span></div>
      <button class="pz-cycle-close" data-pz-close disabled>Trade in progress...</button>
      <p class="pz-cycle-note" data-pz-note>Keep this page open until the cycle is settled.</p>
    </div>
  `;

  overlay.querySelector("[data-pz-direction]").textContent=direction;
  overlay.querySelector("[data-pz-amount]").textContent=formatAmount(amount);
  overlay.querySelector("[data-pz-close]").addEventListener("click",closeTradePopup);

  document.body.appendChild(overlay);
  document.body.classList.add("pz-cycle-open");
  tradePopup=overlay;
  return overlay;
}

function closeTradePopup(){
  if(tradeRunning) return;

  if(popupCloseTimer){
    clearTimeout(popupCloseTimer);
    popupCloseTimer=null;
  }

  if(tradePopup){
    tradePopup.remove();
    tradePopup=null;
  }

  document.body.classList.remove("pz-cycle-open");
}

function updateTradePopupCountdown(remaining){
  if(!tradePopup) return;

  const seconds=Math.max(0,Math.ceil(remaining/1000));
  const progress=Math.max(0,Math.min(1,1-remaining/30000));
  const number=tradePopup.querySelector("[data-pz-countdown]");
  const ring=tradePopup.querySelector("[data-pz-ring]");
  const subtitle=tradePopup.querySelector("[data-pz-subtitle]");

  if(number) number.textContent=String(seconds);
  if(ring) ring.style.setProperty("--cycle-progress",(progress*360)+"deg");
  if(subtitle) subtitle.textContent="Your "+(activeCycleId?"cycle #"+activeCycleId:"trade")+" is running.";
}

function showSettlementResult(result){
  if(!tradePopup) return;

  const isProfit=result.result==="profit";
  const resultLabel=tradePopup.querySelector("[data-pz-result]");
  const adjustment=tradePopup.querySelector("[data-pz-adjustment]");
  const balanceRow=tradePopup.querySelector("[data-pz-balance-row]");
  const balanceLabel=tradePopup.querySelector("[data-pz-balance]");
  const title=tradePopup.querySelector("[data-pz-title]");
  const subtitle=tradePopup.querySelector("[data-pz-subtitle]");
  const countdown=tradePopup.querySelector("[data-pz-countdown]");
  const seconds=tradePopup.querySelector("[data-pz-seconds]");
  const closeButton=tradePopup.querySelector("[data-pz-close]");
  const note=tradePopup.querySelector("[data-pz-note]");
  const ring=tradePopup.querySelector("[data-pz-ring]");

  if(title) title.textContent=isProfit?"Trade Won":"Trade Lost";
  if(subtitle) subtitle.textContent="Your trade cycle has been settled by the server.";
  if(countdown) countdown.textContent=isProfit?"✓":"!";
  if(seconds) seconds.textContent="SETTLED";
  if(ring) ring.style.setProperty("--cycle-progress","360deg");

  if(resultLabel) resultLabel.textContent=isProfit?"Profit":"Loss";
  if(adjustment){
    adjustment.hidden=false;
    adjustment.className="pz-cycle-result "+(isProfit?"profit":"loss");
    adjustment.textContent=formatMoney(result.adjustment_amount);
  }

  if(balanceRow&&result.balance_after!=null){
    balanceRow.hidden=false;
    if(balanceLabel) balanceLabel.textContent=formatAmount(result.balance_after);
  }

  if(closeButton){
    closeButton.disabled=false;
    closeButton.textContent="Close";
  }

  if(note) note.textContent="Your account and transaction history have been updated.";
}

function showSettlementError(message){
  if(!tradePopup) return;

  const title=tradePopup.querySelector("[data-pz-title]");
  const subtitle=tradePopup.querySelector("[data-pz-subtitle]");
  const result=tradePopup.querySelector("[data-pz-result]");
  const countdown=tradePopup.querySelector("[data-pz-countdown]");
  const seconds=tradePopup.querySelector("[data-pz-seconds]");
  const closeButton=tradePopup.querySelector("[data-pz-close]");
  const note=tradePopup.querySelector("[data-pz-note]");

  if(title) title.textContent="Settlement Not Confirmed";
  if(subtitle) subtitle.textContent="The server did not confirm the final result.";
  if(result) result.textContent="Please check your trade history.";
  if(countdown) countdown.textContent="!";
  if(seconds) seconds.textContent="CHECK STATUS";
  if(closeButton){
    closeButton.disabled=false;
    closeButton.textContent="Close";
  }
  if(note) note.textContent=message||"No result has been assumed. Refresh the page and check the recorded cycle.";
}

// ==========================================================
// 11. START TRADE & RUN SERVER-TIMED COUNTDOWN
// ==========================================================

async function startTradeCycle(direction){
  if(tradeRunning) return;

  const client=window.supabaseClient;
  if(!client){
    showToast("Supabase client is unavailable.");
    return;
  }

  const code=(tradeCodeInput?.value||"").trim();
  const amount=Number(balanceInput?.value||balanceSlider?.value||0);
  const balance=Number(TRADING_DATA.availableBalance);

  if(!code){
    showToast("Enter your trade code first.");
    tradeCodeInput?.focus();
    return;
  }

  if(!Number.isFinite(amount)||amount<=0){
    showToast("Enter a balance amount greater than $0.");
    balanceInput?.focus();
    return;
  }

  if(!Number.isFinite(balance)||amount>balance){
    showToast("Selected amount exceeds your current balance.");
    return;
  }

  const {data:authData,error:authError}=await client.auth.getUser().catch(error=>({
    data:null,error
  }));

  if(authError||!authData?.user){
    showToast("Please log in before starting a trade.");
    return;
  }

  tradeRunning=true;
  if(buyTradeBtn) buyTradeBtn.disabled=true;
  if(sellTradeBtn) sellTradeBtn.disabled=true;

  showToast("Starting your trade cycle...");

  try{
    const {data,error}=await client.rpc("start_trade_cycle",{
      p_code:code,
      p_selected_amount:amount,
      p_client_direction:direction.toLowerCase()
    });

    if(error) throw error;

    const cycle=Array.isArray(data)?data[0]:data;
    if(!cycle?.success||cycle.cycle_id==null){
      throw new Error("The server did not confirm the trade cycle.");
    }

    activeCycleId=cycle.cycle_id;
    const overlay=createTradePopup(direction.toUpperCase(),amount);
    const settleAt=Date.parse(cycle.settle_at);

    if(!Number.isFinite(settleAt)){
      throw new Error("The server did not return a valid settlement time.");
    }

    const countdownStartedAt=Date.now();
    const countdownDuration=Math.max(1,settleAt-Date.parse(cycle.started_at||new Date().toISOString()));

    function tick(){
      if(!tradeRunning||!tradePopup) return;

      const remaining=settleAt-Date.now();
      updateTradePopupCountdown(remaining);

      if(remaining<=0){
        clearInterval(countdownTimer);
        countdownTimer=null;
        settleTradeCycle(cycle.cycle_id);
      }
    }

    updateTradePopupCountdown(Math.min(30000,countdownDuration));
    countdownTimer=setInterval(tick,100);
    tick();
  }catch(error){
    console.error("Unable to start trade cycle:",error);
    tradeRunning=false;
    activeCycleId=null;
    if(countdownTimer){
      clearInterval(countdownTimer);
      countdownTimer=null;
    }
    if(tradePopup) closeTradePopup();
    if(buyTradeBtn) buyTradeBtn.disabled=false;
    if(sellTradeBtn) sellTradeBtn.disabled=false;
    showToast(error?.message||"Unable to start trade cycle.");
  }
}

// ==========================================================
// 12. SETTLE TRADE THROUGH SUPABASE RPC
// ==========================================================

async function settleTradeCycle(cycleId,attempt=0){
  try{
    const client=window.supabaseClient;
    if(!client) throw new Error("Supabase client is unavailable.");

    const {data,error}=await client.rpc("settle_trade_cycle",{
      p_cycle_id:cycleId
    });

    if(error){
      if(attempt<4&&/still running/i.test(error.message||"")){
        await new Promise(resolve=>setTimeout(resolve,900));
        return settleTradeCycle(cycleId,attempt+1);
      }
      throw error;
    }

    const result=Array.isArray(data)?data[0]:data;
    if(!result?.success||result.status!=="settled"){
      throw new Error("The server did not confirm settlement.");
    }

    tradeRunning=false;
    activeCycleId=null;

    if(buyTradeBtn) buyTradeBtn.disabled=false;
    if(sellTradeBtn) sellTradeBtn.disabled=false;

    showSettlementResult(result);
    showToast(result.result==="profit"?"Trade settled with profit.":"Trade settled with loss.");

    await Promise.all([
      loadTradingAccountBalance(),
      loadTradeHistory()
    ]);

    if(popupCloseTimer) clearTimeout(popupCloseTimer);
    popupCloseTimer=setTimeout(()=>{
      if(tradePopup) closeTradePopup();
    },4000);
  }catch(error){
    console.error("Unable to settle trade cycle:",error);
    tradeRunning=false;
    activeCycleId=null;

    if(buyTradeBtn) buyTradeBtn.disabled=false;
    if(sellTradeBtn) sellTradeBtn.disabled=false;

    showSettlementError(error?.message);
    showToast("Settlement could not be confirmed. Check your trade history.");

    await Promise.all([
      loadTradingAccountBalance(),
      loadTradeHistory()
    ]);
  }
}

// ==========================================================
// 13. INITIALIZE TRADING PAGE
// ==========================================================

function initTrading(){
  initTheme();
  updateStats();
  initAmountControls();
  initHistory();

  if(themeToggle) themeToggle.addEventListener("click",toggleTheme);
  if(buyTradeBtn) buyTradeBtn.addEventListener("click",()=>startTradeCycle("BUY"));
  if(sellTradeBtn) sellTradeBtn.addEventListener("click",()=>startTradeCycle("SELL"));

  Promise.all([
    loadTradingAccountBalance(),
    loadTradeHistory()
  ]);
}

document.addEventListener("DOMContentLoaded",initTrading);


// topbar ka search box (layout.js) is page ki trade table bhi filter kare
document.addEventListener("pz:search",e=>{
  if(tradeSearch) tradeSearch.value=(e.detail&&e.detail.query)||"";
  renderTrades();
});