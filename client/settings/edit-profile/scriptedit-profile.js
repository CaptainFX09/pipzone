
"use strict";

const $=id=>document.getElementById(id);
let profileSupabase=null;
let currentUser=null;
let profileData=null;
let saving=false;

const profileForm=$("profileForm");
const themeToggle=$("themeToggle");
const themeIcon=$("themeIcon");
const saveProfileBtn=$("saveProfileBtn");
const saveButtonLabel=$("saveButtonLabel");
const formFeedback=$("formFeedback");
const toastContainer=$("toastContainer");

const firstName=$("firstName");
const lastName=$("lastName");
const phone=$("phone");
const address=$("address");
const city=$("city");
const state=$("state");
const postalCode=$("postalCode");
const trc20Wallet=$("trc20Wallet");
const bep20Wallet=$("bep20Wallet");
const accountEmail=$("accountEmail");

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

/* ============================================
   THEME
============================================ */

function initTheme(){
  const saved=localStorage.getItem("pipzone_theme")||"dark";
  document.documentElement.setAttribute("data-theme",saved);
  updateThemeIcon();
}

function updateThemeIcon(){
  if(!themeIcon)return;
  const theme=document.documentElement.getAttribute("data-theme");
  themeIcon.textContent=theme==="light"?"☾":"☀";
}

function toggleTheme(){
  const current=document.documentElement.getAttribute("data-theme")||"dark";
  const next=current==="light"?"dark":"light";

  document.documentElement.setAttribute("data-theme",next);
  localStorage.setItem("pipzone_theme",next);
  updateThemeIcon();
}

/* ============================================
   FEEDBACK AND TOAST
============================================ */

function setFeedback(message,type=""){
  if(!formFeedback)return;
  formFeedback.textContent=message;
  formFeedback.className="form-feedback";
  if(type)formFeedback.classList.add(type);
}

function showToast(message,type="success"){
  if(!toastContainer)return;

  const toast=document.createElement("div");
  toast.className=`toast ${type}`;

  const icon=document.createElement("div");
  icon.className="toast-icon";
  icon.textContent=type==="error"?"!":"✓";

  const text=document.createElement("div");
  text.textContent=message;

  toast.append(icon,text);
  toastContainer.appendChild(toast);

  setTimeout(()=>{
    toast.style.opacity="0";
    toast.style.transform="translateY(8px)";
    toast.style.transition=".2s ease";
    setTimeout(()=>toast.remove(),220);
  },3200);
}

/* ============================================
   WALLET LOCK
============================================ */

function hasSavedWallet(){
  return Boolean(
    String(profileData?.wallet_address||"").trim()||
    String(profileData?.wallet_address_bep20||"").trim()
  );
}

function applyWalletLockState(){
  const locked=hasSavedWallet();

  [trc20Wallet,bep20Wallet].forEach(input=>{
    if(!input)return;

    input.readOnly=locked;
    input.setAttribute("aria-readonly",String(locked));
    input.classList.toggle("wallet-locked-input",locked);
  });

  const notice=document.querySelector(
    "[data-wallet-lock-notice],.wallet-lock-notice"
  );
  if(notice)notice.hidden=!locked;
}

/* ============================================
   LOAD PROFILE FROM SUPABASE
============================================ */

function populateProfile(){
  const p=profileData||{};

  if(firstName)firstName.value=p.first_name||"";
  if(lastName)lastName.value=p.last_name||"";
  if(phone)phone.value=p.phone||"";
  if(address)address.value=p.address||"";
  if(city)city.value=p.city||"";
  if(state)state.value=p.state||"";
  if(postalCode)postalCode.value=p.postal_code||"";
  if(trc20Wallet)trc20Wallet.value=p.wallet_address||"";
  if(bep20Wallet)bep20Wallet.value=p.wallet_address_bep20||"";

  if(accountEmail)accountEmail.textContent=currentUser?.email||"Email unavailable";

  const clientId=$("clientId");
  if(clientId){
    clientId.textContent=p.verified_client_number!=null
      ?`PZ${p.verified_client_number}`:"";
  }

  applyWalletLockState();
}

async function loadProfile(){
  setFeedback("Loading your profile...");

  if(saveProfileBtn)saveProfileBtn.disabled=true;

  try{
    const client=getSupabaseClient();
    const {data:authData,error:authError}=await client.auth.getUser();

    if(authError)throw authError;

    currentUser=authData?.user;

    if(!currentUser){
      throw new Error("Please sign in to edit your profile.");
    }

    const {data,error}=await client
      .from("profiles")
      .select("id,first_name,last_name,full_name,phone,address,city,state,postal_code,wallet_address,wallet_address_bep20,verified_client_number")
      .eq("id",currentUser.id)
      .maybeSingle();

    if(error)throw error;
    if(!data)throw new Error("Your profile record was not found.");

    profileData=data;
    populateProfile();
    setFeedback("");
  }catch(error){
    console.error("Edit Profile load error:",error);

    const message=/expired|invalid jwt|jwt expired/i.test(error?.message||"")
      ?"Your session has expired. Please sign in again."
      :(error?.message||"Could not load your profile.");

    setFeedback(message,"error");
    showToast(message,"error");
  }finally{
    if(saveProfileBtn)saveProfileBtn.disabled=!currentUser||!profileData;
  }
}

