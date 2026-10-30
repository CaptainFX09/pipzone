"use strict";

const $=id=>document.getElementById(id);

let UPDATES=[];

function unreadUpdateIds(){
  const seen=window.PZNavBadges?window.PZNavBadges.getSeen("updates"):[];
  return UPDATES.map(u=>u.id).filter(id=>seen.indexOf(id)===-1);
}

let markAllBtn=null;

function syncMarkAll(){
  if(!markAllBtn) return;
  markAllBtn.disabled=unreadUpdateIds().length===0;
}

function setupMarkAll(){
  if(markAllBtn||!window.PZFeedUI||!updateCount) return;

  markAllBtn=window.PZFeedUI.addMarkAll(updateCount,()=>{
    if(window.PZNavBadges){
      window.PZNavBadges.markSeen("updates",UPDATES.map(u=>u.id));
    }
    renderUpdates();
  });

  syncMarkAll();
}

(function injectFeedCss(){
  if(document.getElementById("pzFeedCss")) return;
  const st=document.createElement("style");
  st.id="pzFeedCss";
  st.textContent=
    ".update-card{cursor:pointer;position:relative;transition:border-color .2s ease}"+
    ".update-card .update-body p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}"+
        ".update-card.pz-unread{border-left:3px solid #2fbf83}"+
    ".pz-new{display:inline-block;margin-left:8px;padding:2px 7px;border-radius:999px;background:#2fbf83;color:#06140e;font-size:10px;font-weight:700;letter-spacing:.04em}"+
    ".pz-hint{display:block;margin-top:6px;font-size:11px;opacity:.65}"+
    "";
  document.head.appendChild(st);
})();


const CATEGORY_ICONS={
  "CLIENT PORTAL":"◎","TRADING":"◈","TRANSACTIONS":"↔","REFERRALS":"◎",
  "DEPOSITS":"↓","WITHDRAWALS":"↑","SECURITY":"◆","INTERFACE":"✦"
};

function esc(v){
  return String(v==null?"":v)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

async function getClient(){
  for(let i=0;i<50;i++){
    if(window.supabaseClient) return window.supabaseClient;
    await new Promise(r=>setTimeout(r,200));
  }
  return null;
}

async function loadUpdates(){
  const client=await getClient();
  if(!client) return;

  const {data,error}=await client
    .from("client_updates")
    .select("id,version,category,type,title,message,created_at")
    .order("created_at",{ascending:false});

  if(error){
    console.error("Updates load failed:",error);
    return;
  }

  UPDATES=(data||[]).map(r=>({
    id:r.id,
    version:r.version||"",
    date:r.created_at,
    category:String(r.category||"UPDATE").toUpperCase(),
    type:r.type||"featured",
    icon:CATEGORY_ICONS[String(r.category||"").toUpperCase()]||"↗",
    title:r.title,
    message:r.message
  }));

  renderUpdates();

}

const themeToggle=$("themeToggle");
const themeIcon=$("themeIcon");
const updateList=$("updateList");
const updateCount=$("updateCount");
const updateEmptyState=$("updateEmptyState");
const toastContainer=$("toastContainer");

function initTheme(){
  const savedTheme=localStorage.getItem("pipzone_theme")||"dark";

  document.documentElement.setAttribute("data-theme",savedTheme);

  if(themeIcon){
    themeIcon.textContent=savedTheme==="light"?"☀":"☾";
  }
}

function toggleTheme(){
  const currentTheme=
    document.documentElement.getAttribute("data-theme")||"dark";

  const newTheme=
    currentTheme==="light"?"dark":"light";

  document.documentElement.setAttribute("data-theme",newTheme);
  localStorage.setItem("pipzone_theme",newTheme);

  if(themeIcon){
    themeIcon.textContent=newTheme==="light"?"☀":"☾";
  }
}

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

    setTimeout(()=>{
      toast.remove();
    },220);
  },2800);
}

function formatDate(dateString){
  const date=new Date(
    String(dateString).length<=10?dateString+"T00:00:00":dateString
  );

  if(Number.isNaN(date.getTime())){
    return dateString;
  }

  return date.toLocaleDateString("en-US",{
    month:"short",
    day:"numeric",
    year:"numeric"
  });
}

function getUpdateClass(type){
  if(type==="security") return "security";
  if(type==="trading") return "trading";
  if(type==="maintenance") return "maintenance";
  if(type==="featured") return "featured";

  return "";
}

