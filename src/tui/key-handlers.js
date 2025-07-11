#!/usr/bin/env node

const { InputHandlers } = require("./input-handlers");

// 各モードのキーハンドラー
const KeyHandlers = {
  // メニューモード
  handleMenuMode: (input, key, state, setState) => {
    const { menuSelection, menuItems, historyItems } = state;
    
    if (key.upArrow && menuSelection > 0) {
      setState({ menuSelection: menuSelection - 1 });
    } else if (key.downArrow && menuSelection < menuItems.length - 1) {
      setState({ menuSelection: menuSelection + 1 });
    } else if (key.return) {
      if (menuSelection === 0) {
        setState({ mode: "input" });
      } else if (menuSelection === 1) {
        if (historyItems.length > 0) {
          setState({ mode: "history" });
        }
      } else if (menuSelection === 2) {
        state.exit();
      }
    } else if (key.escape) {
      state.exit();
    }
  },

  // 履歴選択モード
  handleHistoryMode: (input, key, state, setState) => {
    const { historySelection, historyItems, historyManager } = state;
    
    if (key.upArrow && historySelection > 0) {
      setState({ historySelection: historySelection - 1 });
    } else if (key.downArrow && historySelection < historyItems.length - 1) {
      setState({ historySelection: historySelection + 1 });
    } else if (key.return) {
      const selected = historyItems[historySelection];
      setState({ 
        urlPairs: selected.urlPairs,
        options: selected.options,
        mode: "options"
      });
    } else if (key.escape) {
      setState({ mode: "menu" });
    } else if (key.ctrl && input === "d") {
      if (historyItems.length > 0) {
        const itemToDelete = historyItems[historySelection];
        historyManager.deleteHistoryItem(itemToDelete.id)
          .then(() => historyManager.getFormattedHistory())
          .then((items) => {
            const newState = { historyItems: items };
            if (historySelection >= items.length && items.length > 0) {
              newState.historySelection = items.length - 1;
            }
            if (items.length === 0) {
              newState.mode = "menu";
            }
            setState(newState);
          });
      }
    }
  },

  // 入力モード（ナビゲーションのみ、テキスト編集はink-text-inputが担当）
  handleInputMode: (input, key, state, setState) => {
    const { 
      urlPairs, currentPair, currentField
    } = state;
    
    if (key.return) {
      if (currentField === "before") {
        setState({ currentField: "after" });
      } else {
        if (currentPair < urlPairs.length - 1) {
          setState({ 
            currentPair: currentPair + 1,
            currentField: "before"
          });
        } else {
          setState({ mode: "options" });
        }
      }
    } else if (key.upArrow) {
      if (currentPair > 0) {
        setState({ 
          currentPair: currentPair - 1,
          currentField: "before"
        });
      }
    } else if (key.downArrow) {
      if (currentPair < urlPairs.length - 1) {
        setState({ 
          currentPair: currentPair + 1,
          currentField: "before"
        });
      }
    } else if (key.escape) {
      setState({ mode: "menu" });
    }
  },

  // オプション設定モード（ink-text-inputがテキスト編集を担当）
  handleOptionsMode: (input, key, state, setState) => {
    const { 
      editingOption, optionSelection, optionItems, options,
      tempOptionValue, urlPairs 
    } = state;
    
    if (editingOption) {
      if (key.return) {
        const optionKey = optionItems[optionSelection].key;
        const optionType = optionItems[optionSelection].type;
        
        const newOptions = { ...options };
        if (optionType === "number") {
          const numValue = parseFloat(tempOptionValue);
          if (!isNaN(numValue)) {
            newOptions[optionKey] = numValue;
          }
        } else {
          newOptions[optionKey] = tempOptionValue;
        }
        
        setState({ 
          options: newOptions,
          editingOption: false,
          tempOptionValue: ""
        });
      } else if (key.escape) {
        setState({ 
          editingOption: false,
          tempOptionValue: ""
        });
      }
    } else {
      if (key.upArrow && optionSelection > 0) {
        setState({ optionSelection: optionSelection - 1 });
      } else if (key.downArrow && optionSelection < optionItems.length - 1) {
        setState({ optionSelection: optionSelection + 1 });
      } else if (key.return) {
        const currentValue = options[optionItems[optionSelection].key];
        setState({ 
          tempOptionValue: currentValue.toString(),
          editingOption: true
        });
      } else if (input === "s" || input === "S") {
        // 有効なペアがあるかチェック
        const validPairs = urlPairs.filter((pair) => pair.before && pair.after);
        if (validPairs.length > 0) {
          setState({ mode: "confirm" });
        }
      } else if (key.escape) {
        setState({ mode: "input" });
      }
    }
  },

  // 確認モード
  handleConfirmMode: (input, key, state, setState) => {
    const { urlPairs, options, historyManager, onSubmit, exit } = state;
    
    if (key.return || input === "y") {
      const validPairs = urlPairs.filter((pair) => pair.before && pair.after);
      if (validPairs.length > 0) {
        historyManager.saveHistory(validPairs, options)
          .then(() => {
            onSubmit(validPairs, options);
            exit();
          })
          .catch(() => {
            onSubmit(validPairs, options);
            exit();
          });
      }
    } else if (input === "n" || key.escape) {
      setState({ mode: "options" });
    }
  }
};

module.exports = { KeyHandlers };