/**
 * script.js — ChatTask Extractor Frontend
 * Vanilla JavaScript — no frameworks required.
 * Handles: sample chat injection, form submission, API call,
 *          result rendering, copy-to-text, UI state management.
 */

"use strict";

// ── DOM references ─────────────────────────────────────────────────────────────
const chatInput       = document.getElementById("chat-input");
const btnAnalyze      = document.getElementById("btn-analyze");
const btnSample       = document.getElementById("btn-sample");
const btnClear        = document.getElementById("btn-clear");
const btnCopy         = document.getElementById("btn-copy");
const btnCloseError   = document.getElementById("btn-close-error");
const analyzeIcon     = document.getElementById("analyze-icon");
const analyzeSpinner  = document.getElementById("analyze-spinner");
const analyzeLabel    = document.getElementById("analyze-label");
const errorBanner     = document.getElementById("error-banner");
const errorMessage    = document.getElementById("error-message");
const loadingState    = document.getElementById("loading-state");
const resultsSection  = document.getElementById("results-section");
const statTotal       = document.getElementById("stat-total");
const statClear       = document.getElementById("stat-clear");
const statConfirm     = document.getElementById("stat-confirm");
const tasksTbody      = document.getElementById("tasks-tbody");
const emptyTasks      = document.getElementById("empty-tasks");
const decisionsList   = document.getElementById("decisions-list");
const emptyDecisions  = document.getElementById("empty-decisions");
const copyIcon        = document.getElementById("copy-icon");
const copyCheckIcon   = document.getElementById("copy-check-icon");
const copyLabel       = document.getElementById("copy-label");

// ── Sample chat data (30–50 messages, with difficult edge cases) ───────────────
// Includes: ambiguous deadline ("besok", "minggu depan"), task without assignee,
//           changed decision mid-conversation, off-topic messages.
const SAMPLE_CHAT = `[12/11/2024, 08.14] Reza: hei guys, kita udah deket deadline nih
[12/11/2024, 08.15] Dina: iya nih, kita harus gerak cepet
[12/11/2024, 08.16] Reza: ok kita bagi tugas ya, Dina kamu handle bagian pendahuluan dan tinjauan pustaka
[12/11/2024, 08.17] Dina: siap, sampe kapan?
[12/11/2024, 08.18] Reza: deadline besok pagi ya
[12/11/2024, 08.19] Bagas: eh aku gimana? belum dapet bagian
[12/11/2024, 08.20] Reza: Bagas kamu bikin bab metodologi, sama minta data ke lab ya
[12/11/2024, 08.21] Bagas: oke siap, data lab minta ke siapa?
[12/11/2024, 08.22] Reza: ke Bu Sari, asisten lab lantai 3
[12/11/2024, 08.23] Citra: guys aku bisa bantu apa?
[12/11/2024, 08.24] Reza: Citra kamu tolong buat slide presentasi ya, kita presentasi Jumat 15 November
[12/11/2024, 08.25] Citra: oke siap, pakai template kampus kan?
[12/11/2024, 08.26] Reza: iya template resmi kampus
[12/11/2024, 08.27] Dina: btw tadi dosen bilang format laporan harus pake Times New Roman 12, bukan Arial ya
[12/11/2024, 08.28] Bagas: wah oke noted, aku update template
[12/11/2024, 08.29] Reza: semua ingat ya, format laporan Times New Roman 12pt, margin 3-2-3-2
[12/11/2024, 08.30] Citra: siap dicatat
[12/11/2024, 08.31] Dina: oh iya, siapa yang bakal nulis bab kesimpulan?
[12/11/2024, 08.32] Reza: belum ada yang pegang, nanti aja kita putuskan
[12/11/2024, 08.33] Bagas: hahaha semangat gaes
[12/11/2024, 08.34] Citra: wkwkwk iya semangat
[12/11/2024, 08.35] Reza: eh update: deadline pendahuluan diundur jadi Kamis 14 November jam 20.00, bukan besok
[12/11/2024, 08.36] Dina: oh syukurlah, oke noted
[12/11/2024, 08.37] Bagas: lah berarti aku juga bisa lebih santai dong
[12/11/2024, 08.38] Reza: metodologi tetap besok ya Bagas, karena data lab butuh waktu proses
[12/11/2024, 08.39] Bagas: oh ok siap
[12/11/2024, 08.40] Citra: guys slide presentasi aku kerjain minggu depan boleh ga?
[12/11/2024, 08.41] Reza: jangan, presentasi kan Jumat ini, paling lambat Kamis malam ya
[12/11/2024, 08.42] Citra: oh iya iya lupa, oke Kamis 14 November malem beres
[12/11/2024, 08.43] Dina: btw kita perlu review bareng ga sebelum submit?
[12/11/2024, 08.44] Reza: iya kita review bareng Kamis jam 21.00 di Discord
[12/11/2024, 08.45] Bagas: siap
[12/11/2024, 08.46] Citra: oke
[12/11/2024, 08.47] Reza: jadi keputusan kita: review bareng Kamis 14 Nov jam 21.00 via Discord
[12/11/2024, 08.48] Dina: noted. Reza kamu sendiri nulis bagian apa?
[12/11/2024, 08.49] Reza: aku pegang bab hasil dan pembahasan, deadline bareng Dina Kamis 14 Nov jam 20.00
[12/11/2024, 08.50] Bagas: eh siapa yang upload ke sistem e-learning nanti?
[12/11/2024, 08.51] Reza: belum ada yang pegang, siapa bisa?
[12/11/2024, 08.52] Citra: aku bisa, setelah review jam 21 kelar langsung aku upload
[12/11/2024, 08.53] Reza: oke Citra yang upload ke e-learning, paling lambat Jumat 15 Nov jam 08.00 sebelum presentasi
[12/11/2024, 08.54] Dina: mantap, oke semangat semuanya!
[12/11/2024, 08.55] Bagas: gas gas gas 🔥
[12/11/2024, 08.56] Reza: satu lagi — kesimpulan masih belum ada yang pegang, tolong nanti diputuskan`;