/* ============================================
   VALIDATION
============================================ */

function validateProfile(){
  const required=[
    [firstName,"First name"],
    [lastName,"Last name"],
    [phone,"Phone"],
    [address,"Address"],
    [city,"City"],
    [state,"State"],
    [postalCode,"Postal code"]
  ];

  for(const [input,label] of required){
    if(!input||!input.value.trim()){
      input?.focus();
      setFeedback(`${label} is required.`,"error");
      return false;
    }
  }

  const digits=phone.value.trim().replace(/\D/g,"");
  if(digits.length<7||digits.length>15){
    phone.focus();
    setFeedback("Please enter a valid phone number.","error");
    return false;
  }

  const trc=trc20Wallet?.value.trim()||"";
  const bep=bep20Wallet?.value.trim()||"";

  if(!hasSavedWallet()&&!trc&&!bep){
    trc20Wallet?.focus();
    setFeedback("Add at least one TRC20 or BEP20 wallet address.","error");
    return false;
  }

  if(!hasSavedWallet()){
    if(trc&&trc.length<20){
      trc20Wallet.focus();
      setFeedback("Please check your TRC20 wallet address.","error");
      return false;
    }

    if(bep&&bep.length<20){
      bep20Wallet.focus();
      setFeedback("Please check your BEP20 wallet address.","error");
      return false;
    }
  }

  return true;
}

/* ============================================
   SAVE PROFILE TO SUPABASE
============================================ */

async function saveProfile(event){
  event?.preventDefault();

  if(saving)return;

  if(!currentUser||!profileData){
    setFeedback("Your profile has not loaded. Reload the page and try again.","error");
    return;
  }

  if(!validateProfile())return;

  saving=true;
  if(saveProfileBtn)saveProfileBtn.disabled=true;
  if(saveButtonLabel)saveButtonLabel.textContent="Saving...";
  setFeedback("Saving your profile...");

  try{
    const updates={
      first_name:firstName.value.trim(),
      last_name:lastName.value.trim(),
      full_name:`${firstName.value.trim()} ${lastName.value.trim()}`.trim(),
      phone:phone.value.trim(),
      address:address.value.trim(),
      city:city.value.trim(),
      state:state.value.trim(),
      postal_code:postalCode.value.trim()
    };

    // Existing saved wallets are never overwritten.
    if(!hasSavedWallet()){
      updates.wallet_address=trc20Wallet.value.trim()||null;
      updates.wallet_address_bep20=bep20Wallet.value.trim()||null;
    }

    const client=getSupabaseClient();
    const {data,error}=await client
      .from("profiles")
      .update(updates)
      .eq("id",currentUser.id)
      .select("id,first_name,last_name,full_name,phone,address,city,state,postal_code,wallet_address,wallet_address_bep20,verified_client_number")
      .maybeSingle();

    if(error)throw error;

    if(!data){
      throw new Error("No profile was updated. Check your profiles UPDATE policy and permissions.");
    }

    profileData=data;
    populateProfile();

    setFeedback("Profile saved successfully.","success");
    showToast("Your profile has been saved successfully.");

  }catch(error){
    console.error("Edit Profile save error:",error);

    let message=error?.message||"Unable to save your profile.";

    if(error?.code==="42501"){
      message="Database permission denied (42501). The profiles UPDATE policy must allow this user to update their own record.";
    }else if(/expired|invalid jwt|jwt expired/i.test(message)){
      message="Your session has expired. Please sign in again.";
    }

    setFeedback(message,"error");
    showToast(message,"error");

  }finally{
    saving=false;
    if(saveProfileBtn)saveProfileBtn.disabled=!currentUser||!profileData;
    if(saveButtonLabel)saveButtonLabel.textContent="Save Changes";
  }
}

/* ============================================
   INPUT LISTENERS
============================================ */

function attachInputListeners(){
  [
    firstName,lastName,phone,address,city,state,postalCode,
    trc20Wallet,bep20Wallet
  ].forEach(input=>{
    input?.addEventListener("input",()=>{
      if(formFeedback){
        formFeedback.textContent="";
        formFeedback.className="form-feedback";
      }
    });
  });
}

/* ============================================
   INIT
============================================ */

document.addEventListener("DOMContentLoaded",()=>{
  initTheme();

  themeToggle?.addEventListener("click",toggleTheme);
  profileForm?.addEventListener("submit",saveProfile);

  if(saveProfileBtn&&profileForm){
    saveProfileBtn.addEventListener("click",event=>{
      if(saveProfileBtn.type!=="submit"){
        event.preventDefault();
        profileForm.requestSubmit();
      }
    });
  }

  attachInputListeners();
  loadProfile();
});