"use strict";

/* =========================================================
   PIPZONE ADMIN — CLIENT FEED (Updates + Announcements)
   Tables: client_updates, client_notices
========================================================= */

/* ---- 1. SUPABASE CONFIG -----------------------------------
   Yahan wahi URL aur anon key paste karein jo announcements.js
   (ya script.js) mein hai. Service-role key kabhi nahi.        */
const SUPABASE_URL="https://nzasmkplxzirnqeteclv.supabase.co";
const SUPABASE_ANON_KEY='sb_publishable_ywmF35YANKsFEdZOs8wDdQ__jIezHTF';

const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

const $=id=>document.getElementById(id);

function esc(v){
  return String(v==null?"":v)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function showMsg(text,isError){
  const el=$("msg");
  el.textContent=text;
  el.style.display=text?"block":"none";
  el.style.borderColor=isError?"#71343c":"";
  el.style.color=isError?"#ff9c9c":"";
}

function showResult(text,isError){
  const el=$("feedResult");
  el.textContent=text;
  el.style.color=isError?"#ff9c9c":"";
}

/* ---- 2. AUTH ---------------------------------------------- */

async function ensureAdmin(user){
  const {data,error}=await sb
    .from("profiles")
    .select("role")
    .eq("id",user.id)
    .maybeSingle();

  return !error&&data&&data.role==="admin";
}

async function showApp(user){
  $("loginView").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("adminEmail").textContent=user.email||"";
  await Promise.all([loadUpdates(),loadNotices()]);
}

function showLogin(message){
  $("app").classList.add("hidden");
  $("loginView").classList.remove("hidden");

  const n=$("loginMsg");
  n.textContent=message||"";
  n.style.display=message?"block":"none";
}

async function boot(){
  const {data}=await sb.auth.getSession();
  const user=data&&data.session?data.session.user:null;

  if(!user){ showLogin(""); return; }

  if(await ensureAdmin(user)){
    await showApp(user);
  }else{
    await sb.auth.signOut();
    showLogin("This account is not an admin.");
  }
}

async function login(){
  const email=$("email").value.trim();
  const password=$("password").value;

  if(!email||!password){ showLogin("Enter email and password."); return; }

  $("loginBtn").disabled=true;

  const {data,error}=await sb.auth.signInWithPassword({email,password});

  $("loginBtn").disabled=false;

  if(error||!data.user){ showLogin("Login failed. Check email and password."); return; }

  if(await ensureAdmin(data.user)){
    await showApp(data.user);
  }else{
    await sb.auth.signOut();
    showLogin("This account is not an admin.");
  }
}

/* ---- 3. TYPE MAPPING (client page ke card colours) -------- */

function updateType(category){
  if(category==="TRADING") return "trading";
  if(category==="SECURITY") return "security";
  if(category==="INTERFACE") return "maintenance";
  return "featured";
}

function noticeType(category){
  if(category==="TRADING") return "trading";
  if(category==="SECURITY") return "security";
  if(category==="SCHEDULE") return "weekend";
  if(category==="MAINTENANCE") return "maintenance";
  return "platform";
}

/* ---- 4. PUBLISH ------------------------------------------- */

async function publishUpdate(e){
  e.preventDefault();

  const title=$("updTitle").value.trim();
  const message=$("updMessage").value.trim();
  const category=$("updCategory").value;
  const version=$("updVersion").value.trim();

  if(!title||!message){ showResult("Title and message are required.",true); return; }

  $("publishUpdateBtn").disabled=true;
  showResult("Publishing...");

  const {error}=await sb.from("client_updates").insert({
    version:version||null,
    category,
    type:updateType(category),
    title,
    message
  });

  $("publishUpdateBtn").disabled=false;

  if(error){
    console.error(error);
    showResult("Could not publish: "+error.message,true);
    return;
  }

  $("updTitle").value="";
  $("updMessage").value="";
  $("updVersion").value="";
  showResult("Update published.");
  await loadUpdates();
}

async function publishNotice(e){
  e.preventDefault();

  const title=$("ntcTitle").value.trim();
  const message=$("ntcMessage").value.trim();
  const category=$("ntcCategory").value;

  if(!title||!message){ showResult("Title and message are required.",true); return; }

  $("publishNoticeBtn").disabled=true;
  showResult("Publishing...");

  const {error}=await sb.from("client_notices").insert({
    category,
    type:noticeType(category),
    title,
    message
  });

  $("publishNoticeBtn").disabled=false;

  if(error){
    console.error(error);
    showResult("Could not publish: "+error.message,true);
    return;
  }

  $("ntcTitle").value="";
  $("ntcMessage").value="";
  showResult("Announcement published.");
  await loadNotices();
}

/* ---- 5. HISTORY TABLES ------------------------------------ */

function fmt(d){
  const x=new Date(d);
  return Number.isNaN(x.getTime())?"":x.toLocaleString("en-GB",{
    day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"
  });
}

function renderTable(boxId,rows,table,withVersion){
  const box=$(boxId);

  if(!rows.length){
    box.innerHTML='<div class="empty">Nothing published yet.</div>';
    return;
  }

  box.innerHTML=
    "<table><thead><tr><th>Date</th>"+
    (withVersion?"<th>Version</th>":"")+
    "<th>Category</th><th>Title</th><th>Message</th><th></th></tr></thead><tbody>"+
    rows.map(r=>
      "<tr><td>"+esc(fmt(r.created_at))+"</td>"+
      (withVersion?"<td>"+esc(r.version||"-")+"</td>":"")+
      "<td>"+esc(r.category)+"</td>"+
      "<td>"+esc(r.title)+"</td>"+
      "<td>"+esc(r.message)+"</td>"+
      '<td><button class="btn reject feed-del" type="button" data-table="'+table+'" data-id="'+esc(r.id)+'">Delete</button></td></tr>'
    ).join("")+
    "</tbody></table>";
}

async function loadUpdates(){
  const {data,error}=await sb
    .from("client_updates")
    .select("*")
    .order("created_at",{ascending:false});

  if(error){ showMsg("Could not load updates: "+error.message,true); return; }
  renderTable("updatesTable",data||[],"client_updates",true);
}

async function loadNotices(){
  const {data,error}=await sb
    .from("client_notices")
    .select("*")
    .order("created_at",{ascending:false});

  if(error){ showMsg("Could not load announcements: "+error.message,true); return; }
  renderTable("noticesTable",data||[],"client_notices",false);
}

async function deleteRow(table,id){
  if(!confirm("Delete this item? Clients will no longer see it.")) return;

  const {error}=await sb.from(table).delete().eq("id",id);

  if(error){ showMsg("Delete failed: "+error.message,true); return; }

  showMsg("");
  if(table==="client_updates") await loadUpdates(); else await loadNotices();
}

/* ---- 6. UI WIRING ----------------------------------------- */

function syncKind(){
  const isUpdate=$("kindUpdate").checked;
  $("updateForm").classList.toggle("hidden",!isUpdate);
  $("noticeForm").classList.toggle("hidden",isUpdate);
  showResult("");
}

document.addEventListener("DOMContentLoaded",()=>{
  $("kindUpdate").addEventListener("change",syncKind);
  $("kindNotice").addEventListener("change",syncKind);
  $("updateForm").addEventListener("submit",publishUpdate);
  $("noticeForm").addEventListener("submit",publishNotice);
  $("loginBtn").addEventListener("click",login);
  $("password").addEventListener("keydown",e=>{ if(e.key==="Enter") login(); });

  $("pwToggle").addEventListener("click",()=>{
    const p=$("password");
    p.type=p.type==="password"?"text":"password";
  });

  $("logoutBtn").addEventListener("click",async()=>{
    await sb.auth.signOut();
    showLogin("");
  });

  document.addEventListener("click",e=>{
    const b=e.target.closest(".feed-del");
    if(b) deleteRow(b.dataset.table,b.dataset.id);
  });

  boot();
});