// Customer side of the live chat. All access goes through three database functions; the secret token
// never leaves this device except inside those calls (the database keeps only its SHA-256).
import { rpc } from './api';

export interface ChatMsg {
  id: string;
  cid: string | null;
  sender: 'customer' | 'admin' | 'system';
  kind: 'welcome' | 'offline' | null;
  body: string;
  created_at: string;
}
export interface ChatStatus { enabled: boolean; online: boolean; welcome_message: string; offline_message: string }
export interface ChatState { not_found?: boolean; status: 'open' | 'resolved' | 'archived'; unread: number; messages: ChatMsg[]; online: boolean; enabled: boolean }

export const chatStatus = () => rpc<ChatStatus>('chat_status', {}, 10000);
export const chatFetch = (conversation_id: string, token: string, mark_read: boolean) =>
  rpc<ChatState>('chat_fetch', { p: { conversation_id, token, mark_read } }, 10000);
export const chatSend = (a: { conversation_id: string; token: string; body: string; client_id: string; name?: string }) =>
  rpc<ChatState>('chat_send', { p: a }, 15000);

const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
export const newChatSecrets = () => ({ conversation_id: crypto.randomUUID(), token: hex(32) });
export const newClientId = () => crypto.randomUUID();
