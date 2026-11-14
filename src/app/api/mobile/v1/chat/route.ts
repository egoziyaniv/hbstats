// The app's chat: the same handler as the site's /api/ai/chat — getRequestUser accepts the app's bearer token.
export { POST } from '@/app/api/ai/chat/route';

export const dynamic = 'force-dynamic';
