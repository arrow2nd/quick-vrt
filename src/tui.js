#!/usr/bin/env node

const React = require("react");
const { useState } = React;
const clipboardy = require("clipboardy");

// TUIコンポーネント
const VrtTui = ({ onSubmit, useInput, useApp, Box, Text }) => {
  const [urlPairs, setUrlPairs] = useState([{ before: "", after: "" }]);
  const [currentPair, setCurrentPair] = useState(0);
  const [currentField, setCurrentField] = useState("before"); // 'before' or 'after'
  const [mode, setMode] = useState("input"); // 'input' or 'confirm'
  const { exit } = useApp();

  useInput((input, key) => {
    if (mode === "input") {
      if (key.return) {
        // Enterキーで次のフィールドに移動
        if (currentField === "before") {
          setCurrentField("after");
        } else {
          // 現在のペアのafterが入力されたら、次のペアに移動
          if (currentPair < urlPairs.length - 1) {
            setCurrentPair(currentPair + 1);
            setCurrentField("before");
          } else {
            // 最後のペアなら確認モードに移行
            setMode("confirm");
          }
        }
      } else if (key.tab) {
        // Tabキーで新しいペアを追加
        setUrlPairs([...urlPairs, { before: "", after: "" }]);
        setCurrentPair(urlPairs.length);
        setCurrentField("before");
      } else if (key.ctrl && input === "d") {
        // Ctrl+D で現在のペアを削除
        if (urlPairs.length > 1) {
          const newPairs = urlPairs.filter((_, index) => index !== currentPair);
          setUrlPairs(newPairs);

          // 削除後のカーソル位置を調整
          if (currentPair >= newPairs.length) {
            setCurrentPair(newPairs.length - 1);
          }

          // 現在のペアが空の場合、before フィールドにリセット
          if (
            newPairs[currentPair] && !newPairs[currentPair].before &&
            !newPairs[currentPair].after
          ) {
            setCurrentField("before");
          }
        }
      } else if (
        key.backspace || key.delete ||
        (input && (input.charCodeAt(0) === 8 || input.charCodeAt(0) === 127))
      ) {
        // macOSのBackspace/DELキーで文字を削除
        const newPairs = [...urlPairs];
        const current = newPairs[currentPair];
        if (current[currentField].length > 0) {
          current[currentField] = current[currentField].slice(0, -1);
          setUrlPairs(newPairs);
        }
      } else if (key.ctrl && input === "v") {
        // Ctrl+V でクリップボードから貼り付け
        try {
          const clipboardContent = clipboardy.readSync();
          if (clipboardContent) {
            const newPairs = [...urlPairs];
            // 改行で分割されている場合は最初の行のみ使用
            const content = clipboardContent.split("\n")[0].trim();
            newPairs[currentPair][currentField] += content;
            setUrlPairs(newPairs);
          }
        } catch (error) {
          // クリップボードアクセスに失敗した場合は無視
        }
      } else if (key.upArrow) {
        // 上矢印キーで前のペアに移動
        if (currentPair > 0) {
          setCurrentPair(currentPair - 1);
          setCurrentField("before");
        }
      } else if (key.downArrow) {
        // 下矢印キーで次のペアに移動
        if (currentPair < urlPairs.length - 1) {
          setCurrentPair(currentPair + 1);
          setCurrentField("before");
        }
      } else if (key.escape) {
        // ESCキーで終了
        exit();
      } else if (
        input && !key.ctrl && !key.alt && !key.meta && !key.backspace &&
        !key.delete && !key.return && !key.tab && !key.upArrow &&
        !key.downArrow && !key.escape
      ) {
        // 通常の文字入力
        const inputCode = input.charCodeAt(0);
        // 印刷可能文字のみを受け入れ（ASCII 32-126、制御文字を除外）
        if (
          inputCode >= 32 && inputCode <= 126 && inputCode !== 127 &&
          inputCode !== 8
        ) {
          const newPairs = [...urlPairs];
          newPairs[currentPair][currentField] += input;
          setUrlPairs(newPairs);
        }
      }
    } else if (mode === "confirm") {
      if (key.return || input === "y") {
        // Enterキーまたは'y'で実行
        const validPairs = urlPairs.filter((pair) => pair.before && pair.after);
        if (validPairs.length > 0) {
          onSubmit(validPairs);
          exit();
        }
      } else if (input === "n" || key.escape) {
        // 'n'またはESCキーで戻る
        setMode("input");
      }
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
    mode === "input" && React.createElement(
      React.Fragment,
      null,
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, null, "URLペアを入力してください"),
      ),
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(
          Text,
          { dimColor: true },
          "操作: Enter=次のフィールド, Tab=新しいペア追加, ↑↓=ペア移動, Ctrl+D=ペア削除, Ctrl+V=貼り付け, ESC=終了",
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
              `ペア ${index + 1}:`,
            ),
          ),
          React.createElement(
            Box,
            null,
            React.createElement(
              Text,
              {
                color: currentPair === index && currentField === "before"
                  ? "green"
                  : "gray",
              },
              `Before: ${pair.before}`,
              currentPair === index && currentField === "before" &&
                React.createElement(Text, { color: "green" }, "█"),
            ),
          ),
          React.createElement(
            Box,
            null,
            React.createElement(
              Text,
              {
                color: currentPair === index && currentField === "after"
                  ? "green"
                  : "gray",
              },
              `After:  ${pair.after}`,
              currentPair === index && currentField === "after" &&
                React.createElement(Text, { color: "green" }, "█"),
            ),
          ),
        )
      ),
    ),
    mode === "confirm" && React.createElement(
      Box,
      { flexDirection: "column" },
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { bold: true, color: "yellow" }, "設定確認"),
      ),
      urlPairs.filter((pair) => pair.before && pair.after).map((pair, index) =>
        React.createElement(
          Box,
          { key: index, flexDirection: "column", marginBottom: 1 },
          React.createElement(
            Text,
            { bold: true, color: "cyan" },
            `ペア ${index + 1}:`,
          ),
          React.createElement(Text, null, `  Before: ${pair.before}`),
          React.createElement(Text, null, `  After:  ${pair.after}`),
        )
      ),
      React.createElement(
        Box,
        { marginTop: 1 },
        React.createElement(Text, null, "この設定でVRTを実行しますか? (y/n): "),
      ),
    ),
  );
};

// TUIを起動する関数
const startTui = async () => {
  return new Promise(async (resolve) => {
    const { render, Box, Text, useInput, useApp } = await import("ink");

    const handleSubmit = (pairs) => {
      resolve(pairs);
    };

    render(React.createElement(VrtTui, {
      onSubmit: handleSubmit,
      useInput,
      useApp,
      Box,
      Text,
    }));
  });
};

module.exports = { startTui };

