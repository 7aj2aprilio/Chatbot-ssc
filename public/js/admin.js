/**
 * Admin Dashboard Logic — SSC Telkom University Surabaya
 */

// ─── Auth ────────────────────────────────────────
async function checkAuth() {
    try {
        const res = await fetch('/api/auth/check', { credentials: 'include' });
        const data = await res.json();
        if (data.isAdmin) {
            showDashboard();
        }
    } catch (e) {
        // Not logged in
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.success) {
            showDashboard();
            showToast('Login berhasil! 👋', 'success');
        } else {
            errorEl.textContent = data.message || 'Login gagal';
            errorEl.style.display = 'block';
        }
    } catch (error) {
        errorEl.textContent = 'Gagal menghubungi server';
        errorEl.style.display = 'block';
    }
}

async function handleLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {}
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('dashboardPage').style.display = 'none';
    showToast('Logout berhasil', 'info');
}

function showDashboard() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('dashboardPage').style.display = 'block';
    loadOverview();
}

// ─── Tabs ────────────────────────────────────────
function switchTab(tabName) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.target.classList.add('active');

    // Load data for the tab
    switch (tabName) {
        case 'overview': loadOverview(); break;
        case 'datasets': loadDatasets(); break;
        case 'keywords': loadKeywords(); break;
        case 'behavior': loadBehavior(); break;
    }
}

