"use strict";

const $=id=>document.getElementById(id);
let MESSAGES=[];
let activeFilter="all";
let supabaseClient=null;
let loadingMessages=false;
let markingAllRead=false;
let pendingMessagesRefresh=false;
let messagesRealtimeChannel=null;
let messagesRefreshTimer=null;

const themeToggle=$("themeToggle");
const themeIcon=$("themeIcon");
const markAllReadBtn=$("markAllReadBtn");
const messageSearch=$("messageSearch");
const messageList=$("messageList");
const messageEmptyState=$("messageEmptyState");
const messageCountLabel=$("messageCountLabel");
const allCount=$("allCount");
const unreadCount=$("unreadCount");
const toastContainer=$("toastContainer");

function initTheme(){
  const savedTheme=localStorage.getItem("pipzone_theme")||"dark";
  document.documentElement.setAttribute("data-theme",savedTheme);
  if(themeIcon)themeIcon.textContent=savedTheme==="light"?"☀":"☾";
}

function toggleTheme(){
  const currentTheme=document.documentElement.getAttribute("data-theme")||"dark";
  const newTheme=currentTheme==="light"?"dark":"light";
  document.documentElement.setAttribute("data-theme",newTheme);
  localStorage.setItem("pipzone_theme",newTheme);
  if(themeIcon)themeIcon.textContent=newTheme==="light"?"☀":"☾";
}

function showToast(message){
  if(!toastContainer)return;
  const toast=document.createElement("div");
  toast.className="toast";
  toast.textContent=message;
  toastContainer.appendChild(toast);
  setTimeout(()=>{
    toast.style.opacity="0";
    toast.style.transform="translateY(10px)";
    toast.style.transition="all .3s ease";
    setTimeout(()=>toast.remove(),300);
  },3000);
}

