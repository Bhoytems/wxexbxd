async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

// ---------- engine start/stop ----------
const engineBtn = document.getElementById("engineToggleBtn");
const statusPill = document.getElementById("statusPill");

engineBtn.addEventListener("click", async () => {
  const starting = engineBtn.textContent.trim() === "START";
  const endpoint = starting ? "/api/engine/start" : "/api/engine/stop";
  const data = await postJSON(endpoint);
  applyEngineState(data.running);
});

function applyEngineState(running) {
  statusPill.textContent = running ? "ONLINE" : "OFFLINE";
  statusPill.className = "pill " + (running ? "pill-online" : "pill-offline");
  engineBtn.textContent = running ? "STOP" : "START";
  engineBtn.className = "btn " + (running ? "btn-danger" : "btn-primary");
}

// ---------- asset toggles ----------
document.querySelectorAll(".asset-toggle").forEach((cb) => {
  cb.addEventListener("change", async () => {
    await postJSON("/api/assets/toggle", {
      asset_key: cb.dataset.asset,
      enabled: cb.checked,
    });
    syncAllCheckbox();
  });
});

const toggleAllBox = document.getElementById("toggleAll");
toggleAllBox.addEventListener("change", async () => {
  await postJSON("/api/assets/toggle_all", { enabled: toggleAllBox.checked });
  document.querySelectorAll(".asset-toggle").forEach((cb) => (cb.checked = toggleAllBox.checked));
});

function syncAllCheckbox() {
  const boxes = document.querySelectorAll(".asset-toggle");
  toggleAllBox.checked = Array.from(boxes).every((b) => b.checked);
}
syncAllCheckbox();

// ---------- channels ----------
document.getElementById("addChannelBtn").addEventListener("click", async () => {
  const chatIdInput = document.getElementById("channelChatId");
  const labelInput = document.getElementById("channelLabel");
  const chat_id = chatIdInput.value.trim();
  if (!chat_id) return;
  const data = await postJSON("/api/channels/add", { chat_id, label: labelInput.value.trim() });
  const list = document.getElementById("channelList");
  const emptyLi = list.querySelector(".empty");
  if (emptyLi) emptyLi.remove();
  const li = document.createElement("li");
  li.dataset.id = data.id;
  li.innerHTML = `<span class="channel-label">${data.label || "Unlabeled"}</span><span class="channel-id">${data.chat_id}</span><button class="remove-channel" data-id="${data.id}">Remove</button>`;
  list.appendChild(li);
  li.querySelector(".remove-channel").addEventListener("click", removeChannelHandler);
  chatIdInput.value = "";
  labelInput.value = "";
});

async function removeChannelHandler(e) {
  const id = e.target.dataset.id;
  await postJSON("/api/channels/remove", { id });
  e.target.closest("li").remove();
}
document.querySelectorAll(".remove-channel").forEach((btn) => btn.addEventListener("click", removeChannelHandler));

// ---------- live status polling ----------
async function refreshStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    applyEngineState(data.running);

    document.getElementById("statTotal").textContent = data.perf.total;
    document.getElementById("statWins").textContent = data.perf.wins;
    document.getElementById("statLosses").textContent = data.perf.losses;
    document.getElementById("statRate").textContent = data.perf.win_rate + "%";

    const tbody = document.getElementById("signalTableBody");
    if (data.signals.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty">No signals yet</td></tr>`;
      return;
    }
    tbody.innerHTML = data.signals.map((s) => `
      <tr>
        <td>${s.sent_at_wat}</td>
        <td>${s.asset_key}</td>
        <td class="${s.direction === "CALL" ? "dir-call" : "dir-put"}">${s.direction === "CALL" ? "BUY" : "SELL"}</td>
        <td>${s.entry_price ?? "—"}</td>
        <td>${s.exit_price ?? "—"}</td>
        <td class="result-${s.result.toLowerCase()}">${s.result}</td>
        <td class="mono">${s.id}</td>
      </tr>
    `).join("");
  } catch (e) {
    console.error("status refresh failed", e);
  }
}
setInterval(refreshStatus, 15000);
