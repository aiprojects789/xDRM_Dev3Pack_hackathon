import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { baseURL, rootAPIURL } from '../utils/backend_url';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({
    platformFee: 2.5,
    enableCrypto: true,
    enablePayPal: true,
    enableCompetition: false,
    loading: true
  });

  const fetchSettings = async () => {
    try {
      // We will update the backend to return all these values
      const res = await axios.get(`${rootAPIURL}/artwork/settings/global`);
      console.log("Global Settings Fetched:", res.data);
      setSettings({
        platformFee: res.data.platform_fee ?? 2.5,
        enableCrypto: res.data.enable_crypto ?? true,
        enablePayPal: res.data.enable_paypal ?? true,
        enableCompetition: res.data.enable_competition ?? false,
        loading: false
      });
    } catch (error) {
      console.error("Failed to load global settings:", error);
      // Fallback to defaults if API fails
      setSettings(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // Function to refresh settings (called after Admin updates them)
  const refreshSettings = () => {
    fetchSettings();
  };

  return (
    <SettingsContext.Provider value={{ ...settings, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};