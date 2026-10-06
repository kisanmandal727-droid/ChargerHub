import db from '../db/firestore.js';
import { randomUUID } from 'node:crypto';

const ticketReference = (id) => `CH-${String(id).padStart(6, '0')}`;
const ticketDocument = (id) => db.collection('support_tickets').doc(String(Number(id)));

const normalizeMessages = (entries, allowedRoles, limit = 20) => {
  if (!Array.isArray(entries)) return [];
  return entries.slice(-limit).flatMap((entry) => {
    const role = allowedRoles.includes(entry?.role) ? entry.role : null;
    const text = typeof entry?.text === 'string' ? entry.text.trim().slice(0, 1500) : '';
    return role && text ? [{ role, text }] : [];
  });
};

const addMessages = async (ticketId, entries, changes = {}) => {
  const parent = ticketDocument(ticketId);
  const batch = db.store().batch();
  const messages = entries.map((entry, index) => {
    const ref = parent.collection('messages').doc();
    const message = {
      id: ref.id,
      role: entry.role,
      sender_name: entry.sender_name || '',
      text: entry.text,
      created_at: new Date(Date.now() + index).toISOString()
    };
    batch.set(ref, message);
    return message;
  });

  const lastMessage = messages[messages.length - 1];
  batch.set(parent, {
    ...changes,
    ...(lastMessage ? {
      last_message: lastMessage.text,
      last_message_role: lastMessage.role,
      last_message_at: lastMessage.created_at
    } : {}),
    updated_at: messages[messages.length - 1]?.created_at || new Date().toISOString()
  }, { merge: true });

  await batch.commit();
  return messages;
};

const getMessages = async (ticket) => {
  const snapshot = await ticketDocument(ticket.id).collection('messages').orderBy('created_at', 'asc').get();
  if (!snapshot.empty) return snapshot.docs.map((item) => item.data());

  // Keep conversations created by the previous support-ticket version readable.
  const context = Array.isArray(ticket.conversation)
    ? ticket.conversation.flatMap((entry, index) => {
      const role = ['user', 'assistant', 'admin'].includes(entry?.role) ? entry.role : null;
      const text = typeof entry?.text === 'string' ? entry.text : '';
      return role && text ? [{ id: `legacy-${ticket.id}-${index}`, role, text, created_at: ticket.created_at }] : [];
    })
    : [];
  if (ticket.message) context.push({ id: `legacy-ticket-${ticket.id}`, role: 'user', text: ticket.message, created_at: ticket.created_at });
  return context;
};

const withMessages = async (ticket) => ({
  ...ticket,
  reference: ticketReference(ticket.id),
  messages: await getMessages(ticket)
});

const getOwnedTicket = async (req, res) => {
  const ticket = await db.get('support_tickets', req.params.id);
  if (!ticket) {
    res.status(404).json({ error: 'Chat not found.' });
    return null;
  }
  if (String(ticket.user_id) !== String(req.user.id)) {
    res.status(403).json({ error: 'You do not have access to this chat.' });
    return null;
  }
  return ticket;
};

const deleteTicketAndMessages = async (id) => {
  const messages = ticketDocument(id).collection('messages');
  while (true) {
    const snapshot = await messages.limit(400).get();
    if (snapshot.empty) break;
    const batch = db.store().batch();
    snapshot.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
  return db.delete('support_tickets', id);
};

export const createChat = async (req, res) => {
  try {
    const messages = normalizeMessages(req.body?.messages, ['user', 'assistant'], 20);
    const firstUserMessage = messages.find((entry) => entry.role === 'user');
    if (!firstUserMessage) return res.status(400).json({ error: 'Start the chat with a message.' });

    const ticket = await db.create('support_tickets', {
      user_id: req.user.id,
      user_name: req.user.name || 'ChargerHub user',
      user_email: req.user.email || '',
      message: firstUserMessage.text,
      conversation: [],
      chat_type: 'assistant',
      admin_requested: false,
      status: 'open'
    });
    await addMessages(ticket.id, messages.map((entry) => ({ ...entry, sender_name: entry.role === 'user' ? (req.user.name || 'User') : 'ChargerHub Assistant' })));

    return res.status(201).json({ ticket: await withMessages(ticket) });
  } catch (err) {
    const reference = `SUP-${randomUUID().slice(0, 8).toUpperCase()}`;
    console.error(`Create support chat error [${reference}]:`, err);
    return res.status(500).json({ reference, error: 'Could not save this chat. Please try again.' });
  }
};

export const listUserChats = async (req, res) => {
  try {
    const chats = (await db.where('support_tickets', 'user_id', req.user.id))
      .sort((a, b) => String(b.last_message_at || b.created_at).localeCompare(String(a.last_message_at || a.created_at)))
      .slice(0, 100)
      .map((ticket) => ({
        id: ticket.id,
        reference: ticketReference(ticket.id),
        title: String(ticket.message || 'ChargerHub help').slice(0, 80),
        last_message: ticket.last_message || ticket.message || '',
        last_message_at: ticket.last_message_at || ticket.created_at,
        status: ticket.status || 'open',
        admin_requested: Boolean(ticket.admin_requested || ticket.chat_type === 'support' || !ticket.chat_type),
        created_at: ticket.created_at
      }));
    return res.json({ chats });
  } catch (err) {
    console.error('List user support chats error:', err);
    return res.status(500).json({ error: 'Could not load your saved chats.' });
  }
};

export const getUserChat = async (req, res) => {
  try {
    const ticket = await getOwnedTicket(req, res);
    if (!ticket) return;
    return res.json({ ticket: await withMessages(ticket) });
  } catch (err) {
    console.error('Get user support chat error:', err);
    return res.status(500).json({ error: 'Could not load this chat.' });
  }
};

export const addUserMessages = async (req, res) => {
  try {
    const ticket = await getOwnedTicket(req, res);
    if (!ticket) return;
    const messages = normalizeMessages(req.body?.messages, ['user', 'assistant'], 20);
    if (!messages.length) return res.status(400).json({ error: 'Enter a message before sending.' });
    const changes = ticket.admin_requested ? { status: 'open' } : {};
    await addMessages(ticket.id, messages.map((entry) => ({
      ...entry,
      sender_name: entry.role === 'user' ? (req.user.name || 'User') : 'ChargerHub Assistant'
    })), changes);
    const updated = await db.get('support_tickets', ticket.id);
    return res.json({ ticket: await withMessages(updated) });
  } catch (err) {
    console.error('Save user support chat messages error:', err);
    return res.status(500).json({ error: 'Could not save your message. Please try again.' });
  }
};

export const escalateChat = async (req, res) => {
  try {
    const ticket = await getOwnedTicket(req, res);
    if (!ticket) return;
    const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 1500) : '';
    const transcript = await getMessages(ticket);
    const lastUserMessage = [...transcript].reverse().find((entry) => entry.role === 'user')?.text;
    const additions = message && message !== lastUserMessage
      ? [{ role: 'user', sender_name: req.user.name || 'User', text: message }]
      : [];
    await addMessages(ticket.id, additions, { admin_requested: true, status: 'open' });
    const updated = await db.get('support_tickets', ticket.id);
    return res.json({ ticket: await withMessages(updated) });
  } catch (err) {
    console.error('Escalate support chat error:', err);
    return res.status(500).json({ error: 'Could not send this chat to the admin.' });
  }
};

