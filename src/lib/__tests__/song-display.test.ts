import { SONG_TYPE_HE, slugifySong } from '@/lib/song-display';

describe('song-display', () => {
  it('labels each type in Hebrew', () => {
    expect(SONG_TYPE_HE.STAND).toBe('שיר יציע');
    expect(SONG_TYPE_HE.PLAYER).toBe('שיר שחקן');
    expect(SONG_TYPE_HE.CHAMPIONSHIP).toBe('שיר אליפות');
  });
  it('slugifies Hebrew titles to url-safe hyphenated tokens', () => {
    expect(slugifySong('אין כמו באר שבע')).toBe('אין-כמו-באר-שבע');
    expect(slugifySong('  שיר   האליפות!  ')).toBe('שיר-האליפות');
    expect(slugifySong('Volare - סלים טועמה')).toBe('volare-סלים-טועמה');
  });
});
