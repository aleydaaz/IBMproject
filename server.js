/**
 * server.js — ChatTask Extractor Backend
 * Express server that proxies requests to Google Gemini API.
 * API key and model name are read from environment variables only.
 */

import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ── Validate required env vars on startup ─────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL;

if (!GEMINI_API_KEY || !GEMINI_MODEL) {
  console.error(
    "[ERROR] GEMINI_API_KEY and GEMINI_MODEL must be set in .env file."
  );
  process.exit(1);
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
// Only serve files from the public/ folder — server.js, .env, package.json, README, etc.
// are NOT inside public/ and therefore cannot be accessed through the browser.
app.use(express.static(path.join(__dirname, "public")));

// ── System prompt for the LLM ─────────────────────────────────────────────────
const SYSTEM_PROMPT = `Kamu adalah asisten ekstraksi tugas dari percakapan grup kerja mahasiswa.

ATURAN EKSTRAKSI (wajib dipatuhi):
1. Hanya ekstrak informasi yang BENAR-BENAR tertulis di chat. Jangan mengarang nama, tanggal, atau tugas.
2. Tandai status "Perlu Konfirmasi" bila:
   - Tugas tidak memiliki penanggung jawab yang jelas, ATAU
   - Deadline-nya ambigu (misalnya "besok", "nanti", "minggu depan" tanpa tanggal acuan yang eksplisit di chat).
   Isi kolom "reason" dengan alasan singkat mengapa perlu konfirmasi.
3. Bila sebuah keputusan atau deadline BERUBAH di tengah percakapan, gunakan versi TERBARU dan SELALU catat perubahannya di kolom reason — bahkan bila status akhirnya "Jelas". Contoh reason untuk kasus ini: "Deadline diperbarui dari 'besok pagi' menjadi Kamis 14 November jam 20.00".
4. Abaikan obrolan yang tidak berkaitan dengan tugas (basa-basi, candaan, dll).
5. Bila tidak ada tugas yang ditemukan, kembalikan array kosong [] untuk tasks, bukan tugas karangan.
6. Kolom reason boleh diisi untuk status "Jelas" bila ada perubahan yang perlu dicatat. Isi reason dengan string kosong "" HANYA bila benar-benar tidak ada catatan perubahan maupun konfirmasi yang diperlukan.

FORMAT OUTPUT:
Balas HANYA dengan JSON valid tanpa teks tambahan, markdown, atau penjelasan apapun.
Skema JSON yang wajib digunakan:
{
  "tasks": [
    {
      "task": "deskripsi tugas",
      "assignee": "nama penanggung jawab atau '-' jika tidak ada",
      "deadline": "tanggal atau deskripsi deadline, atau '-' jika tidak ada",
      "status": "Jelas" atau "Perlu Konfirmasi",
      "reason": "catatan perubahan atau alasan konfirmasi; boleh diisi untuk status 'Jelas' bila ada perubahan"
    }
  ],
  "decisions": [
    "teks keputusan yang disepakati bersama"
  ]
}`;

// ── Helper: call Gemini REST API ───────────────────────────────────────────────
async function callGemini(chatText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  // JSON schema for structured output (Gemini response schema)
  const responseSchema = {
    type: "OBJECT",
    properties: {
      tasks: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            task: { type: "STRING" },
            assignee: { type: "STRING" },
            deadline: { type: "STRING" },
            status: { type: "STRING", enum: ["Jelas", "Perlu Konfirmasi"] },
            reason: { type: "STRING" },
          },
          required: ["task", "assignee", "deadline", "status", "reason"],
        },
      },
      decisions: {
        type: "ARRAY",
        items: { type: "STRING" },
      },
    },
    required: ["tasks", "decisions"],
  };

  const body = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: chatText }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema,
      temperature: 0.1, // Low temperature for factual extraction
    },
  };

  // ── 30-second timeout via AbortController ────────────────────────────────
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Helper: sleep for retry delay ─────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Helper: detect model-not-found error from Gemini response ─────────────────
function isModelNotFound(status, errMessage) {
  if (status === 404) return true;
  const msg = (errMessage || "").toLowerCase();
  return msg.includes("not found") || msg.includes("no longer available") || msg.includes("model") && msg.includes("not");
}

// ── Helper: validate parsed JSON structure ────────────────────────────────────
function validateStructure(data) {
  if (!data || typeof data !== "object") return false;
  if (!Array.isArray(data.tasks) || !Array.isArray(data.decisions))
    return false;

  const validStatuses = ["Jelas", "Perlu Konfirmasi"];
  for (const task of data.tasks) {
    if (
      typeof task.task !== "string" ||
      typeof task.assignee !== "string" ||
      typeof task.deadline !== "string" ||
      typeof task.reason !== "string" ||
      !validStatuses.includes(task.status)
    ) {
      return false;
    }
  }

  for (const decision of data.decisions) {
    if (typeof decision !== "string") return false;
  }

  return true;
}

