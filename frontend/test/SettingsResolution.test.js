/*
 * MoonlightWeb — TNR suite. Copyright (C) 2026 Bruno Martin.
 * GPLv3 — see repository LICENSE.
 *
 * The resolution choice on the Settings page, and the ratio it retired. The
 * ratio dropdown left the product in 0.3.1: a user must not find it, a value
 * they forced before must not survive a save, and picking any resolution
 * puts the ratio back to Auto — while a debug build keeps all of it for tests.
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
    t: (key, params) => 'text:' + key + (params ? ':' + JSON.stringify(params) : ''),
    getLanguage: () => 'en',
    setLanguage: vi.fn(),
    AVAILABLE_LANGUAGES: [{ code: 'en', label: 'English' }],
}));

import { SettingsView } from '../js/ui/SettingsView.js';
import { computeAutoBitrate } from '../js/util/AutoBitrate.js';

const STORAGE_KEY = 'mw-streaming-settings';

describe('SettingsView resolution', () => {
    let view;

    const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY));
    const select = () => view.container.querySelector('#settings-stream-height');
    const pick = async (value) => {
        select().value = value;
        select().dispatchEvent(new Event('change'));
        // _autoSave debounces 300 ms.
        await new Promise((r) => setTimeout(r, 350));
    };

    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '<div id="settings"></div>';
        vi.clearAllMocks();
        view = new SettingsView(document.getElementById('settings'), () => {});
    });

    it('offers Auto, this screen and custom, then the rungs largest first', () => {
        view.render();
        const values = [...select().options].map((o) => o.value);
        expect(values).toEqual(['auto', 'device', 'custom', '2160', '1440', '1080', '720']);
        expect(select().value).toBe('auto');
        expect(view.container.querySelector('#settings-custom-width')).toBeNull();
    });

    // The bitrate follows the estimate until the slider leaves it, and is the
    // user's own from then on — whatever the resolution becomes.
    it('keeps a bitrate the user set, and follows the estimate otherwise', async () => {
        view.render();
        view.bindEvents();
        expect(view._bitrateAuto).toBe(true);
        const slider = view.container.querySelector('#settings-stream-bitrate');
        slider.value = '7';
        slider.dispatchEvent(new Event('change'));
        await new Promise((r) => setTimeout(r, 350));
        expect(view._bitrateAuto).toBe(false);
        expect(stored().stream_bitrate_auto).toBe(false);
        expect(stored().stream_bitrate).toBe(7000);
        await pick('720');
        expect(stored().stream_bitrate).toBe(7000);
        // Back on the estimate: auto again, and it moves with the rung.
        slider.value = String(view._estimateBitrate());
        slider.dispatchEvent(new Event('change'));
        await new Promise((r) => setTimeout(r, 350));
        expect(stored().stream_bitrate_auto).toBe(true);
        await pick('2160');
        expect(stored().stream_bitrate).toBe(view._estimateBitrate() * 1000);
    });

    // The pixel budget leaves a named rung its lines (issue #38): with the
    // rate on Auto, 2160p at 60 is over the budget, and the estimate is
    // still the one for the 2160 lines the stream carries.
    it('recommends the bitrate of a named rung at its full size', async () => {
        view.render();
        view.bindEvents();
        await pick('2160');
        expect(view._estimateBitrate()).toBe(computeAutoBitrate(2160, '16:9', false, false));
    });

    it('shows the ratio dropdown to all users', () => {
        view.render();
        const select = view.container.querySelector('#settings-stream-aspect');
        expect(select).not.toBeNull();
        const values = Array.from(select.querySelectorAll('option')).map((o) => o.value);
        expect(values).toContain('auto');
        expect(values).toContain('window');
        expect(values).toContain('16:9');
        expect(values).toContain('21:9');
    });

    it('saves a chosen standard ratio and marks it as forced', async () => {
        view._applySettings({ stream_aspect: '4:3', stream_height: 1440 });
        expect(view._streamAspect).toBe('4:3');
        view.render();
        view.bindEvents();
        expect(view._streamAspect).toBe('4:3');
        await view._saveToStorage();
        expect(stored().stream_aspect).toBe('4:3');
        expect(stored().stream_aspect_forced).toBe(true);
        expect(stored().stream_height).toBe(1440);
        expect(stored().stream_resolution).toBe('auto');
    });

    it('saves window ratio and marks it as forced', async () => {
        view._applySettings({ stream_aspect: 'window' });
        view.render();
        view.bindEvents();
        await view._saveToStorage();
        expect(stored().stream_aspect).toBe('window');
        expect(stored().stream_aspect_forced).toBe(true);
    });

    it('saves auto ratio without forced flag', async () => {
        view._applySettings({ stream_aspect: 'auto' });
        view.render();
        view.bindEvents();
        await view._saveToStorage();
        expect(stored().stream_aspect).toBe('auto');
        expect(stored().stream_aspect_forced).toBeUndefined();
    });

    it('shows the custom pair with its choice, pinned into bounds and even', async () => {
        view.render();
        view.bindEvents();
        await pick('custom');
        const w = view.container.querySelector('#settings-custom-width');
        const h = view.container.querySelector('#settings-custom-height');
        expect(w).not.toBeNull();
        expect(w.value).toBe('1920');
        expect(h.value).toBe('1080');
        w.value = '9999';
        w.dispatchEvent(new Event('change'));
        h.value = '767';
        h.dispatchEvent(new Event('change'));
        await new Promise((r) => setTimeout(r, 350));
        expect(w.value).toBe('4096');
        expect(h.value).toBe('766');
        expect(stored().stream_custom_width).toBe(4096);
        expect(stored().stream_custom_height).toBe(766);
        expect(stored().stream_resolution).toBe('custom');
        // Back to a rung: the pair goes, the value it held stays stored.
        await pick('720');
        expect(view.container.querySelector('#settings-custom-width')).toBeNull();
        expect(stored().stream_resolution).toBe('fixed');
        expect(stored().stream_height).toBe(720);
        expect(stored().stream_custom_width).toBe(4096);
    });

    it('reads an unknown stored choice as Auto, the rung kept for later', () => {
        view._applySettings({ stream_resolution: 'native', stream_height: 2160 });
        view.render();
        expect(select().value).toBe('auto');
        expect(view._streamHeight).toBe(2160);
    });
});
