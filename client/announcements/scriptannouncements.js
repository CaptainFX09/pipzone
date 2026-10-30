"use strict";

const $=id=>document.getElementById(id);

let ANNOUNCEMENTS=[];

let markAllBtn=null;

function setupMarkAll(){
  if(markAllBtn||!window.PZFeedUI||!announcementCount) return;

  markAllBtn=window.PZFeedUI.addMarkAll(announcementCount,()=>{
    if(window.PZNavBadges){
      window.PZNavBadges.markSeen("notices",ANNOUNCEMENTS.map(a=>a.id));
    }
    ANNOUNCEMENTS.forEach(a=>{ readState[a.id]=true; });
    saveReadState();
    renderAnnouncements();
    showToast("All announcements marked as read.");
  });
}

(function injectFeedCss(){
  if(document.getElementById("pzFeedCss")) return;
  const st=document.createElement("style");
  st.id="pzFeedCss";
  st.textContent=
    ".announcement-card{cursor:pointer;position:relative;transition:border-color .2s ease}"+
    ".announcement-card .announcement-body p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}"+
        ".announcement-card.pz-unread{border-left:3px solid #2fbf83}"+
    ".pz-new{display:inline-block;margin-left:8px;padding:2px 7px;border-radius:999px;background:#2fbf83;color:#06140e;font-size:10px;font-weight:700;letter-spacing:.04em}"+
    ".pz-hint{display:block;margin-top:6px;font-size:11px;opacity:.65}"+
    "";
  document.head.appendChild(st);
})();


const CATEGORY_ICONS={
  PLATFORM:"↗",TRADING:"◈",SCHEDULE:"◷",SECURITY:"◆",
  DEPOSITS:"↓",WITHDRAWALS:"↑",MAINTENANCE:"✦"
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

async function loadAnnouncements(){
  const client=await getClient();
  if(!client) return;

  const {data,error}=await client
    .from("client_notices")
    .select("id,category,type,title,message,created_at")
    .order("created_at",{ascending:false});

  if(error){
    console.error("Announcements load failed:",error);
    return;
  }

  ANNOUNCEMENTS=(data||[]).map(r=>({
    id:r.id,
    category:String(r.category||"PLATFORM").toUpperCase(),
    type:r.type||"platform",
    icon:CATEGORY_ICONS[String(r.category||"").toUpperCase()]||"↗",
    title:r.title,
    message:r.message,
    date:r.created_at
  }));

  renderAnnouncements();
}

const themeToggle=$("themeToggle");
const themeIcon=$("themeIcon");
const announcementList=$("announcementList");
const announcementCount=$("announcementCount");
const announcementEmptyState=$("announcementEmptyState");
const toastContainer=$("toastContainer");

let readState={};

function initTheme(){
  const savedTheme=localStorage.getItem("pipzone_theme")||"dark";

  document.documentElement.setAttribute("data-theme",savedTheme);

  if(themeIcon){
    themeIcon.textContent=savedTheme==="light"?"☀":"☾";
  }
}

function toggleTheme(){
  const currentTheme=document.documentElement.getAttribute("data-theme")||"dark";
  const newTheme=currentTheme==="light"?"dark":"light";

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

function loadReadState(){
  try{
    const saved=localStorage.getItem("pipzone_announcement_read");

    if(saved){
      readState=JSON.parse(saved)||{};
    }
  }catch(error){
    readState={};
  }
}

function saveReadState(){
  try{
    localStorage.setItem(
      "pipzone_announcement_read",
      JSON.stringify(readState)
    );
  }catch(error){}
}

function isAnnouncementRead(item){
  const seen=window.PZNavBadges?window.PZNavBadges.getSeen("notices"):[];
  return seen.indexOf(item.id)!==-1||readState[item.id]===true;
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

function getAnnouncementClass(type){
  if(type==="maintenance") return "maintenance";
  if(type==="security") return "security";
  if(type==="weekend") return "weekend";

  return "";
}

function markAnnouncementRead(id,silent){

  const item=ANNOUNCEMENTS.find(
    announcement=>announcement.id===id
  );

  if(!item||isAnnouncementRead(item)) return;

  readState[id]=true;
  saveReadState();
  if(window.PZNavBadges){
    window.PZNavBadges.markSeen("notices",[id]);
  }

  renderAnnouncements();

  if(!silent) showToast("Announcement marked as read.");
}

function renderAnnouncements(){

  if(!announcementList) return;

  announcementList.innerHTML="";

  let unreadCount=0;

  ANNOUNCEMENTS.forEach(item=>{
    if(!isAnnouncementRead(item)){
      unreadCount++;
    }
  });

  if(announcementCount){
    announcementCount.textContent=
      `${ANNOUNCEMENTS.length} Updates`;
  }

  if(announcementEmptyState){
    announcementEmptyState.classList.toggle(
      "hidden",
      ANNOUNCEMENTS.length>0
    );
  }

  setupMarkAll();
  if(markAllBtn){
    markAllBtn.disabled=unreadCount===0;
  }

  ANNOUNCEMENTS.forEach(item=>{

    const read=isAnnouncementRead(item);

    const card=document.createElement("article");

    card.className=
      `announcement-card ${getAnnouncementClass(item.type)}${read?"":" unread pz-unread"}`;

    card.innerHTML=`
      <div class="announcement-icon">
        ${item.icon}
      </div>

      <div class="announcement-body">
        <div class="announcement-meta">
          <span class="announcement-category">
            ${esc(item.category)}
          </span>

          <span class="announcement-date">
            ${formatDate(item.date)}
          </span>
          ${read?"":'<span class="pz-new">NEW</span>'}
        </div>

        <h3>${esc(item.title)}</h3>

        <p>${esc(item.message).replace(/\n/g,"<br>")}</p>
        <span class="pz-hint">Click to open</span>
      </div>

      <button
        class="announcement-action${read?" read":""}"
        type="button"
        data-announcement-id="${item.id}"
      >
        ${read?"Read":"Mark read"}
      </button>
    `;

    card.addEventListener("click",e=>{
      if(e.target.closest(".announcement-action")) return;

      if(!isAnnouncementRead(item)){
        markAnnouncementRead(item.id,true);
      }

      if(window.PZFeedUI){
        window.PZFeedUI.openModal(item);
      }
    });

    announcementList.appendChild(card);
  });

  const buttons=announcementList.querySelectorAll(
    ".announcement-action"
  );

  buttons.forEach(button=>{
    button.addEventListener("click",()=>{

      const id=button.getAttribute("data-announcement-id");

      markAnnouncementRead(id);
    });
  });

  document.title="Announcements | PipZoNe";
}

function waitForFeedUi(){
  let tries=0;
  const t=setInterval(()=>{
    tries++;
    if(window.PZFeedUI){
      clearInterval(t);
      renderAnnouncements();
    }else if(tries>50){
      clearInterval(t);
    }
  },200);
}

function initAnnouncements(){

  waitForFeedUi();
  initTheme();
  loadReadState();
  renderAnnouncements();
  loadAnnouncements();
  document.addEventListener("pz:feed-changed",e=>{
    if(e.detail&&e.detail.kind==="notices") loadAnnouncements();
  });

  if(themeToggle){
    themeToggle.addEventListener(
      "click",
      toggleTheme
    );
  }
}

document.addEventListener(
  "DOMContentLoaded",
  initAnnouncements
);