// ── State ──────────────────────────────────────────────────────────────────────
let lastResult = null; // Stores the last successful analysis result for copy

// ── Utility: show/hide helpers ─────────────────────────────────────────────────
function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

/**
 * Escapes HTML entities to prevent XSS when injecting into innerHTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── UI State: loading ──────────────────────────────────────────────────────────
function setLoading(isLoading) {
  btnAnalyze.disabled = isLoading;

  if (isLoading) {
    hide(analyzeIcon);
    show(analyzeSpinner);
    analyzeLabel.textContent = "Menganalisis…";
    show(loadingState);
    hide(resultsSection);
    hide(errorBanner);
  } else {
    show(analyzeIcon);
    hide(analyzeSpinner);
    analyzeLabel.textContent = "Analisis";
    hide(loadingState);
  }
}

// ── UI State: show error ───────────────────────────────────────────────────────
function showError(message) {
  errorMessage.textContent = message;
  errorBanner.classList.remove("hidden");
  errorBanner.classList.add("visible");
  // Scroll error into view smoothly
  errorBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hideError() {
  errorBanner.classList.add("hidden");
  errorBanner.classList.remove("visible");
}

// ── Render: summary cards ──────────────────────────────────────────────────────
function renderSummary(tasks) {
  const total   = tasks.length;
  const clear   = tasks.filter((t) => t.status === "Jelas").length;
  const confirm = tasks.filter((t) => t.status === "Perlu Konfirmasi").length;

  statTotal.textContent   = total;
  statClear.textContent   = clear;
  statConfirm.textContent = confirm;
}

// ── Render: tasks table ────────────────────────────────────────────────────────
function renderTasksTable(tasks) {
  tasksTbody.innerHTML = "";

  if (tasks.length === 0) {
    show(emptyTasks);
    return;
  }

  hide(emptyTasks);

  tasks.forEach((task, index) => {
    const isWarning = task.status === "Perlu Konfirmasi";
    const tr = document.createElement("tr");

    // Apply warning row style via CSS class
    tr.className = isWarning ? "row-warning border-b border-amber-100" : "border-b border-gray-100";

    // Show reason note for ANY non-empty reason, regardless of status
    const reasonHtml = task.reason
      ? `<div class="reason-note">${escapeHtml(task.reason)}</div>`
      : "";

    // Build status badge
    const badgeHtml = isWarning
      ? `<span class="badge-confirm">Perlu Konfirmasi</span>`
      : `<span class="badge-clear">Jelas</span>`;

    tr.innerHTML = `
      <td class="px-5 py-3.5 text-gray-400 text-xs font-medium align-top">${index + 1}</td>
      <td class="px-5 py-3.5 align-top">
        <span class="text-gray-800 font-medium">${escapeHtml(task.task)}</span>
        ${reasonHtml}
      </td>
      <td class="px-5 py-3.5 align-top">
        <span class="text-gray-700">${escapeHtml(task.assignee || "–")}</span>
      </td>
      <td class="px-5 py-3.5 align-top">
        <span class="text-gray-700">${escapeHtml(task.deadline || "–")}</span>
      </td>
      <td class="px-5 py-3.5 align-top">${badgeHtml}</td>
    `;

    tasksTbody.appendChild(tr);
  });
}

// ── Render: decisions list ─────────────────────────────────────────────────────
function renderDecisions(decisions) {
  decisionsList.innerHTML = "";

  if (!decisions || decisions.length === 0) {
    show(emptyDecisions);
    return;
  }

  hide(emptyDecisions);

  decisions.forEach((decision) => {
    const li = document.createElement("li");
    li.className = "decision-item";
    li.textContent = decision; // textContent is safe — no XSS risk
    decisionsList.appendChild(li);
  });
}

// ── Render: full results section ───────────────────────────────────────────────
function renderResults(data) {
  renderSummary(data.tasks);
  renderTasksTable(data.tasks);
  renderDecisions(data.decisions);

  // Show results with fade-in
  show(resultsSection);
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Copy to text ───────────────────────────────────────────────────────────────
/**
 * Builds a plain-text representation of the analysis result for clipboard copy.
 * @param {object} data - The validated analysis result.
 * @returns {string}
 */
