/**
 * Shared library modules for the ITOM Chat UI.
 *
 * Import from "@/lib" to access:
 *   import { apiClient, ApiError } from "@/lib";
 *   import { auth, signIn, signOut } from "@/lib";
 */

export { apiClient, ApiError } from './api';
export {
  getHealth,
  listConversations,
  getConversation,
  createConversation,
  deleteConversation,
  sendMessage,
  getMessages,
  listAgents,
  getAgent,
} from './api';
export { auth, signIn, signOut, authConfig } from './auth';
