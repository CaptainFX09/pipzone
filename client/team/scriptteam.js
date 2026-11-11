
"use strict";

const $=id=>document.getElementById(id);
let TEAM_MEMBERS=[];
let teamSupabaseClient=null;
let TEAM_LOADING=false;
let TEAM_ERROR=false;

const themeToggle=$("themeToggle");
const themeIcon=$("themeIcon");
const teamSearch=$("teamSearch");
const teamStatusFilter=$("teamStatusFilter");
const teamTableBody=$("teamTableBody");
const teamEmptyState=$("teamEmptyState");
const toastContainer=$("toastContainer");


function getTeamSupabase(){
  if(teamSupabaseClient) return teamSupabaseClient;

  // supabase-config.js ka banaya hua client use karein
  if(window.supabaseClient){
    teamSupabaseClient=window.supabaseClient;
    return teamSupabaseClient;
  }

  // fallback: agar config ne client nahi banaya to khud bana lein
  if(
    typeof supabase!=="undefined"&&
    typeof SUPABASE_URL!=="undefined"&&
    typeof SUPABASE_PUBLISHABLE_KEY!=="undefined"
  ){
    teamSupabaseClient=supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    );
    return teamSupabaseClient;
  }

  return null;
}

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

function showToast(message,type="success"){
  if(!toastContainer) return;
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

function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,char=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  })[char]);
}

function formatMoney(amount){
  return "$"+Number(amount||0).toLocaleString("en-US",{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  });
}

function formatCapital(amount){
  return Number(amount||0)>0?formatMoney(amount):"—";
}

function formatDate(dateString){
  if(!dateString) return "—";
  const date=new Date(dateString);
  if(Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US",{
    month:"short",
    day:"numeric",
    year:"numeric"
  });
}

function getMemberInitials(name){
  const parts=String(name||"Client").trim().split(/\s+/);
  return parts.length>1
    ?(parts[0][0]+parts[1][0]).toUpperCase()
    :parts[0].slice(0,2).toUpperCase();
}

function getMemberStatus(member){
  return member.deposit_approved?"active":"pending";
}

function getStatusLabel(status){
  if(status==="active") return "Deposited";
  if(status==="pending") return "No deposit yet";
  return "Inactive";
}

function getFilteredMembers(){
  const searchValue=(teamSearch?.value||"").trim().toLowerCase();
  const statusValue=teamStatusFilter?.value||"all";

  return TEAM_MEMBERS.filter(member=>{
    const name=String(member.name||"Client").toLowerCase();
    const matchesSearch=!searchValue||name.includes(searchValue);
    const matchesStatus=statusValue==="all"||
      getMemberStatus(member)===statusValue;
    return matchesSearch&&matchesStatus;
  });
}

function renderTeamMembers(){
  if(!teamTableBody) return;

  const members=getFilteredMembers();
  teamTableBody.innerHTML="";

  if(teamEmptyState){
    teamEmptyState.classList.toggle(
      "hidden",
      members.length>0||TEAM_LOADING
    );
    if(TEAM_LOADING){
      teamEmptyState.textContent="Loading your team...";
    }else if(TEAM_ERROR){
      teamEmptyState.textContent="Unable to load your team right now.";
      teamEmptyState.classList.remove("hidden");
    }else if(TEAM_MEMBERS.length===0){
      teamEmptyState.textContent="No referrals yet. Share your referral link to invite clients.";
    }else{
      teamEmptyState.textContent="No members match your search or filter.";
    }
  }

  members.forEach(member=>{
    const name=member.name||"Client";
    const status=getMemberStatus(member);
    const capital=Number(member.total_deposited||0);
    const reward=Number(member.commission_earned||0);
    const row=document.createElement("tr");

    row.innerHTML=`
      <td>
        <div class="member-cell">
          <div class="member-avatar">${escapeHtml(getMemberInitials(name))}</div>
          <div class="member-info">
            <div class="member-id">${escapeHtml(name)}</div>
            <div class="member-label">Direct Partner</div>
          </div>
        </div>
      </td>
      <td class="mono">${escapeHtml(formatDate(member.joined_at))}</td>
      <td>
        <span class="status-pill status-${status}">
          ${escapeHtml(getStatusLabel(status))}
        </span>
      </td>
      <td><span class="capital-value">${formatCapital(capital)}</span></td>
      <td>
        <span class="reward-value">${reward>0?"+"+formatMoney(reward):"—"}</span>
      </td>
    `;
    teamTableBody.appendChild(row);
  });
}

