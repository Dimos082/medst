// Set your backend (AWS Lambda Function URL) here:
const BACKEND_BASE = "https://YOUR_LAMBDA_FUNCTION_URL"; // example: https://abcde.lambda-url.eu-central-1.on.aws

const el = (id) => document.getElementById(id);

function setStatus(type, msg) {
  const s = el("status");
  s.className = "status " + (type === "ok" ? "status--ok" : "status--err");
  s.textContent = msg;
}

function clearStatus() {
  const s = el("status");
  s.className = "status";
  s.textContent = "";
  s.style.display = "none";
}

function showStatus() { el("status").style.display = "block"; }

function showStep(n) {
  el("step1").classList.toggle("step--active", n === 1);
  el("step2").classList.toggle("step--active", n === 2);
  el("stepBtn1").classList.toggle("steps__btn--active", n === 1);
  el("stepBtn2").classList.toggle("steps__btn--active", n === 2);
}

function debounce(fn, ms) {
  let tId;
  return (...args) => {
    clearTimeout(tId);
    tId = setTimeout(() => fn(...args), ms);
  };
}

async function filesToBase64(fileList) {
  const files = Array.from(fileList || []);
  const out = [];
  for (const f of files) {
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        // r.result is data:...;base64,XXXX
        const s = String(r.result || "");
        const idx = s.indexOf("base64,");
        resolve(idx >= 0 ? s.slice(idx + 7) : "");
      };
      r.onerror = reject;
      r.readAsDataURL(f);
    });
    out.push({ filename: f.name, mimeType: f.type || "application/octet-stream", base64 });
  }
  return out;
}

function requiredIfNoPesel() {
  const noPesel = el("noPesel").checked;
  const passport = el("passport");
  const dob = el("dob");
  const country = el("country");
  if (!noPesel) return true;

  return passport.value.trim() && dob.value && country.value.trim().length === 2;
}

function validateStep1() {
  const mode = document.querySelector('input[name="medMode"]:checked')?.value;
  const packages = Number(el("packages").value || 1);
  if (packages < 1 || packages > 3) return false;

  if (mode === "self") {
    const drugId = el("drugId").value.trim();
    if (!drugId) return false;
  }
  return true;
}

function validateStep2() {
  if (!el("firstName").value.trim()) return false;
  if (!el("lastName").value.trim()) return false;
  if (!el("consent").checked) return false;

  const noPesel = el("noPesel").checked;
  const pesel = el("pesel").value.trim();
  if (!noPesel && pesel.length === 0) {
    // allow empty for demo: return true;
    // but typically you want either PESEL or passport/dob/country
    return true;
  }
  if (noPesel && !requiredIfNoPesel()) return false;

  return true;
}

function toggleDrugBlock() {
  const mode = document.querySelector('input[name="medMode"]:checked')?.value;
  el("drugBlock").style.display = (mode === "self") ? "block" : "none";
}

function toggleTextArea(radioName, textareaId) {
  const v = document.querySelector(`input[name="${radioName}"]:checked`)?.value;
  el(textareaId).disabled = (v !== "yes");
  if (v !== "yes") el(textareaId).value = "";
}

function closeDrugDropdown() {
  el("drugResults").innerHTML = "";
}

