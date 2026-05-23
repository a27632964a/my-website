const STORAGE_KEY = "trip-splitter-current-v2";
const HISTORY_KEY = "trip-splitter-history-v2";

const state = {
  people: ["A", "B", "C", "司機"],
  expenses: [],
  paymentProfiles: {},
  paymentStatus: {},
  history: []
};

const modeCopy = {
  equal: "平均分攤：勾選需要一起付的人，金額會平均分。",
  weighted: "依比例分攤：適合有人吃比較多、票券方案不同，比例越高分越多。",
  driver: "司機/隱藏成本：把油錢、停車費、開車體力成本放進來，通常由司機先付或應收。",
  uber: "Uber 分段下車：用搭乘比例表示每個人搭了多長。全程填 100，中途下車可填 70、40 等。"
};

const money = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0
});

const personForm = document.querySelector("#personForm");
const personName = document.querySelector("#personName");
const peopleList = document.querySelector("#peopleList");
const paymentProfileList = document.querySelector("#paymentProfileList");
const payerSelect = document.querySelector("#expensePayer");
const expenseForm = document.querySelector("#expenseForm");
const expenseMode = document.querySelector("#expenseMode");
const modeNote = document.querySelector("#modeNote");
const participantTable = document.querySelector("#participantTable");
const expenseList = document.querySelector("#expenseList");
const balanceList = document.querySelector("#balanceList");
const settlementList = document.querySelector("#settlementList");
const historyList = document.querySelector("#historyList");
const totalAmount = document.querySelector("#totalAmount");
const toast = document.querySelector("#toast");

function formatMoney(value) {
  return money.format(Math.round(value));
}

function uid(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeKey(...parts) {
  return parts.map((part) => String(part).replaceAll("|", "/")).join("|");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.left = "-999px";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  }
}

function ensureProfiles() {
  state.people.forEach((person) => {
    if (!state.paymentProfiles[person]) {
      state.paymentProfiles[person] = { linePay: "", bank: "", qrCode: "" };
    }
    if (!("qrCode" in state.paymentProfiles[person])) {
      state.paymentProfiles[person].qrCode = "";
    }
  });

  Object.keys(state.paymentProfiles).forEach((person) => {
    if (!state.people.includes(person)) {
      delete state.paymentProfiles[person];
    }
  });
}

function saveCurrent() {
  ensureProfiles();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    people: state.people,
    expenses: state.expenses,
    paymentProfiles: state.paymentProfiles,
    paymentStatus: state.paymentStatus
  }));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
}

function loadStoredData() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (current) {
      state.people = Array.isArray(current.people) ? current.people : state.people;
      state.expenses = Array.isArray(current.expenses) ? current.expenses : [];
      state.paymentProfiles = current.paymentProfiles || {};
      state.paymentStatus = current.paymentStatus || {};
    }
    state.history = Array.isArray(history) ? history : [];
  } catch {
    state.history = [];
  }
  ensureProfiles();
}

function selectedPeople() {
  return state.people.filter((name) => {
    const checkbox = document.querySelector(`[data-person-check="${CSS.escape(name)}"]`);
    return checkbox && checkbox.checked;
  });
}

function getWeight(name) {
  const input = document.querySelector(`[data-person-weight="${CSS.escape(name)}"]`);
  const value = input ? Number(input.value) : 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function sharesFor(expense) {
  const shares = Object.fromEntries(state.people.map((person) => [person, 0]));
  const participants = expense.participants.filter((person) => state.people.includes(person));
  if (!participants.length || expense.amount <= 0) return shares;

  if (expense.mode === "equal" || expense.mode === "driver") {
    const each = expense.amount / participants.length;
    participants.forEach((person) => {
      shares[person] += each;
    });
    return shares;
  }

  const totalWeight = participants.reduce((sum, person) => sum + (expense.weights[person] || 0), 0);
  if (totalWeight <= 0) return shares;

  participants.forEach((person) => {
    shares[person] += expense.amount * ((expense.weights[person] || 0) / totalWeight);
  });
  return shares;
}

function calculate() {
  const balances = Object.fromEntries(state.people.map((person) => [
    person,
    { paid: 0, owes: 0, net: 0 }
  ]));

  state.expenses.forEach((expense) => {
    if (balances[expense.payer]) {
      balances[expense.payer].paid += expense.amount;
    }
    const shares = sharesFor(expense);
    Object.entries(shares).forEach(([person, share]) => {
      if (balances[person]) {
        balances[person].owes += share;
      }
    });
  });

  Object.values(balances).forEach((balance) => {
    balance.net = balance.paid - balance.owes;
  });

  return balances;
}

function settlementsFrom(balances) {
  const debtors = [];
  const creditors = [];

  Object.entries(balances).forEach(([name, balance]) => {
    const net = Math.round(balance.net);
    if (net < 0) debtors.push({ name, amount: Math.abs(net) });
    if (net > 0) creditors.push({ name, amount: net });
  });

  const settlements = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount > 0) {
      settlements.push({ from: debtor.name, to: creditor.name, amount });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }

  return settlements;
}

