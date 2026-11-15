import React, { createContext, useContext, useState } from "react";
import { useColorScheme } from "react-native";
const light = {
  bg: "#f6f7f1",
  card: "#ffffff",
  text: "#183a30",
  muted: "#63756a",
  line: "#dce2d8",
  accent: "#174f3d",
  lime: "#d4f487",
  error: "#b33428",
};
const dark = {
  bg: "#101d18",
  card: "#1b2b23",
  text: "#f0f5eb",
  muted: "#a5b7a9",
  line: "#344b3b",
  accent: "#a7dd9c",
  lime: "#d4f487",
  error: "#ff9e91",
};
const Context = createContext({ colors: light, dark: false, toggle: () => {} });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [override, setOverride] = useState<boolean | null>(null);
  const isDark = override ?? system === "dark";
  return (
    <Context.Provider
      value={{
        colors: isDark ? dark : light,
        dark: isDark,
        toggle: () => setOverride(!isDark),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useTheme = () => useContext(Context);
