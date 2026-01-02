/**
 * AGI Personal Assistant - Main Application
 * Système d'extraction automatique des informations
 */

// ============================================================================
// State Management
// ============================================================================

const state = {
  apiKey: null,
  triggers: [],      // Auto-extracted keywords
  chatHistory: [],
  isTyping: false
};

// Storage keys
const STORAGE_KEYS = {
  API_KEY: 'agi_api_key',
  TRIGGERS: 'agi_triggers',
  CHAT_HISTORY: 'agi_chat_history'
};

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  loadState();
  setupEventListeners();
  renderTriggers();
  renderMemories();
  updateStatusIndicator();
  checkApiKey();
  autoResizeTextarea();
}

function loadState() {
  // Load API key
  state.apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);

  // Load triggers (auto-extracted)
  try {
    const triggers = localStorage.getItem(STORAGE_KEYS.TRIGGERS);
    state.triggers = triggers ? JSON.parse(triggers) : [];
  } catch (e) {
    state.triggers = [];
  }

  // Load chat history
  try {
    const history = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
    state.chatHistory = history ? JSON.parse(history) : [];
    renderChatHistory();
  } catch (e) {
    state.chatHistory = [];
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEYS.TRIGGERS, JSON.stringify(state.triggers));
  localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(state.chatHistory));
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
  const messageInput = document.getElementById('messageInput');

  // Auto-resize textarea
  messageInput.addEventListener('input', () => {
    autoResizeTextarea();
  });

  // Send on Enter (Shift+Enter for new line)
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Close sidebar on outside click (mobile)
  document.addEventListener('click', (e) => {
    if (window.innerWidth < 1024) {
      const leftSidebar = document.getElementById('sidebarLeft');
      const rightSidebar = document.getElementById('sidebarRight');

      if (leftSidebar.classList.contains('open') &&
        !leftSidebar.contains(e.target) &&
        !e.target.closest('.mobile-menu')) {
        toggleSidebar('left');
      }

      if (rightSidebar.classList.contains('open') &&
        !rightSidebar.contains(e.target) &&
        !e.target.closest('.mobile-menu')) {
        toggleSidebar('right');
      }
    }
  });

  // Handle escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllSidebars();
      closeModal();
    }
  });
}

function autoResizeTextarea() {
  const textarea = document.getElementById('messageInput');
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

// ============================================================================
// Sidebar Management
// ============================================================================

function toggleSidebar(side) {
  const sidebar = document.getElementById(side === 'left' ? 'sidebarLeft' : 'sidebarRight');
  const isOpen = sidebar.classList.contains('open');

  // Close the other sidebar first
  if (!isOpen) {
    const otherSide = side === 'left' ? 'right' : 'left';
    const otherSidebar = document.getElementById(otherSide === 'left' ? 'sidebarLeft' : 'sidebarRight');
    otherSidebar.classList.remove('open');
  }

  sidebar.classList.toggle('open');

  // Manage body scroll on mobile
  if (window.innerWidth < 1024) {
    document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
  }
}

function closeAllSidebars() {
  document.getElementById('sidebarLeft').classList.remove('open');
  document.getElementById('sidebarRight').classList.remove('open');
  document.body.style.overflow = '';
}

// ============================================================================
// API Key Management
// ============================================================================

function checkApiKey() {
  if (!state.apiKey) {
    showSetupModal();
  }
}

function showSetupModal() {
  document.getElementById('setupModal').classList.add('open');
}

function saveSetupApiKey() {
  const input = document.getElementById('setupApiKey');
  const key = input.value.trim();

  if (key && key.startsWith('sk-')) {
    state.apiKey = key;
    localStorage.setItem(STORAGE_KEYS.API_KEY, key);
    document.getElementById('setupModal').classList.remove('open');
    updateStatusIndicator();
    showNotification('API configurée avec succès!', 'success');
  } else {
    showNotification('Clé API invalide. Elle doit commencer par "sk-"', 'error');
  }
}

function saveApiKey() {
  const input = document.getElementById('apiKeyInput');
  const key = input.value.trim();

  if (key && key.startsWith('sk-')) {
    state.apiKey = key;
    localStorage.setItem(STORAGE_KEYS.API_KEY, key);
    input.value = '';
    updateStatusIndicator();
    showNotification('Clé API mise à jour!', 'success');
  } else {
    showNotification('Clé API invalide', 'error');
  }
}

function updateStatusIndicator() {
  const indicator = document.getElementById('statusIndicator');
  const text = indicator.querySelector('.status-text');

  if (state.apiKey) {
    indicator.classList.add('connected');
    text.textContent = 'Connecté';
  } else {
    indicator.classList.remove('connected');
    text.textContent = 'Non configuré';
  }
}

// ============================================================================
// Chat Functionality
// ============================================================================

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const message = input.value.trim();

  if (!message || state.isTyping) return;

  if (!state.apiKey) {
    showSetupModal();
    return;
  }

  // Add user message
  addMessage('user', message);
  input.value = '';
  autoResizeTextarea();

  // Show typing indicator
  showTypingIndicator();

  try {
    // Run extraction and response in parallel
    const [response, extraction] = await Promise.all([
      callClaudeAPI(message),
      extractInformation(message)
    ]);

    hideTypingIndicator();
    addMessage('assistant', response);

    // Process extraction results
    if (extraction && extraction.important) {
      processExtraction(extraction, message);
    }

  } catch (error) {
    hideTypingIndicator();
    console.error('API Error:', error);
    addMessage('assistant', 'Désolé, une erreur s\'est produite. Vérifie ta connexion et ta clé API.');
  }
}

