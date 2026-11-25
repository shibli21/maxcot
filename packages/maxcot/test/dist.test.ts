import { describe, expect, it } from 'vitest';

// The published entry points (dist) expose the same API as the sources.
describe('dist', () => {
  it('exports every subpath', async () => {
    const core = await import('../dist/index.js');
    const skins = await import('../dist/skins/index.js');
    const film = await import('../dist/film/index.js');
    const score = await import('../dist/score/index.js');
    const voice = await import('../dist/voice/index.js');
    const sound = await import('../dist/sound/index.js');
    expect(typeof core.createCharacter).toBe('function');
    expect(typeof core.Character).toBe('function');
    expect(skins.allSkins).toHaveLength(42);
    expect(typeof film.Player).toBe('function');
    expect(new score.Conductor({ bpm: 60 }).timeOf([2, 1])).toBe(4);
    expect(typeof voice.Voice).toBe('function');
    expect(sound.sfx('ding').length).toBeGreaterThan(1000);
    expect(voice.lipTrack(voice.babble({ seconds: 0.5 }), 22050, 30)).toHaveLength(15);
  });
});
