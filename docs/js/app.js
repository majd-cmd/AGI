/**
 * AGI Personal Assistant - Main Application
 * Uses MemoryEngine for advanced memory management
 */

// ============================================================================
// State Management
// ============================================================================

const state = {
  apiKey: null,
  chatHistory: [],
  isTyping: false
};

const STORAGE_KEYS = {
  API_KEY: 'agi_api_key',
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
  updateStats();
}

function loadState() {
  // Load API key
  state.apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);

  // Set API key in memory engine
  if (state.apiKey) {
    memoryEngine.setApiKey(state.apiKey);
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
  localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(state.chatHistory));
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
  const messageInput = document.getElementById('messageInput');

  messageInput.addEventListener('input', () => {
    autoResizeTextarea();
  });

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

  if (!isOpen) {
    const otherSide = side === 'left' ? 'right' : 'left';
    const otherSidebar = document.getElementById(otherSide === 'left' ? 'sidebarLeft' : 'sidebarRight');
    otherSidebar.classList.remove('open');
  }

  sidebar.classList.toggle('open');

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
    memoryEngine.setApiKey(key);
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
    memoryEngine.setApiKey(key);
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
    // Run in parallel: get context, call API, extract info
    const [context, response] = await Promise.all([
      memoryEngine.getContextForMessage(message),
      callClaudeAPIWithContext(message),
    ]);

    // Extract and store info (don't wait for this)
    memoryEngine.extractAndStore(message).then(result => {
      if (result) {
        renderTriggers();
        renderMemories();
        updateStats();
      }
    });

    hideTypingIndicator();
    addMessage('assistant', response);

  } catch (error) {
    hideTypingIndicator();
    console.error('API Error:', error);
    addMessage('assistant', 'Désolé, une erreur s\'est produite. Vérifie ta connexion et ta clé API.');
  }
}

