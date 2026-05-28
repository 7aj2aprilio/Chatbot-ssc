# 🚀 Rencana Implementasi: Web Chatbot SSC Telkom University Surabaya

## Ringkasan Proyek

Chatbot web pintar untuk **SSC (Student Service Center) Telkom University Surabaya** yang berfungsi sebagai asisten akademik mahasiswa. Dibangun dengan:

- **Google Gemini 2.0 Flash** sebagai LLM (cepat, gratis, context 1M tokens)
- **TF-IDF/BM25 Lokal** untuk vectoring (sangat cepat, tanpa API call)
- **PDF Reader** untuk ingesti dokumen akademik
- **Admin Dashboard** dengan login (admin/admin) untuk kelola dataset PDF
- **Chat Interface** modern berbahasa Indonesia

---

## ✅ Keputusan yang Sudah Dikonfirmasi

| Pertanyaan | Keputusan |
|---|---|
| API Key Gemini | `AIzaSyCGWaR2WpU7xh6yIYytS62Gq9B3Qs1fvnE` |
| Model | `gemini-2.0-flash` |
| Domain/Topik | SSC Telkom University Surabaya — asisten akademik mahasiswa |
| Bahasa UI | Bahasa Indonesia saja |
| Autentikasi Admin | Login sederhana (username: `admin`, password: `admin`) |
| Storage | JSON files (simpel, cukup untuk skala ini) |
| Vectoring | TF-IDF/BM25 lokal (diproses oleh server Node.js, tanpa API call) |

---

## Cara Kerja Vectoring (TF-IDF Lokal)

```mermaid
flowchart LR
    subgraph "Saat Admin Upload PDF (1x)"
        A["📄 PDF"] --> B["Extract Teks"]
        B --> C["Chunking<br/>(Potong per paragraf)"]
        C --> D["Tokenisasi<br/>(Pecah jadi kata-kata)"]
        D --> E["Hitung TF-IDF<br/>(Bobot tiap kata)"]
        E --> F["💾 Simpan Index<br/>(JSON file)"]
    end
    
    subgraph "Saat User Bertanya (setiap chat)"
        G["❓ Pertanyaan"] --> H["Tokenisasi"]
        H --> I["Hitung Skor<br/>BM25/Cosine"]
        I --> J["Top-5 Dokumen<br/>Paling Relevan"]
        J --> K["🤖 Kirim ke Gemini<br/>+ Pertanyaan"]
        K --> L["💬 Jawaban"]
    end
    
    F -.->|"Load index<br/>(sudah siap)"| I
```

**Kecepatan:**
- Upload PDF 50 halaman → indexing selesai dalam **~1-3 detik**
- Setiap pertanyaan user → pencarian context hanya **~10-50ms**
- Gemini generate jawaban → **~500ms-1.5 detik**
- **Total waktu respons per chat: ~1-2 detik** ✅

---

## Arsitektur Sistem

```mermaid
graph TB
    subgraph "Frontend (Browser)"
        A["💬 Chat Interface<br/>/index.html<br/>Halaman utama mahasiswa"]
        B["⚙️ Admin Dashboard<br/>/admin.html<br/>Login: admin/admin"]
    end

    subgraph "Backend (Node.js + Express)"
        C["🌐 Express Server :3001<br/>REST API + Static Files"]
        D["📄 PDF Processor<br/>pdf-parse"]
        E["🧠 RAG Engine v2<br/>TF-IDF + BM25 (Lokal)"]
        F["🤖 Gemini Client<br/>gemini-2.0-flash"]
        G["💾 Dataset Manager<br/>PDF + JSON"]
        H["🔐 Auth Middleware<br/>Session-based"]
    end

    subgraph "Storage (JSON Files)"
        I["📁 data/uploads/<br/>File PDF asli"]
        J["📁 data/processed/<br/>Dokumen hasil parsing"]
        K["📁 data/vectors/<br/>Index TF-IDF"]
        L["📁 config/<br/>behavior.json"]
        M["knowledge.json<br/>FAQ Keywords"]
    end

    subgraph "External"
        N["☁️ Google Gemini API<br/>gemini-2.0-flash"]
    end

    A -->|"POST /api/chat"| C
    B -->|"CRUD APIs"| C
    C --> H
    H --> D
    H --> E
    C --> F
    C --> G
    D --> J
    E --> K
    F --> N
    G --> I
```

