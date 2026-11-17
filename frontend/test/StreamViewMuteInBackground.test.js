/*
 * MoonlightWeb — TNR suite. Copyright (C) 2026 Bruno Martin.
 * GPLv3 — see repository LICENSE.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StreamView } from '../js/ui/StreamView.js';
import * as streamVolume from '../js/audio/streamVolume.js';

function makeView({ muteInBackground = false, isWindowActive = true, volume = 0.8 } = {}) {
    streamVolume.setLevel(volume);
    streamVolume.setMuted(false);

    const audioEl = document.createElement('audio');
    const audioPipeline = {
        volume: 1,
        setVolume(v) {
            this.volume = v;
        },
    };

    const v = {
        _muteInBackground: muteInBackground,
        _isWindowActive: isWindowActive,
        _quitting: false,
        audioEl,
        audioPipeline,
        _volumeCtl: null,
        _releaseAllPhysKeys: vi.fn(),
        _touchPadLetGo: vi.fn(),
        _resyncAfterHidden: vi.fn(),
        _refreshLocalCursorOnFocus: vi.fn(),
    };

    // Bind prototype methods
    v._applyVolume = StreamView.prototype._applyVolume.bind(v);
    v._setWindowActive = StreamView.prototype._setWindowActive.bind(v);

    Object.defineProperty(v, 'muteInBackground', {
        get: Object.getOwnPropertyDescriptor(StreamView.prototype, 'muteInBackground').get.bind(v),
        set: Object.getOwnPropertyDescriptor(StreamView.prototype, 'muteInBackground').set.bind(v),
    });

    v._onWindowBlur = (e) => {
        if (e && e.target && e.target !== window && e.target !== document) return;
        v._releaseAllPhysKeys();
        v._setWindowActive(false);
    };

    v._onWindowFocus = () => {
        v._setWindowActive(true);
        v._refreshLocalCursorOnFocus();
    };

    v._onVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            v._releaseAllPhysKeys();
            v._touchPadLetGo();
            v._setWindowActive(false);
        }
        if (document.visibilityState === 'visible' && !v._quitting) {
            v._setWindowActive(true);
            v._resyncAfterHidden();
            v._refreshLocalCursorOnFocus();
        }
    };

    return v;
}

describe('StreamView: mute when in background', () => {
    beforeEach(() => {
        localStorage.clear();
        streamVolume.setLevel(0.8);
        streamVolume.setMuted(false);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('applies full volume when window is active and muteInBackground is true', () => {
        const v = makeView({ muteInBackground: true, isWindowActive: true, volume: 0.8 });
        v._applyVolume();

        expect(v.audioEl.volume).toBeCloseTo(0.8);
        expect(v.audioPipeline.volume).toBeCloseTo(0.8);
    });

    it('mutes audio when window becomes inactive and muteInBackground is true', () => {
        const v = makeView({ muteInBackground: true, isWindowActive: true, volume: 0.8 });
        v._applyVolume();
        expect(v.audioEl.volume).toBeCloseTo(0.8);

        // Window loses focus
        v._onWindowBlur({ target: window });

        expect(v._isWindowActive).toBe(false);
        expect(v.audioEl.volume).toBe(0);
        expect(v.audioPipeline.volume).toBe(0);
    });

    it('restores audio when window regains focus', () => {
        const v = makeView({ muteInBackground: true, isWindowActive: false, volume: 0.8 });
        v._applyVolume();
        expect(v.audioEl.volume).toBe(0);

        // Window gains focus
        v._onWindowFocus();

        expect(v._isWindowActive).toBe(true);
        expect(v.audioEl.volume).toBeCloseTo(0.8);
        expect(v.audioPipeline.volume).toBeCloseTo(0.8);
    });

    it('does not mute when muteInBackground is false (default)', () => {
        const v = makeView({ muteInBackground: false, isWindowActive: true, volume: 0.8 });
        v._applyVolume();
        expect(v.audioEl.volume).toBeCloseTo(0.8);

        v._onWindowBlur({ target: window });

        expect(v._isWindowActive).toBe(false);
        expect(v.audioEl.volume).toBeCloseTo(0.8);
        expect(v.audioPipeline.volume).toBeCloseTo(0.8);
    });

    it('mutes when document becomes hidden and unmutes when visible', () => {
        const v = makeView({ muteInBackground: true, isWindowActive: true, volume: 0.75 });
        v._applyVolume();
        expect(v.audioEl.volume).toBeCloseTo(0.75);

        // Tab hidden
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'hidden',
        });
        v._onVisibilityChange();

        expect(v._isWindowActive).toBe(false);
        expect(v.audioEl.volume).toBe(0);
        expect(v.audioPipeline.volume).toBe(0);

        // Tab visible
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'visible',
        });
        v._onVisibilityChange();

        expect(v._isWindowActive).toBe(true);
        expect(v.audioEl.volume).toBeCloseTo(0.75);
        expect(v.audioPipeline.volume).toBeCloseTo(0.75);
    });

    it('ignores element-level blur events', () => {
        const v = makeView({ muteInBackground: true, isWindowActive: true, volume: 0.8 });
        v._applyVolume();

        const inputEl = document.createElement('input');
        v._onWindowBlur({ target: inputEl });

        expect(v._isWindowActive).toBe(true);
        expect(v.audioEl.volume).toBeCloseTo(0.8);
    });

    it('preserves user manual mute across window focus changes', () => {
        const v = makeView({ muteInBackground: true, isWindowActive: true, volume: 0.8 });
        streamVolume.setMuted(true);
        v._applyVolume();
        expect(v.audioEl.volume).toBe(0);

        // Blur then focus
        v._onWindowBlur({ target: window });
        expect(v.audioEl.volume).toBe(0);

        v._onWindowFocus();
        // Since streamVolume was manually muted, it should remain 0
        expect(v._isWindowActive).toBe(true);
        expect(v.audioEl.volume).toBe(0);
        expect(v.audioPipeline.volume).toBe(0);
    });

    it('dynamically toggling muteInBackground updates audio immediately', () => {
        const v = makeView({ muteInBackground: false, isWindowActive: false, volume: 0.8 });
        v._applyVolume();
        expect(v.audioEl.volume).toBeCloseTo(0.8);

        // Toggle on while in background -> mutes
        v.muteInBackground = true;
        expect(v.muteInBackground).toBe(true);
        expect(v.audioEl.volume).toBe(0);

        // Toggle off while in background -> unmutes
        v.muteInBackground = false;
        expect(v.muteInBackground).toBe(false);
        expect(v.audioEl.volume).toBeCloseTo(0.8);
    });
});
