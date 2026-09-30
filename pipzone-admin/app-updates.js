const SUPABASE_URL='https://nzasmkplxzirnqeteclv.supabase.co';
const SUPABASE_KEY='sb_publishable_ywmF35YANKsFEdZOs8wDdQ__jIezHTF';

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);


const updateForm = document.getElementById("updateForm");
const publishBtn = document.getElementById("publishBtn");
const formMessage = document.getElementById("formMessage");
const historyBody = document.getElementById("historyBody");
const latestVersion = document.getElementById("latestVersion");
const latestBadge = document.getElementById("latestBadge");
const refreshBtn = document.getElementById("refreshBtn");

function showMessage(message, type) {
    formMessage.textContent = message;
    formMessage.className = `form-message ${type}`;
}

function clearMessage() {
    formMessage.textContent = "";
    formMessage.className = "form-message";
}

function formatDate(dateString) {
    if (!dateString) {
        return "-";
    }

    const date = new Date(dateString);

    return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function loadHistory() {
    historyBody.innerHTML = `
        <tr>
            <td colspan="5" class="loading">
                Loading history...
            </td>
        </tr>
    `;

    latestVersion.innerHTML = `
        <div class="latest-loading">
            Loading latest version...
        </div>
    `;

    const { data, error } = await supabaseClient
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
        .order("version_code", {
            ascending: false
        });

    if (error) {
        console.error("LOAD HISTORY ERROR:", error);

        historyBody.innerHTML = `
            <tr>
                <td colspan="5" class="loading">
                    Failed to load update history.
                </td>
            </tr>
        `;

        latestVersion.innerHTML = `
            <div class="latest-loading">
                Failed to load latest version.
            </div>
        `;

        latestBadge.textContent = "Latest: Error";

        return;
    }

    if (!data || data.length === 0) {
        historyBody.innerHTML = `
            <tr>
                <td colspan="5" class="loading">
                    No app updates found.
                </td>
            </tr>
        `;

        latestVersion.innerHTML = `
            <div class="latest-loading">
                No versions published yet.
            </div>
        `;

        latestBadge.textContent = "Latest: None";

        return;
    }

    const latest = data[0];

    latestBadge.textContent =
        `Latest: v${latest.version_name}`;

    latestVersion.innerHTML = `
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

    historyBody.innerHTML = data.map(update => `
        <tr>

            <td>
                <span class="version-code">
                    ${escapeHtml(update.version_code)}
                </span>
            </td>

            <td>
                v${escapeHtml(update.version_name)}
            </td>

            <td>
                ${escapeHtml(formatDate(update.created_at))}
            </td>

            <td>
                <span class="status ${update.is_required ? "yes" : "no"}">
                    ${update.is_required ? "YES" : "NO"}
                </span>
            </td>

            <td>
                <span class="status ${update.is_active ? "yes" : "no"}">
                    ${update.is_active ? "ACTIVE" : "OFF"}
                </span>
            </td>

        </tr>
    `).join("");
}

async function getLatestVersionCode() {
    const { data, error } = await supabaseClient
        .from("app_updates")
        .select("version_code")
        .order("version_code", {
            ascending: false
        })
        .limit(1);

    if (error) {
        console.error("LATEST VERSION ERROR:", error);
        return null;
    }

    if (!data || data.length === 0) {
        return 0;
    }

    return Number(data[0].version_code);
}

updateForm.addEventListener("submit", async event => {
    event.preventDefault();

    clearMessage();

    const versionCode = Number(
        document.getElementById("versionCode").value
    );

    const versionName =
        document.getElementById("versionName").value.trim();

    const apkUrl =
        document.getElementById("apkUrl").value.trim();

    const updateMessage =
        document.getElementById("updateMessage").value.trim();

    const isRequired =
        document.getElementById("isRequired").checked;

    const isActive =
        document.getElementById("isActive").checked;

    if (!versionCode || versionCode < 1) {
        showMessage(
            "Please enter a valid Version Code.",
            "error"
        );
        return;
    }

    if (!versionName) {
        showMessage(
            "Please enter a Version Name.",
            "error"
        );
        return;
    }

    if (!apkUrl) {
        showMessage(
            "Please enter the APK URL.",
            "error"
        );
        return;
    }

    if (!updateMessage) {
        showMessage(
            "Please enter the update message.",
            "error"
        );
        return;
    }

    publishBtn.disabled = true;
    publishBtn.textContent = "Publishing...";

    try {
        const latestCode =
            await getLatestVersionCode();

        if (latestCode === null) {
            showMessage(
                "Could not check the latest version.",
                "error"
            );
            return;
        }

        if (versionCode <= latestCode) {
            showMessage(
                `Version Code ${versionCode} must be higher than the current latest Version Code ${latestCode}.`,
                "error"
            );
            return;
        }

        const { data, error } =
            await supabaseClient
                .from("app_updates")
                .insert({
                    version_code: versionCode,
                    version_name: versionName,
                    apk_url: apkUrl,
                    update_message: updateMessage,
                    is_required: isRequired,
                    is_active: isActive
                })
                .select()
                .single();

        if (error) {
            console.error("PUBLISH UPDATE ERROR:", error);

            showMessage(
                error.message ||
                "Failed to publish update.",
                "error"
            );

            return;
        }

        console.log("UPDATE PUBLISHED:", data);

        showMessage(
            `PipZoNe v${versionName} published successfully.`,
            "success"
        );

        updateForm.reset();

        document.getElementById("isActive").checked = true;

        await loadHistory();

    } catch (error) {
        console.error("PUBLISH UPDATE EXCEPTION:", error);

        showMessage(
            "Something went wrong. Please try again.",
            "error"
        );

    } finally {
        publishBtn.disabled = false;
        publishBtn.textContent = "Publish Update";
    }
});

refreshBtn.addEventListener(
    "click",
    loadHistory
);

loadHistory();
