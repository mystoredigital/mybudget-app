import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';

/**
 * Initialize native Capacitor plugins.
 * This function is safe to call on web — it will no-op if not running natively.
 */
export async function initCapacitor() {
    if (!Capacitor.isNativePlatform()) return;

    try {
        // Status Bar — transparent overlay style
        await StatusBar.setStyle({ style: Style.Dark });
        if (Capacitor.getPlatform() === 'android') {
            await StatusBar.setBackgroundColor({ color: '#09090b' });
            await StatusBar.setOverlaysWebView({ overlay: false });
        }

        // Keyboard — resize body on open/close
        await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
        await Keyboard.setScroll({ isDisabled: false });

        // Splash Screen — hide after app is ready
        await SplashScreen.hide();
    } catch (err) {
        console.warn('[Capacitor] Plugin init error:', err);
    }
}

/**
 * Check if running as a native app.
 */
export function isNative(): boolean {
    return Capacitor.isNativePlatform();
}

/**
 * Get the current platform: 'ios' | 'android' | 'web'
 */
export function getPlatform(): string {
    return Capacitor.getPlatform();
}