function addMessage(role, content) {
  const chatMessages = document.getElementById('chatMessages');

  // Remove welcome message if present
  const welcome = chatMessages.querySelector('.welcome-message');
  if (welcome) {
    welcome.remove();
  }

  const messageEl = document.createElement('div');
  messageEl.className = `message message-${role}`;

  const avatar = role === 'user' ? '👤' : '🤖';
  const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  messageEl.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-content">
      <p>${formatMessage(content)}</p>
      <div class="message-time">${time}</div>
    </div>
  `;

  chatMessages.appendChild(messageEl);
  scrollToBottom();

  // Save to history
  state.chatHistory.push({ role, content, timestamp: Date.now() });
  saveState();
}

function formatMessage(content) {
  // Basic markdown-like formatting
  return content
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
}

function showTypingIndicator() {
  state.isTyping = true;
  const chatMessages = document.getElementById('chatMessages');

  const typingEl = document.createElement('div');
  typingEl.className = 'message message-assistant';
  typingEl.id = 'typingIndicator';
  typingEl.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="typing-indicator">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;

  chatMessages.appendChild(typingEl);
  scrollToBottom();
}

function hideTypingIndicator() {
  state.isTyping = false;
  const typing = document.getElementById('typingIndicator');
  if (typing) typing.remove();
}

function scrollToBottom() {
  const chatMessages = document.getElementById('chatMessages');
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderChatHistory() {
  if (state.chatHistory.length === 0) return;

  const chatMessages = document.getElementById('chatMessages');
  const welcome = chatMessages.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  state.chatHistory.forEach(msg => {
    const messageEl = document.createElement('div');
    messageEl.className = `message message-${msg.role}`;

    const avatar = msg.role === 'user' ? '👤' : '🤖';
    const time = new Date(msg.timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    messageEl.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-content">
        <p>${formatMessage(msg.content)}</p>
        <div class="message-time">${time}</div>
      </div>
    `;

    chatMessages.appendChild(messageEl);
  });

  scrollToBottom();
}

// ============================================================================
// Claude API
// ============================================================================

async function callClaudeAPI(userMessage) {
  const memories = memoryManager.getMemoriesForContext();
  const memoriesContext = memories.length > 0
    ? `\n\nVoici ce que tu sais sur l'utilisateur:\n${memories.map(m => `- [${m.category}] ${m.content}`).join('\n')}`
    : '';

  const systemPrompt = `Tu es un assistant personnel AGI bienveillant et empathique.
Tu te souviens de tout ce que l'utilisateur te dit et tu utilises ces informations pour personnaliser tes réponses.
Tu es français et tu parles de manière naturelle et chaleureuse.
Tu fais attention aux émotions de l'utilisateur et tu adaptes ton ton en conséquence.
Quand l'utilisateur partage des informations personnelles (famille, travail, préférences, etc.), montre que tu les as notées.${memoriesContext}`;

  const messages = state.chatHistory.slice(-10).map(msg => ({
    role: msg.role,
    content: msg.content
  }));

  messages.push({ role: 'user', content: userMessage });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': state.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'API request failed');
  }

  const data = await response.json();
  return data.content[0].text;
}

