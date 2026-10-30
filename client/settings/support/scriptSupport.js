"use strict";

const MAX_FILE_SIZE=5*1024*1024;
const SUPPORT_BUCKET="support-attachments";
const SUPPORT_FUNCTION="send-support";

const $=id=>document.getElementById(id);

const supportForm=$("supportForm");
const supportCategory=$("supportCategory");
const supportSubject=$("supportSubject");
const supportMessage=$("supportMessage");
const supportAttachment=$("supportAttachment");
const selectedFile=$("selectedFile");
const fileName=$("fileName");
const fileSize=$("fileSize");
const removeFileBtn=$("removeFileBtn");
const uploadBox=$("uploadBox");
const messageCounter=$("messageCounter");
const formFeedback=$("formFeedback");
const submitSupportBtn=$("submitSupportBtn");
const submitButtonLabel=$("submitButtonLabel");
const themeToggle=$("themeToggle");
const themeIcon=$("themeIcon");
const toastContainer=$("toastContainer");

let selectedAttachment=null;

function initTheme(){
  const savedTheme=localStorage.getItem("pipzone_theme")||"dark";

  document.documentElement.setAttribute(
    "data-theme",
    savedTheme
  );

  if(themeIcon){
    themeIcon.textContent=savedTheme==="light"?"☀":"☾";
  }
}

function toggleTheme(){
  const currentTheme=
    document.documentElement.getAttribute("data-theme")||"dark";

  const newTheme=
    currentTheme==="light"?"dark":"light";

  document.documentElement.setAttribute(
    "data-theme",
    newTheme
  );

  localStorage.setItem(
    "pipzone_theme",
    newTheme
  );

  if(themeIcon){
    themeIcon.textContent=
      newTheme==="light"?"☀":"☾";
  }
}

function showToast(message,type="success"){
  if(!toastContainer)return;

  const toast=document.createElement("div");

  toast.className=`toast ${type}`;
  toast.textContent=message;

  toastContainer.appendChild(toast);

  setTimeout(()=>{
    toast.remove();
  },3500);
}

function showFeedback(message,type="error"){
  if(!formFeedback)return;

  formFeedback.textContent=message;
  formFeedback.className=`form-feedback show ${type}`;
}

function clearFeedback(){
  if(!formFeedback)return;

  formFeedback.textContent="";
  formFeedback.className="form-feedback";
}

function formatFileSize(bytes){
  if(bytes<1024){
    return `${bytes} B`;
  }

  if(bytes<1024*1024){
    return `${(bytes/1024).toFixed(1)} KB`;
  }

  return `${(bytes/(1024*1024)).toFixed(2)} MB`;
}

function updateMessageCounter(){
  if(!supportMessage||!messageCounter)return;

  const length=supportMessage.value.length;

  messageCounter.textContent=
    `${length} / 2000`;
}

function resetAttachment(){
  selectedAttachment=null;

  if(supportAttachment){
    supportAttachment.value="";
  }

  if(selectedFile){
    selectedFile.classList.add("hidden");
  }

  if(fileName){
    fileName.textContent="";
  }

  if(fileSize){
    fileSize.textContent="";
  }
}

function handleFile(file){
  if(!file)return;

  const allowedTypes=[
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/pdf"
  ];

  const allowedExtensions=[
    ".png",
    ".jpg",
    ".jpeg",
    ".pdf"
  ];

  const lowerName=file.name.toLowerCase();

  const validType=
    allowedTypes.includes(file.type)||
    allowedExtensions.some(
      extension=>lowerName.endsWith(extension)
    );

  if(!validType){
    resetAttachment();

    showFeedback(
      "Only PNG, JPG, JPEG or PDF files are allowed.",
      "error"
    );

    showToast(
      "Unsupported attachment type.",
      "error"
    );

    return;
  }

  if(file.size>MAX_FILE_SIZE){
    resetAttachment();

    showFeedback(
      "Attachment must be 5 MB or smaller.",
      "error"
    );

    showToast(
      "Attachment is larger than 5 MB.",
      "error"
    );

    return;
  }

  clearFeedback();

  selectedAttachment=file;

  if(fileName){
    fileName.textContent=file.name;
  }

  if(fileSize){
    fileSize.textContent=formatFileSize(file.size);
  }

  if(selectedFile){
    selectedFile.classList.remove("hidden");
  }
}

function createTicketNumber(){
  const now=Date.now()
    .toString()
    .slice(-8);

  return `PZ-SUP-${now}`;
}

