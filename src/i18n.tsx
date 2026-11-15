import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { translate, localeFor, type Language } from "./translations";
const Context = createContext({
  language: "en" as Language,
  setLanguage: (_: Language) => {},
  t: (s: string) => s,
  locale: "en-BD",
});
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, set] = useState<Language>("en");
  useEffect(() => {
    let live = true;
    SecureStore.getItemAsync("rungather-language")
      .then((v) => {
        if (live && (v === "bn" || v === "en")) set(v);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const setLanguage = (next: Language) => {
    set(next);
    void SecureStore.setItemAsync("rungather-language", next).catch(() => {});
  };
  return (
    <Context.Provider
      value={{
        language,
        setLanguage,
        t: (s) => translate(s, language),
        locale: localeFor(language),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useI18n = () => useContext(Context);
