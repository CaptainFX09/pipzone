
"use strict";

const $=id=>document.getElementById(id);
let profileSupabase=null;

function getSupabaseClient(){
  if(profileSupabase)return profileSupabase;

  // supabase-config.js ka banaya hua client use karein
  if(window.supabaseClient){
    profileSupabase=window.supabaseClient;
    return profileSupabase;
  }

  // fallback: agar config ne client nahi banaya
  if(typeof supabase==="undefined"||
     typeof SUPABASE_URL==="undefined"||
     typeof SUPABASE_PUBLISHABLE_KEY==="undefined"){
    throw new Error("Supabase configuration is missing. Check supabase-config.js.");
  }
  profileSupabase=supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );
  return profileSupabase;
}

function setText(id,value,fallback="Not added"){
  const el=$(id);
  if(el)el.textContent=value==null||String(value).trim()===""
    ?fallback:String(value);
}

function markComplete(id,complete){
  const el=$(id);
  if(!el)return;
  el.classList.toggle("complete",complete);
  el.setAttribute("aria-label",complete?"Complete":"Incomplete");
}

function showProfileError(message){
  console.error("View Profile:",message);
  let notice=$("profileLoadNotice");
  if(!notice){
    notice=document.createElement("div");
    notice.id="profileLoadNotice";
    notice.setAttribute("role","alert");
    notice.style.cssText="margin:12px 0;padding:12px 16px;border:1px solid #b45309;border-radius:8px;color:inherit;background:rgba(180,83,9,.10);overflow-wrap:anywhere;";
    const shell=document.querySelector(".page-shell");
    if(shell)shell.prepend(notice);
    else document.body.prepend(notice);
  }
  notice.textContent=message;
  notice.hidden=false;
}

function hideProfileError(){
  const notice=$("profileLoadNotice");
  if(notice)notice.hidden=true;
}

function updateCompletion(p){
  const personal=Boolean(
    String(p.first_name||"").trim()&&
    String(p.last_name||"").trim()&&
    String(p.phone||"").trim()
  );

  const address=Boolean(
    String(p.address||"").trim()&&
    String(p.city||"").trim()&&
    String(p.state||"").trim()&&
    String(p.postal_code||"").trim()
  );

  const wallet=Boolean(
    String(p.wallet_address||"").trim()||
    String(p.wallet_address_bep20||"").trim()
  );

  const completed=[personal,address,wallet].filter(Boolean).length;
  const percent=Math.round(completed/3*100);

  setText("completionPercent",`${percent}%`);
  const bar=$("completionBar");
  if(bar){
    bar.style.width=`${percent}%`;
    bar.setAttribute("aria-valuenow",String(percent));
  }

  markComplete("checkPersonal",personal);
  markComplete("checkAddress",address);
  markComplete("checkWallet",wallet);
}

function renderProfile(p,user){
  const first=String(p.first_name||"").trim();
  const last=String(p.last_name||"").trim();
  const fullName=[first,last].filter(Boolean).join(" ")||
    String(p.full_name||"").trim();

  setText("profileFullName",fullName,"Name not added");
  setText("profileEmail",user.email,"Email unavailable");
  setText("firstNameValue",first);
  setText("lastNameValue",last);
  setText("phoneValue",p.phone);
  setText("emailValue",user.email,"Email unavailable");
  setText("addressValue",p.address);
  setText("cityValue",p.city);
  setText("stateValue",p.state);
  setText("postalCodeValue",p.postal_code);

  const clientId=p.verified_client_number!=null
    ?`PZ${p.verified_client_number}`:"Not assigned";

  setText("clientId",clientId,"Not assigned");
  setText("sideClientId",clientId,"Not assigned");

  const avatar=$("profileAvatar");
  if(avatar){
    const initials=fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0,2)
      .map(part=>part[0].toUpperCase())
      .join("");
    avatar.textContent=initials||"PZ";
  }

  const trc20=String(p.wallet_address||"").trim();
  const bep20=String(p.wallet_address_bep20||"").trim();

  setText("trc20Wallet",trc20,"Not added");
  setText("bep20Wallet",bep20,"Not added");
  setText("trc20Status",trc20?"Added":"Not Added");
  setText("bep20Status",bep20?"Added":"Not Added");

  updateCompletion(p);
}

async function loadProfile(){
  try{
    hideProfileError();
    const client=getSupabaseClient();

    const {data:authData,error:authError}=await client.auth.getUser();
    if(authError)throw authError;

    const user=authData?.user;
    if(!user){
      showProfileError("You are not signed in. Please sign in to view your profile.");
      return;
    }

    const {data,error}=await client
      .from("profiles")
      .select("id,first_name,last_name,full_name,phone,address,city,state,postal_code,wallet_address,wallet_address_bep20,verified_client_number")
      .eq("id",user.id)
      .maybeSingle();

    if(error)throw error;
    if(!data){
      showProfileError("Your PipZoNe profile record was not found. Please contact support.");
      return;
    }

    renderProfile(data,user);
  }catch(error){
    console.error("View Profile load error:",error);

    const message=error?.message||"Unknown error";
    if(/expired|invalid jwt|jwt expired/i.test(message)){
      showProfileError("Your login session has expired. Please sign in again, then reopen View Profile.");
    }else{
      showProfileError(`Could not load your profile: ${message}`);
    }
  }
}

function initTheme(){
  const saved=localStorage.getItem("pipzone_theme")||"dark";
  document.documentElement.setAttribute("data-theme",saved);
  updateThemeIcon();
}

function updateThemeIcon(){
  const icon=$("themeIcon");
  if(!icon)return;
  const theme=document.documentElement.getAttribute("data-theme");
  icon.textContent=theme==="light"?"☾":"☀";
}

function toggleTheme(){
  const current=document.documentElement.getAttribute("data-theme");
  const next=current==="light"?"dark":"light";
  document.documentElement.setAttribute("data-theme",next);
  localStorage.setItem("pipzone_theme",next);
  updateThemeIcon();
}

document.addEventListener("DOMContentLoaded",()=>{
  initTheme();
  const toggle=$("themeToggle");
  if(toggle)toggle.addEventListener("click",toggleTheme);
  loadProfile();
});