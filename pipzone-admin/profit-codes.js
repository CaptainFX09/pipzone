
/*
  PipZoNe Trade Code page
  -----------------------
  This file intentionally does NOT update balances in the browser.
  Final code creation/application should be performed by a Supabase
  Edge Function after your exact database schema is connected.

  The page works as a standalone UI now. Replace the SUPABASE_CONFIG
  values below only when you are ready to connect this page.
*/

const SUPABASE_CONFIG = {
  url: "",
  anonKey: ""
};

const state = {
  clients: [],
  generatedCodes: []
};

const $ = (id) => document.getElementById(id);

function money(value) {
  const n = Number(value || 0);
  return "$" + n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function generateLocalCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "PZ-";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function calculateAdjustment(amount, percentage, type) {
  const base = Number(amount) || 0;
  const pct = Number(percentage) || 0;
  const adjustment = base * (pct / 100);
  return {
    adjustment,
    newBalance: type === "decrease" ? base - adjustment : base + adjustment
  };
}

function updatePreview() {
  const amount = Number($("amountInput")?.value || 0);
  const percentage = Number($("percentageInput")?.value || 0);
  const type = $("adjustmentType")?.value || "increase";
  const result = calculateAdjustment(amount, percentage, type);

  if ($("adjustmentPreview")) {
    $("adjustmentPreview").textContent = money(result.adjustment);
  }
  if ($("newBalancePreview")) {
    $("newBalancePreview").textContent = money(result.newBalance);
  }
}

function renderCodes() {
  const box = $("codesTable");
  if (!box) return;

  if (!state.generatedCodes.length) {
    box.innerHTML = `<div class="empty">No codes generated in this session.</div>`;
    return;
  }

  box.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Code</th>
          <th>Client</th>
          <th>Type</th>
          <th>%</th>
          <th>Amount</th>
          <th>Status</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        ${state.generatedCodes.map(row => `
          <tr>
            <td><b>${escapeHtml(row.code)}</b></td>
            <td>${escapeHtml(row.clientName)}</td>
            <td>${escapeHtml(row.type)}</td>
            <td>${escapeHtml(row.percentage)}%</td>
            <td>${row.maxAmount ? money(row.maxAmount) : "Full balance"}</td>
            <td>${escapeHtml(row.status)}</td>
            <td>${escapeHtml(row.createdAt)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderClientBalance() {
  const select = $("clientSelect");
  const client = state.clients.find(c => c.id === select.value);
  const balance = client ? Number(client.balance || 0) : 0;

  $("currentBalance").textContent = money(balance);

  if ($("amountInput")) {
    $("amountInput").value = balance ? balance.toFixed(2) : "";
    $("amountInput").max = balance || "";
  }

  updatePreview();
}

function copyGeneratedCode() {
  const input = $("generatedCode");
  if (!input || !input.value) return;

  navigator.clipboard?.writeText(input.value).then(() => {
    $("copyMsg").textContent = "Code copied.";
    setTimeout(() => $("copyMsg").textContent = "", 1800);
  }).catch(() => {
    input.select();
    document.execCommand("copy");
    $("copyMsg").textContent = "Code copied.";
  });
}

function generateCode() {
  const select = $("clientSelect");
  const client = state.clients.find(c => c.id === select.value);
  const percentage = Number($("percentageInput").value);
  const type = $("adjustmentType").value;
  const amountMode = $("amountMode").value;
  const amount = Number($("amountInput").value);

  if (!client) {
    $("pageMsg").textContent = "Please select a client.";
    return;
  }

  if (!percentage || percentage <= 0 || percentage > 100) {
    $("pageMsg").textContent = "Enter a percentage between 0.01 and 100.";
    return;
  }

  if (amountMode === "selected" && (!amount || amount <= 0)) {
    $("pageMsg").textContent = "Enter a valid selected amount.";
    return;
  }

  const code = generateLocalCode();
  const result = calculateAdjustment(amount, percentage, type);

  $("generatedCode").value = code;
  $("pageMsg").textContent =
    "Preview code generated. Connect the Edge Function before saving it to Supabase.";

  state.generatedCodes.unshift({
    code,
    clientName: client.name,
    type: type === "increase" ? "Increase" : "Decrease",
    percentage: percentage.toFixed(2),
    maxAmount: amountMode === "selected" ? amount.toFixed(2) : "",
    status: "Preview",
    createdAt: new Date().toLocaleString()
  });

  $("adjustmentPreview").textContent = money(result.adjustment);
  $("newBalancePreview").textContent = money(result.newBalance);
  renderCodes();
}

function sendEmailPlaceholder() {
  $("pageMsg").textContent =
    "Email sending is ready to be connected to your existing Supabase email Edge Function.";
}

function loadDemoClients() {
  /*
    Temporary UI data only.
    Once you provide your existing schema, these values will be replaced
    with the real authenticated admin/Supabase query.
  */
  state.clients = [
    { id: "demo-1", name: "Select client..." },
  ];

  const select = $("clientSelect");
  select.innerHTML = state.clients.map(c =>
    `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`
  ).join("");

  $("currentBalance").textContent = "$0.00";
}

document.addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style");
  style.textContent = `
    .trade-page{min-height:100vh}
    .trade-header{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-bottom:20px}
    .trade-actions{display:flex;gap:8px;flex-wrap:wrap}
    .trade-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:18px}
    .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .form-field{margin-bottom:2px}
    .form-field.full{grid-column:1/-1}
    .preview{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}
    .preview-card{background:#08150f;border:1px solid var(--border);border-radius:10px;padding:14px}
    .preview-card small{color:var(--muted)}
    .preview-card strong{display:block;font-size:21px;margin-top:5px}
    .code-box{display:flex;gap:8px;margin-top:8px}
    .code-box input{font-size:20px;font-weight:800;letter-spacing:2px}
    .empty{color:var(--muted);padding:20px;text-align:center}
    table{width:100%;border-collapse:collapse}
    th,td{text-align:left;padding:11px 10px;border-bottom:1px solid var(--border);white-space:nowrap}
    th{color:var(--muted);font-size:12px}
    .hint{font-size:12px;color:var(--muted);line-height:1.5;margin-top:10px}
    @media(max-width:800px){.trade-grid{grid-template-columns:1fr}.form-grid{grid-template-columns:1fr}.form-field.full{grid-column:auto}}
  `;
  document.head.appendChild(style);

  document.body.innerHTML = `
    <main class="trade-page">
      <div class="wrap">
        <div class="trade-header">
          <div>
            <div class="brand">PipZoNe <span>Trade Code</span></div>
            <div class="sub">Admin profit adjustment codes</div>
          </div>
          <div class="trade-actions">
            <button class="btn" type="button" onclick="location.href='admin.html'">← Dashboard</button>
            <button class="btn logout" type="button" onclick="location.href='admin.html'">Exit</button>
          </div>
        </div>

        <div id="pageMsg" class="notice"></div>

        <div class="trade-grid">
          <section class="section">
            <h3>Generate Trade Code</h3>

            <div class="form-grid">
              <div class="form-field full">
                <label>Client</label>
                <select id="clientSelect"></select>
              </div>

              <div class="form-field">
                <label>Current Balance</label>
                <div class="preview-card">
                  <small>Selected client</small>
                  <strong id="currentBalance">$0.00</strong>
                </div>
              </div>

              <div class="form-field">
                <label>Adjustment Type</label>
                <select id="adjustmentType">
                  <option value="increase">Increase (+)</option>
                  <option value="decrease">Decrease (-)</option>
                </select>
              </div>

              <div class="form-field">
                <label>Adjustment Percentage</label>
                <input id="percentageInput" type="number" min="0.01" max="100" step="0.01" value="1.50" placeholder="1.50">
              </div>

              <div class="form-field">
                <label>Amount Mode</label>
                <select id="amountMode">
                  <option value="full">Full Balance</option>
                  <option value="selected">Selected Amount</option>
                </select>
              </div>

              <div class="form-field full">
                <label>Amount</label>
                <input id="amountInput" type="number" min="0" step="0.01" placeholder="Amount">
                <div class="hint">For Full Balance, this field is automatically filled with the client's current balance. The server must recalculate this again when the code is applied.</div>
              </div>
            </div>

            <div class="preview">
              <div class="preview-card">
                <small>Adjustment</small>
                <strong id="adjustmentPreview">$0.00</strong>
              </div>
              <div class="preview-card">
                <small>Preview New Balance</small>
                <strong id="newBalancePreview">$0.00</strong>
              </div>
            </div>

            <button class="btn" style="margin-top:18px;width:100%" id="generateBtn" type="button">
              Generate Code
            </button>
          </section>

          <section class="section">
            <h3>Generated Code</h3>
            <div class="code-box">
              <input id="generatedCode" readonly placeholder="PZ-XXXXXX">
              <button class="btn" id="copyBtn" type="button">Copy</button>
            </div>
            <div id="copyMsg" class="hint"></div>

            <button class="btn" style="margin-top:14px;width:100%" id="emailBtn" type="button">
              Send Email
            </button>

            <div class="hint">
              Important: this browser page only provides the admin UI and calculation preview.
              Final code creation, client binding, expiry, single-use validation and balance
              changes should be performed server-side through a Supabase Edge Function.
            </div>
          </section>
        </div>

        <section class="section">
          <h3>Generated Codes</h3>
          <div id="codesTable" class="table-wrap"></div>
        </section>

        <div class="footer">PipZoNe • Trade Code Management</div>
      </div>
    </main>
  `;

  loadDemoClients();

  $("clientSelect").addEventListener("change", renderClientBalance);
  $("percentageInput").addEventListener("input", updatePreview);
  $("amountInput").addEventListener("input", updatePreview);
  $("adjustmentType").addEventListener("change", updatePreview);
  $("amountMode").addEventListener("change", () => {
    renderClientBalance();
    if ($("amountMode").value === "full") {
      $("amountInput").readOnly = true;
    } else {
      $("amountInput").readOnly = false;
    }
  });

  $("generateBtn").addEventListener("click", generateCode);
  $("copyBtn").addEventListener("click", copyGeneratedCode);
  $("emailBtn").addEventListener("click", sendEmailPlaceholder);

  $("amountInput").readOnly = true;
  renderCodes();
  updatePreview();
});
