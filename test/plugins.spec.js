// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
    Framework,
    PluginRegistry,
    registerContentHook,
    registerMenuItemFilter,
    runContentHooks,
    isMenuItemVetoed,
} from '../core.js';

describe('PluginRegistry', () => {
    it('Framework.use executa plugin function e .install', () => {
        const calls = [];
        Framework.use((fw) => calls.push(['fn', fw === Framework]));
        Framework.use({ install: (fw) => calls.push(['install', fw === Framework]) });
        expect(calls).toEqual([['fn', true], ['install', true]]);
        expect(Framework._plugins.length).toBeGreaterThanOrEqual(2);
    });

    it('content hooks rodam em ordem e unregister funciona', () => {
        const seen = [];
        const off = registerContentHook((ctx) => seen.push(ctx.screenId));
        runContentHooks({ screenId: 'a', root: null });
        off();
        runContentHooks({ screenId: 'b', root: null });
        expect(seen).toEqual(['a']);
        expect(PluginRegistry.contentHooks).toHaveLength(0);
    });

    it('menu-item filter veta com false e unregister funciona', () => {
        const off = registerMenuItemFilter(() => false);
        expect(isMenuItemVetoed({ screenId: 's', kind: 'menu', labelPath: 'A', item: {} })).toBe(true);
        off();
        expect(isMenuItemVetoed({ screenId: 's', kind: 'menu', labelPath: 'A', item: {} })).toBe(false);
    });

    it('Framework expõe os registros como métodos', () => {
        expect(typeof Framework.registerContentHook).toBe('function');
        expect(typeof Framework.registerMenuItemFilter).toBe('function');
        const off = Framework.registerMenuItemFilter(() => true);
        off();
    });
});