// ─── Overview ────────────────────────────────────
async function loadOverview() {
    try {
        const res = await fetch('/api/stats', { credentials: 'include' });
        if (res.status === 401) return;
        const data = await res.json();

        document.getElementById('statDatasets').textContent = data.datasets?.totalDatasets || 0;
        document.getElementById('statChunks').textContent = data.datasets?.totalChunks || 0;
        document.getElementById('statModel').textContent = (data.gemini?.model || '—').replace('gemini-', '');

        // Load keywords count
        try {
            const kRes = await fetch('/api/knowledge', { credentials: 'include' });
            const kData = await kRes.json();
            document.getElementById('statKeywords').textContent = Object.keys(kData.responses || {}).length;
        } catch (e) {}
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ─── Datasets ────────────────────────────────────
async function loadDatasets() {
    try {
        const res = await fetch('/api/datasets', { credentials: 'include' });
        if (res.status === 401) return;
        const data = await res.json();

        const container = document.getElementById('datasetList');

        if (!data.datasets || data.datasets.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <p>Belum ada dataset. Upload PDF untuk memulai.</p>
                </div>
            `;
            return;
        }

        let html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Nama File</th>
                        <th>Halaman</th>
                        <th>Chunks</th>
                        <th>Tanggal Upload</th>
                        <th>Aksi</th>
                    </tr>
                </thead>
                <tbody>
        `;

        for (const ds of data.datasets) {
            const date = new Date(ds.uploadedAt).toLocaleDateString('id-ID', {
                day: '2-digit', month: 'short', year: 'numeric'
            });

            html += `
                <tr>
                    <td class="filename">📄 ${escapeHtml(ds.name)}</td>
                    <td>${ds.numPages || '—'}</td>
                    <td>${ds.totalChunks || '—'}</td>
                    <td>${date}</td>
                    <td>
                        <button class="btn btn-accent btn-sm" onclick="previewChunks('${ds.id}')">👁️ Preview</button>
                        <button class="btn btn-accent btn-sm" onclick="reprocessDataset('${ds.id}')">🔄 Reprocess</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteDataset('${ds.id}')">🗑️ Hapus</button>
                    </td>
                </tr>
            `;
        }

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading datasets:', error);
    }
}

// Upload handler
async function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
        showToast('Hanya file PDF yang diperbolehkan', 'error');
        return;
    }

    const progressEl = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    progressEl.style.display = 'block';
    progressFill.style.width = '30%';
    progressText.textContent = `Mengupload ${file.name}...`;

    const formData = new FormData();
    formData.append('pdf', file);

    try {
        progressFill.style.width = '60%';
        progressText.textContent = 'Memproses PDF...';

        const res = await fetch('/api/datasets/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        const data = await res.json();
        progressFill.style.width = '100%';

        if (data.success) {
            progressText.textContent = `✅ ${data.message}`;
            showToast(data.message, 'success');
            loadDatasets();
            loadOverview();
        } else {
            progressText.textContent = `❌ ${data.message}`;
            showToast(data.message, 'error');
        }
    } catch (error) {
        progressText.textContent = '❌ Gagal mengupload file';
        showToast('Gagal mengupload file', 'error');
    }

    input.value = '';
    setTimeout(() => {
        progressEl.style.display = 'none';
        progressFill.style.width = '0%';
    }, 3000);
}

async function deleteDataset(id) {
    if (!confirm('Yakin ingin menghapus dataset ini?')) return;

    try {
        const res = await fetch(`/api/datasets/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await res.json();

        if (data.success) {
            showToast(data.message, 'success');
            loadDatasets();
            loadOverview();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        showToast('Gagal menghapus dataset', 'error');
    }
}

async function reprocessDataset(id) {
    showToast('Memproses ulang dataset...', 'info');
    try {
        const res = await fetch(`/api/datasets/${id}/reprocess`, {
            method: 'POST',
            credentials: 'include'
        });
        const data = await res.json();
        showToast(data.message, data.success ? 'success' : 'error');
        if (data.success) {
            loadDatasets();
            loadOverview();
        }
    } catch (error) {
        showToast('Gagal reprocess dataset', 'error');
    }
}

async function previewChunks(id) {
    try {
        const res = await fetch(`/api/datasets/${id}/documents`, { credentials: 'include' });
        const data = await res.json();

        const modal = document.getElementById('chunksModal');
        const title = document.getElementById('chunksModalTitle');
        const content = document.getElementById('chunksModalContent');

        title.textContent = `Preview: ${data.dataset?.name || id} (${data.documents?.length || 0} chunks)`;

        if (!data.documents || data.documents.length === 0) {
            content.innerHTML = '<div class="empty-state"><p>Tidak ada chunks</p></div>';
        } else {
            const chunks = data.documents.slice(0, 20); // Show max 20
            content.innerHTML = chunks.map((doc, i) => `
                <div class="chunk-preview">
                    <div class="chunk-meta">Chunk #${i + 1} · Halaman ${doc.page || '?'}</div>
                    ${escapeHtml(doc.text.substring(0, 300))}${doc.text.length > 300 ? '...' : ''}
                </div>
            `).join('');

            if (data.documents.length > 20) {
                content.innerHTML += `<p style="text-align:center;color:var(--text-muted);font-size:12px;margin-top:12px;">Menampilkan 20 dari ${data.documents.length} chunks</p>`;
            }
        }

        modal.classList.add('active');
    } catch (error) {
        showToast('Gagal memuat preview', 'error');
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// Drag & Drop
const uploadArea = document.getElementById('uploadArea');
if (uploadArea) {
    ['dragenter', 'dragover'].forEach(event => {
        uploadArea.addEventListener(event, (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(event => {
        uploadArea.addEventListener(event, (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
        });
    });

    uploadArea.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files[0];
        if (file) {
            const input = document.getElementById('fileInput');
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            handleFileUpload(input);
        }
    });
}

// ─── Keywords ────────────────────────────────────
async function loadKeywords() {
    try {
        const res = await fetch('/api/knowledge', { credentials: 'include' });
        if (res.status === 401) return;
        const data = await res.json();

        const container = document.getElementById('keywordList');
        const responses = data.responses || {};
        const keys = Object.keys(responses);

        if (keys.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <p>Belum ada FAQ keyword.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = keys.map(key => `
            <div class="faq-item">
                <div>
                    <div class="faq-keyword">"${escapeHtml(key)}"</div>
                    <div class="faq-response">${escapeHtml(responses[key])}</div>
                </div>
                <div class="faq-actions">
                    <button class="btn btn-danger btn-sm" onclick="deleteKeyword('${escapeHtml(key)}')">🗑️</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading keywords:', error);
    }
}

async function addKeyword() {
    const keyword = document.getElementById('faqKeyword').value.trim();
    const response = document.getElementById('faqResponse').value.trim();

    if (!keyword || !response) {
        showToast('Keyword dan response harus diisi', 'error');
        return;
    }

    try {
        const res = await fetch('/api/knowledge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ keyword, response })
        });
        const data = await res.json();

        if (data.success) {
            showToast('Keyword berhasil disimpan', 'success');
            document.getElementById('faqKeyword').value = '';
            document.getElementById('faqResponse').value = '';
            loadKeywords();
            loadOverview();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        showToast('Gagal menyimpan keyword', 'error');
    }
}

async function deleteKeyword(keyword) {
    if (!confirm(`Hapus keyword "${keyword}"?`)) return;

    try {
        const res = await fetch(`/api/knowledge/${encodeURIComponent(keyword)}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await res.json();

        if (data.success) {
            showToast('Keyword berhasil dihapus', 'success');
            loadKeywords();
            loadOverview();
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        showToast('Gagal menghapus keyword', 'error');
    }
}

// ─── Behavior ────────────────────────────────────
async function loadBehavior() {
    try {
        const res = await fetch('/api/behavior', { credentials: 'include' });
        if (res.status === 401 || res.status === 404) return;
        const data = await res.json();

        document.getElementById('behaviorInstructions').value = data.system_instructions || '';
        document.getElementById('behaviorFallback').value = data.fallback_response || '';
        document.getElementById('behaviorMaxSentences').value = data.max_sentences || 5;
        document.getElementById('behaviorLanguage').value = data.language || 'id';
        document.getElementById('behaviorReplyStyle').value = data.reply_style || '';
    } catch (error) {
        console.error('Error loading behavior:', error);
    }
}

async function saveBehavior() {
    const obj = {
        system_instructions: document.getElementById('behaviorInstructions').value,
        fallback_response: document.getElementById('behaviorFallback').value,
        max_sentences: parseInt(document.getElementById('behaviorMaxSentences').value) || 5,
        language: document.getElementById('behaviorLanguage').value || 'id',
        reply_style: document.getElementById('behaviorReplyStyle').value
    };

    try {
        const res = await fetch('/api/behavior', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(obj)
        });
        const data = await res.json();
        showToast(data.success ? 'Pengaturan berhasil disimpan' : data.message, data.success ? 'success' : 'error');
    } catch (error) {
        showToast('Gagal menyimpan pengaturan', 'error');
    }
}

// ─── Test Chat ───────────────────────────────────
async function sendTestChat() {
    const input = document.getElementById('testChatInput');
    const message = input.value.trim();
    if (!message) return;

    const container = document.getElementById('testChatMessages');

    // Add user message
    container.innerHTML += `<div class="test-msg user">${escapeHtml(message)}</div>`;
    input.value = '';
    container.scrollTop = container.scrollHeight;

    // Loading
    const loadingId = 'loading-' + Date.now();
    container.innerHTML += `<div class="test-msg bot" id="${loadingId}">⏳ Memproses...</div>`;
    container.scrollTop = container.scrollHeight;

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        const data = await res.json();

        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) {
            let reply = escapeHtml(data.reply);
            if (data.sources && data.sources.length > 0) {
                reply += '<br><br><small style="color:var(--text-muted)">📚 Sumber: ' +
                    data.sources.map(s => s.filename || 'dokumen').join(', ') + '</small>';
            }
            loadingEl.innerHTML = reply;
        }
    } catch (error) {
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.textContent = '❌ Gagal mendapatkan respons';
    }

    container.scrollTop = container.scrollHeight;
}

function clearTestChat() {
    document.getElementById('testChatMessages').innerHTML = '<div class="test-msg bot">Halo! Saya siap menerima pertanyaan untuk testing. 🤖</div>';
}

// ─── Utilities ───────────────────────────────────
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 3000);
}

// ─── Init ────────────────────────────────────────
window.addEventListener('load', () => {
    checkAuth();
});
