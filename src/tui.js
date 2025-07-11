#!/usr/bin/env node

const React = require("react");
const { useState, useEffect } = React;
const { HistoryManager } = require("./history");
const { KeyHandlers } = require("./tui/key-handlers");
const { UIComponents } = require("./tui/ui-components");

const VrtTui = ({ onSubmit, useInput, useApp, Box, Text, TextInputComponent }) => {
  const [urlPairs, setUrlPairs] = useState([{ before: "", after: "" }]);
  const [currentPair, setCurrentPair] = useState(0);
  const [currentField, setCurrentField] = useState("before");
  const [mode, setMode] = useState("menu");
  const [menuSelection, setMenuSelection] = useState(0);
  const [historyItems, setHistoryItems] = useState([]);
  const [historySelection, setHistorySelection] = useState(0);
  const [options, setOptions] = useState({
    width: 1280,
    height: 800,
    threshold: 0.01,
    outputDir: "./vrt-reports",
  });
  const [optionSelection, setOptionSelection] = useState(0);
  const [editingOption, setEditingOption] = useState(false);
  const [tempOptionValue, setTempOptionValue] = useState("");

  const { exit } = useApp();
  const historyManager = new HistoryManager();

  // 履歴の読み込み
  useEffect(() => {
    historyManager.getFormattedHistory()
      .then((items) => setHistoryItems(items))
      .catch(() => setHistoryItems([]));
  }, []);

  const menuItems = ["新規入力", "履歴から選択", "終了"];
  const optionItems = [
    { key: "width", label: "画面幅", type: "number" },
    { key: "height", label: "画面高さ", type: "number" },
    { key: "threshold", label: "しきい値", type: "number" },
    { key: "outputDir", label: "出力ディレクトリ", type: "string" },
  ];

  // 状態更新のヘルパー関数
  const updateState = (updates) => {
    if (updates.urlPairs !== undefined) setUrlPairs(updates.urlPairs);
    if (updates.currentPair !== undefined) setCurrentPair(updates.currentPair);
    if (updates.currentField !== undefined) {
      setCurrentField(updates.currentField);
    }
    if (updates.mode !== undefined) setMode(updates.mode);
    if (updates.menuSelection !== undefined) {
      setMenuSelection(updates.menuSelection);
    }
    if (updates.historyItems !== undefined) {
      setHistoryItems(updates.historyItems);
    }
    if (updates.historySelection !== undefined) {
      setHistorySelection(updates.historySelection);
    }
    if (updates.options !== undefined) setOptions(updates.options);
    if (updates.optionSelection !== undefined) {
      setOptionSelection(updates.optionSelection);
    }
    if (updates.editingOption !== undefined) {
      setEditingOption(updates.editingOption);
    }
    if (updates.tempOptionValue !== undefined) {
      setTempOptionValue(updates.tempOptionValue);
    }
  };

  // 現在の状態オブジェクト
  const currentState = {
    urlPairs,
    currentPair,
    currentField,
    mode,
    menuSelection,
    historyItems,
    historySelection,
    options,
    optionSelection,
    editingOption,
    tempOptionValue,
    menuItems,
    optionItems,
    historyManager,
    onSubmit,
    exit,
  };

  useInput((input, key) => {
    // すべてのキーイベントを統一的に処理
    // Delete（ペア削除）- Beforeが空欄の場合のみ
    if (mode === "input" && key.delete && currentField === "before") {
      const currentPairData = urlPairs[currentPair];
      if (urlPairs.length > 1 && (!currentPairData.before || currentPairData.before.trim() === "")) {
        const newPairs = urlPairs.filter((_, index) => index !== currentPair);
        const newState = { urlPairs: newPairs };
        
        if (currentPair >= newPairs.length) {
          newState.currentPair = newPairs.length - 1;
        }
        
        const targetPair = newState.currentPair || currentPair;
        if (newPairs[targetPair] && 
            !newPairs[targetPair].before &&
            !newPairs[targetPair].after) {
          newState.currentField = "before";
        }
        
        updateState(newState);
      }
      return;
    }
    
    // Tab（新しいペア追加）
    if (mode === "input" && key.tab) {
      const newPairs = [...urlPairs, { before: "", after: "" }];
      updateState({ 
        urlPairs: newPairs,
        currentPair: urlPairs.length,
        currentField: "before"
      });
      return;
    }

    switch (mode) {
      case "menu":
        KeyHandlers.handleMenuMode(input, key, currentState, updateState);
        break;
      case "history":
        KeyHandlers.handleHistoryMode(input, key, currentState, updateState);
        break;
      case "input":
        KeyHandlers.handleInputMode(input, key, currentState, updateState);
        break;
      case "options":
        KeyHandlers.handleOptionsMode(input, key, currentState, updateState);
        break;
      case "confirm":
        KeyHandlers.handleConfirmMode(input, key, currentState, updateState);
        break;
    }
  });

  return React.createElement(
    Box,
    { flexDirection: "column", padding: 1 },
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(
        Text,
        { bold: true, color: "blue" },
        "🔍 quick-vrt",
      ),
    ),
    mode === "menu" && UIComponents.renderMenu(currentState, React, Box, Text),
    mode === "history" &&
      UIComponents.renderHistory(currentState, React, Box, Text),
    mode === "input" &&
      UIComponents.renderInput(currentState, React, Box, Text, updateState, TextInputComponent),
    mode === "options" &&
      UIComponents.renderOptions(currentState, React, Box, Text, updateState, TextInputComponent),
    mode === "confirm" &&
      UIComponents.renderConfirm(currentState, React, Box, Text),
  );
};

// TUIを起動する関数
const startTui = async () => {
  return new Promise(async (resolve) => {
    const { render, Box, Text, useInput, useApp } = await import("ink");
    
    // ink-text-inputを動的にインポート
    let TextInputComponent = null;
    try {
      const { default: TextInput } = await import("ink-text-input");
      TextInputComponent = TextInput;
    } catch (error) {
      console.warn("ink-text-input could not be loaded:", error.message);
    }

    const handleSubmit = (pairs, options) => {
      resolve({ pairs, options });
    };

    render(React.createElement(VrtTui, {
      onSubmit: handleSubmit,
      useInput,
      useApp,
      Box,
      Text,
      TextInputComponent,
    }));
  });
};

module.exports = { startTui };

