"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState("en"); // "en" or "hi"

  // Persist language preference
  useEffect(() => {
    const saved = localStorage.getItem("app_lang");
    if (saved) setLanguage(saved);
  }, []);

  const toggleLanguage = () => {
    const newLang = language === "en" ? "hi" : "en";
    setLanguage(newLang);
    localStorage.setItem("app_lang", newLang);
    
    // Toggle the 'lang-hi' class on the document body for global font changes
    if (newLang === "hi") {
      document.body.classList.add("lang-hi");
    } else {
      document.body.classList.remove("lang-hi");
    }
  };

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