function renderUpdates(){

  if(!updateList) return;

  updateList.innerHTML="";

  if(updateCount){
    updateCount.textContent=
      `${UPDATES.length} Updates`;
  }

  if(updateEmptyState){
    updateEmptyState.classList.toggle(
      "hidden",
      UPDATES.length>0
    );
  }

  const seen=window.PZNavBadges?window.PZNavBadges.getSeen("updates"):[];
  setupMarkAll();
  syncMarkAll();

  UPDATES.forEach(update=>{

    const card=document.createElement("article");
    const unread=seen.indexOf(update.id)===-1;
    

    card.className=
      `update-card ${getUpdateClass(update.type)}${unread?" pz-unread":""}`;

    card.innerHTML=`
      <div class="update-icon">
        ${update.icon}
      </div>

      <div class="update-body">

        <div class="update-meta">
          <span class="update-category">
            ${esc(update.category)}
          </span>

          <span class="update-date">
            ${formatDate(update.date)}
          </span>
          ${unread?'<span class="pz-new">NEW</span>':""}
        </div>

        <h3>${esc(update.title)}</h3>

        <p>${esc(update.message).replace(/\n/g,"<br>")}</p>
        <span class="pz-hint">Click to open</span>

      </div>

      <div class="update-version">
        ${update.version?"v"+esc(update.version):""}
      </div>
    `;

    card.addEventListener("click",()=>{
      if(window.PZNavBadges){
        window.PZNavBadges.markSeen("updates",[update.id]);
      }

      card.classList.remove("pz-unread");

      const pill=card.querySelector(".pz-new");
      if(pill) pill.remove();

      if(window.PZFeedUI){
        window.PZFeedUI.openModal(update);
      }

      syncMarkAll();
    });

    updateList.appendChild(card);
  });
}

async function loadAppVersion(){
  const client=await getClient();
  if(!client) return;

  const {data,error}=await client
    .from("app_updates")
    .select("version_name,version_code,apk_url,update_message,is_required")
    .eq("is_active",true)
    .order("version_code",{ascending:false})
    .limit(1);

  if(error||!data||!data.length){
    if(error) console.error("App version load failed:",error);
    return;
  }

  const app=data[0];
  const card=document.querySelector(".version-card");
  if(!card) return;

  if(!document.getElementById("pzApkCss")){
    const st=document.createElement("style");
    st.id="pzApkCss";
    st.textContent=
      ".pz-apk-btn{border:0;font-family:inherit;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:8px 14px;border-radius:10px;background:var(--accent-primary,#2fbf83);color:#06140e !important;font-size:12px;font-weight:700;text-decoration:none;cursor:pointer}"+
      ".pz-apk-btn:hover{filter:brightness(1.08)}";
    document.head.appendChild(st);
  }

  const strong=card.querySelector("strong");
  if(strong) strong.textContent=app.version_name||"";

  const status=card.querySelector(".version-status");
  if(status){
    status.textContent=app.is_required?"Required update":"Stable release";
  }

  card.querySelector(".pz-apk-btn")?.remove();

  if(app.apk_url){
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="pz-apk-btn";
    btn.textContent="⬇ Download APK";
    btn.addEventListener("click",()=>{
      const a=document.createElement("a");
      a.href=app.apk_url;
      a.setAttribute("download","PipZoNe.apk");
      a.rel="noopener";
      a.style.display="none";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    card.appendChild(btn);
  }
}

function waitForFeedUi(){
  let tries=0;
  const t=setInterval(()=>{
    tries++;
    if(window.PZFeedUI){
      clearInterval(t);
      renderUpdates();
    }else if(tries>50){
      clearInterval(t);
    }
  },200);
}

function initUpdates(){

  loadAppVersion();
  waitForFeedUi();
  initTheme();
  renderUpdates();
  loadUpdates();
  document.addEventListener("pz:feed-changed",e=>{
    if(e.detail&&e.detail.kind==="updates") loadUpdates();
  });

  if(themeToggle){
    themeToggle.addEventListener(
      "click",
      toggleTheme
    );
  }

  const announcementLink=document.querySelector(
    ".side-link"
  );

  if(announcementLink){
    announcementLink.addEventListener("click",()=>{
      showToast("Opening PipZoNe Announcements.");
    });
  }
}

document.addEventListener(
  "DOMContentLoaded",
  initUpdates
);