/**
 * PipZoNe — Deposit Capital
 * Theme / sidebar / topbar: shared/layout.js
 * Profile check: shared/profile-gate.js (complete profile ke bina deposit nahi)
 * Submit: Supabase Storage (deposit-proofs) + deposits table — live site jaisa hi.
 */

const WALLET_DATA={
  TRC20:{
    name:"USDT (Tether) · TRC20",
    network:"TRC20",
    address:"TZ1xrSedo6vPVqc6kY2fE7JDunsVoJZUT8",
    qr:"../../assets/qr/qr-trc20.png"
  },
  BEP20:{
    name:"USDT (Tether) · BEP20",
    network:"BEP20",
    address:"0xf4a61fbfc905b5b66077878e12ffa4566374d54d",
    qr:"../../assets/qr/qr-bep20.png"
  }
};

const PROOF_BUCKET="deposit-proofs";
const MAX_PROOF_SIZE=5*1024*1024;

// Page khulte hi konsa method selected ho (Recommended wala)
let selectedNetwork="BEP20";

// null = abhi check ho raha hai, true = profile complete, false = incomplete/error
let profileReady=null;
let submitting=false;
let gatePromise=null;

document.addEventListener("DOMContentLoaded",()=>{
  initMethodCards();
  initCopyWallet();
  initAmount();
  initScreenshot();
  initDepositForm();
  updateNetworkUI();

  updateSubmitState();
  refreshProfileGate();

  // Edit Profile se wapas aane par (back button / tab switch) dobara check
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible"&&!submitting)refreshProfileGate();
  });
  window.addEventListener("pageshow",event=>{
    if(event.persisted&&!submitting)refreshProfileGate();
  });
});

/* ====================================================================
   0. Profile gate
==================================================================== */

function refreshProfileGate(){
  if(gatePromise)return gatePromise;

  gatePromise=(async()=>{
    const gate=window.PipZoNeProfile;
    const box=document.getElementById("profileGate");
    let result;

    if(!gate){
      // profile-gate.js load nahi hui: deposit band rakho (safe side)
      result={
        status:"error",
        missing:[],
        message:"Profile check is unavailable. Please refresh the page."
      };
      if(box)box.textContent=result.message;
    }else{
      result=await gate.check();
      gate.renderBanner(box,result,{purpose:"deposit",onRetry:refreshProfileGate});
    }

    profileReady=result.status==="complete";
    updateSubmitState();
    return result;
  })().finally(()=>{
    gatePromise=null;
  });

  return gatePromise;
}

function updateSubmitState(){
  const button=document.getElementById("submitDepositBtn");
  const form=document.getElementById("depositForm");

  if(form)form.classList.toggle("pz-locked",profileReady===false);

  if(button){
    button.disabled=submitting||profileReady!==true;
    button.title=profileReady===false?"Complete your profile to make a deposit.":"";
  }
}

/* ====================================================================
   1. Payment method cards (BEP20 / TRC20)
==================================================================== */

function initMethodCards(){
  document.querySelectorAll(".method-card").forEach(card=>{
    card.addEventListener("click",()=>{
      const network=card.dataset.network;

      if(!WALLET_DATA[network])return;

      selectedNetwork=network;
      updateNetworkUI();
      clearNetworkErrors();

      // Card chunne ke baad Step 02 (QR + address) par le jao.
      const walletCard=document.querySelector(".wallet-card");
      if(walletCard)walletCard.scrollIntoView({behavior:"smooth",block:"start"});
    });
  });
}

function updateNetworkUI(){
  const data=WALLET_DATA[selectedNetwork];

  document.querySelectorAll(".method-card").forEach(card=>{
    const isSelected=card.dataset.network===selectedNetwork;
    card.classList.toggle("selected",isSelected);
    card.setAttribute("aria-pressed",String(isSelected));
  });

  const walletNetwork=document.getElementById("walletNetwork");
  const walletAddress=document.getElementById("walletAddress");
  const walletQr=document.getElementById("walletQr");
  const summaryNetwork=document.getElementById("summaryNetwork");

  if(walletNetwork)walletNetwork.textContent=data.name;
  if(walletAddress)walletAddress.textContent=data.address;
  if(walletQr){
    walletQr.src=data.qr;
    walletQr.alt=`${data.name} Deposit QR`;
  }
  if(summaryNetwork)summaryNetwork.textContent=data.name;
}

/* ====================================================================
   2. Copy wallet address
==================================================================== */