// ============================================================================
// Automatic Information Extraction
// ============================================================================

async function extractInformation(message) {
  const extractionPrompt = `Tu es un système d'extraction d'informations. Analyse le message de l'utilisateur et extrais les informations importantes à retenir.

Réponds UNIQUEMENT avec un objet JSON valide (pas de texte avant ou après), avec cette structure exacte:
{
  "important": true/false,
  "souvenir": "résumé concis de l'info à retenir (ou null si pas important)",
  "categorie": "famille|travail|loisirs|sante|emotions|preferences|projets|social|autre",
  "mots_cles": ["mot1", "mot2"],
  "score": 1-10
}

Règles:
- important = true si le message contient des infos personnelles, préférences, faits sur la vie de l'utilisateur
- important = false pour les questions simples, salutations, messages sans contenu personnel
- mots_cles = noms propres, lieux, activités, préférences mentionnées (max 5)
- score = importance de l'information (1=trivial, 10=crucial)
- souvenir = reformulation concise à la 3ème personne ("Il/Elle aime...", "Son frère s'appelle...")

Message à analyser: "${message.replace(/"/g, '\\"')}"`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        messages: [{ role: 'user', content: extractionPrompt }]
      })
    });

    if (!response.ok) {
      console.error('Extraction API error');
      return null;
    }

    const data = await response.json();
    const text = data.content[0].text.trim();

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return null;
  } catch (error) {
    console.error('Extraction error:', error);
    return null;
  }
}

function processExtraction(extraction, originalMessage) {
  // Add memory
  if (extraction.souvenir) {
    memoryManager.addMemory(
      extraction.souvenir,
      extraction.categorie || 'autre',
      extraction.score || 5
    );
    renderMemories();
  }

  // Add new keywords as triggers
  if (extraction.mots_cles && extraction.mots_cles.length > 0) {
    let newTriggersCount = 0;

    extraction.mots_cles.forEach(keyword => {
      const word = keyword.toLowerCase().trim();
      if (word.length > 2 && !state.triggers.find(t => t.word === word)) {
        state.triggers.push({
          word: word,
          score: extraction.score || 5,
          category: extraction.categorie || 'autre',
          createdAt: new Date().toISOString()
        });
        newTriggersCount++;
      }
    });

    if (newTriggersCount > 0) {
      // Keep only the 50 most recent triggers
      state.triggers = state.triggers.slice(-50);
      saveState();
      renderTriggers();
    }
  }
}

// ============================================================================
// Triggers Display (Auto-extracted)
// ============================================================================

function renderTriggers() {
  const container = document.getElementById('triggersList');

  if (state.triggers.length === 0) {
    container.innerHTML = '<p class="empty-state">Les mots-clés apparaîtront automatiquement...</p>';
    return;
  }

  // Group triggers by category
  const grouped = {};
  state.triggers.forEach(trigger => {
    const cat = trigger.category || 'autre';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(trigger);
  });

  // Category labels and emojis
  const categoryInfo = {
    famille: { label: 'Famille', emoji: '👨‍👩‍👧‍👦' },
    travail: { label: 'Travail', emoji: '💼' },
    loisirs: { label: 'Loisirs', emoji: '🎮' },
    sante: { label: 'Santé', emoji: '🏥' },
    emotions: { label: 'Émotions', emoji: '💭' },
    preferences: { label: 'Préférences', emoji: '⭐' },
    projets: { label: 'Projets', emoji: '🎯' },
    social: { label: 'Social', emoji: '👥' },
    autre: { label: 'Autre', emoji: '📌' }
  };

  let html = '';
  Object.keys(grouped).forEach(category => {
    const info = categoryInfo[category] || { label: category, emoji: '📌' };
    html += `<div class="trigger-category">
      <div class="trigger-category-header">${info.emoji} ${info.label}</div>
      <div class="trigger-category-tags">
        ${grouped[category].map(t => `
          <span class="trigger-tag" title="Score: ${t.score}/10">
            <span class="trigger-word">${t.word}</span>
          </span>
        `).join('')}
      </div>
    </div>`;
  });

  container.innerHTML = html;
}

function clearTriggers() {
  if (confirm('Effacer tous les mots-clés détectés?')) {
    state.triggers = [];
    saveState();
    renderTriggers();
    showNotification('Mots-clés effacés', 'success');
  }
}

