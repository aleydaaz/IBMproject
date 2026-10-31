# ChatTask Extractor

AI Agent yang membaca ekspor chat grup kerja mahasiswa dan mengubahnya menjadi daftar tindak lanjut terstruktur. Ditenagai oleh Google Gemini API.

---

## Fitur

- **Ekstraksi otomatis** tugas, penanggung jawab, dan deadline dari chat informal bahasa Indonesia
- **Deteksi ambiguitas**: tugas tanpa PIC atau deadline ambigu ("besok", "nanti") ditandai *Perlu Konfirmasi*
- **Kartu ringkasan**: Total Tugas, Tugas Jelas, Perlu Konfirmasi
- **Keputusan yang disepakati**: dipisahkan dari daftar tugas
- **Chat contoh** 40+ pesan dengan kasus sulit bawaan
- **Salin Hasil** ke clipboard dalam format teks terstruktur
- Privasi terjaga: chat tidak disimpan dan tidak dicatat di log server

---

## Prasyarat

- **Node.js** v18 atau lebih baru (butuh native `fetch` API bawaan Node.js)
- **Google Gemini API Key** — dapatkan gratis di [Google AI Studio](https://aistudio.google.com/app/apikey)

---

## Instalasi & Menjalankan

### 1. Clone / unduh proyek

```bash
git clone <url-repo>
cd chattask-extractor
```

### 2. Install dependensi

```bash
npm install
```

### 3. Buat file `.env`

Salin file contoh dan isi dengan nilai Anda:

```bash
cp .env.example .env
```

Buka `.env` dan isi:

```env
GEMINI_API_KEY=AIza...          # API key dari Google AI Studio
GEMINI_MODEL=gemini-1.5-flash   # Nama model (lihat opsi di bawah)
PORT=3000                       # Opsional, default 3000
```

**Pilihan model yang direkomendasikan:**
| Model | Kecepatan | Kualitas | Kuota Gratis |
|---|---|---|---|
| `gemini-1.5-flash` | Cepat | Baik | ✅ Tersedia |
| `gemini-1.5-pro` | Lambat | Sangat Baik | Terbatas |
| `gemini-2.0-flash-exp` | Cepat | Sangat Baik | ✅ Tersedia |

### 4. Jalankan server

```bash
npm start
```

Server akan berjalan di **http://localhost:3000**

Buka URL tersebut di browser Anda.

---

## Struktur Proyek

```
chattask-extractor/
├── index.html      # Halaman utama (HTML semantik + Tailwind CSS)
├── style.css       # Custom styles tambahan
├── script.js       # Frontend JavaScript (Vanilla, tanpa framework)
├── server.js       # Backend Express + integrasi Gemini API
├── package.json    # Dependensi Node.js
├── .env            # Konfigurasi rahasia (BUAT SENDIRI, jangan di-commit)
├── .env.example    # Template konfigurasi
└── README.md       # Dokumentasi ini
```

---

## Cara Penggunaan

1. Buka **http://localhost:3000**
2. Tempel teks ekspor chat ke dalam textarea, **atau** klik **"Gunakan Chat Contoh"** untuk mencoba dengan data dummy
3. Klik **"Analisis"**
4. Lihat hasil: ringkasan, tabel tugas (dengan highlight oranye untuk *Perlu Konfirmasi*), dan daftar keputusan
5. Klik **"Salin Hasil"** untuk menyalin ke clipboard

---

## Keamanan & Privasi

- API key **hanya** dibaca dari file `.env` di server — tidak pernah dikirim ke frontend
- Teks chat **tidak disimpan** ke database atau file apapun
- Teks chat **tidak dicatat** (`console.log`) di server
- Tambahkan `.env` ke `.gitignore` agar API key tidak ter-commit

---

## Penanganan Error

| Situasi | Pesan yang Ditampilkan |
|---|---|
| Input kosong | "Teks chat tidak boleh kosong…" |
| API rate limit (429) | "Terlalu banyak permintaan, coba lagi sebentar." (otomatis retry 1x) |
| API key tidak valid | Pesan error dari Gemini |
| Respons bukan JSON | "Respons AI bukan JSON valid. Coba analisis ulang." |

---

## Dependensi

```json
{
  "express": "^4.x",
  "dotenv": "^16.x"
}
```

Install dengan: `npm install`

---

## Lisensi

MIT — bebas digunakan dan dimodifikasi.