function initCopyWallet(){
  const button=document.getElementById("copyWalletBtn");
  if(!button)return;

  button.addEventListener("click",async()=>{
    const address=WALLET_DATA[selectedNetwork].address;

    try{
      await navigator.clipboard.writeText(address);
      const oldText=button.textContent;
      button.textContent="COPIED";

      showToast(
        `${WALLET_DATA[selectedNetwork].name} wallet address copied.`,
        "success"
      );

      setTimeout(()=>{
        button.textContent=oldText;
      },1600);
    }catch(error){
      showToast("Unable to copy wallet address.","error");
    }
  });
}

/* ====================================================================
   3. Amount summary
==================================================================== */

function initAmount(){
  const input=document.getElementById("depositAmount");
  const summary=document.getElementById("summaryAmount");

  if(!input||!summary)return;

  input.addEventListener("input",()=>{
    const amount=parseFloat(input.value);

    summary.textContent=
      Number.isFinite(amount)&&amount>0
        ? formatUSDT(amount)
        : "$0.00";
  });
}

/* ====================================================================
   4. Screenshot upload
==================================================================== */

function resetUploadBox(){
  const title=document.getElementById("uploadTitle");
  const subtitle=document.getElementById("uploadSubtitle");
  const box=document.querySelector(".upload-box");

  if(title)title.textContent="Upload screenshot";
  if(subtitle)subtitle.textContent="PNG, JPG or PDF · Max 5 MB";
  if(box)box.classList.remove("has-file");
}

function initScreenshot(){
  const input=document.getElementById("depositScreenshot");
  const title=document.getElementById("uploadTitle");
  const subtitle=document.getElementById("uploadSubtitle");
  const box=document.querySelector(".upload-box");

  if(!input)return;

  input.addEventListener("change",()=>{
    const file=input.files&&input.files[0];

    if(!file){
      resetUploadBox();
      return;
    }

    if(file.size>MAX_PROOF_SIZE){
      input.value="";
      resetUploadBox();
      showToast("File size must not exceed 5 MB.","error");
      return;
    }

    title.textContent=file.name;
    subtitle.textContent=formatFileSize(file.size);
    box.classList.add("has-file");

    clearError("screenshotError");
  });
}

/* ====================================================================
   5. Deposit form — asli submit (Supabase)
==================================================================== */

function getClient(){
  return window.supabaseClient||null;
}

async function uploadProof(client,userId,file){
  const ext=(file.name.split(".").pop()||"png").toLowerCase().replace(/[^a-z0-9]/g,"")||"png";
  const path=`${userId}/${Date.now()}.${ext}`;

  const {error:uploadError}=await client.storage
    .from(PROOF_BUCKET)
    .upload(path,file);

  if(uploadError)throw uploadError;

  const {data:urlData}=client.storage.from(PROOF_BUCKET).getPublicUrl(path);
  return urlData?.publicUrl||null;
}

function initDepositForm(){
  const form=document.getElementById("depositForm");
  if(!form)return;

  form.addEventListener("submit",event=>{
    event.preventDefault();
    handleSubmit(form);
  });
}

