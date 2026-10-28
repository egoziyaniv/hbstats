import {
  classifyTelegramLink,
  cleanTelegramText,
  dedupeTelegramMessages,
  splitTelegramKicker,
  telegramBodyText,
  type TelegramChannelMessage,
} from '@/lib/telegram';

describe('cleanTelegramText', () => {
  it('drops the channel promo footer on its own lines', () => {
    const raw = 'גורמים באופ״א מוסרים לנו כי מדובר במדינה ידידותית לישראל.\n\nוסרמיליה בטלגרם 🚩\nhttps://t.me/vasermilya';
    expect(cleanTelegramText(raw)).toBe('גורמים באופ״א מוסרים לנו כי מדובר במדינה ידידותית לישראל.');
  });

  it('drops a footer flattened onto the last line, and Telegram placeholders', () => {
    const raw = 'נעשים מאמצים לסגור את הנושא.   וסרמיליה בטלגרם 🚩 https://t.me/vasermilya\nPlease open Telegram to view this post\nVIEW IN TELEGRAM';
    expect(cleanTelegramText(raw)).toBe('נעשים מאמצים לסגור את הנושא.');
  });

  it('keeps a trailing link that is the content', () => {
    const raw = 'המחווה של רן קוז׳וך ♥️\n\nhttps://www.instagram.com/reel/DfDN89qNUx4/?cplk=x';
    expect(cleanTelegramText(raw)).toBe(raw);
  });
});

describe('telegramBodyText', () => {
  it('removes URLs and the line that only introduced one', () => {
    const text = 'פודקאסט חדש!\n\n🎥 לצפייה ביוטיוב:\nhttps://youtu.be/YJkP_QUtWYU';
    expect(telegramBodyText(text)).toBe('פודקאסט חדש!');
  });
});

describe('splitTelegramKicker', () => {
  it('lifts a one-word topic line', () => {
    expect(splitTelegramKicker('כדורגל\nהפועל באר-שבע עלתה שלב.')).toEqual({ kicker: 'כדורגל', body: 'הפועל באר-שבע עלתה שלב.' });
  });

  it('leaves a real first line alone', () => {
    const body = 'מחר 🔥\nהגרלת סיבוב ח׳ של גביע המדינה 🏆';
    expect(splitTelegramKicker(body)).toEqual({ kicker: null, body });
  });
});

describe('classifyTelegramLink', () => {
  it.each([
    ['https://www.instagram.com/reel/DfD/?x=1', 'סרטון באינסטגרם', 'video'],
    ['https://youtu.be/abc', 'סרטון ביוטיוב', 'video'],
    ['https://open.spotify.com/episode/208', 'פודקאסט בספוטיפיי', 'audio'],
    ['https://www.one.co.il/Article/1', 'one.co.il', 'article'],
  ])('%s', (url, label, kind) => {
    expect(classifyTelegramLink(url)).toEqual({ label, kind });
  });
});

describe('dedupeTelegramMessages', () => {
  const msg = (id: string, body: string, extra: Partial<TelegramChannelMessage> = {}): TelegramChannelMessage => ({
    id, text: body, body, kicker: null, links: [], hasVideo: false, url: `https://t.me/v/${id}`,
    publishedAt: new Date(`2026-10-28T20:0${id.slice(-1)}:00Z`), sourceSlug: 'v', sourceLabel: 'V', teamLabel: '', ...extra,
  });

  it('keeps the copy of a reposted text that carries the video', () => {
    const out = dedupeTelegramMessages([
      msg('1', 'מדובר במדינה ידידותית.\nנעשים מאמצים.'),
      msg('4', 'מדובר במדינה ידידותית. נעשים מאמצים.', { hasVideo: true }),
      msg('2', 'משהו אחר'),
    ]);
    expect(out.map((m) => m.id).sort()).toEqual(['2', '4']);
  });
});