---

## Proposed Changes

### Struktur Folder Proyek

```
TUBESS/
├── server.js                  # [NEW] Entry point utama
├── package.json               # [NEW] Dependencies
├── .env                       # [NEW] GEMINI_API_KEY
├── .gitignore                 # [NEW]
│
├── lib/
│   ├── gemini.js              # [NEW] Gemini AI client
│   ├── rag.js                 # [NEW] RAG Engine v2 (TF-IDF + BM25)
│   ├── pdf-processor.js       # [NEW] PDF extraction & chunking
│   └── dataset.js             # [NEW] Dataset manager (PDF support)
│
├── config/
│   └── behavior.json          # [NEW] System prompt SSC Telkom
│
├── data/
│   ├── uploads/               # [NEW] Raw PDF files
│   ├── processed/             # [NEW] Extracted documents (JSON)
│   └── vectors/               # [NEW] TF-IDF index cache (JSON)
│
├── public/
│   ├── index.html             # [NEW] Chat interface mahasiswa
│   ├── admin.html             # [NEW] Admin dashboard + login
│   ├── css/
│   │   ├── chat.css           # [NEW] Chat UI styling
│   │   └── admin.css          # [NEW] Admin styling
│   └── js/
│       ├── chat.js            # [NEW] Chat logic
│       └── admin.js           # [NEW] Admin logic
│
└── knowledge.json             # [NEW] FAQ keyword responses
```

---

### Komponen 1: Backend Core

#### [NEW] package.json

| Package | Fungsi |
|---------|--------|
| `@google/genai` | SDK resmi Google Gemini AI |
| `pdf-parse` | Ekstraksi teks dari PDF |
| `multer` | Upload file PDF |
| `express` | Web server & API |
| `express-session` | Session untuk login admin |
| `cors` | Cross-origin |
| `dotenv` | Environment variables |

#### [NEW] .env

```env
GEMINI_API_KEY=AIzaSyCGWaR2WpU7xh6yIYytS62Gq9B3Qs1fvnE
GEMINI_MODEL=gemini-2.0-flash
PORT=3001
ADMIN_USER=admin
ADMIN_PASS=admin
SESSION_SECRET=ssc-telkom-secret-key
```

#### [NEW] server.js

Entry point. REST API endpoints:

| Method | Endpoint | Auth? | Deskripsi |
|--------|----------|-------|-----------|
| `POST` | `/api/chat` | ❌ | Chat: kirim pesan, terima jawaban + sumber referensi |
| `GET` | `/api/files/:filename` | ❌ | **Download file PDF sumber referensi** |
| `POST` | `/api/auth/login` | ❌ | Login admin |
| `POST` | `/api/auth/logout` | ✅ | Logout admin |
| `GET` | `/api/auth/check` | ✅ | Cek status login |
| `GET` | `/api/datasets` | ✅ | List semua dataset |
| `POST` | `/api/datasets/upload` | ✅ | Upload PDF baru |
| `DELETE` | `/api/datasets/:id` | ✅ | Hapus dataset |
| `GET` | `/api/datasets/:id/documents` | ✅ | Preview dokumen dari dataset |
| `POST` | `/api/datasets/:id/reprocess` | ✅ | Re-parse & re-index dataset |
| `GET` | `/api/behavior` | ✅ | Ambil config behavior |
| `POST` | `/api/behavior` | ✅ | Update config behavior |
| `GET` | `/api/knowledge` | ✅ | Ambil FAQ keywords |
| `POST` | `/api/knowledge` | ✅ | Tambah/update keyword |
| `DELETE` | `/api/knowledge/:keyword` | ✅ | Hapus keyword |
| `GET` | `/api/stats` | ✅ | Statistik sistem |