function escapeHtml(value){
  return String(value??"")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function getText(value){
  return value==null?"":String(value);
}

function formatMessageTime(value){
  if(!value)return "—";
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return getText(value);
  return date.toLocaleString(undefined,{
    year:"numeric",
    month:"short",
    day:"numeric",
    hour:"2-digit",
    minute:"2-digit"
  });
}

function getCategory(message){
  const title=getText(message.title).toLowerCase();
  const body=getText(message.message).toLowerCase();
  const code=getText(message.trade_code).trim();

  if(code||/trade|trading|settlement|forex|crypto|profit|loss|buy|sell/.test(title+" "+body)){
    return {category:"trading",label:"Trading"};
  }

  if(/security|password|otp|login|sign in|account protection/.test(title+" "+body)){
    return {category:"security",label:"Security"};
  }

  return {category:"support",label:"Support"};
}

function normalizeMessage(row){
  const category=getCategory(row);
  return {
    id:row.id,
    title:getText(row.title)||"PipZoNe Message",
    message:getText(row.message),
    tradeCode:getText(row.trade_code),
    time:formatMessageTime(row.created_at),
    createdAt:getText(row.created_at),
    category:category.category,
    categoryLabel:category.label,
    unread:row.is_read===false||getText(row.is_read).toLowerCase()==="false"
  };
}

function getFilteredMessages(){
  const search=(messageSearch?.value||"").trim().toLowerCase();

  return MESSAGES.filter(message=>{
    let filterMatch=true;

    if(activeFilter==="unread"){
      filterMatch=message.unread;
    }else if(activeFilter==="support"){
      filterMatch=message.category==="support";
    }else if(activeFilter==="trading"){
      filterMatch=message.category==="trading";
    }

    if(!filterMatch)return false;
    if(!search)return true;

    return [
      message.title,
      message.message,
      message.tradeCode,
      message.categoryLabel,
      message.time
    ].join(" ").toLowerCase().includes(search);
  });
}

function getMessageIcon(category){
  if(category==="trading"){
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"></polyline><polyline points="16 7 21 7 21 12"></polyline></svg>`;
  }

  if(category==="security"){
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>`;
  }

  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H11l-4.5 4v-4.5A2.5 2.5 0 0 1 4 13V5.5Z"></path><path d="M8 7h8"></path><path d="M8 11h5"></path></svg>`;
}

function renderMessages(){
  if(!messageList)return;

  const filteredMessages=getFilteredMessages();
  messageList.innerHTML="";

  if(!filteredMessages.length){
    messageEmptyState?.classList.remove("hidden");
  }else{
    messageEmptyState?.classList.add("hidden");

    filteredMessages.forEach(message=>{
      const item=document.createElement("article");
      item.className=`message-item${message.unread?" unread":""}`;

      item.innerHTML=`
        <div class="message-icon">${getMessageIcon(message.category)}</div>
        <div class="message-body">
          <div class="message-topline">
            <div class="message-title">${escapeHtml(message.title)}</div>
            <div class="message-time">${escapeHtml(message.time)}</div>
          </div>
          <div class="message-text">${escapeHtml(message.message)}</div>
          ${message.tradeCode?`<div class="message-text">Trade Code: ${escapeHtml(message.tradeCode)}</div>`:""}
          <div class="message-meta">
            <span class="message-category ${escapeHtml(message.category)}">${escapeHtml(message.categoryLabel)}</span>
            ${message.unread?`<span class="unread-label">Unread</span>`:""}
          </div>
        </div>
        ${message.unread?`<button class="message-action" type="button" data-read-id="${escapeHtml(message.id)}">Mark read</button>`:""}
      `;

      const readButton=item.querySelector("[data-read-id]");
      readButton?.addEventListener("click",event=>{
        event.stopPropagation();
        markMessageRead(message.id);
      });

      item.addEventListener("click",event=>{
        if(event.target.closest("button"))return;
        if(message.unread)markMessageRead(message.id);
      });

      messageList.appendChild(item);
    });
  }

  updateCounts();
}

function updateCounts(){
  const total=MESSAGES.length;
  const unread=MESSAGES.filter(message=>message.unread).length;

  if(allCount)allCount.textContent=total;
  if(unreadCount)unreadCount.textContent=unread;

  if(messageCountLabel){
    messageCountLabel.textContent=unread>0
      ?`${unread} unread ${unread===1?"message":"messages"} in your inbox.`
      :"You're all caught up. No unread messages.";
  }

  if(markAllReadBtn){
    markAllReadBtn.disabled=unread===0||markingAllRead;
    markAllReadBtn.style.opacity=unread===0||markingAllRead?".55":"1";
    markAllReadBtn.style.cursor=unread===0||markingAllRead?"default":"pointer";
  }
}

async function getCurrentUser(){
  if(!supabaseClient)throw new Error("Supabase client is not configured.");
  const {data,error}=await supabaseClient.auth.getUser();
  if(error)throw error;
  if(!data?.user)throw new Error("Please sign in to view your messages.");
  return data.user;
}

async function loadMessages(){
  if(loadingMessages){
    pendingMessagesRefresh=true;
    return;
  }

  loadingMessages=true;

  if(messageList)messageList.setAttribute("aria-busy","true");

  try{
    await getCurrentUser();

    const {data,error}=await supabaseClient.rpc("get_user_messages");
    if(error)throw error;
    if(!Array.isArray(data))throw new Error("Unexpected messages response.");

    MESSAGES=data.map(normalizeMessage)
      .sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));

    renderMessages();
  }catch(error){
    console.error("PipZoNe messages load failed:",error);
    MESSAGES=[];
    renderMessages();

    if(messageCountLabel){
      messageCountLabel.textContent=error.message==="Please sign in to view your messages."
        ?error.message
        :"Unable to load messages. Please refresh and try again.";
    }

    showToast(error.message==="Please sign in to view your messages."
      ?error.message
      :"Unable to load messages.");
  }finally{
    loadingMessages=false;
    messageList?.removeAttribute("aria-busy");

    if(pendingMessagesRefresh){
      pendingMessagesRefresh=false;
      setTimeout(()=>loadMessages(),0);
    }
  }
}

function scheduleMessagesRefresh(){
  if(messagesRefreshTimer)clearTimeout(messagesRefreshTimer);

  messagesRefreshTimer=setTimeout(()=>{
    messagesRefreshTimer=null;
    loadMessages();
  },300);
}

