const SUPABASE_URL='https://nzasmkplxzirnqeteclv.supabase.co';
const SUPABASE_KEY='sb_publishable_ywmF35YANKsFEdZOs8wDdQ__jIezHTF';

const supabaseClient=window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

const updateForm=document.getElementById("updateForm");
const publishBtn=document.getElementById("publishBtn");
const formMessage=document.getElementById("formMessage");
const historyBody=document.getElementById("historyBody");
const latestVersion=document.getElementById("latestVersion");
const latestBadge=document.getElementById("latestBadge");
const refreshBtn=document.getElementById("refreshBtn");
const logoutBtn=document.getElementById("logoutBtn");
const cancelEditBtn=document.getElementById("cancelEditBtn");
const newUpdateBtn=document.getElementById("newUpdateBtn");
const formTitle=document.getElementById("formTitle");
const formSubtitle=document.getElementById("formSubtitle");

let editingId=null;

function showMessage(message,type){
    formMessage.textContent=message;
    formMessage.className=`form-message ${type}`;
}

function clearMessage(){
    formMessage.textContent="";
    formMessage.className="form-message";
}

function formatDate(dateString){
    if(!dateString){
        return "-";
    }

    const date=new Date(dateString);

    return date.toLocaleString("en-GB",{
        day:"2-digit",
        month:"short",
        year:"numeric",
        hour:"2-digit",
        minute:"2-digit"
    });
}

function escapeHtml(value){
    return String(value??"")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");
}

function setNewMode(){
    editingId=null;

    updateForm.reset();

    document.getElementById("isRequired").checked=false;
    document.getElementById("isActive").checked=true;

    formTitle.textContent="Publish New Update";
    formSubtitle.textContent="Add a new PipZoNe Android app version.";

    publishBtn.textContent="Publish Update";
    cancelEditBtn.style.display="none";
    newUpdateBtn.style.display="none";

    clearMessage();

    document.getElementById("versionCode").focus();
}

function setEditMode(update){
    editingId=update.id;

    document.getElementById("versionCode").value=update.version_code;
    document.getElementById("versionName").value=update.version_name||"";
    document.getElementById("apkUrl").value=update.apk_url||"";
    document.getElementById("updateMessage").value=update.update_message||"";
    document.getElementById("isRequired").checked=!!update.is_required;
    document.getElementById("isActive").checked=!!update.is_active;

    formTitle.textContent=`Edit Release — v${update.version_name}`;
    formSubtitle.textContent=`Editing release published on ${formatDate(update.created_at)}.`;

    publishBtn.textContent="Update Release";
    cancelEditBtn.style.display="inline-block";
    newUpdateBtn.style.display="inline-block";

    showMessage(
        `Loaded PipZoNe v${update.version_name}. You can edit the release and save it.`,
        "success"
    );

    window.scrollTo({
        top:0,
        behavior:"smooth"
    });
}

