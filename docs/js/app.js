/**
 * AGI Personal Assistant - Main Application
 */

// ============================================================================
// State Management
// ============================================================================

const state = {
  apiKey: null,
  triggers: [],
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

  // Load triggers
  try {
    const triggers = localStorage.getItem(STORAGE_KEYS.TRIGGERS);
    state.triggers = triggers ? JSON.parse(triggers) : getDefaultTriggers();
  } catch (e) {
    state.triggers = getDefaultTriggers();
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

function getDefaultTriggers() {
  return [
    { word: 'important', score: 8, category: 'personnel' },
    { word: 'souviens-toi', score: 9, category: 'personnel' },
    { word: 'rappelle', score: 7, category: 'personnel' },
    { word: 'projet', score: 6, category: 'professionnel' },
    { word: 'objectif', score: 7, category: 'aspirations' },
    { word: 'stress', score: 8, category: 'emotions' },
    { word: 'heureux', score: 6, category: 'emotions' }
  ];
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
    updateTriggersPreview();
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

  // Check for triggers and save memory if needed
  const triggeredWords = checkTriggers(message);
  if (triggeredWords.length > 0) {
    const maxScore = Math.max(...triggeredWords.map(t => t.score));
    memoryManager.addMemory(message, triggeredWords[0].category, maxScore);
    renderMemories();
  }

  // Show typing indicator
  showTypingIndicator();

  try {
    const response = await callClaudeAPI(message);
    hideTypingIndicator();
    addMessage('assistant', response);
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
    ? `\n\nVoici ce que tu sais sur l'utilisateur:\n${memories.map(m => `- ${m.content}`).join('\n')}`
    : '';

  const systemPrompt = `Tu es un assistant personnel AGI bienveillant et empathique.
Tu te souviens de tout ce que l'utilisateur te dit et tu utilises ces informations pour personnaliser tes réponses.
Tu es français et tu parles de manière naturelle et chaleureuse.
Tu fais attention aux émotions de l'utilisateur et tu adaptes ton ton en conséquence.${memoriesContext}`;

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
// Triggers Management
// ============================================================================

function checkTriggers(message) {
  const lowerMessage = message.toLowerCase();
  return state.triggers.filter(trigger =>
    lowerMessage.includes(trigger.word.toLowerCase())
  );
}

function updateTriggersPreview() {
  const input = document.getElementById('messageInput');
  const preview = document.getElementById('triggersPreview');
  const triggered = checkTriggers(input.value);

  if (triggered.length > 0) {
    preview.textContent = `🎯 Triggers: ${triggered.map(t => t.word).join(', ')}`;
  } else {
    preview.textContent = '';
  }
}

function addTrigger() {
  const wordInput = document.getElementById('newTriggerWord');
  const scoreInput = document.getElementById('newTriggerScore');
  const categorySelect = document.getElementById('newTriggerCategory');

  const word = wordInput.value.trim().toLowerCase();
  const score = parseInt(scoreInput.value) || 5;
  const category = categorySelect.value;

  if (!word) {
    showNotification('Entre un mot-clé', 'error');
    return;
  }

  if (state.triggers.find(t => t.word === word)) {
    showNotification('Ce trigger existe déjà', 'error');
    return;
  }

  state.triggers.push({ word, score: Math.min(10, Math.max(1, score)), category });
  saveState();
  renderTriggers();

  wordInput.value = '';
  scoreInput.value = '';
  showNotification('Trigger ajouté!', 'success');
}

function removeTrigger(word) {
  state.triggers = state.triggers.filter(t => t.word !== word);
  saveState();
  renderTriggers();
}

function renderTriggers() {
  const container = document.getElementById('triggersList');
  container.innerHTML = state.triggers.map(trigger => `
    <div class="trigger-tag">
      <span class="trigger-word">${trigger.word}</span>
      <span class="trigger-score">${trigger.score}</span>
      <button class="trigger-remove" onclick="removeTrigger('${trigger.word}')" title="Supprimer">×</button>
    </div>
  `).join('');
}

// ============================================================================
// Memories Management
// ============================================================================

function renderMemories() {
  const container = document.getElementById('memoriesList');
  const memories = memoryManager.getRecentMemories(10);

  if (memories.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucun souvenir pour l\'instant...</p>';
    return;
  }

  container.innerHTML = memories.map(memory => `
    <div class="memory-item" onclick="showMemoryDetails('${memory.id}')">
      <div class="memory-content">${memory.content}</div>
      <div class="memory-meta">
        ${memory.category} • ${formatDate(memory.createdAt)}
      </div>
    </div>
  `).join('');
}

function showMemoryDetails(id) {
  const memory = memoryManager.getMemoryById(id);
  if (!memory) return;

  const modal = document.getElementById('memoryModal');
  const body = document.getElementById('memoryModalBody');

  body.innerHTML = `
    <p><strong>Contenu:</strong></p>
    <p>${memory.content}</p>
    <p class="mt-4"><strong>Catégorie:</strong> ${memory.category}</p>
    <p><strong>Importance:</strong> ${memory.importance}/10</p>
    <p><strong>Date:</strong> ${formatDate(memory.createdAt)}</p>
    <div class="mt-4">
      <button class="btn btn-danger btn-small" onclick="deleteMemory('${memory.id}')">Supprimer ce souvenir</button>
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
    renderMemories();
    showNotification('Souvenirs effacés', 'success');
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
