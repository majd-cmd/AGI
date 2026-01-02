/**
 * AGI Memory Engine - Advanced Memory System
 *
 * Architecture:
 * - Trigger Cache with dynamic scoring
 * - Semantic similarity via Claude API
 * - Automatic extraction and linking
 * - Synonym expansion
 */

class MemoryEngine {
  constructor() {
    this.STORAGE_KEYS = {
      TRIGGERS: 'agi_triggers_v2',
      MEMORIES: 'agi_memories_v2',
      LAST_DECAY: 'agi_last_decay'
    };

    // Scoring constants
    this.SCORE_NEW_TRIGGER = 50;
    this.SCORE_USAGE_BONUS = 5;
    this.SCORE_DECAY_PER_DAY = 2;
    this.SCORE_ACTIVE_THRESHOLD = 50;
    this.SCORE_ARCHIVE_THRESHOLD = 20;
    this.SIMILARITY_THRESHOLD = 0.7;

    // Cache
    this.triggers = new Map();  // id -> Trigger
    this.memories = new Map();  // id -> Memory
    this.apiKey = null;

    // Synonyms dictionary
    this.synonyms = {
      'femme': ['épouse', 'conjointe', 'compagne'],
      'mari': ['époux', 'conjoint', 'compagnon'],
      'travail': ['boulot', 'job', 'emploi', 'profession', 'métier'],
      'enfant': ['fils', 'fille', 'gamin', 'gosse', 'kid'],
      'maison': ['domicile', 'appartement', 'appart', 'logement', 'chez moi'],
      'voiture': ['auto', 'véhicule', 'bagnole', 'caisse'],
      'argent': ['fric', 'thune', 'pognon', 'sous', 'finances'],
      'manger': ['bouffer', 'dîner', 'déjeuner', 'repas'],
      'aimer': ['adorer', 'kiffer', 'apprécier', 'affectionner'],
      'détester': ['haïr', 'ne pas supporter', 'avoir horreur'],
      'content': ['heureux', 'joyeux', 'ravi', 'satisfait'],
      'triste': ['malheureux', 'déprimé', 'abattu', 'morose'],
      'fatigué': ['épuisé', 'crevé', 'lessivé', 'exténué'],
      'stressé': ['anxieux', 'angoissé', 'tendu', 'nerveux']
    };

    this.load();
    this.applyDailyDecay();
  }

  // ============================================================================
  // Data Structures
  // ============================================================================

  createTrigger(word, category = 'autre', importance = 5) {
    const id = this.generateId();
    const synonymList = this.getSynonyms(word);

    const trigger = {
      id,
      word: word.toLowerCase().trim(),
      synonyms: synonymList,
      score: this.SCORE_NEW_TRIGGER + (importance * 2),
      usageCount: 0,
      lastUsed: null,
      memoryLinks: [],
      category,
      createdAt: new Date().toISOString()
    };

    this.triggers.set(id, trigger);
    return trigger;
  }

  createMemory(content, category = 'autre', importance = 5, linkedTriggerIds = []) {
    const id = this.generateId();

    const memory = {
      id,
      content,
      category,
      importance,
      triggerLinks: linkedTriggerIds,
      createdAt: new Date().toISOString(),
      accessCount: 0
    };

    this.memories.set(id, memory);

    // Update trigger links
    linkedTriggerIds.forEach(triggerId => {
      const trigger = this.triggers.get(triggerId);
      if (trigger && !trigger.memoryLinks.includes(id)) {
        trigger.memoryLinks.push(id);
      }
    });

    return memory;
  }

  // ============================================================================
  // Synonym System
  // ============================================================================

  getSynonyms(word) {
    const lowerWord = word.toLowerCase().trim();
    const result = [];

    // Direct synonyms
    if (this.synonyms[lowerWord]) {
      result.push(...this.synonyms[lowerWord]);
    }

    // Reverse lookup (if word is a synonym of another)
    Object.entries(this.synonyms).forEach(([key, values]) => {
      if (values.includes(lowerWord) && !result.includes(key)) {
        result.push(key);
        result.push(...values.filter(v => v !== lowerWord));
      }
    });

    return [...new Set(result)];
  }

  // ============================================================================
  // Scoring System
  // ============================================================================