// ── POST /api/analyze ─────────────────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  const { chatText } = req.body;

  // Input validation — do NOT log chatText to protect privacy
  if (!chatText || typeof chatText !== "string" || chatText.trim() === "") {
    return res.status(400).json({
      error: "Input chat tidak boleh kosong.",
    });
  }

  if (chatText.trim().length < 10) {
    return res.status(400).json({
      error: "Teks chat terlalu pendek untuk dianalisis.",
    });
  }

  let response;

  // ── First attempt ────────────────────────────────────────────────────────
  try {
    response = await callGemini(chatText.trim());
  } catch (networkErr) {
    // Handle AbortController timeout separately
    if (networkErr.name === "AbortError") {
      console.error("[ERROR] Gemini request timed out after 30 seconds.");
      return res.status(504).json({
        error: "Permintaan ke API Gemini melebihi batas waktu (30 detik). Coba lagi.",
      });
    }
    console.error("[ERROR] Network error calling Gemini:", networkErr.message);
    return res.status(502).json({
      error: "Gagal menghubungi API Gemini. Periksa koneksi internet Anda.",
    });
  }

  // ── Retry once on 429 (rate limit) or 503 (service unavailable) ──────────
  if (response.status === 429 || response.status === 503) {
    const reason = response.status === 429 ? "429 rate limit" : "503 service unavailable";
    console.warn(`[WARN] Gemini ${reason} received, retrying after 2 seconds...`);
    await sleep(2000);

    try {
      response = await callGemini(chatText.trim());
    } catch (retryErr) {
      if (retryErr.name === "AbortError") {
        console.error("[ERROR] Gemini retry request timed out.");
        return res.status(504).json({
          error: "Permintaan ke API Gemini melebihi batas waktu (30 detik). Coba lagi.",
        });
      }
      console.error("[ERROR] Retry network error:", retryErr.message);
      return res.status(502).json({
        error: "Gagal menghubungi API Gemini setelah retry.",
      });
    }

    // Still rate-limited after retry
    if (response.status === 429) {
      return res.status(429).json({
        error: "Terlalu banyak permintaan, coba lagi sebentar.",
      });
    }
    // Still 503 after retry
    if (response.status === 503) {
      return res.status(503).json({
        error: "Layanan API Gemini sedang tidak tersedia. Coba lagi beberapa saat.",
      });
    }
  }

  // ── Handle other non-OK responses ────────────────────────────────────────
  if (!response.ok) {
    let errDetail = `HTTP ${response.status}`;
    let errBody;
    try {
      errBody = await response.json();
      errDetail = errBody?.error?.message || errDetail;
    } catch (_) {}

    // Detect model-not-found errors (Fix #5)
    if (isModelNotFound(response.status, errDetail)) {
      console.error(`[ERROR] Gemini model not found (${response.status}): ${errDetail}`);
      return res.status(502).json({
        error:
          "Model AI tidak tersedia. Periksa nilai GEMINI_MODEL di file .env, lalu restart server.",
      });
    }

    console.error("[ERROR] Gemini API error:", errDetail);
    return res.status(502).json({
      error: `API Gemini mengembalikan error: ${errDetail}`,
    });
  }

  // ── Parse Gemini response ─────────────────────────────────────────────────
  let geminiBody;
  try {
    geminiBody = await response.json();
  } catch (parseErr) {
    console.error("[ERROR] Failed to parse Gemini response body.");
    return res.status(502).json({
      error: "Respons dari API Gemini tidak dapat dibaca.",
    });
  }

  // Extract the text content from Gemini's response structure
  const rawText = geminiBody?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    console.error("[ERROR] Gemini response has no text content.");
    return res.status(502).json({
      error: "API Gemini tidak mengembalikan konten. Coba lagi.",
    });
  }

  // ── Parse and validate the structured JSON ───────────────────────────────
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (jsonErr) {
    console.error("[ERROR] Gemini returned invalid JSON.");
    return res.status(502).json({
      error: "Respons AI bukan JSON valid. Coba analisis ulang.",
    });
  }

  if (!validateStructure(parsed)) {
    console.error("[ERROR] Gemini JSON failed schema validation.");
    return res.status(502).json({
      error: "Struktur respons AI tidak sesuai skema. Coba analisis ulang.",
    });
  }

  // ── Success: return validated data ───────────────────────────────────────
  return res.json(parsed);
});

// ── Express error handler: 413 Payload Too Large → JSON response ──────────────
app.use((err, req, res, next) => {
  if (err.status === 413 || err.type === "entity.too.large") {
    return res.status(413).json({ error: "Teks chat terlalu panjang." });
  }
  next(err);
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[INFO] ChatTask Extractor server running at http://localhost:${PORT}`);
  console.log(`[INFO] Using Gemini model: ${GEMINI_MODEL}`);
});