async function startMessagesRealtime(){
  try{
    const user=await getCurrentUser();

    if(messagesRealtimeChannel){
      await supabaseClient.removeChannel(messagesRealtimeChannel);
      messagesRealtimeChannel=null;
    }

    messagesRealtimeChannel=supabaseClient
      .channel(`pipzone-messages-${user.id}`)
      .on("postgres_changes",{
        event:"*",
        schema:"public",
        table:"messages",
        filter:`user_id=eq.${user.id}`
      },payload=>{
        console.log("PipZoNe messages Realtime event:",payload.eventType);
        scheduleMessagesRefresh();
      })
      .subscribe(status=>{
        if(status==="SUBSCRIBED"){
          console.log("PipZoNe Messages Realtime connected.");
        }else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){
          console.error("PipZoNe Messages Realtime error:",status);
        }else if(status==="CLOSED"){
          console.warn("PipZoNe Messages Realtime channel closed.");
        }
      });
  }catch(error){
    console.error("PipZoNe Messages Realtime setup failed:",error);
  }
}

async function markMessageRead(id){
  const message=MESSAGES.find(item=>String(item.id)===String(id));
  if(!message||!message.unread)return;

  try{
    const user=await getCurrentUser();

    const {error}=await supabaseClient
      .from("messages")
      .update({is_read:true})
      .eq("id",id)
      .eq("user_id",user.id)
      .eq("is_read",false);

    if(error)throw error;

    message.unread=false;
    renderMessages();
    showToast("Message marked as read.");
  }catch(error){
    console.error("PipZoNe mark message read failed:",error);
    showToast("Unable to mark message as read.");
  }
}

async function markAllAsRead(){
  if(markingAllRead)return;

  const unreadMessages=MESSAGES.filter(message=>message.unread);
  if(!unreadMessages.length){
    showToast("All messages are already read.");
    return;
  }

  markingAllRead=true;
  updateCounts();

  try{
    const user=await getCurrentUser();

    const {error}=await supabaseClient
      .from("messages")
      .update({is_read:true})
      .eq("user_id",user.id)
      .eq("is_read",false);

    if(error)throw error;

    MESSAGES=MESSAGES.map(message=>({...message,unread:false}));
    renderMessages();
    showToast("All messages marked as read.");
  }catch(error){
    console.error("PipZoNe mark all read failed:",error);
    showToast("Unable to mark messages as read.");
  }finally{
    markingAllRead=false;
    updateCounts();
  }
}

function setActiveFilter(filter){
  activeFilter=filter;

  document.querySelectorAll(".message-tab").forEach(tab=>{
    tab.classList.toggle("active",tab.dataset.filter===filter);
  });

  renderMessages();
}

function initEvents(){
  themeToggle?.addEventListener("click",toggleTheme);
  markAllReadBtn?.addEventListener("click",markAllAsRead);
  messageSearch?.addEventListener("input",renderMessages);

  document.querySelectorAll(".message-tab").forEach(tab=>{
    tab.addEventListener("click",()=>{
      setActiveFilter(tab.dataset.filter||"all");
    });
  });
}

async function initMessages(){
  initTheme();
  initEvents();

  if(
    typeof window.supabase==="undefined"||
    typeof SUPABASE_URL==="undefined"||
    typeof SUPABASE_PUBLISHABLE_KEY==="undefined"
  ){
    console.error("Supabase library/config not loaded.");
    if(messageCountLabel)messageCountLabel.textContent="Unable to connect. Refresh the page and try again.";
    showToast("Supabase configuration is missing.");
    return;
  }

 supabaseClient=window.supabaseClient;

if(!supabaseClient){
  console.error("Shared Supabase client is not initialized.");
  if(messageCountLabel)messageCountLabel.textContent="Unable to connect. Refresh the page and try again.";
  showToast("Supabase client is not available.");
  return;
}

  await loadMessages();
  await startMessagesRealtime();
}

document.addEventListener("DOMContentLoaded",initMessages);