function validateForm(){
  clearFeedback();

  const category=supportCategory?.value.trim()||"";
  const subject=supportSubject?.value.trim()||"";
  const message=supportMessage?.value.trim()||"";

  if(!category){
    showFeedback(
      "Please select a support category.",
      "error"
    );

    supportCategory?.focus();

    return false;
  }

  if(subject.length<3){
    showFeedback(
      "Please enter a clear subject.",
      "error"
    );

    supportSubject?.focus();

    return false;
  }

  if(message.length<10){
    showFeedback(
      "Please provide at least 10 characters in your message.",
      "error"
    );

    supportMessage?.focus();

    return false;
  }

  if(message.length>2000){
    showFeedback(
      "Your message cannot exceed 2000 characters.",
      "error"
    );

    supportMessage?.focus();

    return false;
  }

  if(selectedAttachment&&selectedAttachment.size>MAX_FILE_SIZE){
    showFeedback(
      "Attachment must be 5 MB or smaller.",
      "error"
    );

    return false;
  }

  return true;
}

function getSupabase(){
  return window.supabaseClient||null;
}

function safeFileName(name){
  return String(name||"file")
    .replace(/[^a-zA-Z0-9._-]/g,"_")
    .slice(-80);
}

let currentUser=null;

async function loadCurrentUser(){
  const supportFrom=$("supportFrom");
  const client=getSupabase();

  try{
    if(!client)throw new Error("Supabase client is missing.");

    const {data,error}=await client.auth.getUser();
    if(error)throw error;

    currentUser=data?.user||null;
  }catch(error){
    console.error("Support: user load failed:",error);
    currentUser=null;
  }

  if(supportFrom){
    supportFrom.value=currentUser?.email||"Please sign in to send a request";
  }

  loadTickets();
  watchTickets();
}


const CATEGORY_LABELS={
  deposit:"Deposit",
  withdrawal:"Withdrawal",
  trading:"Trading Activity",
  account:"Account / Profile",
  security:"Security",
  technical:"Technical Issue",
  other:"Other"
};

