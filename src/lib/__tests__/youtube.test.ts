import { youtubeId, youtubeEmbedUrl, youtubeThumb } from '@/lib/youtube';

describe('youtube', () => {
  it('extracts id from watch, youtu.be, embed, shorts', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=abc123DEF45')).toBe('abc123DEF45');
    expect(youtubeId('https://youtu.be/abc123DEF45')).toBe('abc123DEF45');
    expect(youtubeId('https://www.youtube.com/embed/abc123DEF45')).toBe('abc123DEF45');
    expect(youtubeId('https://www.youtube.com/shorts/abc123DEF45')).toBe('abc123DEF45');
    expect(youtubeId('https://youtube.com/watch?v=abc123DEF45&t=30s')).toBe('abc123DEF45');
  });
  it('returns null for non-youtube / garbage', () => {
    expect(youtubeId('https://vimeo.com/123')).toBeNull();
    expect(youtubeId('')).toBeNull();
    expect(youtubeId(null)).toBeNull();
  });
  it('builds embed + thumb from a url or id', () => {
    expect(youtubeEmbedUrl('https://youtu.be/abc123DEF45')).toBe('https://www.youtube-nocookie.com/embed/abc123DEF45');
    expect(youtubeEmbedUrl('abc123DEF45')).toBe('https://www.youtube-nocookie.com/embed/abc123DEF45');
    expect(youtubeThumb('abc123DEF45')).toBe('https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg');
    expect(youtubeThumb('https://vimeo.com/123')).toBeNull();
    expect(youtubeThumb('short')).toBeNull();
  });
});