async function callClaudeAPIWithContext(userMessage) {
  // Get context from memory engine
  const context = await memoryEngine.getContextForMessage(userMessage);

  const systemPrompt = `Tu es un assistant personnel AGI bienveillant et empathique.
Tu te souviens de tout ce que l'utilisateur te dit et tu utilises ces informations pour personnaliser tes réponses.
Tu es français et tu parles de manière naturelle et chaleureuse.
Tu fais attention aux émotions de l'utilisateur et tu adaptes ton ton en conséquence.
Quand l'utilisateur partage des informations personnelles, montre que tu les as notées.${context}`;

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

function addMessage(role, content) {
  const chatMessages = document.getElementById('chatMessages');

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

  state.chatHistory.push({ role, content, timestamp: Date.now() });
  saveState();
}

function formatMessage(content) {
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
// Triggers Display
// ============================================================================

function renderTriggers() {
  const container = document.getElementById('triggersList');
  const grouped = memoryEngine.getTriggersGroupedByCategory();

  if (Object.keys(grouped).length === 0) {
    container.innerHTML = '<p class="empty-state">Les mots-clés apparaîtront automatiquement...</p>';
    return;
  }

  const categoryInfo = {
    famille: { label: 'Famille', emoji: '👨‍👩‍👧‍👦' },
    travail: { label: 'Travail', emoji: '💼' },
    loisirs: { label: 'Loisirs', emoji: '🎮' },
    sante: { label: 'Santé', emoji: '🏥' },
    emotions: { label: 'Émotions', emoji: '💭' },
    preferences: { label: 'Préférences', emoji: '⭐' },
    projets: { label: 'Projets', emoji: '🎯' },
    social: { label: 'Social', emoji: '👥' },
    lieu: { label: 'Lieux', emoji: '📍' },
    autre: { label: 'Autre', emoji: '📌' }
  };

  // Sort categories by number of triggers
  const sortedCategories = Object.keys(grouped).sort((a, b) =>
    grouped[b].length - grouped[a].length
  );

  let html = '';
  sortedCategories.forEach(category => {
    const info = categoryInfo[category] || { label: category, emoji: '📌' };
    const triggers = grouped[category];

    html += `<div class="trigger-category">
      <div class="trigger-category-header">
        ${info.emoji} ${info.label}
        <span class="trigger-count">${triggers.length}</span>
      </div>
      <div class="trigger-category-tags">
        ${triggers.map(t => {
          const scoreClass = t.currentScore >= 50 ? 'high' : t.currentScore >= 30 ? 'medium' : 'low';
          return `
            <span class="trigger-tag score-${scoreClass}"
                  title="Score: ${Math.round(t.currentScore)} | Utilisations: ${t.usageCount}${t.synonyms.length > 0 ? ' | Synonymes: ' + t.synonyms.join(', ') : ''}">
              <span class="trigger-word">${t.word}</span>
              ${t.synonyms.length > 0 ? `<span class="trigger-synonyms">+${t.synonyms.length}</span>` : ''}
            </span>
          `;
        }).join('')}
      </div>
    </div>`;
  });

  container.innerHTML = html;
}

// ============================================================================
// Memories Display
// ============================================================================

function renderMemories() {
  const container = document.getElementById('memoriesList');
  const memories = memoryEngine.getRecentMemories(15);

  if (memories.length === 0) {
    container.innerHTML = '<p class="empty-state">Les souvenirs apparaîtront automatiquement...</p>';
    return;
  }

  const categoryEmoji = {
    famille: '👨‍👩‍👧‍👦',
    travail: '💼',
    loisirs: '🎮',
    sante: '🏥',
    emotions: '💭',
    preferences: '⭐',
    projets: '🎯',
    social: '👥',
    lieu: '📍',
    autre: '📌'
  };

  container.innerHTML = memories.map(memory => {
    const linkedTriggers = memory.triggerLinks
      .map(id => memoryEngine.getTriggerById(id))
      .filter(Boolean)
      .map(t => t.word);

    return `
      <div class="memory-item" onclick="showMemoryDetails('${memory.id}')">
        <div class="memory-icon">${categoryEmoji[memory.category] || '📌'}</div>
        <div class="memory-info">
          <div class="memory-content">${memory.content}</div>
          <div class="memory-meta">
            <span class="memory-score">★ ${memory.importance}/10</span>
            <span class="memory-date">${formatDate(memory.createdAt)}</span>
            ${linkedTriggers.length > 0 ? `<span class="memory-triggers">🔗 ${linkedTriggers.length}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function showMemoryDetails(id) {
  const memory = memoryEngine.getMemoryById(id);
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
    lieu: 'Lieux',
    autre: 'Autre'
  };

  const linkedTriggers = memory.triggerLinks
    .map(id => memoryEngine.getTriggerById(id))
    .filter(Boolean);

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
          <span class="meta-label">Accès</span>
          <span class="meta-value">${memory.accessCount || 0}×</span>
        </div>
      </div>
      ${linkedTriggers.length > 0 ? `
        <div class="memory-linked-triggers">
          <span class="meta-label">Mots-clés liés</span>
          <div class="linked-triggers-list">
            ${linkedTriggers.map(t => `<span class="linked-trigger">${t.word}</span>`).join('')}
          </div>
        </div>
      ` : ''}
      <div class="memory-detail-date">
        Créé le ${new Date(memory.createdAt).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}
      </div>
      <button class="btn btn-danger btn-small" onclick="deleteMemory('${memory.id}')">
        Supprimer ce souvenir
      </button>
    </div>
  `;

  modal.classList.add('open');
}

function deleteMemory(id) {
  memoryEngine.deleteMemory(id);
  renderMemories();
  renderTriggers();
  updateStats();
  closeModal();
  showNotification('Souvenir supprimé', 'success');
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
// Statistics
// ============================================================================

function updateStats() {
  const statsEl = document.getElementById('memoryStats');
  if (!statsEl) return;

  const stats = memoryEngine.getStats();
  statsEl.innerHTML = `
    <div class="stat-item">
      <span class="stat-value">${stats.totalMemories}</span>
      <span class="stat-label">Souvenirs</span>
    </div>
    <div class="stat-item">
      <span class="stat-value">${stats.activeTriggers}</span>
      <span class="stat-label">Triggers actifs</span>
    </div>
  `;
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

function clearMemories() {
  if (confirm('Effacer TOUS les souvenirs et mots-clés? Cette action est irréversible.')) {
    memoryEngine.clearAll();
    renderMemories();
    renderTriggers();
    updateStats();
    showNotification('Mémoire effacée', 'success');
  }
}

function exportData() {
  const data = {
    ...memoryEngine.exportData(),
    chatHistory: state.chatHistory
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
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  // Trigger animation
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
