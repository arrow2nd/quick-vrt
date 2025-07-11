#!/usr/bin/env node

const fs = require("fs").promises;
const path = require("path");
const os = require("os");

const HISTORY_FILE = path.join(os.homedir(), ".quick-vrt-history.json");
const MAX_HISTORY_ITEMS = 20;

class HistoryManager {
  constructor() {
    this.historyFilePath = HISTORY_FILE;
  }

  async loadHistory() {
    try {
      const data = await fs.readFile(this.historyFilePath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async saveHistory(urlPairs, options = {}) {
    try {
      const history = await this.loadHistory();
      
      const newEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        urlPairs: urlPairs,
        options: {
          width: options.width || 1280,
          height: options.height || 800,
          threshold: options.threshold || 0.01,
          outputDir: options.outputDir || "./vrt-reports",
          ...options
        }
      };

      history.unshift(newEntry);

      if (history.length > MAX_HISTORY_ITEMS) {
        history.length = MAX_HISTORY_ITEMS;
      }

      await fs.writeFile(
        this.historyFilePath,
        JSON.stringify(history, null, 2),
        "utf-8"
      );

      return newEntry;
    } catch (error) {
      console.error("履歴の保存に失敗しました:", error.message);
      throw error;
    }
  }

  async deleteHistoryItem(id) {
    try {
      const history = await this.loadHistory();
      const filteredHistory = history.filter(item => item.id !== id);
      
      await fs.writeFile(
        this.historyFilePath,
        JSON.stringify(filteredHistory, null, 2),
        "utf-8"
      );

      return filteredHistory;
    } catch (error) {
      console.error("履歴の削除に失敗しました:", error.message);
      throw error;
    }
  }

  async clearHistory() {
    try {
      await fs.writeFile(this.historyFilePath, "[]", "utf-8");
      return [];
    } catch (error) {
      console.error("履歴のクリアに失敗しました:", error.message);
      throw error;
    }
  }

  formatHistoryItem(item) {
    const date = new Date(item.timestamp);
    const dateStr = date.toLocaleDateString("ja-JP");
    const timeStr = date.toLocaleTimeString("ja-JP", { 
      hour: "2-digit", 
      minute: "2-digit" 
    });
    
    const urlCount = item.urlPairs.length;
    const firstPair = item.urlPairs[0];
    const summary = firstPair 
      ? `${firstPair.before.substring(0, 30)}...` 
      : "URLなし";

    return {
      id: item.id,
      display: `[${dateStr} ${timeStr}] ${urlCount}ペア - ${summary}`,
      date: dateStr,
      time: timeStr,
      urlCount: urlCount,
      summary: summary,
      urlPairs: item.urlPairs,
      options: item.options
    };
  }

  async getFormattedHistory() {
    const history = await this.loadHistory();
    return history.map(item => this.formatHistoryItem(item));
  }
}

module.exports = { HistoryManager };