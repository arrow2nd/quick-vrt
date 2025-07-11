#!/usr/bin/env node

const React = require("react");
const { useState, useEffect } = React;

// カスタムテキスト入力コンポーネント
const CustomTextInput = ({
  value,
  onChange,
  placeholder = "",
  focus = false,
  color = "green",
  TextInputComponent,
  onKeyPress,
}) => {
  const [internalValue, setInternalValue] = useState(value || "");

  useEffect(() => {
    setInternalValue(value || "");
  }, [value]);

  const handleChange = (newValue) => {
    setInternalValue(newValue);
    if (onChange) {
      onChange(newValue);
    }
  };

  if (!TextInputComponent) {
    // TextInputComponentが利用できない場合のフォールバック（静的表示）
    return React.createElement("span", {
      style: {
        color: focus ? color : "gray",
        textDecoration: focus ? "underline" : "none",
      },
    }, internalValue || `[${placeholder}]`);
  }

  return React.createElement(TextInputComponent, {
    value: internalValue,
    onChange: handleChange,
    placeholder,
    focus,
    showCursor: focus,
    onSubmit: () => {
      // Enterキーが押されたときの処理
      if (onKeyPress) {
        onKeyPress("", { return: true });
      }
    },
  });
};

module.exports = { CustomTextInput };

