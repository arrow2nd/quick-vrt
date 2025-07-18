#!/usr/bin/env node

const React = require("react");
const { CustomTextInput } = require("./text-input");

// UI表示コンポーネント
const UIComponents = {
  // メニュー画面
  renderMenu: (state, React, Box, Text) => {
    const { menuSelection, menuItems, historyItems } = state;
    
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { bold: true }, "Main Menu"),
      ),
      menuItems.map((item, index) =>
        React.createElement(
          Box,
          { key: index },
          React.createElement(
            Text,
            { color: menuSelection === index ? "green" : "white" },
            menuSelection === index ? "▶ " : "  ",
            item,
            item === "Select from History" && historyItems.length === 0 &&
              " (No history)",
          ),
        )
      ),
    );
  },

  // 履歴選択画面
  renderHistory: (state, React, Box, Text) => {
    const { historySelection, historyItems } = state;
    
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { bold: true }, "Select from History"),
      ),
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(
          Text,
          { dimColor: true },
          "Keys: ↑↓=Select, Enter=Choose, Ctrl+D=Delete, ESC=Back",
        ),
      ),
      historyItems.map((item, index) =>
        React.createElement(
          Box,
          { key: item.id, flexDirection: "column", marginBottom: 1 },
          React.createElement(
            Text,
            { color: historySelection === index ? "green" : "white" },
            historySelection === index ? "▶ " : "  ",
            item.display,
          ),
          historySelection === index && React.createElement(
            Box,
            { marginLeft: 2, flexDirection: "column" },
            item.urlPairs.map((pair, i) =>
              React.createElement(
                Text,
                { key: i, color: "gray", dimColor: true },
                `  ${i + 1}. ${pair.before.substring(0, 50)}...`,
              )
            ),
          ),
        )
      ),
    );
  },

  // 入力画面
  renderInput: (state, React, Box, Text, updateState, TextInputComponent) => {
    const { urlPairs, currentPair, currentField } = state;
    
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, null, "Enter URL pairs"),
      ),
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(
          Text,
          { dimColor: true },
          "Keys: Enter=Next field, Tab=Add pair, ↑↓=Move pair, Delete=Remove pair (when empty), ESC=Menu",
        ),
      ),
      urlPairs.map((pair, index) =>
        React.createElement(
          Box,
          { key: index, flexDirection: "column", marginBottom: 1 },
          React.createElement(
            Box,
            null,
            React.createElement(
              Text,
              { bold: true, color: "cyan" },
              `Pair ${index + 1}:`,
            ),
          ),
          React.createElement(
            Box,
            { alignItems: "center" },
            React.createElement(
              Text,
              { marginRight: 1 },
              "Before: "
            ),
            React.createElement(
              Box,
              { flexGrow: 1 },
              currentPair === index && currentField === "before"
                ? React.createElement(CustomTextInput, {
                    value: pair.before,
                    onChange: (value) => {
                      const newPairs = [...urlPairs];
                      newPairs[index].before = value;
                      updateState({ urlPairs: newPairs });
                    },
                    focus: true,
                    placeholder: "Before URL",
                    color: "green",
                    TextInputComponent,
                    onKeyPress: (input, key) => {
                      // Delete, Tab, 矢印キーなどを親コンポーネントに通知
                      if (key.delete || 
                          key.tab || 
                          key.upArrow || 
                          key.downArrow || 
                          key.escape) {
                        // 親コンポーネントのuseInputが処理する
                        // このイベントを阻止して親に委譲
                        return true;
                      }
                    }
                  })
                : React.createElement(
                    Text,
                    { color: "gray" },
                    pair.before || "(empty)"
                  )
            ),
          ),
          React.createElement(
            Box,
            { alignItems: "center" },
            React.createElement(
              Text,
              { marginRight: 1 },
              "After:  "
            ),
            React.createElement(
              Box,
              { flexGrow: 1 },
              currentPair === index && currentField === "after"
                ? React.createElement(CustomTextInput, {
                    value: pair.after,
                    onChange: (value) => {
                      const newPairs = [...urlPairs];
                      newPairs[index].after = value;
                      updateState({ urlPairs: newPairs });
                    },
                    focus: true,
                    placeholder: "After URL",
                    color: "green",
                    TextInputComponent,
                    onKeyPress: (input, key) => {
                      // Delete, Tab, 矢印キーなどを親コンポーネントに通知
                      if (key.delete || 
                          key.tab || 
                          key.upArrow || 
                          key.downArrow || 
                          key.escape) {
                        // 親コンポーネントのuseInputが処理する
                        // このイベントを阻止して親に委譲
                        return true;
                      }
                    }
                  })
                : React.createElement(
                    Text,
                    { color: "gray" },
                    pair.after || "(empty)"
                  )
            ),
          ),
        )
      ),
    );
  },

  // オプション設定画面
  renderOptions: (state, React, Box, Text, updateState, TextInputComponent) => {
    const { 
      optionSelection, optionItems, options, editingOption,
      tempOptionValue, urlPairs 
    } = state;
    
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(
          Text,
          { bold: true, color: "yellow" },
          "Options",
        ),
      ),
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(
          Text,
          { dimColor: true },
          "Keys: ↑↓=Select, Enter=Edit, S=Start execution, ESC=Back",
        ),
      ),
      optionItems.map((item, index) =>
        React.createElement(
          Box,
          { key: item.key, alignItems: "center" },
          React.createElement(
            Text,
            {
              color: optionSelection === index
                ? (editingOption ? "yellow" : "green")
                : "white",
              marginRight: 1
            },
            optionSelection === index ? "▶ " : "  ",
            `${item.label}: `,
          ),
          React.createElement(
            Box,
            { flexGrow: 1 },
            editingOption && optionSelection === index
              ? React.createElement(CustomTextInput, {
                  value: tempOptionValue,
                  onChange: (value) => {
                    updateState({ tempOptionValue: value });
                  },
                  focus: true,
                  placeholder: `Enter ${item.label}`,
                  color: "yellow",
                  TextInputComponent
                })
              : React.createElement(
                  Text,
                  { color: "white" },
                  options[item.key]
                )
          ),
        )
      ),
      React.createElement(
        Box,
        { marginTop: 1 },
        React.createElement(
          Text,
          { dimColor: true },
          "Press 'S' key to proceed to execution confirmation",
        ),
      ),
      (() => {
        const validPairs = urlPairs.filter((pair) => pair.before && pair.after);
        if (validPairs.length === 0) {
          return React.createElement(
            Box,
            { marginTop: 1 },
            React.createElement(
              Text,
              { color: "red" },
              "⚠️  No valid URL pairs. Please go back to input screen.",
            ),
          );
        }
        return null;
      })(),
    );
  },

  // 確認画面
  renderConfirm: (state, React, Box, Text) => {
    const { urlPairs, options, optionItems } = state;
    
    return React.createElement(
      Box,
      { flexDirection: "column" },
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { bold: true, color: "yellow" }, "Execution Confirmation"),
      ),
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { bold: true }, "URL Pairs:"),
      ),
      urlPairs.filter((pair) => pair.before && pair.after).map((pair, index) =>
        React.createElement(
          Box,
          { key: index, flexDirection: "column", marginBottom: 1 },
          React.createElement(
            Text,
            { bold: true, color: "cyan" },
            `Pair ${index + 1}:`,
          ),
          React.createElement(Text, null, `  Before: ${pair.before}`),
          React.createElement(Text, null, `  After:  ${pair.after}`),
        )
      ),
      React.createElement(
        Box,
        { marginTop: 1, marginBottom: 1 },
        React.createElement(Text, { bold: true }, "Options:"),
      ),
      optionItems.map((item) =>
        React.createElement(
          Box,
          { key: item.key },
          React.createElement(
            Text,
            null,
            `  ${item.label}: ${options[item.key]}`,
          ),
        )
      ),
      React.createElement(
        Box,
        { marginTop: 1 },
        React.createElement(Text, null, "Run VRT with these settings? (y/n): "),
      ),
    );
  }
};

module.exports = { UIComponents };