function buildCopyText(data) {
  const lines = [];
  lines.push("=== CHATASK EXTRACTOR — HASIL ANALISIS ===");
  lines.push("");

  // Summary
  const total   = data.tasks.length;
  const clear   = data.tasks.filter((t) => t.status === "Jelas").length;
  const confirm = data.tasks.filter((t) => t.status === "Perlu Konfirmasi").length;
  lines.push(`Total Tugas: ${total} | Tugas Jelas: ${clear} | Perlu Konfirmasi: ${confirm}`);
  lines.push("");

  // Tasks table (plain text)
  lines.push("--- DAFTAR TUGAS ---");
  const colWidths = { no: 3, task: 40, assignee: 20, deadline: 20, status: 20 };
  const header = [
    "No.".padEnd(colWidths.no),
    "Tugas".padEnd(colWidths.task),
    "Penanggung Jawab".padEnd(colWidths.assignee),
    "Deadline".padEnd(colWidths.deadline),
    "Status",
  ].join(" | ");
  lines.push(header);
  lines.push("-".repeat(header.length));

  data.tasks.forEach((task, i) => {
    const row = [
      String(i + 1).padEnd(colWidths.no),
      (task.task || "–").substring(0, colWidths.task).padEnd(colWidths.task),
      (task.assignee || "–").substring(0, colWidths.assignee).padEnd(colWidths.assignee),
      (task.deadline || "–").substring(0, colWidths.deadline).padEnd(colWidths.deadline),
      task.status,
    ].join(" | ");
    lines.push(row);
    // Add reason note for any task with a non-empty reason (any status)
    if (task.reason) {
      lines.push(`     ⚠ ${task.reason}`);
    }
  });

  lines.push("");

  // Decisions
  if (data.decisions && data.decisions.length > 0) {
    lines.push("--- KEPUTUSAN YANG DISEPAKATI ---");
    data.decisions.forEach((d, i) => {
      lines.push(`${i + 1}. ${d}`);
    });
  }

  lines.push("");
  lines.push("Diekstraksi oleh ChatTask Extractor (Powered by Google Gemini)");

  return lines.join("\n");
}