**Format Response `/api/chat`:**
```json
{
  "reply": "Berdasarkan Kalender Akademik 2025, UAS dijadwalkan pada...",
  "sources": [
    {
      "filename": "Kalender_Akademik_2025.pdf",
      "page": 12,
      "chunk_preview": "Jadwal UAS Semester Genap 2024/2025...",
      "download_url": "/api/files/Kalender_Akademik_2025.pdf"
    }
  ],
  "source_type": "rag"
}
```

> **Fitur Download Sumber**: Setiap jawaban bot yang berasal dari RAG akan menyertakan link download ke file PDF asli. Mahasiswa bisa klik untuk membuka/download dokumen sumber, sehingga bisa memverifikasi informasi secara mandiri.

---

### Komponen 2: Gemini AI Client

#### [NEW] lib/gemini.js

```javascript
// Menggunakan @google/genai SDK
class GeminiClient {
    constructor(apiKey, model)
    
    async generateResponse(message, contextBlock, behavior)
    // Kirim system prompt + context + pertanyaan ke Gemini
    // Return: teks jawaban dalam Bahasa Indonesia
}
```

**System Prompt Default (SSC Telkom):**
```
Anda adalah asisten virtual SSC (Student Service Center) Telkom University Surabaya.
Tugas Anda adalah membantu mahasiswa mendapatkan informasi akademik seperti:
- Jadwal akademik & perkuliahan
- Prosedur administrasi kampus
- Informasi beasiswa & program studi
- Pemberitahuan & pengumuman penting
- FAQ seputar kehidupan kampus

Jawab HANYA berdasarkan konteks yang diberikan. 
Jika tidak ada informasi yang relevan, jawab dengan sopan bahwa informasi tersebut 
belum tersedia dan sarankan menghubungi SSC langsung.
Gunakan Bahasa Indonesia yang ramah dan profesional.
```

---

### Komponen 3: RAG Engine v2

#### [NEW] lib/rag.js

Peningkatan dari versi lama:

| Fitur | Versi Lama (Praktikum) | Versi Baru (TUBESS) |
|-------|------------------------|---------------------|
| Scoring | TF-IDF + Cosine | **TF-IDF + BM25** (lebih akurat) |
| Indexing | Rebuild setiap query | **Pre-built & cached ke JSON file** |
| Stopwords | 39 kata | **200+ kata Bahasa Indonesia** |
| Chunking | Fixed 700 char | **Paragraph-aware, adaptive** |
| Source | Nama file saja | **File + halaman + posisi** |

---

### Komponen 4: PDF Processor

#### [NEW] lib/pdf-processor.js

```mermaid
flowchart LR
    A["📄 Upload PDF"] --> B["pdf-parse<br/>Extract text"]
    B --> C["Bersihkan teks<br/>(hapus header/footer)"]
    C --> D["Smart Chunking<br/>(per paragraf)"]
    D --> E["Metadata<br/>(source + page)"]
    E --> F["💾 Simpan JSON"]
```

---

### Komponen 5: Chat Interface (Mahasiswa)

#### [NEW] public/index.html + css/chat.css + js/chat.js

Desain premium modern:
- 🌙 Dark mode glassmorphism dengan gradient Telkom University (merah-biru)
- 💬 Chat bubbles dengan animasi smooth
- ⌨️ Typing indicator animasi saat bot memproses
- 📱 Responsive mobile-friendly
- 🎓 Branding SSC Telkom University Surabaya
- ⚡ Auto-scroll, timestamp, tombol "Percakapan Baru"
- 📎 **Sumber Referensi dengan Download Link** — di bawah setiap jawaban bot yang menggunakan RAG, akan ditampilkan card berisi:
  - Nama file PDF sumber (contoh: `Kalender_Akademik_2025.pdf`)
  - Halaman yang direferensikan (contoh: `Halaman 12`)
  - Cuplikan teks yang relevan
  - **Tombol 📥 Download** — klik untuk membuka/download file PDF asli