  calculateScore(trigger) {
    const now = new Date();
    const lastUsed = trigger.lastUsed ? new Date(trigger.lastUsed) : new Date(trigger.createdAt);
    const daysSinceUse = Math.floor((now - lastUsed) / (1000 * 60 * 60 * 24));

    // Score = (usageCount × 2) + baseScore - (daysSinceUse × 2)
    const baseScore = trigger.score;
    const usageBonus = trigger.usageCount * 2;
    const decayPenalty = daysSinceUse * this.SCORE_DECAY_PER_DAY;

    return Math.max(0, usageBonus + baseScore - decayPenalty);
  }

  activateTrigger(triggerId) {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) return;

    trigger.usageCount++;
    trigger.lastUsed = new Date().toISOString();
    trigger.score += this.SCORE_USAGE_BONUS;

    this.save();
  }

  applyDailyDecay() {
    const lastDecay = localStorage.getItem(this.STORAGE_KEYS.LAST_DECAY);
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    if (lastDecay === today) return;

    // Calculate days since last decay
    let daysSinceDecay = 1;
    if (lastDecay) {
      const lastDate = new Date(lastDecay);
      daysSinceDecay = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
    }

    // Apply decay to all triggers
    this.triggers.forEach(trigger => {
      trigger.score = Math.max(0, trigger.score - (daysSinceDecay * this.SCORE_DECAY_PER_DAY));
    });

    localStorage.setItem(this.STORAGE_KEYS.LAST_DECAY, today);
    this.save();
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  getActiveTriggers() {
    const active = [];
    this.triggers.forEach(trigger => {
      const score = this.calculateScore(trigger);
      if (score >= this.SCORE_ARCHIVE_THRESHOLD) {
        active.push({ ...trigger, currentScore: score });
      }
    });
    return active.sort((a, b) => b.currentScore - a.currentScore);
  }

  getHighPriorityTriggers() {
    return this.getActiveTriggers().filter(t => t.currentScore >= this.SCORE_ACTIVE_THRESHOLD);
  }

  // ============================================================================
  // Semantic Similarity (via Claude API)
  // ============================================================================

  async computeSimilarity(text1, text2) {
    if (!this.apiKey) return 0;

    const prompt = `Compare ces deux textes et donne un score de similarité sémantique entre 0 et 1.
Réponds UNIQUEMENT avec un nombre décimal (ex: 0.85).

Texte 1: "${text1}"
Texte 2: "${text2}"

Score de similarité:`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) return 0;

      const data = await response.json();
      const scoreText = data.content[0].text.trim();
      const score = parseFloat(scoreText);

      return isNaN(score) ? 0 : Math.min(1, Math.max(0, score));
    } catch (error) {
      console.error('Similarity error:', error);
      return 0;
    }
  }

  // Fast keyword matching (before semantic check)
  quickMatch(message, trigger) {
    const lowerMessage = message.toLowerCase();
    const words = [trigger.word, ...trigger.synonyms];

    for (const word of words) {
      if (lowerMessage.includes(word)) {
        return true;
      }
    }
    return false;
  }

  // ============================================================================
  // Message Scanning
  // ============================================================================

  async scanMessage(message) {
    const activatedTriggers = [];
    const relevantMemories = [];

    // Get active triggers from cache
    const activeTriggers = this.getActiveTriggers();

    // Phase 1: Quick keyword matching
    const quickMatches = activeTriggers.filter(t => this.quickMatch(message, t));

    // Phase 2: Semantic similarity for non-matches (batch for efficiency)
    const nonMatches = activeTriggers.filter(t => !quickMatches.includes(t));

    // For quick matches, activate immediately
    for (const trigger of quickMatches) {
      activatedTriggers.push(trigger);
      this.activateTrigger(trigger.id);
    }

    // For top non-matches, check semantic similarity (limit to avoid too many API calls)
    const topNonMatches = nonMatches.slice(0, 5);
    for (const trigger of topNonMatches) {
      const similarity = await this.computeSimilarity(message, trigger.word);
      if (similarity >= this.SIMILARITY_THRESHOLD) {
        activatedTriggers.push({ ...trigger, similarity });
        this.activateTrigger(trigger.id);
      }
    }

    // Collect relevant memories
    const memoryIds = new Set();
    activatedTriggers.forEach(trigger => {
      trigger.memoryLinks.forEach(memId => memoryIds.add(memId));
    });

    memoryIds.forEach(memId => {
      const memory = this.memories.get(memId);
      if (memory) {
        memory.accessCount++;
        relevantMemories.push(memory);
      }
    });

    return {
      triggers: activatedTriggers,
      memories: relevantMemories.sort((a, b) => b.importance - a.importance)
    };
  }

  // ============================================================================
  // Intelligent Extraction
  // ============================================================================

  async extractAndStore(message) {
    if (!this.apiKey) return null;

    const extractionPrompt = `Analyse ce message et extrais les informations importantes à mémoriser.

Message: "${message.replace(/"/g, '\\"')}"

Réponds UNIQUEMENT avec un JSON valide:
{
  "important": true/false,
  "memoire": {
    "contenu": "résumé à la 3ème personne (Il/Elle...)",
    "categorie": "famille|travail|loisirs|sante|emotions|preferences|projets|social|lieu|autre",
    "importance": 1-10
  },
  "triggers": [
    {
      "mot": "mot-clé principal",
      "categorie": "famille|travail|loisirs|sante|preferences|projets|social|lieu|autre",
      "synonymes_suggeres": ["syn1", "syn2"]
    }
  ]
}

Règles:
- important=true si infos personnelles, préférences, faits importants
- triggers = noms propres, lieux, activités, préférences clés (max 5)
- Suggère des synonymes pertinents pour chaque trigger`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 512,
          messages: [{ role: 'user', content: extractionPrompt }]
        })
      });

      if (!response.ok) return null;

      const data = await response.json();
      const text = data.content[0].text.trim();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const extracted = JSON.parse(jsonMatch[0]);

      if (!extracted.important) return null;

      // Create triggers first
      const triggerIds = [];
      if (extracted.triggers && Array.isArray(extracted.triggers)) {
        for (const t of extracted.triggers) {
          const word = t.mot.toLowerCase().trim();

          // Check if trigger already exists
          let existingTrigger = null;
          this.triggers.forEach(trigger => {
            if (trigger.word === word) {
              existingTrigger = trigger;
            }
          });

          if (existingTrigger) {
            // Update existing trigger
            this.activateTrigger(existingTrigger.id);
            triggerIds.push(existingTrigger.id);

            // Add new synonyms
            if (t.synonymes_suggeres) {
              t.synonymes_suggeres.forEach(syn => {
                if (!existingTrigger.synonyms.includes(syn.toLowerCase())) {
                  existingTrigger.synonyms.push(syn.toLowerCase());
                }
              });
            }
          } else if (word.length > 2) {
            // Create new trigger
            const newTrigger = this.createTrigger(word, t.categorie);

            // Add suggested synonyms
            if (t.synonymes_suggeres) {
              t.synonymes_suggeres.forEach(syn => {
                const lowerSyn = syn.toLowerCase().trim();
                if (!newTrigger.synonyms.includes(lowerSyn)) {
                  newTrigger.synonyms.push(lowerSyn);
                }
              });
            }

            triggerIds.push(newTrigger.id);
          }
        }
      }

      // Create memory with links
      let memory = null;
      if (extracted.memoire && extracted.memoire.contenu) {
        memory = this.createMemory(
          extracted.memoire.contenu,
          extracted.memoire.categorie || 'autre',
          extracted.memoire.importance || 5,
          triggerIds
        );
      }

      this.save();

      return {
        memory,
        triggers: triggerIds.map(id => this.triggers.get(id))
      };

    } catch (error) {
      console.error('Extraction error:', error);
      return null;
    }
  }

  // ============================================================================
  // Context Building
  // ============================================================================

  async getContextForMessage(message) {
    // Scan message for relevant triggers and memories
    const { triggers, memories } = await this.scanMessage(message);

    // Also get recent high-importance memories
    const recentImportant = this.getRecentMemories(5)
      .filter(m => m.importance >= 7)
      .filter(m => !memories.find(rm => rm.id === m.id));

    const allMemories = [...memories, ...recentImportant];

    // Build context string
    if (allMemories.length === 0) {
      return '';
    }

    const contextLines = allMemories.map(m => {
      const category = m.category.charAt(0).toUpperCase() + m.category.slice(1);
      return `- [${category}] ${m.content}`;
    });

    return `\n\nInformations connues sur l'utilisateur:\n${contextLines.join('\n')}`;
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  save() {
    const triggersArray = Array.from(this.triggers.values());
    const memoriesArray = Array.from(this.memories.values());

    localStorage.setItem(this.STORAGE_KEYS.TRIGGERS, JSON.stringify(triggersArray));
    localStorage.setItem(this.STORAGE_KEYS.MEMORIES, JSON.stringify(memoriesArray));
  }

  load() {
    try {
      const triggersData = localStorage.getItem(this.STORAGE_KEYS.TRIGGERS);
      if (triggersData) {
        const triggers = JSON.parse(triggersData);
        triggers.forEach(t => this.triggers.set(t.id, t));
      }

      const memoriesData = localStorage.getItem(this.STORAGE_KEYS.MEMORIES);
      if (memoriesData) {
        const memories = JSON.parse(memoriesData);
        memories.forEach(m => this.memories.set(m.id, m));
      }
    } catch (error) {
      console.error('Load error:', error);
    }

    // Migrate from old format if needed
    this.migrateOldData();
  }

  migrateOldData() {
    // Check for old memories format
    const oldMemories = localStorage.getItem('agi_memories');
    if (oldMemories && this.memories.size === 0) {
      try {
        const old = JSON.parse(oldMemories);
        if (Array.isArray(old)) {
          old.forEach(m => {
            this.createMemory(m.content, m.category || 'autre', m.importance || 5, []);
          });
          this.save();
        }
      } catch (e) {
        console.error('Migration error:', e);
      }
    }
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  getRecentMemories(limit = 10) {
    return Array.from(this.memories.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  getMemoryById(id) {
    return this.memories.get(id);
  }

  getTriggerById(id) {
    return this.triggers.get(id);
  }

  getAllTriggers() {
    return Array.from(this.triggers.values());
  }

  getAllMemories() {
    return Array.from(this.memories.values());
  }

  getTriggersGroupedByCategory() {
    const grouped = {};
    const activeTriggers = this.getActiveTriggers();

    activeTriggers.forEach(trigger => {
      const cat = trigger.category || 'autre';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(trigger);
    });

    return grouped;
  }

  // ============================================================================
  // Maintenance
  // ============================================================================

  deleteMemory(id) {
    const memory = this.memories.get(id);
    if (!memory) return;

    // Remove from trigger links
    memory.triggerLinks.forEach(triggerId => {
      const trigger = this.triggers.get(triggerId);
      if (trigger) {
        trigger.memoryLinks = trigger.memoryLinks.filter(mId => mId !== id);
      }
    });

    this.memories.delete(id);
    this.save();
  }

  deleteTrigger(id) {
    const trigger = this.triggers.get(id);
    if (!trigger) return;

    // Remove from memory links
    trigger.memoryLinks.forEach(memoryId => {
      const memory = this.memories.get(memoryId);
      if (memory) {
        memory.triggerLinks = memory.triggerLinks.filter(tId => tId !== id);
      }
    });

    this.triggers.delete(id);
    this.save();
  }

  clearAll() {
    this.triggers.clear();
    this.memories.clear();
    localStorage.removeItem(this.STORAGE_KEYS.TRIGGERS);
    localStorage.removeItem(this.STORAGE_KEYS.MEMORIES);
    localStorage.removeItem(this.STORAGE_KEYS.LAST_DECAY);
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  getStats() {
    const triggers = this.getActiveTriggers();
    const memories = this.getAllMemories();

    return {
      totalTriggers: this.triggers.size,
      activeTriggers: triggers.filter(t => t.currentScore >= this.SCORE_ACTIVE_THRESHOLD).length,
      archivedTriggers: triggers.filter(t => t.currentScore < this.SCORE_ACTIVE_THRESHOLD).length,
      totalMemories: memories.length,
      memoriesByCategory: this.countByCategory(memories),
      triggersByCategory: this.countByCategory(triggers)
    };
  }

  countByCategory(items) {
    const counts = {};
    items.forEach(item => {
      const cat = item.category || 'autre';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  // Export/Import
  exportData() {
    return {
      triggers: Array.from(this.triggers.values()),
      memories: Array.from(this.memories.values()),
      exportedAt: new Date().toISOString(),
      version: 2
    };
  }

  importData(data) {
    if (data.version !== 2) {
      console.warn('Old data format, migration may be needed');
    }

    if (data.triggers) {
      data.triggers.forEach(t => this.triggers.set(t.id, t));
    }
    if (data.memories) {
      data.memories.forEach(m => this.memories.set(m.id, m));
    }

    this.save();
  }
}

// Global instance
const memoryEngine = new MemoryEngine();