function escapeHtml(value){
  return String(value==null?"":value)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function formatTicketDate(value){
  const date=new Date(value);

  if(Number.isNaN(date.getTime())){
    return "";
  }

  return date.toLocaleDateString("en-GB",{
    day:"2-digit",
    month:"short",
    year:"numeric"
  });
}

async function loadTickets(){
  const list=$("ticketList");
  const empty=$("ticketEmpty");
  const count=$("ticketCount");
  const client=getSupabase();

  if(!list||!client||!currentUser)return;

  const {data,error}=await client
    .from("support_requests")
    .select("ticket,category,subject,status,created_at")
    .eq("user_id",currentUser.id)
    .order("created_at",{ascending:false})
    .limit(20);

  if(error){
    console.error("Support: ticket history failed:",error);
    return;
  }

  const rows=data||[];

  if(count){
    count.textContent=`${rows.length} Ticket${rows.length===1?"":"s"}`;
  }

  if(empty){
    empty.style.display=rows.length?"none":"block";
  }

  list.innerHTML=rows.map(row=>{
    const status=["pending","resolved","closed"].includes(row.status)
      ?row.status
      :"pending";

    const category=CATEGORY_LABELS[row.category]||row.category||"";

    return `
      <div class="ticket-row">
        <div class="ticket-main">
          <div class="ticket-no">${escapeHtml(row.ticket)}</div>
          <div class="ticket-subject">${escapeHtml(row.subject)}</div>
          <div class="ticket-meta">
            ${escapeHtml(category)} · ${escapeHtml(formatTicketDate(row.created_at))}
          </div>
        </div>
        <span class="ticket-status ${status}">${status}</span>
      </div>
    `;
  }).join("");
}

function watchTickets(){
  const client=getSupabase();

  if(!client||!currentUser||!client.channel)return;

  client
    .channel("support-tickets-"+currentUser.id)
    .on(
      "postgres_changes",
      {event:"*",schema:"public",table:"support_requests"},
      ()=>loadTickets()
    )
    .subscribe();

  // Realtime na chale to bhi 30 sec mein status refresh ho jaye
  setInterval(()=>{
    if(!document.hidden)loadTickets();
  },30000);
}

async function submitSupportRequest(event){
  event.preventDefault();

  if(!validateForm()){
    return;
  }

  const client=getSupabase();

  if(!client||!currentUser){
    showFeedback(
      "Please sign in again before sending a support request.",
      "error"
    );
    return;
  }

  if(!submitSupportBtn){
    return;
  }

  submitSupportBtn.disabled=true;

  if(submitButtonLabel){
    submitButtonLabel.textContent="Sending Request...";
  }

  clearFeedback();

  const ticketNumber=createTicketNumber();
  let attachmentPath=null;

  try{
    // 1. Attachment (screenshot / PDF) -> private storage bucket
    if(selectedAttachment){
      attachmentPath=
        `${currentUser.id}/${ticketNumber}-${safeFileName(selectedAttachment.name)}`;

      const {error:uploadError}=await client.storage
        .from(SUPPORT_BUCKET)
        .upload(attachmentPath,selectedAttachment,{
          contentType:selectedAttachment.type||undefined,
          upsert:false
        });

      if(uploadError)throw uploadError;
    }

    // 2. Ticket record
    const {error:insertError}=await client
      .from("support_requests")
      .insert({
        ticket:ticketNumber,
        user_id:currentUser.id,
        email:currentUser.email||null,
        category:supportCategory.value,
        subject:supportSubject.value.trim(),
        message:supportMessage.value.trim(),
        attachment_path:attachmentPath,
        attachment_name:selectedAttachment?selectedAttachment.name:null
      });

    if(insertError)throw insertError;

  }catch(error){
    console.error("Support request save failed:",error);

    showFeedback(
      "We could not send your request. Please try again.",
      "error"
    );

    showToast("Request failed. Please try again.","error");

    if(submitButtonLabel){
      submitButtonLabel.textContent="Send Request";
    }

    submitSupportBtn.disabled=false;
    return;
  }

  loadTickets();

  // 3. Email to admin team (ticket is already saved even if this fails)
  let emailSent=true;

  try{
    const {data,error}=await client.functions.invoke(
      SUPPORT_FUNCTION,
      {body:{ticket:ticketNumber}}
    );

    if(error)throw error;
    if(data&&data.error)throw new Error(data.error);
  }catch(error){
    console.error("Support email failed:",error);
    emailSent=false;
  }

  if(emailSent){
    showFeedback(
      `Your support request has been sent to the PipZoNe team. Ticket: ${ticketNumber}`,
      "success"
    );

    showToast(
      `Support request sent · ${ticketNumber}`,
      "success"
    );
  }else{
    showFeedback(
      `Your request was saved (Ticket: ${ticketNumber}) but the email notification could not be sent. The team can still see it, or you can email support.pipzone@gmail.com with this ticket number.`,
      "error"
    );

    showToast(
      "Saved, but the email could not be sent.",
      "error"
    );
  }

  supportForm.reset();

  const fromField=$("supportFrom");
  if(fromField)fromField.value=currentUser?.email||"";

  resetAttachment();

  updateMessageCounter();

  if(submitButtonLabel){
    submitButtonLabel.textContent="Request Sent";
  }

  setTimeout(()=>{
    if(submitButtonLabel){
      submitButtonLabel.textContent="Send Request";
    }

    submitSupportBtn.disabled=false;
  },2200);
}

function initAttachment(){
  if(!supportAttachment)return;

  supportAttachment.addEventListener(
    "change",
    event=>{
      const file=event.target.files?.[0]||null;

      handleFile(file);
    }
  );

  if(removeFileBtn){
    removeFileBtn.addEventListener(
      "click",
      ()=>{
        resetAttachment();
        clearFeedback();
      }
    );
  }

  if(uploadBox){
    uploadBox.addEventListener(
      "dragover",
      event=>{
        event.preventDefault();
        uploadBox.classList.add("dragover");
      }
    );

    uploadBox.addEventListener(
      "dragleave",
      ()=>{
        uploadBox.classList.remove("dragover");
      }
    );

    uploadBox.addEventListener(
      "drop",
      event=>{
        event.preventDefault();

        uploadBox.classList.remove("dragover");

        const file=
          event.dataTransfer?.files?.[0]||null;

        if(!file){
          return;
        }

        handleFile(file);

        try{
          const dataTransfer=new DataTransfer();

          dataTransfer.items.add(file);

          supportAttachment.files=
            dataTransfer.files;
        }catch(error){
          // Browser does not allow assigning files.
        }
      }
    );
  }
}

function initForm(){
  if(supportForm){
    supportForm.addEventListener(
      "submit",
      submitSupportRequest
    );
  }

  if(supportMessage){
    supportMessage.addEventListener(
      "input",
      ()=>{
        updateMessageCounter();
        clearFeedback();
      }
    );
  }

  if(supportCategory){
    supportCategory.addEventListener(
      "change",
      clearFeedback
    );
  }

  if(supportSubject){
    supportSubject.addEventListener(
      "input",
      clearFeedback
    );
  }
}

function init(){
  initTheme();
  loadCurrentUser();
  initForm();
  initAttachment();
  updateMessageCounter();

  if(themeToggle){
    themeToggle.addEventListener(
      "click",
      toggleTheme
    );
  }
}

document.addEventListener(
  "DOMContentLoaded",
  init
);