---

### Komponen 6: Admin Dashboard

#### [NEW] public/admin.html + css/admin.css + js/admin.js

| Section | Fitur |
|---------|-------|
| **🔐 Login Page** | Form login (admin/admin) dengan desain elegan |
| **📊 Overview** | Statistik: total PDF, chunks, datasets |
| **📄 Kelola Dataset** | Upload PDF, lihat daftar, hapus, preview isi |
| **🔑 FAQ Keywords** | CRUD keyword responses |
| **⚙️ Pengaturan Bot** | Edit system prompt, fallback, max kalimat |
| **💬 Test Chat** | Widget chat mini untuk test bot |

---

## Alur Kerja End-to-End

### A. Admin Upload PDF Akademik

```mermaid
sequenceDiagram
    actor Admin
    participant UI as Admin Dashboard
    participant API as Express Server
    participant PDF as PDF Processor
    participant RAG as RAG Engine

    Admin->>UI: Login (admin/admin)
    Admin->>UI: Upload "Kalender_Akademik_2025.pdf"
    UI->>API: POST /api/datasets/upload
    API->>PDF: Extract & chunk teks
    Note over PDF: ~1-3 detik untuk 50 halaman
    PDF-->>API: 127 dokumen chunks
    API->>RAG: Build TF-IDF index
    Note over RAG: ~500ms untuk index
    RAG-->>API: Index tersimpan
    API-->>UI: ✅ "127 chunks berhasil diproses"
    Admin-->>UI: Preview chunks di dashboard
```

### B. Mahasiswa Chat

```mermaid
sequenceDiagram
    actor Mhs as Mahasiswa
    participant Chat as Chat Interface
    participant API as Express Server
    participant KB as Knowledge Base
    participant RAG as RAG Engine
    participant AI as Gemini 2.0 Flash

    Mhs->>Chat: "Kapan jadwal UAS semester ini?"
    Chat->>API: POST /api/chat
    
    API->>KB: Cek FAQ keyword
    Note over KB: Tidak cocok → lanjut RAG
    
    API->>RAG: retrieveContext("jadwal UAS")
    Note over RAG: ~30ms pencarian lokal
    RAG-->>API: 5 chunks relevan (dari Kalender Akademik)
    
    API->>AI: System prompt + 5 chunks + pertanyaan
    Note over AI: ~1 detik generate jawaban
    AI-->>API: "Berdasarkan Kalender Akademik 2025, UAS semester genap dijadwalkan pada..."
    
    API-->>Chat: { reply, sources: ["Kalender_Akademik.pdf hal.12"] }
    Chat-->>Mhs: 💬 Jawaban + sumber referensi + tombol download PDF
```

---

## Verification Plan

### Automated Tests

```bash
# 1. Start server
node server.js

# 2. Test chat API
curl -X POST http://localhost:3001/api/chat -H "Content-Type: application/json" -d "{\"message\":\"halo\"}"

# 3. Test login
curl -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"admin\"}"

# 4. Test stats
curl http://localhost:3001/api/stats

# 5. Test download file sumber
curl http://localhost:3001/api/files/nama_file.pdf
```

### Manual Verification
- Buka `http://localhost:3001` → verifikasi chat interface
- Buka `http://localhost:3001/admin.html` → login → upload PDF → test chat
- Test download file sumber referensi dari chat interface
- Test responsive di ukuran mobile

---

## Timeline Estimasi

| Fase | Komponen | Estimasi |
|------|----------|----------|
| 1 | Setup proyek + Backend core (server, gemini, env) | ~15 menit |
| 2 | PDF Processor + Dataset Manager | ~15 menit |
| 3 | RAG Engine v2 (TF-IDF + BM25) | ~15 menit |
| 4 | Chat Interface (HTML/CSS/JS) | ~20 menit |
| 5 | Admin Dashboard + Login (HTML/CSS/JS) | ~25 menit |
| 6 | Integration testing & polish | ~10 menit |
| **Total** | | **~100 menit** |