async function loadHistory(){
    historyBody.innerHTML=`
        <tr>
            <td colspan="8" class="loading">
                Loading history...
            </td>
        </tr>
    `;

    latestVersion.innerHTML=`
        <div class="latest-loading">
            Loading latest version...
        </div>
    `;

    const {data,error}=await supabaseClient
        .from("app_updates")
        .select(`
            id,
            version_code,
            version_name,
            apk_url,
            update_message,
            is_required,
            is_active,
            created_at
        `)
        .order("version_code",{
            ascending:false
        });

    if(error){
        console.error("LOAD HISTORY ERROR:",error);

        historyBody.innerHTML=`
            <tr>
                <td colspan="8" class="loading">
                    Failed to load update history.
                </td>
            </tr>
        `;

        latestVersion.innerHTML=`
            <div class="latest-loading">
                Failed to load latest version.
            </div>
        `;

        latestBadge.textContent="Latest: Error";

        return;
    }

    if(!data||data.length===0){
        historyBody.innerHTML=`
            <tr>
                <td colspan="8" class="loading">
                    No app updates found.
                </td>
            </tr>
        `;

        latestVersion.innerHTML=`
            <div class="latest-loading">
                No versions published yet.
            </div>
        `;

        latestBadge.textContent="Latest: None";

        return;
    }

    const latest=data[0];

    latestBadge.textContent=`Latest: v${latest.version_name}`;

    latestVersion.innerHTML=`
        <div class="latest-title">
            LATEST VERSION
        </div>

        <div class="latest-main">

            <div>
                <div class="latest-number">
                    v${escapeHtml(latest.version_name)}
                </div>

                <div class="latest-code">
                    Version Code: ${escapeHtml(latest.version_code)}
                </div>
            </div>

            <div class="latest-date">
                ${escapeHtml(formatDate(latest.created_at))}
            </div>

        </div>
    `;

    historyBody.innerHTML=data.map(update=>`
        <tr
            class="update-row"
            data-id="${escapeHtml(update.id)}"
            title="Click to edit this release"
        >

            <td>
                ${escapeHtml(formatDate(update.created_at))}
            </td>

            <td>
                <span class="version-code">
                    ${escapeHtml(update.version_code)}
                </span>
            </td>

            <td>
                v${escapeHtml(update.version_name)}
            </td>

            <td>
                <a
                    class="apk-link"
                    href="${escapeHtml(update.apk_url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    onclick="event.stopPropagation()"
                >
                    Open APK
                </a>
            </td>

            <td>
                <span class="update-message-cell">
                    ${escapeHtml(update.update_message)}
                </span>
            </td>

            <td>
                <span class="status ${update.is_required?"yes":"no"}">
                    ${update.is_required?"ON":"OFF"}
                </span>
            </td>

            <td>
                <span class="status ${update.is_active?"yes":"no"}">
                    ${update.is_active?"ON":"OFF"}
                </span>
            </td>

            <td>
                <button
                    type="button"
                    class="delete-btn"
                    data-delete-id="${escapeHtml(update.id)}"
                    onclick="event.stopPropagation()"
                >
                    Delete
                </button>
            </td>

        </tr>
    `).join("");

    document.querySelectorAll(".update-row").forEach(row=>{
        row.addEventListener("click",()=>{
            const id=Number(row.dataset.id);
            const selected=data.find(item=>Number(item.id)===id);

            if(selected){
                setEditMode(selected);
            }
        });
    });

    document.querySelectorAll(".delete-btn").forEach(button=>{
        button.addEventListener("click",async event=>{
            event.stopPropagation();

            const id=Number(button.dataset.deleteId);
            const selected=data.find(item=>Number(item.id)===id);

            if(!selected){
                return;
            }

            await deleteUpdate(selected);
        });
    });
}

async function deleteUpdate(update){
    const confirmed=confirm(
        `Delete PipZoNe v${update.version_name}?\n\nThis will remove the release record from App Updates.`
    );

    if(!confirmed){
        return;
    }

    const {error}=await supabaseClient
        .from("app_updates")
        .delete()
        .eq("id",update.id);

    if(error){
        console.error("DELETE UPDATE ERROR:",error);

        showMessage(
            error.message||"Failed to delete update.",
            "error"
        );

        return;
    }

    if(editingId===update.id){
        setNewMode();
    }

    showMessage(
        `PipZoNe v${update.version_name} deleted successfully.`,
        "success"
    );

    await loadHistory();
}

async function getLatestVersionCode(){
    const {data,error}=await supabaseClient
        .from("app_updates")
        .select("version_code")
        .order("version_code",{
            ascending:false
        })
        .limit(1);

    if(error){
        console.error("LATEST VERSION ERROR:",error);
        return null;
    }

    if(!data||data.length===0){
        return 0;
    }

    return Number(data[0].version_code);
}