async function fetchDrugs(query) {
  const url = `${BACKEND_BASE}/drugs?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`drug search failed (${res.status})`);
  return res.json();
}

function renderDrugResults(items) {
  const box = el("drugResults");
  if (!items.length) { box.innerHTML = ""; return; }

  const list = document.createElement("div");
  list.className = "dropdown__list";

  for (const it of items) {
    const row = document.createElement("div");
    row.className = "dropdown__item";
    row.textContent = it.label;
    row.addEventListener("click", () => {
      el("drugName").value = it.label;
      el("drugId").value = String(it.id);
      closeDrugDropdown();
    });
    list.appendChild(row);
  }

  box.innerHTML = "";
  box.appendChild(list);
}

const onDrugInput = debounce(async () => {
  const mode = document.querySelector('input[name="medMode"]:checked')?.value;
  if (mode !== "self") return;

  const q = el("drugName").value.trim();
  el("drugId").value = ""; // reset until user selects
  if (q.length < 2) { closeDrugDropdown(); return; }

  try {
    const data = await fetchDrugs(q);
    renderDrugResults(data.items || []);
  } catch {
    closeDrugDropdown();
  }
}, 300);

async function submitCheckout(e) {
  e.preventDefault();
  clearStatus();

  if (!validateStep1()) { showStep(1); showStatus(); setStatus("err", t("errPickDrug")); return; }
  if (!validateStep2()) { showStatus(); setStatus("err", t("errFillRequired")); return; }

  showStatus();
  setStatus("ok", t("submitting"));

  const medMode = document.querySelector('input[name="medMode"]:checked')?.value;
  const payload = {
    language: currentLang,
    medical: {
      mode: medMode,
      drug: medMode === "self" ? { id: Number(el("drugId").value), label: el("drugName").value.trim() } : null,
      packages: Number(el("packages").value || 1),
      symptoms: el("symptoms").value.trim(),
      allergies: {
        has: document.querySelector('input[name="allergies"]:checked')?.value === "yes",
        text: el("allergiesText").value.trim()
      },
      chronic: {
        has: document.querySelector('input[name="chronic"]:checked')?.value === "yes",
        text: el("chronicText").value.trim()
      }
    },
    personal: {
      name: el("firstName").value.trim(),
      surname: el("lastName").value.trim(),
      telephone: el("phone").value.trim(),
      email: el("email").value.trim(),
      pesel: el("noPesel").checked ? "" : el("pesel").value.trim(),
      noPesel: el("noPesel").checked,
      passport: el("passport").value.trim(),
      date_of_birth: el("dob").value || null,
      country: (el("country").value.trim() || "PL").toUpperCase(),
      address: {
        country: (el("country").value.trim() || "PL").toUpperCase(),
        street: el("street").value.trim(),
        street_number: el("streetNo").value.trim(),
        postal_code: el("postal").value.trim(),
        city: el("city").value.trim()
      }
    },
    files: await filesToBase64(el("files").files)
  };

  try {
    const res = await fetch(`${BACKEND_BASE}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

    setStatus("ok", t("success") + data.patientId);
  } catch (err) {
    setStatus("err", t("failure") + (err?.message || String(err)));
  }
}

function init() {
  applyTranslations();

  document.querySelectorAll(".lang__btn").forEach(b => {
    b.addEventListener("click", () => setLang(b.dataset.lang));
  });

  el("stepBtn1").addEventListener("click", () => showStep(1));
  el("stepBtn2").addEventListener("click", () => showStep(2));

  el("nextBtn").addEventListener("click", () => {
    if (!validateStep1()) { showStatus(); setStatus("err", t("errPickDrug")); return; }
    showStep(2);
  });

  el("backBtn").addEventListener("click", () => showStep(1));

  document.querySelectorAll('input[name="medMode"]').forEach(r => r.addEventListener("change", toggleDrugBlock));
  toggleDrugBlock();

  el("drugName").addEventListener("input", onDrugInput);
  document.addEventListener("click", (ev) => {
    if (!el("drugBlock").contains(ev.target)) closeDrugDropdown();
  });

  document.querySelectorAll('input[name="allergies"]').forEach(r => r.addEventListener("change", () => toggleTextArea("allergies", "allergiesText")));
  document.querySelectorAll('input[name="chronic"]').forEach(r => r.addEventListener("change", () => toggleTextArea("chronic", "chronicText")));
  toggleTextArea("allergies", "allergiesText");
  toggleTextArea("chronic", "chronicText");

  el("noPesel").addEventListener("change", () => {
    el("noPeselBlock").style.display = el("noPesel").checked ? "block" : "none";
  });

  el("wizardForm").addEventListener("submit", submitCheckout);
}

init();