function updateStats(){
  const total=TEAM_MEMBERS.length;
  const active=TEAM_MEMBERS.filter(member=>member.deposit_approved).length;
  const capital=TEAM_MEMBERS.reduce(
    (sum,member)=>sum+Number(member.total_deposited||0),0
  );
  const rewards=TEAM_MEMBERS.reduce(
    (sum,member)=>sum+Number(member.commission_earned||0),0
  );

  const setText=(id,value)=>{
    const element=$(id);
    if(element) element.textContent=value;
  };

  setText("totalMembers",total.toLocaleString("en-US"));
  setText("activeMembers",active.toLocaleString("en-US"));
  setText("teamCapital",formatMoney(capital));
  setText("teamRewards","+"+formatMoney(rewards));
  setText("heroTotalMembers",total.toLocaleString("en-US"));
  setText("memberCountBadge",total.toLocaleString("en-US"));
}

async function loadTeamMembers(){
  const client=getTeamSupabase();

  TEAM_LOADING=true;
  TEAM_ERROR=false;
  renderTeamMembers();

  if(!client){
    TEAM_LOADING=false;
    TEAM_ERROR=true;
    renderTeamMembers();
    console.error("Team page: Supabase client not found.");
    return;
  }

  try{
    const {data,error}=await client.rpc("get_referred_clients");

    if(error) throw error;

    TEAM_MEMBERS=Array.isArray(data)?data:[];
    TEAM_MEMBERS=TEAM_MEMBERS.map(member=>({
      ...member,
      total_deposited:Number(member.total_deposited||0),
      commission_earned:Number(member.commission_earned||0),
      deposit_approved:member.deposit_approved===true
    }));

    updateStats();
  }catch(error){
    TEAM_ERROR=true;
    console.error("Team load error:",error);
  }finally{
    TEAM_LOADING=false;
    renderTeamMembers();
  }
}

async function loadTeamRewardTiers(){
  const client=getTeamSupabase();
  const element=$("teamRewardTiers");
  if(!client||!element) return;

  try{
    const {data,error}=await client
      .from("app_settings")
      .select("key,value")
      .in("key",[
        "referral_commission_rate_low",
        "referral_commission_rate_high"
      ]);

    if(error) throw error;

    const settings={};
    (data||[]).forEach(item=>{
      settings[item.key]=Number(item.value);
    });

    const low=settings.referral_commission_rate_low;
    const high=settings.referral_commission_rate_high;

    if(!Number.isFinite(low)||!Number.isFinite(high)) return;

    element.textContent=
      `Deposits up to $499.99 qualify for ${low}%; deposits of $500 or more qualify for ${high}%.`;
  }catch(error){
    console.error("Reward tiers load error:",error);
  }
}

function initSearch(){
  teamSearch?.addEventListener("input",renderTeamMembers);
  teamStatusFilter?.addEventListener("change",renderTeamMembers);
}

function initReferralLink(){
  const inviteButton=document.querySelector(".invite-btn");
  if(!inviteButton) return;
  inviteButton.addEventListener("click",()=>{
    showToast("Opening your Refer & Earn program.");
  });
}

function initTeam(){
  initTheme();
  initSearch();
  initReferralLink();

  themeToggle?.addEventListener("click",toggleTheme);

  updateStats();
  loadTeamMembers();
  loadTeamRewardTiers();
}

document.addEventListener("DOMContentLoaded",initTeam);