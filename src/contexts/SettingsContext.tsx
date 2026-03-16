import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export interface UserSettings {
    theme: 'light' | 'dark';
    webhook_reminders: string;
    webhook_sync: string;
}

interface SettingsContextType {
    settings: UserSettings;
    updateSettings: (newSettings: Partial<UserSettings>) => Promise<void>;
    loading: boolean;
}

const defaultSettings: UserSettings = {
    theme: 'light',
    webhook_reminders: '',
    webhook_sync: '',
};

const SettingsContext = createContext<SettingsContextType>({
    settings: defaultSettings,
    updateSettings: async () => { },
    loading: false,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [settings, setSettings] = useState<UserSettings>(defaultSettings);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!user) {
            setSettings(defaultSettings);
            setLoading(false);
            return;
        }

        let cancelled = false;

        async function loadSettings() {
            try {
                setLoading(true);
                const { data, error } = await supabase
                    .from('user_settings')
                    .select('*')
                    .eq('user_id', user!.id)
                    .maybeSingle();

                if (cancelled) return;

                if (data) {
                    setSettings({
                        theme: data.theme || 'light',
                        webhook_reminders: data.webhook_reminders || '',
                        webhook_sync: data.webhook_sync || '',
                    });
                } else {
                    // No settings row found – create one with defaults
                    await supabase.from('user_settings').insert([{ user_id: user!.id }]);
                    setSettings(defaultSettings);
                }
            } catch (err) {
                console.error('Error loading settings:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        loadSettings();
        return () => { cancelled = true; };
    }, [user]);

    useEffect(() => {
        if (settings.theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [settings.theme]);

    const updateSettings = async (newSettings: Partial<UserSettings>) => {
        if (!user) return;

        const merged = { ...settings, ...newSettings };
        setSettings(merged);

        try {
            const { error } = await supabase
                .from('user_settings')
                .update(newSettings)
                .eq('user_id', user.id);

            if (error) {
                console.error('Error saving settings:', error);
                // Revert on error
                setSettings(settings);
            }
        } catch (err) {
            console.error('Error saving settings:', err);
            setSettings(settings);
        }
    };

    return (
        <SettingsContext.Provider value={{ settings, updateSettings, loading }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    return useContext(SettingsContext);
}
