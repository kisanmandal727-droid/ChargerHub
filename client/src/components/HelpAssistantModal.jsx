import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Headphones, List, Mic, MicOff, Plus, Send, Trash2, Volume2, X, MessageCircle } from 'lucide-react';
import { answerAppHelp, helpSuggestions } from './helpKnowledge.js';
import { api } from '../api/client.js';

const welcomeMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Hi! Ask me anything about ChargerHub. I can explain the app’s features, guide you through a screen, and help troubleshoot common errors. You can type or use your microphone.'
};

const makeMessage = (role, text) => ({ id: `${Date.now()}-${Math.random()}`, role, text });

export default function HelpAssistantModal({ onClose }) {
  const [messages, setMessages] = useState([welcomeMessage]);
  const [chatId, setChatId] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isAdminChat, setIsAdminChat] = useState(false);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [notice, setNotice] = useState('');
  const [showEscalationForm, setShowEscalationForm] = useState(false);
  const [escalationMessage, setEscalationMessage] = useState('');
  const [sendingEscalation, setSendingEscalation] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [escalationError, setEscalationError] = useState('');
  const [loadingChatId, setLoadingChatId] = useState(null);
  const [deletingChatId, setDeletingChatId] = useState(null);
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);

  const refreshChatHistory = useCallback(async () => {
    const result = await api.get('/support/chats');
    setChatHistory(result.chats || []);
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(Boolean(SpeechRecognition));
    refreshChatHistory().catch((error) => setNotice(error.message || 'Saved chats could not be loaded. Check that the local API is running.'));
  }, [refreshChatHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, showHistory]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    if (!chatId || !isAdminChat || showHistory) return undefined;
    let active = true;
    const refreshConversation = async () => {
      try {
        const result = await api.get(`/support/chats/${chatId}`);
        if (active && result.ticket?.messages) setMessages(result.ticket.messages);
      } catch {
        // Keep the open transcript visible while the user is temporarily offline.
      }
    };
    const timer = window.setInterval(refreshConversation, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [chatId, isAdminChat, showHistory]);

  const startNewChat = () => {
    setChatId(null);
    setMessages([welcomeMessage]);
    setIsAdminChat(false);
    setShowHistory(false);
    setShowEscalationForm(false);
    setInput('');
    setNotice('');
    setEscalationError('');
  };

  const openSavedChat = async (id) => {
    setLoadingChatId(id);
    setNotice('');
    try {
      const result = await api.get(`/support/chats/${id}`);
      setChatId(result.ticket.id);
      setMessages(result.ticket.messages?.length ? result.ticket.messages : [welcomeMessage]);
      setIsAdminChat(Boolean(result.ticket.admin_requested || result.ticket.chat_type === 'support' || !result.ticket.chat_type));
      setShowHistory(false);
      setShowEscalationForm(false);
      setInput('');
    } catch (error) {
      setNotice(error.message || 'Could not open this saved chat.');
    } finally {
      setLoadingChatId(null);
    }
  };

  const deleteSavedChat = async (id) => {
    if (!window.confirm('Delete this chat and its saved messages? This cannot be undone.')) return;
    setDeletingChatId(id);
    try {
      await api.delete(`/support/chats/${id}`);
      setChatHistory((current) => current.filter((chat) => chat.id !== id));
      if (String(chatId) === String(id)) startNewChat();
    } catch (error) {
      setNotice(error.message || 'Could not delete this chat.');
    } finally {
      setDeletingChatId(null);
    }
  };

  const ask = async (value, speakReply = false) => {
    const question = value.trim();
    if (!question || sendingMessage) return;
    const userMessage = makeMessage('user', question);
    setInput('');
    setNotice('');
    setShowHistory(false);
    setSendingMessage(true);

    if (isAdminChat && chatId) {
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      try {
        const result = await api.post(`/support/chats/${chatId}/messages`, { messages: [{ role: 'user', text: question }] });
        setMessages(result.ticket.messages || nextMessages);
        await refreshChatHistory();
      } catch (error) {
        setNotice(error.message || 'Could not send your message. Please try again.');
      } finally {
        setSendingMessage(false);
      }
      return;
    }

    const answer = answerAppHelp(question);
    const assistantMessage = makeMessage('assistant', answer);
    const nextMessages = [...messages, userMessage, assistantMessage];
    setMessages(nextMessages);

    try {
      const payload = nextMessages
        .filter((message) => message.id !== 'welcome' && ['user', 'assistant'].includes(message.role))
        .map(({ role, text }) => ({ role, text }));
      const result = chatId
        ? await api.post(`/support/chats/${chatId}/messages`, { messages: [{ role: 'user', text: question }, { role: 'assistant', text: answer }] })
        : await api.post('/support/chats', { messages: payload });
      if (!chatId) setChatId(result.ticket.id);
      setMessages(result.ticket.messages || nextMessages);
      refreshChatHistory().catch(() => {});
    } catch (error) {
      setNotice(`This chat could not be saved. Your messages are still visible here. ${error.message || 'Check that the local API is running.'}`);
    } finally {
      setSendingMessage(false);
    }

    if (speakReply && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(answer);
      utterance.lang = 'en-IN';
      window.speechSynthesis.speak(utterance);
    }
  };

  const openEscalationForm = () => {
    const lastQuestion = [...messages].reverse().find((message) => message.role === 'user')?.text || '';
    setEscalationMessage(lastQuestion);
    setEscalationError('');
    setShowEscalationForm(true);
  };

  const submitEscalation = async (event) => {
    event.preventDefault();
    if (escalationMessage.trim().length < 5 || sendingEscalation) return;
    setSendingEscalation(true);
    setEscalationError('');
    try {
      let activeId = chatId;
      if (!activeId) {
        const transcript = messages
          .filter((message) => message.id !== 'welcome' && ['user', 'assistant'].includes(message.role))
          .map(({ role, text }) => ({ role, text }));
        const seedMessages = transcript.length ? transcript : [{ role: 'user', text: escalationMessage.trim() }];
        const created = await api.post('/support/chats', { messages: seedMessages });
        activeId = created.ticket.id;
        setChatId(activeId);
      }
      const result = await api.post(`/support/chats/${activeId}/escalate`, { message: escalationMessage.trim() });
      setMessages(result.ticket.messages || messages);
      setIsAdminChat(true);
      setShowEscalationForm(false);
      setInput('');
      refreshChatHistory().catch(() => {});
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        setEscalationError('Your sign-in has expired. Sign out, sign in again, then send your request.');
      } else if (error.status === 404) {
        setEscalationError('Chat support is not available on the current local API. Start the updated server, then try again.');
      } else if (error.status >= 500) {
        const reference = error.data?.reference;
        setEscalationError(reference
          ? `The server could not save your request. Please share reference ${reference} with the administrator.`
          : 'The server could not save your request. Please try again in a moment.');
      } else if (!error.status) {
        setEscalationError(error.message || 'Could not reach ChargerHub. Check your connection and try again.');
      } else {
        setEscalationError(error.data?.error || 'Please check your request and try again.');
      }
    } finally {
      setSendingEscalation(false);
    }
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice('Voice input is not available in this browser. You can type your question below.');
      return;
    }
    window.speechSynthesis?.cancel();
    recognitionRef.current?.abort();
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { setListening(true); setNotice('Listening…'); };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript) ask(transcript, true);
      else setNotice('I did not catch that. Please try again or type your question.');
    };
    recognition.onerror = (event) => {
      setListening(false);
      setNotice(event.error === 'not-allowed'
        ? 'Microphone access is blocked. Allow microphone access in your browser settings, or type your question.'
        : 'Voice input stopped. Please try again or type your question.');
    };
    recognition.onend = () => setListening(false);
    try { recognition.start(); } catch {
      setListening(false);
      setNotice('Could not start the microphone. Please try again or type your question.');
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
    setNotice('Voice input stopped.');
  };

  const speak = (text) => {
    if (!window.speechSynthesis) {
      setNotice('Spoken replies are not available in this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    window.speechSynthesis.speak(utterance);
  };

  const sendInput = async (event) => {
    event.preventDefault();
    await ask(input);
  };

  return (
    <div role="presentation" onClick={(event) => event.target === event.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 2200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(14, 19, 38, 0.65)', backdropFilter: 'blur(4px)' }}>
      <section role="dialog" aria-modal="true" aria-labelledby="help-assistant-title" style={{ width: 'min(100%, 480px)', height: 'min(700px, 92dvh)', minHeight: '420px', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F8FAFC', borderRadius: '24px', boxShadow: '0 24px 80px rgba(0,0,0,0.28)' }}>
        <header style={{ padding: '18px 20px', color: '#FFFFFF', background: 'linear-gradient(135deg, #151C38, #087E63)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', flexShrink: 0, borderRadius: '14px', display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.16)' }}><Headphones size={22} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="help-assistant-title" style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>{showHistory ? 'Saved Chats' : 'ChargerHub Help'}</h2>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>{showHistory ? 'Your conversations are saved to your account' : isAdminChat ? 'Chat with ChargerHub support' : 'App-wide voice and chat help'}</p>
          </div>
          <button type="button" onClick={() => { setShowHistory((value) => !value); setShowEscalationForm(false); }} aria-label={showHistory ? 'Back to chat' : 'Show saved chats'} title={showHistory ? 'Back to chat' : 'Saved chats'} style={iconButtonStyle}>
            {showHistory ? <ArrowLeft size={19} /> : <List size={19} />}
          </button>
          <button type="button" onClick={startNewChat} aria-label="Start a new chat" title="New chat" style={iconButtonStyle}><Plus size={20} /></button>
          <button type="button" onClick={onClose} aria-label="Close help assistant" style={iconButtonStyle}><X size={20} /></button>
        </header>

        <div aria-live="polite" style={{ flex: 1, overflowY: 'auto', padding: '18px 16px 12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {showHistory ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div><strong style={{ color: '#151C38', fontSize: '14px' }}>Your conversations</strong><p style={{ color: '#64748B', fontSize: '11px', marginTop: '3px' }}>Open a chat to continue it, or delete it from your history.</p></div>
                <button type="button" onClick={startNewChat} style={suggestionStyle}><Plus size={14} /> New</button>
              </div>
              {chatHistory.length === 0 ? <p style={{ color: '#64748B', fontSize: '13px' }}>Your saved chats will appear here after you send a message.</p> : chatHistory.map((chat) => (
                <article key={chat.id} style={{ display: 'flex', gap: '8px', padding: '10px', borderRadius: '14px', border: '1px solid #E2E8F0', background: '#FFFFFF' }}>
                  <button type="button" disabled={loadingChatId === chat.id} onClick={() => openSavedChat(chat.id)} style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', padding: '2px' }}>
                    <strong style={{ display: 'block', color: '#151C38', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.title || 'ChargerHub help chat'}</strong>
                    <span style={{ display: 'block', color: '#64748B', fontSize: '11px', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.last_message || 'No messages yet'}</span>
                    <span style={{ display: 'block', color: chat.admin_requested ? '#087E63' : '#94A3B8', fontSize: '10px', fontWeight: 700, marginTop: '5px' }}>{chat.admin_requested ? 'Admin support chat' : 'Saved help chat'} · {chat.last_message_at ? new Date(chat.last_message_at).toLocaleString() : ''}</span>
                  </button>
                  <button type="button" disabled={deletingChatId === chat.id} onClick={() => deleteSavedChat(chat.id)} aria-label="Delete chat" title="Delete chat" style={{ ...iconButtonStyle, color: '#B91C1C', background: '#FEF2F2', alignSelf: 'center' }}><Trash2 size={17} /></button>
                </article>
              ))}
            </>
          ) : (
            <>
              {isAdminChat && <div style={{ alignSelf: 'center', borderRadius: '999px', padding: '6px 10px', color: '#047857', background: '#DCFCE7', fontSize: '11px', fontWeight: 800 }}>Admin support · messages are saved</div>}
              {messages.map((message) => {
                const fromUser = message.role === 'user';
                return <div key={message.id} style={{ alignSelf: fromUser ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
                  {message.role === 'admin' && <div style={{ color: '#087E63', fontSize: '10px', fontWeight: 800, margin: '0 0 4px 5px' }}>{message.sender_name || 'ChargerHub Admin'}</div>}
                  <div style={{ padding: '12px 14px', borderRadius: fromUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: fromUser ? '#0B8F70' : '#FFFFFF', color: fromUser ? '#FFFFFF' : '#25304A', border: fromUser ? 'none' : '1px solid #E7ECF2', boxShadow: '0 2px 8px rgba(21,28,56,0.04)', fontSize: '14px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{message.text}</div>
                  {(message.role === 'assistant' || message.role === 'admin') && <button type="button" onClick={() => speak(message.text)} style={{ ...plainButtonStyle, margin: '5px 0 0 4px', color: '#64748B' }} aria-label="Read reply aloud"><Volume2 size={15} /> <span>Read aloud</span></button>}
                </div>;
              })}
              {!isAdminChat && messages.length === 1 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>{helpSuggestions.map((question) => <button key={question} type="button" disabled={sendingMessage} onClick={() => ask(question)} style={suggestionStyle}>{question}</button>)}</div>}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {notice && <p role="status" style={{ margin: 0, padding: '0 16px 8px', color: '#64748B', fontSize: '12px' }}>{notice}</p>}
        <div style={{ padding: '12px 14px 14px', background: '#FFFFFF', borderTop: '1px solid #E7ECF2' }}>
          {showHistory ? (
            <button type="button" onClick={startNewChat} className="btn-primary" style={{ width: '100%', background: '#087E63' }}><Plus size={16} /> Start a new chat</button>
          ) : showEscalationForm ? (
            <form onSubmit={submitEscalation} style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><strong style={{ color: '#151C38', fontSize: '14px' }}>Start a chat with the admin</strong><button type="button" onClick={() => { setShowEscalationForm(false); setEscalationError(''); }} style={plainButtonStyle}>Cancel</button></div>
              <p style={{ color: '#64748B', fontSize: '11px', lineHeight: 1.4 }}>Your chat is saved to your account. When you send it to the admin, they can read this conversation and reply here. Don’t include passwords, OTPs, or card details.</p>
              <textarea value={escalationMessage} onChange={(event) => setEscalationMessage(event.target.value)} maxLength={1500} rows={3} required minLength={5} placeholder="Describe what you need help with…" aria-label="Describe your support request" style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid #DDE4EC', borderRadius: '12px', outline: 'none', fontSize: '13px', color: '#151C38', background: '#F8FAFC' }} />
              {escalationError && <p role="alert" style={{ color: '#B91C1C', fontSize: '12px' }}>{escalationError}</p>}
              <button type="submit" disabled={sendingEscalation || escalationMessage.trim().length < 5} className="btn-primary" style={{ background: '#087E63', opacity: sendingEscalation ? 0.7 : 1 }}>{sendingEscalation ? 'Sending…' : 'Send to Admin'}</button>
            </form>
          ) : (
            <>
              <form onSubmit={sendInput} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {!isAdminChat && <button type="button" onClick={listening ? stopListening : startListening} aria-label={listening ? 'Stop listening' : 'Ask by voice'} title={voiceSupported ? 'Ask by voice' : 'Voice input may not be supported in this browser'} style={{ ...actionButtonStyle, background: listening ? '#FEE2E2' : '#EAF7F2', color: listening ? '#B91C1C' : '#087E63' }}>{listening ? <MicOff size={19} /> : <Mic size={19} />}</button>}
                <input value={input} onChange={(event) => setInput(event.target.value)} placeholder={isAdminChat ? 'Write a message to the admin…' : 'Ask anything about ChargerHub…'} aria-label={isAdminChat ? 'Message the admin' : 'Type a help question'} style={{ flex: 1, minWidth: 0, height: '46px', padding: '0 14px', border: '1px solid #DDE4EC', borderRadius: '14px', outline: 'none', fontSize: '14px', color: '#151C38', background: '#F8FAFC' }} />
                <button type="submit" disabled={!input.trim() || sendingMessage} aria-label="Send message" style={{ ...actionButtonStyle, background: input.trim() && !sendingMessage ? '#0B8F70' : '#CBD5E1', color: '#FFFFFF', cursor: input.trim() && !sendingMessage ? 'pointer' : 'not-allowed' }}>{sendingMessage ? <span style={{ fontSize: '11px' }}>…</span> : <Send size={18} />}</button>
              </form>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '9px' }}>
                <p style={{ color: '#94A3B8', fontSize: '11px', lineHeight: 1.4 }}>{isAdminChat ? 'Replies are saved here. This chat refreshes automatically.' : 'Chats are saved to your account. Voice recognition depends on your browser.'}</p>
                {!isAdminChat && <button type="button" onClick={openEscalationForm} style={{ ...plainButtonStyle, flexShrink: 0, color: '#087E63', fontWeight: 800 }}><MessageCircle size={14} /> Talk to Admin</button>}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

const iconButtonStyle = {
  display: 'grid', placeItems: 'center', flexShrink: 0, width: '36px', height: '36px', border: 'none', borderRadius: '50%',
  color: '#FFFFFF', background: 'rgba(255,255,255,0.16)', cursor: 'pointer'
};

const actionButtonStyle = {
  flexShrink: 0, display: 'grid', placeItems: 'center', width: '44px', height: '44px', border: 'none', borderRadius: '14px', cursor: 'pointer'
};

const plainButtonStyle = {
  display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 4px', border: 'none', background: 'transparent',
  fontSize: '11px', cursor: 'pointer'
};

const suggestionStyle = {
  display: 'inline-flex', alignItems: 'center', gap: '5px', border: '1px solid #D7E9E2', background: '#FFFFFF', color: '#087E63', borderRadius: '999px', padding: '8px 11px',
  fontSize: '12px', fontWeight: 700, textAlign: 'left', cursor: 'pointer'
};