updateForm.addEventListener("submit",async event=>{
    event.preventDefault();

    clearMessage();

    const versionCode=Number(
        document.getElementById("versionCode").value
    );

    const versionName=
        document.getElementById("versionName").value.trim();

    const apkUrl=
        document.getElementById("apkUrl").value.trim();

    const updateMessage=
        document.getElementById("updateMessage").value.trim();

    const isRequired=
        document.getElementById("isRequired").checked;

    const isActive=
        document.getElementById("isActive").checked;

    if(!versionCode||versionCode<1){
        showMessage(
            "Please enter a valid Version Code.",
            "error"
        );
        return;
    }

    if(!versionName){
        showMessage(
            "Please enter a Version Name.",
            "error"
        );
        return;
    }

    if(!apkUrl){
        showMessage(
            "Please enter the APK URL.",
            "error"
        );
        return;
    }

    if(!updateMessage){
        showMessage(
            "Please enter the update message.",
            "error"
        );
        return;
    }

    publishBtn.disabled=true;

    try{

        if(editingId!==null){

            publishBtn.textContent="Updating...";

            const {data,error}=await supabaseClient
                .from("app_updates")
                .update({
                    version_code:versionCode,
                    version_name:versionName,
                    apk_url:apkUrl,
                    update_message:updateMessage,
                    is_required:isRequired,
                    is_active:isActive
                })
                .eq("id",editingId)
                .select()
                .single();

            if(error){
                console.error("UPDATE RELEASE ERROR:",error);

                showMessage(
                    error.message||"Failed to update release.",
                    "error"
                );

                return;
            }

            console.log("RELEASE UPDATED:",data);

            showMessage(
                `PipZoNe v${versionName} updated successfully.`,
                "success"
            );

            setNewMode();

            await loadHistory();

            return;
        }

        publishBtn.textContent="Publishing...";

        const latestCode=await getLatestVersionCode();

        if(latestCode===null){
            showMessage(
                "Could not check the latest version.",
                "error"
            );
            return;
        }

        if(versionCode<=latestCode){
            showMessage(
                `Version Code ${versionCode} must be higher than the current latest Version Code ${latestCode}.`,
                "error"
            );
            return;
        }

        const {data,error}=await supabaseClient
            .from("app_updates")
            .insert({
                version_code:versionCode,
                version_name:versionName,
                apk_url:apkUrl,
                update_message:updateMessage,
                is_required:isRequired,
                is_active:isActive
            })
            .select()
            .single();

        if(error){
            console.error("PUBLISH UPDATE ERROR:",error);

            showMessage(
                error.message||"Failed to publish update.",
                "error"
            );

            return;
        }

        console.log("UPDATE PUBLISHED:",data);

        showMessage(
            `PipZoNe v${versionName} published successfully.`,
            "success"
        );

        setNewMode();

        await loadHistory();

    }catch(error){

        console.error("SAVE UPDATE EXCEPTION:",error);

        showMessage(
            "Something went wrong. Please try again.",
            "error"
        );

    }finally{
        publishBtn.disabled=false;

        if(editingId!==null){
            publishBtn.textContent="Update Release";
        }else{
            publishBtn.textContent="Publish Update";
        }
    }
});

cancelEditBtn.addEventListener(
    "click",
    setNewMode
);

newUpdateBtn.addEventListener(
    "click",
    setNewMode
);

refreshBtn.addEventListener(
    "click",
    loadHistory
);

logoutBtn.addEventListener("click",async()=>{
    logoutBtn.disabled=true;
    logoutBtn.textContent="Logging out...";

    try{
        const {error}=await supabaseClient.auth.signOut();

        if(error){
            console.error("LOGOUT ERROR:",error);

            logoutBtn.disabled=false;
            logoutBtn.textContent="Logout";

            showMessage(
                "Logout failed. Please try again.",
                "error"
            );

            return;
        }

        window.location.href="index.html";

    }catch(error){
        console.error("LOGOUT EXCEPTION:",error);

        logoutBtn.disabled=false;
        logoutBtn.textContent="Logout";

        showMessage(
            "Logout failed. Please try again.",
            "error"
        );
    }
});

loadHistory();