// ============================================================================
// Memories Management
// ============================================================================

function renderMemories() {
  const container = document.getElementById('memoriesList');
  const memories = memoryManager.getRecentMemories(15);

  if (memories.length === 0) {
    container.innerHTML = '<p class="empty-state">Les souvenirs apparaîtront automatiquement quand tu partageras des infos personnelles...</p>';
    return;
  }

  // Category emojis
  const categoryEmoji = {
    famille: '👨‍👩‍👧‍👦',
    travail: '💼',
    loisirs: '🎮',
    sante: '🏥',
    emotions: '💭',
    preferences: '⭐',
    projets: '🎯',
    social: '👥',
    autre: '📌'
  };

  container.innerHTML = memories.map(memory => `
    <div class="memory-item" onclick="showMemoryDetails('${memory.id}')">
      <div class="memory-icon">${categoryEmoji[memory.category] || '📌'}</div>
      <div class="memory-info">
        <div class="memory-content">${memory.content}</div>
        <div class="memory-meta">
          <span class="memory-score">★ ${memory.importance}/10</span>
          <span class="memory-date">${formatDate(memory.createdAt)}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function showMemoryDetails(id) {
  const memory = memoryManager.getMemoryById(id);
  if (!memory) return;

  const categoryLabels = {
    famille: 'Famille',
    travail: 'Travail',
    loisirs: 'Loisirs',
    sante: 'Santé',
    emotions: 'Émotions',
    preferences: 'Préférences',
    projets: 'Projets',
    social: 'Social',
    autre: 'Autre'
  };

  const modal = document.getElementById('memoryModal');
  const body = document.getElementById('memoryModalBody');

  body.innerHTML = `
    <div class="memory-detail">
      <p class="memory-detail-content">${memory.content}</p>
      <div class="memory-detail-meta">
        <div class="meta-item">
          <span class="meta-label">Catégorie</span>
          <span class="meta-value">${categoryLabels[memory.category] || memory.category}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Importance</span>
          <span class="meta-value">${memory.importance}/10</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Date</span>
          <span class="meta-value">${new Date(memory.createdAt).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</span>
        </div>
      </div>
      <button class="btn btn-danger btn-small" onclick="deleteMemory('${memory.id}')">
        Supprimer ce souvenir
      </button>
    </div>
  `;

  modal.classList.add('open');
}

function deleteMemory(id) {
  memoryManager.deleteMemory(id);
  renderMemories();
  closeModal();
  showNotification('Souvenir supprimé', 'success');
}

function clearMemories() {
  if (confirm('Effacer tous les souvenirs? Cette action est irréversible.')) {
    memoryManager.clearMemories();
    state.triggers = [];
    saveState();
    renderMemories();
    renderTriggers();
    showNotification('Mémoire effacée', 'success');
  }
}

function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'À l\'instant';
  if (diff < 3600000) return `Il y a ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)}h`;
  if (diff < 604800000) return `Il y a ${Math.floor(diff / 86400000)}j`;

  return date.toLocaleDateString('fr-FR');
}

// ============================================================================
// Modal Management
// ============================================================================

function closeModal() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.classList.remove('open');
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

function clearHistory() {
  if (confirm('Effacer l\'historique de conversation?')) {
    state.chatHistory = [];
    saveState();

    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = `
      <div class="welcome-message">
        <div class="welcome-icon">🌟</div>
        <h2>Bienvenue!</h2>
        <p>Je suis ton assistant personnel AGI. Je me souviens de tout ce que tu me dis.</p>
        <p>Parle-moi de toi, de tes projets, de ce qui te préoccupe...</p>
      </div>
    `;
    showNotification('Historique effacé', 'success');
  }
}

function exportData() {
  const data = {
    memories: memoryManager.exportData(),
    triggers: state.triggers,
    chatHistory: state.chatHistory,
    exportedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `agi-assistant-backup-${Date.now()}.json`;
  a.click();

  URL.revokeObjectURL(url);
  showNotification('Données exportées!', 'success');
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color: white;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 500;
    z-index: 1000;
    animation: slideUp 0.3s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  notification.textContent = message;

  // Add animation keyframes
  if (!document.getElementById('notificationStyles')) {
    const style = document.createElement('style');
    style.id = 'notificationStyles';
    style.textContent = `
      @keyframes slideUp {
        from { transform: translateX(-50%) translateY(20px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