export const deleteUserChat = async (req, res) => {
  try {
    const ticket = await getOwnedTicket(req, res);
    if (!ticket) return;
    await deleteTicketAndMessages(ticket.id);
    return res.json({ success: true });
  } catch (err) {
    console.error('Delete user support chat error:', err);
    return res.status(500).json({ error: 'Could not delete this chat.' });
  }
};

// Legacy endpoint retained for older app builds that still create support tickets directly.
export const createTicket = async (req, res) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (message.length < 5) return res.status(400).json({ error: 'Please describe what you need help with.' });
    if (message.length > 1500) return res.status(400).json({ error: 'Please keep your support request under 1,500 characters.' });

    const conversation = Array.isArray(req.body?.conversation)
      ? req.body.conversation.slice(-8).flatMap((entry) => {
        const role = ['user', 'assistant'].includes(entry?.role) ? entry.role : null;
        const text = typeof entry?.text === 'string' ? entry.text.trim().slice(0, 1200) : '';
        return role && text ? [{ role, text }] : [];
      })
      : [];
    const ticket = await db.create('support_tickets', {
      user_id: req.user.id,
      user_name: req.user.name || 'ChargerHub user',
      user_email: req.user.email || '',
      message,
      conversation,
      chat_type: 'support',
      admin_requested: true,
      status: 'open'
    });
    await addMessages(ticket.id, [{ role: 'user', sender_name: req.user.name || 'User', text: message }]);
    return res.status(201).json({ ticket: await withMessages(ticket) });
  } catch (err) {
    const reference = `SUP-${randomUUID().slice(0, 8).toUpperCase()}`;
    console.error(`Create support ticket error [${reference}]:`, err);
    return res.status(500).json({ code: 'SUPPORT_TICKET_SAVE_FAILED', reference, error: 'We could not save your support request. Please try again.' });
  }
};

export const getTickets = async (_req, res) => {
  try {
    const tickets = (await db.list('support_tickets'))
      .filter((ticket) => ticket.admin_requested !== false)
      .sort((a, b) => String(b.last_message_at || b.created_at).localeCompare(String(a.last_message_at || a.created_at)))
      .slice(0, 100);
    return res.json({ tickets: await Promise.all(tickets.map(withMessages)) });
  } catch (err) {
    console.error('Get support tickets error:', err);
    return res.status(500).json({ error: 'Failed to load support requests.' });
  }
};

export const addAdminMessage = async (req, res) => {
  try {
    const ticket = await db.get('support_tickets', req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Chat not found.' });
    const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 1500) : '';
    if (!text) return res.status(400).json({ error: 'Write a reply before sending.' });
    await addMessages(ticket.id, [{ role: 'admin', sender_name: req.user.name || 'ChargerHub Admin', text }], { status: 'in_progress', handled_by: req.user.id, admin_requested: true });
    const updated = await db.get('support_tickets', ticket.id);
    return res.json({ ticket: await withMessages(updated) });
  } catch (err) {
    console.error('Save admin support reply error:', err);
    return res.status(500).json({ error: 'Could not save the admin reply.' });
  }
};

export const deleteAdminChat = async (req, res) => {
  try {
    const ticket = await db.get('support_tickets', req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Chat not found.' });
    await deleteTicketAndMessages(ticket.id);
    return res.json({ success: true });
  } catch (err) {
    console.error('Delete admin support chat error:', err);
    return res.status(500).json({ error: 'Could not delete this chat.' });
  }
};

export const updateTicketStatus = async (req, res) => {
  try {
    const status = String(req.body?.status || '').toLowerCase();
    if (!['open', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Choose Open, In progress, or Resolved.' });
    }
    const ticket = await db.update('support_tickets', req.params.id, { status, handled_by: req.user.id });
    if (!ticket) return res.status(404).json({ error: 'Support request not found.' });
    return res.json({ ticket: await withMessages(ticket) });
  } catch (err) {
    console.error('Update support ticket error:', err);
    return res.status(500).json({ error: 'Could not update this support request.' });
  }
};