async function handleSubmit(form){
  if(submitting)return;

  submitting=true;
  updateSubmitState();

  const submitButton=document.getElementById("submitDepositBtn");
  const originalHTML=submitButton.innerHTML;
  let succeeded=false;

  try{
    clearErrors();

    /* ---------- 1) Profile complete hai? (har submit par fresh check) ---------- */
    const gateResult=await refreshProfileGate();

    if(gateResult.status!=="complete"){
      showToast(
        gateResult.status==="incomplete"
          ?"Please complete your profile before making a deposit."
          :(gateResult.message||"We could not verify your profile."),
        "error"
      );
      const banner=document.getElementById("profileGate");
      if(banner)banner.scrollIntoView({behavior:"smooth",block:"center"});
      return;
    }

    /* ---------- 2) Form validation ---------- */
    const amountInput=document.getElementById("depositAmount");
    const txHashInput=document.getElementById("txHash");
    const screenshotInput=document.getElementById("depositScreenshot");

    const amount=parseFloat(amountInput.value);
    const txHash=txHashInput.value.trim();
    const screenshot=screenshotInput.files&&screenshotInput.files[0];

    let valid=true;

    if(!Number.isFinite(amount)||amount<100){
      setError("amountError","Minimum deposit amount is $100 USDT (Tether).");
      valid=false;
    }

    if(!txHash){
      setError("txHashError","Please enter your blockchain transaction hash.");
      valid=false;
    }else if(txHash.length<10){
      setError("txHashError","Please enter a valid transaction hash.");
      valid=false;
    }

    if(!screenshot){
      setError("screenshotError","Please upload your payment screenshot.");
      valid=false;
    }else if(screenshot.size>MAX_PROOF_SIZE){
      setError("screenshotError","Screenshot must not exceed 5 MB.");
      valid=false;
    }else if(!/^image\//.test(screenshot.type)&&screenshot.type!=="application/pdf"){
      setError("screenshotError","Please upload an image (PNG, JPG) or a PDF.");
      valid=false;
    }

    if(!valid){
      showToast("Please correct the highlighted fields.","error");
      return;
    }

    /* ---------- 3) Connection + login ---------- */
    const client=getClient();
    if(!client){
      showToast("Connection is not ready. Please refresh the page and try again.","error");
      return;
    }

    const {data:authData,error:authError}=await client.auth.getUser();
    if(authError)throw authError;

    const user=authData&&authData.user;
    if(!user){
      showToast("Please log in again to submit a deposit.","error");
      return;
    }

    submitButton.innerHTML=
      "<span>Submitting...</span><span class=\"submit-arrow\">↻</span>";

    /* ---------- 4) Screenshot upload ---------- */
    let proofUrl;
    try{
      proofUrl=await uploadProof(client,user.id,screenshot);
    }catch(uploadError){
      console.error("Deposit proof upload failed:",uploadError);
      setError("screenshotError","Screenshot upload failed: "+(uploadError.message||"please try again."));
      showToast("Screenshot upload failed. Please try again.","error");
      return;
    }

    /* ---------- 5) deposits table mein row ---------- */
    const {error:insertError}=await client.from("deposits").insert({
      user_id:user.id,
      amount:amount,
      currency:"USDT",
      network:selectedNetwork,
      tx_hash:txHash,
      status:"pending",
      proof_url:proofUrl
    });

    if(insertError){
      console.error("Deposit insert failed:",insertError);

      // Same tx hash dobara: Postgres unique violation
      if(insertError.code==="23505"){
        setError("txHashError","This transaction hash was already submitted.");
        showToast("This transaction hash was already submitted.","error");
      }else{
        showToast(insertError.message||"Deposit submission failed. Please try again.","error");
      }
      return;
    }

    /* ---------- 6) Kamyabi ---------- */
    succeeded=true;

    showToast(
      `Deposit request for ${formatUSDT(amount)} USDT via ${selectedNetwork} submitted. It is pending verification.`,
      "success"
    );

    submitButton.innerHTML=
      "<span>Deposit Submitted</span><span class=\"submit-arrow\">✓</span>";

  }catch(error){
    console.error("Deposit submit error:",error);
    showToast("Unable to submit deposit request right now.","error");
  }finally{
    if(succeeded){
      setTimeout(()=>{
        form.reset();

        const summary=document.getElementById("summaryAmount");
        if(summary)summary.textContent="$0.00";
        resetUploadBox();

        submitButton.innerHTML=originalHTML;
        submitting=false;
        updateSubmitState();
      },1800);
    }else{
      submitButton.innerHTML=originalHTML;
      submitting=false;
      updateSubmitState();
    }
  }
}

/* ====================================================================
   6. Helpers
==================================================================== */

function clearErrors(){
  document.querySelectorAll(".field-error").forEach(element=>{
    element.textContent="";
  });
}

function clearNetworkErrors(){
  clearError("amountError");
  clearError("txHashError");
  clearError("screenshotError");
}

function clearError(id){
  const element=document.getElementById(id);
  if(element)element.textContent="";
}

function setError(id,message){
  const element=document.getElementById(id);
  if(element)element.textContent=message;
}

function formatUSDT(amount){
  return `$${Number(amount).toLocaleString("en-US",{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  })}`;
}

function formatFileSize(bytes){
  if(bytes<1024)return `${bytes} B`;
  if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(2)} MB`;
}

function showToast(message,type="success"){
  const container=document.getElementById("toastContainer");
  if(!container)return;

  const toast=document.createElement("div");
  toast.className=`toast ${type}`;
  toast.textContent=message;

  container.appendChild(toast);

  setTimeout(()=>{
    toast.style.opacity="0";
    toast.style.transform="translateY(8px)";
    toast.style.transition=".2s ease";

    setTimeout(()=>{
      toast.remove();
    },220);
  },3500);
}