// ── Event: Gunakan Chat Contoh ─────────────────────────────────────────────────
btnSample.addEventListener("click", () => {
  chatInput.value = SAMPLE_CHAT;
  chatInput.focus();
  // Briefly highlight the textarea to give visual feedback
  chatInput.classList.add("ring-2", "ring-brand-500");
  setTimeout(() => chatInput.classList.remove("ring-2", "ring-brand-500"), 800);
  // Hide previous results/errors when loading a sample
  hide(resultsSection);
  hide(errorBanner);
});

// ── Event: Hapus ──────────────────────────────────────────────────────────────
btnClear.addEventListener("click", () => {
  chatInput.value = "";
  chatInput.focus();
  hide(resultsSection);
  hide(errorBanner);
  lastResult = null;
});

// ── Event: Tutup error banner ─────────────────────────────────────────────────
btnCloseError.addEventListener("click", hideError);

// ── Event: Analisis ───────────────────────────────────────────────────────────
btnAnalyze.addEventListener("click", async () => {
  const text = chatInput.value.trim();

  // Client-side validation: empty input
  if (!text) {
    showError("Teks chat tidak boleh kosong. Tempel chat atau gunakan chat contoh.");
    chatInput.focus();
    return;
  }

  if (text.length < 10) {
    showError("Teks chat terlalu pendek untuk dianalisis.");
    chatInput.focus();
    return;
  }

  // Start loading state
  hideError();
  setLoading(true);
  lastResult = null;

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Send the raw chat text — no transformations
      body: JSON.stringify({ chatText: text }),
    });

    // Parse the JSON response from our server
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("Respons server tidak dapat dibaca. Coba lagi.");
    }

    // Handle non-OK HTTP responses (server returned an error object)
    if (!response.ok) {
      const msg = data?.error || `Error server: HTTP ${response.status}`;
      throw new Error(msg);
    }

    // Success — store result and render
    lastResult = data;
    setLoading(false);
    renderResults(data);

  } catch (err) {
    setLoading(false);
    showError(err.message || "Terjadi kesalahan yang tidak diketahui. Coba lagi.");
  }
});

// ── Event: Salin Hasil ────────────────────────────────────────────────────────
btnCopy.addEventListener("click", async () => {
  if (!lastResult) return;

  const textToCopy = buildCopyText(lastResult);

  try {
    await navigator.clipboard.writeText(textToCopy);

    // Show success state briefly
    hide(copyIcon);
    show(copyCheckIcon);
    copyLabel.textContent = "Tersalin!";
    btnCopy.classList.add("copied");

    setTimeout(() => {
      show(copyIcon);
      hide(copyCheckIcon);
      copyLabel.textContent = "Salin Hasil";
      btnCopy.classList.remove("copied");
    }, 2000);

  } catch {
    // Fallback for older browsers that don't support clipboard API
    showError("Gagal menyalin. Coba salin teks secara manual dari halaman.");
  }
});

// ── Accessibility: allow Enter key on buttons ─────────────────────────────────
// (Native <button> elements already handle Enter, this is a safety net)
[btnAnalyze, btnSample, btnClear, btnCopy].forEach((btn) => {
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      btn.click();
    }
  });
});
