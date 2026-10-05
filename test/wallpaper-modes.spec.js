// @vitest-environment jsdom
// Modos de exibição do papel de parede (estilo MS Windows:
// Preencher/Ajustar/Esticar/Centralizar/Lado a lado).
import { describe, it, expect, beforeEach } from 'vitest';
import { Desktop } from '../desktop.js';

const IMG = 'https://exemplo.com/fundo.jpg';

beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    Desktop._wallpaper = null;
    Desktop._wallpaperMode = null;
    Desktop.options = Desktop.options || {};
    Desktop.windowsEl = null;
    Desktop.tasksEl = null;
    Desktop.init({ target: '#app', clock: false });
});

function bg() {
    const el = document.getElementById('desktop');
    return {
        image: el.style.backgroundImage,
        size: el.style.backgroundSize,
        position: el.style.backgroundPosition,
        repeat: el.style.backgroundRepeat,
    };
}

describe('Wallpaper — modos de exibição', () => {
    it('padrão é Preencher/cover (comportamento anterior preservado)', () => {
        Desktop.setWallpaper(IMG);
        expect(bg().size).toBe('cover');
        expect(bg().position).toContain('center'); // jsdom normaliza "center" → "center center"
        expect(bg().repeat).toBe('no-repeat');
        expect(bg().image).toContain('exemplo.com/fundo.jpg');
        expect(Desktop.getWallpaperMode()).toBe('cover');
    });

    it.each([
        ['contain', 'contain', 'center', 'no-repeat'],
        ['stretch', '100% 100%', 'center', 'no-repeat'],
        ['center', 'auto', 'center', 'no-repeat'],
        ['tile', 'auto', 'left top', 'repeat'],
    ])('modo %s aplica size/position/repeat corretos', (mode, size, position, repeat) => {
        Desktop.setWallpaper(IMG, true, mode);
        expect(bg().size).toBe(size);
        expect(bg().position).toContain(position);
        expect(bg().repeat).toBe(repeat);
        expect(Desktop.getWallpaperMode()).toBe(mode);
    });

    it('modo inválido cai para cover', () => {
        Desktop.setWallpaper(IMG, false, 'papel-de-parede-3d');
        expect(bg().size).toBe('cover');
        expect(Desktop.getWallpaperMode()).toBe('cover');
    });

    it('aceita apelidos em PT (preencher/centralizar/lado-a-lado...)', () => {
        Desktop.setWallpaper(IMG, false, 'centralizar');
        expect(Desktop.getWallpaperMode()).toBe('center');
        Desktop.setWallpaper(IMG, false, 'lado-a-lado');
        expect(Desktop.getWallpaperMode()).toBe('tile');
    });

    it('getWallpaperModes lista os 5 modos', () => {
        expect(Desktop.getWallpaperModes().map((m) => m.id)).toEqual(
            ['cover', 'contain', 'stretch', 'center', 'tile']);
    });

    it('persiste valor + modo e restaura os dois', () => {
        Desktop.setWallpaper(IMG, true, 'tile');
        expect(localStorage.getItem('desktop_engine_wallpaper_mode')).toBe('tile');

        Desktop.setWallpaper(null, false);
        expect(bg().image).toBe('');

        Desktop.setWallpaper(
            localStorage.getItem('desktop_engine_wallpaper'), false,
            localStorage.getItem('desktop_engine_wallpaper_mode'));
        expect(bg().repeat).toBe('repeat');
        expect(Desktop.getWallpaperMode()).toBe('tile');
    });

    it('cor/gradiente ignora o modo (vai no background, sem url)', () => {
        Desktop.setWallpaper('linear-gradient(135deg, #111, #333)', true, 'tile');
        const el = document.getElementById('desktop');
        expect(el.style.backgroundImage).not.toContain('url(');
        expect(el.style.background).toContain('linear-gradient');
    });
});
