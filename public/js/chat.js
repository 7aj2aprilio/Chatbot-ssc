/**
 * Chat Interface Logic — SSC Telkom University Surabaya
 */

const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const btnSend = document.getElementById('btnSend');
const typingIndicator = document.getElementById('typingIndicator');
const welcomeScreen = document.getElementById('welcomeScreen');

let isProcessing = false;

/**
 * Kirim pesan
 */
async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message || isProcessing) return;

    // Sembunyikan welcome screen
    if (welcomeScreen) {
        welcomeScreen.style.display = 'none';
    }

    // Tampilkan pesan user
    appendMessage('user', message);
    chatInput.value = '';
    autoResize(chatInput);

    // Tampilkan typing indicator
    isProcessing = true;
    btnSend.disabled = true;
    typingIndicator.classList.add('active');
    scrollToBottom();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        const data = await response.json();

        // Sembunyikan typing
        typingIndicator.classList.remove('active');

        // Tampilkan jawaban bot
        appendMessage('bot', data.reply, data.sources);

    } catch (error) {
        typingIndicator.classList.remove('active');
        appendMessage('bot', 'Maaf, terjadi kesalahan koneksi. Silakan coba lagi.');
        console.error('Chat error:', error);
    } finally {
        isProcessing = false;
        btnSend.disabled = false;
        chatInput.focus();
    }
}

/**
 * Tambahkan pesan ke chat
 */
function appendMessage(role, text, sources = []) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const avatar = role === 'bot' ? '🎓' : '👤';
    const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    let sourcesHTML = '';
    if (sources && sources.length > 0 && role === 'bot') {
        const sourceItems = sources.map(src => {
            const downloadBtn = src.download_url
                ? `<a href="${src.download_url}" target="_blank" class="btn-download" title="Buka PDF">📥 Buka PDF</a>`
                : '';
            return `
                <div class="source-item">
                    <div class="source-info">
                        <span class="source-filename">📄 ${escapeHtml(src.filename || 'Dokumen')}</span>
                        <span class="source-page">Halaman ${src.page || '?'}</span>
                    </div>
                    ${downloadBtn}
                </div>
            `;
        }).join('');

        sourcesHTML = `
            <div class="sources-container">
                <div class="sources-title">📚 Sumber Referensi</div>
                ${sourceItems}
            </div>
        `;
    }

    // Format teks: konversi newline dan list
    const formattedText = formatBotText(text);

    messageDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
            <div class="message-bubble">${role === 'bot' ? formattedText : escapeHtml(text)}</div>
            ${sourcesHTML}
            <span class="message-time">${time}</span>
        </div>
    `;

    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * Format teks bot: handle list, bold, newlines
 */
function formatBotText(text) {
    let formatted = escapeHtml(text);
    
    // Bold: **text** → <strong>text</strong>
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // List items: - item atau * item
    formatted = formatted.replace(/^[\-\*]\s+(.+)$/gm, '• $1');
    
    // Numbered list: 1. item
    formatted = formatted.replace(/^\d+\.\s+(.+)$/gm, (match, p1, offset) => {
        return `${'  '}• ${p1}`;
    });
    
    // Newlines
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
}

/**
 * Escape HTML untuk keamanan
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Scroll ke bawah
 */
function scrollToBottom() {
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 100);
}

/**
 * Handle keyboard
 */
function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

/**
 * Auto-resize textarea
 */
function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

/**
 * Kirim dari suggestion chip
 */
function sendSuggestion(text) {
    chatInput.value = text;
    sendMessage();
}

/**
 * Percakapan baru
 */
function newChat() {
    chatMessages.innerHTML = '';

    // Tampilkan welcome screen kembali
    const welcome = document.createElement('div');
    welcome.className = 'welcome-screen';
    welcome.id = 'welcomeScreen';
    welcome.innerHTML = `
        <div class="welcome-icon">🤖</div>
        <h2>Halo, Mahasiswa! 👋</h2>
        <p>Saya adalah asisten virtual SSC Telkom University Surabaya. Tanyakan informasi akademik yang Anda butuhkan.</p>
        <div class="suggestion-chips">
            <button class="suggestion-chip" onclick="sendSuggestion('Apa saja layanan SSC?')">📋 Layanan SSC</button>
            <button class="suggestion-chip" onclick="sendSuggestion('Bagaimana jadwal akademik semester ini?')">📅 Jadwal Akademik</button>
            <button class="suggestion-chip" onclick="sendSuggestion('Bagaimana prosedur pengajuan cuti?')">📝 Prosedur Cuti</button>
            <button class="suggestion-chip" onclick="sendSuggestion('Informasi beasiswa apa saja yang tersedia?')">🎓 Info Beasiswa</button>
        </div>
    `;
    chatMessages.appendChild(welcome);
}

// Focus input saat halaman dimuat
window.addEventListener('load', () => {
    chatInput.focus();
});
