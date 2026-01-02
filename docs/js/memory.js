/**
 * Memory Manager for AGI Personal Assistant
 * Handles storing and retrieving memories from localStorage
 */

class MemoryManager {
  constructor() {
    this.storageKey = 'agi_memories';
    this.memories = this.loadMemories();
  }

  loadMemories() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error loading memories:', e);
      return [];
    }
  }

  saveMemories() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.memories));
    } catch (e) {
      console.error('Error saving memories:', e);
    }
  }

  addMemory(content, category = 'general', importance = 5) {
    const memory = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      content,
      category,
      importance,
      createdAt: new Date().toISOString(),
      accessCount: 0
    };
    this.memories.unshift(memory);
    this.saveMemories();
    return memory;
  }

  getMemories(limit = 50) {
    return this.memories.slice(0, limit);
  }

  getMemoryById(id) {
    return this.memories.find(m => m.id === id);
  }

  deleteMemory(id) {
    this.memories = this.memories.filter(m => m.id !== id);
    this.saveMemories();
  }

  clearMemories() {
    this.memories = [];
    this.saveMemories();
  }

  searchMemories(query) {
    const lowerQuery = query.toLowerCase();
    return this.memories.filter(m =>
      m.content.toLowerCase().includes(lowerQuery)
    );
  }

  getRecentMemories(count = 5) {
    return this.memories.slice(0, count);
  }

  getMemoriesForContext() {
    // Get the most relevant memories for AI context
    const recent = this.memories.slice(0, 10);
    const important = this.memories
      .filter(m => m.importance >= 7)
      .slice(0, 5);

    // Combine and deduplicate
    const combined = [...recent];
    important.forEach(m => {
      if (!combined.find(c => c.id === m.id)) {
        combined.push(m);
      }
    });

    return combined.slice(0, 15);
  }

  exportData() {
    return {
      memories: this.memories,
      exportedAt: new Date().toISOString()
    };
  }

  importData(data) {
    if (data.memories && Array.isArray(data.memories)) {
      this.memories = data.memories;
      this.saveMemories();
      return true;
    }
    return false;
  }
}

// Global instance
const memoryManager = new MemoryManager();
