/*
 * MoonlightWeb — TNR suite. Copyright (C) 2026 Bruno Martin.
 * GPLv3 — see repository LICENSE.
 *
 * "Mute when in background" setting toggle.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../js/api/BackendClient.js', () => ({
    BackendClient: {
        getAuthStatus: vi.fn(async () => ({ has_session: false })),
        getStreamingSettings: vi.fn(async () => ({})),
        saveStreamingSettings: vi.fn(async () => ({})),
        getMetricsReporting: vi.fn(),
        setMetricsReporting: vi.fn(async () => ({ enabled: true })),
    },
}));
vi.mock('../js/ui/Toast.js', () => ({
    Toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('../js/i18n/i18n.js', () => ({
    t: (key) => 'text:' + key,
    getLanguage: () => 'en',
    setLanguage: vi.fn(),
    AVAILABLE_LANGUAGES: [{ code: 'en', label: 'English' }],
}));

import { SettingsView } from '../js/ui/SettingsView.js';

const STORAGE_KEY = 'mw-streaming-settings';

describe('SettingsView: mute in background toggle', () => {
    let view;
    const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const checkbox = () => view.container.querySelector('#settings-mute-in-background');

    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '<div id="settings"></div>';
        vi.clearAllMocks();
        view = new SettingsView(document.getElementById('settings'), () => {});
    });

    it('defaults to unchecked / false', () => {
        view.render();
        view.bindEvents();
        expect(view._muteInBackground).toBe(false);
        expect(checkbox().checked).toBe(false);
    });

    it('persists changes to localStorage when checked', async () => {
        view.render();
        view.bindEvents();

        checkbox().checked = true;
        checkbox().dispatchEvent(new Event('change'));

        expect(view._muteInBackground).toBe(true);
        // Wait for debounce in _autoSave (300ms)
        await new Promise((r) => setTimeout(r, 350));
        expect(stored().mute_in_background).toBe(true);
    });

    it('loads previously saved state from localStorage', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ mute_in_background: true }));
        await view._loadState();
        view.render();
        view.bindEvents();

        expect(view._muteInBackground).toBe(true);
        expect(checkbox().checked).toBe(true);
    });

    it('resets to false on reset defaults', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ mute_in_background: true }));
        await view._loadState();
        view.render();
        view.bindEvents();

        await view._resetDefaults();
        expect(view._muteInBackground).toBe(false);

        view.render();
        expect(checkbox().checked).toBe(false);
    });
});
