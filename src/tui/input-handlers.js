#!/usr/bin/env node

const clipboardy = require("clipboardy");

// 入力処理のヘルパー関数
const InputHandlers = {
  // 文字挿入
  insertCharacter: (text, position, char) => {
    return text.slice(0, position) + char + text.slice(position);
  },

  // 文字削除（Backspace）
  deleteCharBefore: (text, position) => {
    if (position > 0) {
      return {
        newText: text.slice(0, position - 1) + text.slice(position),
        newPosition: position - 1
      };
    }
    return { newText: text, newPosition: position };
  },

  // 文字削除（Delete）
  deleteCharAfter: (text, position) => {
    if (position < text.length) {
      return {
        newText: text.slice(0, position) + text.slice(position + 1),
        newPosition: position
      };
    }
    return { newText: text, newPosition: position };
  },

  // クリップボード貼り付け
  pasteFromClipboard: async (text, position) => {
    try {
      const clipboardContent = clipboardy.readSync();
      if (clipboardContent) {
        const content = clipboardContent.split("\n")[0].trim();
        return {
          newText: text.slice(0, position) + content + text.slice(position),
          newPosition: position + content.length
        };
      }
    } catch (error) {
      // クリップボードアクセスに失敗した場合は無視
    }
    return { newText: text, newPosition: position };
  },

  // キーが削除キーかどうかを判定（Backspace専用）
  isBackspaceKey: (key, input) => {
    // Backspace キーの判定
    if (key.backspace) {
      return true;
    }
    
    // 文字コードベースの判定（macOSのdeleteキーは多くの場合backspaceとして動作）
    if (input && typeof input === 'string' && input.length > 0) {
      const code = input.charCodeAt(0);
      return code === 8 || code === 127; // BS または DEL（macOSのdeleteキー）
    }
    
    return false;
  },

  // 本当のDeleteキー（Forward Delete）の判定
  isForwardDeleteKey: (key, input) => {
    // fn+delete や専用のDeleteキーの場合
    if (key.delete) {
      return true;
    }
    
    // 一部の環境では特殊な文字コードで送信される場合がある
    return false;
  },

  // キーが印刷可能文字かどうかを判定
  isPrintableChar: (input, key) => {
    if (!input || key.ctrl || key.alt || key.meta || key.backspace || 
        key.delete || key.return || key.tab || key.upArrow || 
        key.downArrow || key.escape || key.leftArrow || key.rightArrow) {
      return false;
    }
    
    const inputCode = input.charCodeAt(0);
    // 制御文字（8=BS, 127=DEL）と非印刷文字を除外
    if (inputCode === 8 || inputCode === 127 || inputCode < 32 || inputCode > 126) {
      return false;
    }
    
    return true;
  }
};

module.exports = { InputHandlers };