function paymentMessage(settlement) {
  const profile = state.paymentProfiles[settlement.to] || {};
  const statusKey = settlementKey(settlement);
  const method = state.paymentStatus[statusKey]?.method || "bank";
  const target = method === "linePay"
    ? profile.linePay || "請提供 LINE Pay 收款連結"
    : method === "cash"
      ? "現金付款"
      : profile.bank || "請提供銀行帳號";

  return `${settlement.from} 需要轉給 ${settlement.to} ${formatMoney(settlement.amount)}。付款方式：${methodLabel(method)}。${target}`;
}

function methodLabel(method) {
  return {
    linePay: "LINE Pay",
    bank: "銀行轉帳",
    cash: "現金"
  }[method] || "銀行轉帳";
}

function settlementKey(settlement) {
  return safeKey(settlement.from, settlement.to, Math.round(settlement.amount));
}

function renderPeople() {
  ensureProfiles();
  peopleList.innerHTML = "";
  state.people.forEach((person) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML = `<span>${person}</span><button type="button" aria-label="移除 ${person}">x</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      state.people = state.people.filter((name) => name !== person);
      state.expenses = state.expenses.filter((expense) => expense.payer !== person)
        .map((expense) => ({
          ...expense,
          participants: expense.participants.filter((name) => name !== person),
          weights: Object.fromEntries(Object.entries(expense.weights).filter(([name]) => name !== person))
        }));
      delete state.paymentProfiles[person];
      render();
    });
    peopleList.appendChild(chip);
  });

  payerSelect.innerHTML = state.people.map((person) => `<option value="${person}">${person}</option>`).join("");
}

function renderPaymentProfiles() {
  ensureProfiles();
  if (!state.people.length) {
    paymentProfileList.innerHTML = `<div class="empty-state">先加入朋友，再填收款資訊。</div>`;
    return;
  }

  paymentProfileList.innerHTML = "";
  state.people.forEach((person) => {
    const profile = state.paymentProfiles[person];
    const row = document.createElement("div");
    row.className = "payment-profile-row";
    row.innerHTML = `
      <strong>${person}</strong>
      <label>
        <span>LINE Pay 收款連結</span>
        <input type="url" value="${profile.linePay}" placeholder="https://..." data-linepay="${person}">
      </label>
      <label>
        <span>銀行帳號 / 備註</span>
        <input type="text" value="${profile.bank}" placeholder="例如：808 123456789" data-bank="${person}">
      </label>
      <div class="qr-field">
        <span>QR Code</span>
        <div class="qr-uploader">
          ${profile.qrCode ? `<img src="${profile.qrCode}" alt="${person} 的收款 QR Code">` : `<div class="qr-placeholder">QR</div>`}
          <div class="qr-actions">
            <label class="file-button">
              <input type="file" accept="image/*" data-qr="${person}">
              上傳 QR
            </label>
            <button class="secondary-button" type="button" data-clear-qr="${person}" ${profile.qrCode ? "" : "disabled"}>移除</button>
          </div>
        </div>
      </div>
    `;
    paymentProfileList.appendChild(row);
  });

  paymentProfileList.querySelectorAll("input[type='url'], input[type='text']").forEach((input) => {
    input.addEventListener("input", () => {
      const linePerson = input.dataset.linepay;
      const bankPerson = input.dataset.bank;
      if (linePerson) state.paymentProfiles[linePerson].linePay = input.value.trim();
      if (bankPerson) state.paymentProfiles[bankPerson].bank = input.value.trim();
      saveCurrent();
      renderSummary();
    });
  });

  paymentProfileList.querySelectorAll("[data-qr]").forEach((input) => {
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      const person = input.dataset.qr;
      if (!file || !person) return;

      const reader = new FileReader();
      reader.addEventListener("load", () => {
        state.paymentProfiles[person].qrCode = reader.result;
        render();
        showToast("已加入 QR Code");
      });
      reader.readAsDataURL(file);
    });
  });

  paymentProfileList.querySelectorAll("[data-clear-qr]").forEach((button) => {
    button.addEventListener("click", () => {
      const person = button.dataset.clearQr;
      state.paymentProfiles[person].qrCode = "";
      render();
      showToast("已移除 QR Code");
    });
  });
}

function renderParticipantTable() {
  const mode = expenseMode.value;
  modeNote.textContent = modeCopy[mode];

  const label = mode === "uber" ? "搭乘比例" : mode === "weighted" ? "分攤比例" : "比例";
  const hideWeight = mode === "equal" || mode === "driver";

  participantTable.innerHTML = `
    <div class="participant-row header">
      <span></span>
      <span>朋友</span>
      <span>${hideWeight ? "分攤狀態" : label}</span>
      <span>預估分攤</span>
    </div>
  `;

  state.people.forEach((person) => {
    const row = document.createElement("div");
    row.className = "participant-row";
    row.innerHTML = `
      <input type="checkbox" data-person-check="${person}" checked aria-label="${person} 是否分攤">
      <span class="participant-name">${person}</span>
      <input type="number" min="0" step="1" value="100" data-person-weight="${person}" ${hideWeight ? "disabled" : ""} aria-label="${person} 的比例">
      <span data-person-preview="${person}">$0</span>
    `;
    participantTable.appendChild(row);
  });

  participantTable.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", renderPreview);
    input.addEventListener("change", renderPreview);
  });

  renderPreview();
}

function renderPreview() {
  const amount = Number(document.querySelector("#expenseAmount").value) || 0;
  const mode = expenseMode.value;
  const people = selectedPeople();
  const weights = Object.fromEntries(people.map((person) => [person, getWeight(person)]));
  const previewExpense = {
    amount,
    mode,
    participants: people,
    weights
  };
  const shares = sharesFor(previewExpense);

  state.people.forEach((person) => {
    const preview = document.querySelector(`[data-person-preview="${CSS.escape(person)}"]`);
    if (preview) preview.textContent = formatMoney(shares[person] || 0);
  });
}

function renderExpenses() {
  if (!state.expenses.length) {
    expenseList.innerHTML = `<div class="empty-state">還沒有花費。先新增一筆午餐、車費或票券吧。</div>`;
    return;
  }

  expenseList.innerHTML = "";
  state.expenses.forEach((expense, index) => {
    const shares = sharesFor(expense);
    const splitText = Object.entries(shares)
      .filter(([, amount]) => amount > 0)
      .map(([person, amount]) => `${person} ${formatMoney(amount)}`)
      .join("、");

    const card = document.createElement("article");
    card.className = "expense-card";
    card.innerHTML = `
      <div>
        <strong>${expense.title} · ${formatMoney(expense.amount)}</strong>
        <div class="expense-meta">先付：${expense.payer}｜方式：${modeLabel(expense.mode)}</div>
        <div class="split-preview">${splitText || "沒有分攤對象"}</div>
      </div>
      <button class="icon-button" type="button" aria-label="刪除此花費">x</button>
    `;
    card.querySelector("button").addEventListener("click", () => {
      state.expenses.splice(index, 1);
      render();
    });
    expenseList.appendChild(card);
  });
}

function modeLabel(mode) {
  return {
    equal: "平均分攤",
    weighted: "依比例分攤",
    driver: "司機/隱藏成本",
    uber: "Uber 分段下車"
  }[mode];
}

function renderSummary() {
  const total = state.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const balances = calculate();
  const settlements = settlementsFrom(balances);

  totalAmount.textContent = formatMoney(total);
  balanceList.innerHTML = "";

  if (!state.people.length) {
    balanceList.innerHTML = `<div class="empty-state">請先加入朋友。</div>`;
  } else {
    Object.entries(balances).forEach(([person, balance]) => {
      const row = document.createElement("div");
      row.className = "balance-row";
      const netClass = balance.net >= 0 ? "money-positive" : "money-negative";
      const netText = balance.net >= 0 ? `應收 ${formatMoney(balance.net)}` : `應付 ${formatMoney(Math.abs(balance.net))}`;
      row.innerHTML = `
        <div class="balance-row-top">
          <strong>${person}</strong>
          <span class="${netClass}">${netText}</span>
        </div>
        <small>已付 ${formatMoney(balance.paid)}｜應分攤 ${formatMoney(balance.owes)}</small>
      `;
      balanceList.appendChild(row);
    });
  }

  settlementList.innerHTML = "";
  if (!settlements.length) {
    settlementList.innerHTML = `<div class="empty-state">目前大家剛好打平。</div>`;
    return;
  }

  settlements.forEach((settlement) => {
    const key = settlementKey(settlement);
    const status = state.paymentStatus[key] || { method: "bank", paid: false };
    const receiverProfile = state.paymentProfiles[settlement.to] || {};
    const row = document.createElement("div");
    row.className = `settlement-row payment-card ${status.paid ? "paid" : ""}`;
    row.innerHTML = `
      <div>
        <strong>${settlement.from} 轉給 ${settlement.to}</strong>
        <span>${formatMoney(settlement.amount)}</span>
      </div>
      ${receiverProfile.qrCode ? `
        <div class="payment-qr">
          <img src="${receiverProfile.qrCode}" alt="${settlement.to} 的收款 QR Code">
          <span>掃描 ${settlement.to} 的 QR Code</span>
        </div>
      ` : ""}
      <label>
        <span>付款方式</span>
        <select data-payment-method="${key}">
          <option value="bank" ${status.method === "bank" ? "selected" : ""}>銀行轉帳</option>
          <option value="linePay" ${status.method === "linePay" ? "selected" : ""}>LINE Pay</option>
          <option value="cash" ${status.method === "cash" ? "selected" : ""}>現金</option>
        </select>
      </label>
      <div class="payment-actions">
        <button class="secondary-button" type="button" data-copy-payment="${key}">複製訊息</button>
        <button class="secondary-button" type="button" data-open-payment="${key}">開啟付款</button>
        <label class="paid-check">
          <input type="checkbox" data-paid="${key}" ${status.paid ? "checked" : ""}>
          <span>已付款</span>
        </label>
      </div>
    `;
    row.querySelector("[data-payment-method]").addEventListener("change", (event) => {
      state.paymentStatus[key] = { ...status, method: event.target.value };
      saveCurrent();
      renderSummary();
    });
    row.querySelector("[data-paid]").addEventListener("change", (event) => {
      state.paymentStatus[key] = { ...state.paymentStatus[key], method: state.paymentStatus[key]?.method || status.method, paid: event.target.checked };
      saveCurrent();
      renderSummary();
    });
    row.querySelector("[data-copy-payment]").addEventListener("click", async () => {
      const currentStatus = state.paymentStatus[key] || status;
      state.paymentStatus[key] = currentStatus;
      const message = paymentMessage(settlement);
      const copied = await copyText(message);
      showToast(copied ? "已複製付款訊息" : "無法複製，請手動選取");
    });
    row.querySelector("[data-open-payment]").addEventListener("click", () => {
      const currentStatus = state.paymentStatus[key] || status;
      const method = currentStatus.method || "bank";
      const profile = state.paymentProfiles[settlement.to] || {};
      if (method === "linePay" && profile.linePay) {
        window.open(profile.linePay, "_blank", "noopener");
        return;
      }
      showToast(method === "linePay" ? "請先填 LINE Pay 收款連結" : "銀行轉帳請使用複製訊息");
    });
    settlementList.appendChild(row);
  });
}

function renderHistory() {
  if (!state.history.length) {
    historyList.innerHTML = `<div class="empty-state">還沒有歷史紀錄。完成一次分帳後按「儲存本次結算」。</div>`;
    return;
  }

  historyList.innerHTML = "";
  state.history.forEach((record) => {
    const card = document.createElement("article");
    card.className = "history-card";
    card.innerHTML = `
      <div>
        <strong>${record.title}</strong>
        <span>${new Date(record.createdAt).toLocaleString("zh-TW")}｜${formatMoney(record.total)}｜${record.people.length} 人</span>
      </div>
      <div class="history-actions">
        <button class="secondary-button" type="button" data-load-history="${record.id}">載入</button>
        <button class="icon-button" type="button" data-delete-history="${record.id}" aria-label="刪除紀錄">x</button>
      </div>
    `;
    card.querySelector("[data-load-history]").addEventListener("click", () => {
      state.people = [...record.people];
      state.expenses = JSON.parse(JSON.stringify(record.expenses));
      state.paymentProfiles = JSON.parse(JSON.stringify(record.paymentProfiles || {}));
      state.paymentStatus = JSON.parse(JSON.stringify(record.paymentStatus || {}));
      render();
      showToast("已載入歷史紀錄");
    });
    card.querySelector("[data-delete-history]").addEventListener("click", () => {
      state.history = state.history.filter((item) => item.id !== record.id);
      render();
      showToast("已刪除歷史紀錄");
    });
    historyList.appendChild(card);
  });
}

function render() {
  ensureProfiles();
  renderPeople();
  renderPaymentProfiles();
  renderParticipantTable();
  renderExpenses();
  renderSummary();
  renderHistory();
  expenseForm.querySelector("button[type='submit']").disabled = state.people.length === 0;
  saveCurrent();
}

function addSample() {
  state.people = ["A", "B", "C", "司機"];
  state.expenses = [
    {
      title: "午餐",
      amount: 2400,
      payer: "A",
      mode: "equal",
      participants: ["A", "B", "C", "司機"],
      weights: {}
    },
    {
      title: "Uber A 車",
      amount: 900,
      payer: "B",
      mode: "uber",
      participants: ["A", "B", "C"],
      weights: { A: 100, B: 70, C: 40 }
    },
    {
      title: "司機體力成本",
      amount: 600,
      payer: "司機",
      mode: "driver",
      participants: ["A", "B", "C"],
      weights: {}
    },
    {
      title: "遊樂園套票",
      amount: 3600,
      payer: "C",
      mode: "equal",
      participants: ["A", "B", "C", "司機"],
      weights: {}
    }
  ];
  state.paymentProfiles = {
    A: { linePay: "", bank: "A 的銀行帳號", qrCode: "" },
    B: { linePay: "", bank: "B 的銀行帳號", qrCode: "" },
    C: { linePay: "https://line.me/pay/sample-c", bank: "C 的銀行帳號", qrCode: "" },
    司機: { linePay: "", bank: "司機的銀行帳號", qrCode: "" }
  };
  render();
}

function saveHistoryRecord() {
  const total = state.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  if (!state.expenses.length || total <= 0) {
    showToast("目前沒有可儲存的花費");
    return;
  }

  const title = `${new Date().toLocaleDateString("zh-TW")} 出遊結算`;
  state.history.unshift({
    id: uid("history"),
    title,
    createdAt: new Date().toISOString(),
    total,
    people: [...state.people],
    expenses: JSON.parse(JSON.stringify(state.expenses)),
    paymentProfiles: JSON.parse(JSON.stringify(state.paymentProfiles)),
    paymentStatus: JSON.parse(JSON.stringify(state.paymentStatus))
  });
  render();
  showToast("已儲存到歷史紀錄");
}

personForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = personName.value.trim();
  if (!name || state.people.includes(name)) return;
  state.people.push(name);
  state.paymentProfiles[name] = { linePay: "", bank: "", qrCode: "" };
  personName.value = "";
  render();
});

expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = document.querySelector("#expenseTitleInput").value.trim();
  const amount = Number(document.querySelector("#expenseAmount").value);
  const payer = payerSelect.value;
  const mode = expenseMode.value;
  const participants = selectedPeople();
  const weights = Object.fromEntries(participants.map((person) => [person, getWeight(person)]));

  if (!title || !amount || amount <= 0 || !payer || !participants.length) return;

  state.expenses.push({
    title,
    amount,
    payer,
    mode,
    participants,
    weights
  });

  expenseForm.reset();
  expenseMode.value = "equal";
  render();
});

expenseMode.addEventListener("change", renderParticipantTable);
document.querySelector("#expenseAmount").addEventListener("input", renderPreview);
document.querySelector("#loadSample").addEventListener("click", addSample);
document.querySelector("#saveHistory").addEventListener("click", saveHistoryRecord);
document.querySelector("#resetDemo").addEventListener("click", () => {
  state.people = [];
  state.expenses = [];
  state.paymentProfiles = {};
  state.paymentStatus = {};
  render();
});

loadStoredData();
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
