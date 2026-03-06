import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { doc, updateDoc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { MessageCircle, X, Send, ChevronRight } from 'lucide-react';
import { functions, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { updateRanks } from '../hooks/useSchools';

const chatFn = httpsCallable(functions, 'chatWithClaire', { timeout: 120000 });

// ─── Markdown-lite renderer ───────────────────────────────────────────────────

function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Bullet list
    if (line.match(/^[-*]\s/)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^[-*]\s/)) {
        items.push(lines[i].replace(/^[-*]\s/, ''));
        i++;
      }
      elements.push(
        <ul key={i} style={{ margin: '0.4rem 0', paddingLeft: '1.25rem', listStyleType: 'disc' }}>
          {items.map((item, j) => (
            <li key={j} style={{ marginBottom: '0.2rem', color: 'rgba(245,240,232,0.85)', fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', lineHeight: 1.5 }}>
              {inlineFormat(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (line.match(/^\d+\.\s/)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={i} style={{ margin: '0.4rem 0', paddingLeft: '1.25rem' }}>
          {items.map((item, j) => (
            <li key={j} style={{ marginBottom: '0.2rem', color: 'rgba(245,240,232,0.85)', fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', lineHeight: 1.5 }}>
              {inlineFormat(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Heading
    if (line.startsWith('### ')) {
      elements.push(
        <p key={i} style={{ margin: '0.6rem 0 0.2rem', fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', fontWeight: 700, color: '#f5f0e8' }}>
          {line.slice(4)}
        </p>
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <p key={i} style={{ margin: '0.6rem 0 0.2rem', fontFamily: "'DM Sans', sans-serif", fontSize: '0.95rem', fontWeight: 700, color: '#f5f0e8' }}>
          {line.slice(3)}
        </p>
      );
      i++;
      continue;
    }

    // Table row detection (| col | col |)
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const trimmed = lines[i].trim();
        if (!trimmed.match(/^\|[-:| ]+\|$/)) {
          rows.push(trimmed.split('|').filter(Boolean).map((c) => c.trim()));
        }
        i++;
      }
      if (rows.length > 0) {
        elements.push(
          <div key={i} style={{ overflowX: 'auto', margin: '0.5rem 0' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8rem', fontFamily: "'DM Sans', sans-serif" }}>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    {row.map((cell, ci) => {
                      const Tag = ri === 0 ? 'th' : 'td';
                      return (
                        <Tag key={ci} style={{
                          padding: '0.3rem 0.6rem',
                          color: ri === 0 ? 'rgba(245,240,232,0.5)' : 'rgba(245,240,232,0.85)',
                          fontWeight: ri === 0 ? 600 : 400,
                          textAlign: 'left',
                          whiteSpace: 'nowrap',
                        }}>
                          {inlineFormat(cell)}
                        </Tag>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Normal paragraph
    elements.push(
      <p key={i} style={{ margin: '0.3rem 0', color: 'rgba(245,240,232,0.85)', fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', lineHeight: 1.55 }}>
        {inlineFormat(line)}
      </p>
    );
    i++;
  }

  return elements;
}

function inlineFormat(text) {
  // **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: '#f5f0e8', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

// ─── TypingDots ───────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: '4px', padding: '4px 0', alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'rgba(245,240,232,0.4)',
          animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          display: 'inline-block',
        }} />
      ))}
    </div>
  );
}

// ─── SuggestUpdateCard ────────────────────────────────────────────────────────

function SuggestUpdateCard({ update, schoolName, onApply, onDismiss, applied, dismissed }) {
  if (dismissed) return null;
  return (
    <div style={{
      marginTop: '0.5rem', padding: '0.6rem 0.85rem',
      border: '1px solid rgba(232,151,107,0.35)',
      borderRadius: '8px', background: 'rgba(232,151,107,0.06)',
    }}>
      <p style={{ margin: '0 0 0.4rem', fontFamily: "'DM Sans', sans-serif", fontSize: '0.8rem', color: 'rgba(232,151,107,0.9)' }}>
        Update <strong>{update.field}</strong>{schoolName ? ` for ${schoolName}` : ''}?
      </p>
      <p style={{ margin: '0 0 0.5rem', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: 'rgba(245,240,232,0.6)' }}>
        → {update.newValue}
      </p>
      {applied ? (
        <p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: '0.8rem', color: '#6fcf97' }}>
          ✓ Updated!
        </p>
      ) : (
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button onClick={onApply} style={{
            padding: '0.25rem 0.65rem', background: '#E8976B', border: 'none',
            borderRadius: '5px', color: '#111', fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
          }}>
            Apply
          </button>
          <button onClick={onDismiss} style={{
            padding: '0.25rem 0.65rem', background: 'none',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: '5px',
            color: 'rgba(245,240,232,0.55)', fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.78rem', cursor: 'pointer',
          }}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// ─── SuggestRerankCard ────────────────────────────────────────────────────────

function SuggestRerankCard({ schoolIds, schools, onApply, onDismiss, applied, dismissed }) {
  if (dismissed) return null;
  const orderedSchools = schoolIds
    .map((id) => schools.find((s) => s.id === id))
    .filter(Boolean);

  return (
    <div style={{
      marginTop: '0.5rem', padding: '0.6rem 0.85rem',
      border: '1px solid rgba(111,207,151,0.3)',
      borderRadius: '8px', background: 'rgba(111,207,151,0.05)',
    }}>
      <p style={{ margin: '0 0 0.5rem', fontFamily: "'DM Sans', sans-serif", fontSize: '0.8rem', color: 'rgba(111,207,151,0.9)', fontWeight: 600 }}>
        Suggested ranking:
      </p>
      <ol style={{ margin: '0 0 0.6rem', paddingLeft: '1.2rem' }}>
        {orderedSchools.map((s, i) => (
          <li key={s.id} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8rem', color: 'rgba(245,240,232,0.75)', marginBottom: '0.15rem' }}>
            {s.name}
          </li>
        ))}
      </ol>
      {applied ? (
        <p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: '0.8rem', color: '#6fcf97' }}>✓ Ranking applied!</p>
      ) : (
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button onClick={onApply} style={{
            padding: '0.25rem 0.65rem', background: '#6fcf97', border: 'none',
            borderRadius: '5px', color: '#111', fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
          }}>
            Apply Ranking
          </button>
          <button onClick={onDismiss} style={{
            padding: '0.25rem 0.65rem', background: 'none',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: '5px',
            color: 'rgba(245,240,232,0.55)', fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.78rem', cursor: 'pointer',
          }}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, schools, onApplyUpdate, onDismissUpdate, onApplyRerank, onDismissRerank }) {
  const isUser = msg.role === 'user';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '0.85rem',
    }}>
      <div style={{
        maxWidth: '85%',
        padding: '0.6rem 0.85rem',
        background: isUser ? 'rgba(232,151,107,0.15)' : '#1A1A1A',
        borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
        border: isUser ? '1px solid rgba(232,151,107,0.25)' : '1px solid rgba(255,255,255,0.07)',
      }}>
        {isUser ? (
          <p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', color: '#f5f0e8', lineHeight: 1.5 }}>
            {msg.content}
          </p>
        ) : (
          <div>{renderMarkdown(msg.content)}</div>
        )}
      </div>

      {/* Suggested updates */}
      {!isUser && msg.suggestedUpdates?.map((upd, i) => {
        const school = schools.find((s) => s.id === upd.schoolId);
        return (
          <SuggestUpdateCard
            key={i}
            update={upd}
            schoolName={school?.name}
            applied={upd._applied}
            dismissed={upd._dismissed}
            onApply={() => onApplyUpdate(msg.id, i, upd, school)}
            onDismiss={() => onDismissUpdate(msg.id, i)}
          />
        );
      })}

      {/* Suggested rerank */}
      {!isUser && msg.suggestedRerank && (
        <SuggestRerankCard
          schoolIds={msg.suggestedRerank}
          schools={schools}
          applied={msg._rerankApplied}
          dismissed={msg._rerankDismissed}
          onApply={() => onApplyRerank(msg.id, msg.suggestedRerank)}
          onDismiss={() => onDismissRerank(msg.id)}
        />
      )}
    </div>
  );
}

// ─── Quick chips ──────────────────────────────────────────────────────────────

const QUICK_CHIPS = [
  'Compare my top schools',
  'Which school has the best nursing program?',
  'What are the pros and cons of each school?',
  'How far is each school from San Diego?',
];

// ─── ChatPanel ────────────────────────────────────────────────────────────────

export default function ChatPanel() {
  const { user } = useAuth();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [schools, setSchools] = useState([]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const hasShownPulse = useRef(false);
  const [showPulse, setShowPulse] = useState(true);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Extract current schoolId from URL
  const schoolMatch = location.pathname.match(/^\/school\/([^/]+)/);
  const currentSchoolId = schoolMatch ? schoolMatch[1] : null;
  const currentSchool = schools.find((s) => s.id === currentSchoolId);

  // Subscribe to schools
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'schools'), where('archived', '!=', true)),
      (snap) => {
        setSchools(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }))
            .filter((s) => s && s.name)
            .sort((a, b) => (a.rank || 99) - (b.rank || 99))
        );
      }
    );
    return unsub;
  }, []);

  // Stop pulse after 4s
  useEffect(() => {
    const t = setTimeout(() => setShowPulse(false), 4000);
    return () => clearTimeout(t);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg = { id: Date.now() + '-u', role: 'user', content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages.slice(-10).map(({ role, content }) => ({ role, content }));
      const result = await chatFn({
        message: msg,
        conversationHistory: history,
        schoolId: currentSchoolId || null,
      });

      const { response, suggestedUpdates = [], suggestedRerank = null } = result.data;
      const assistantMsg = {
        id: Date.now() + '-a',
        role: 'assistant',
        content: response,
        suggestedUpdates,
        suggestedRerank,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: Date.now() + '-err',
        role: 'assistant',
        content: `Sorry, something went wrong: ${err.message}`,
        suggestedUpdates: [],
        suggestedRerank: null,
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, currentSchoolId]);

  async function handleApplyUpdate(msgId, updateIdx, upd, school) {
    try {
      // Build the nested field path update object
      const fieldPath = upd.field; // e.g. "overview.enrollment.value"
      const parts = fieldPath.split('.');

      // We need to update both the value AND source fields
      // Use dot notation for Firestore updateDoc
      const updatePayload = {};
      if (parts.length >= 2) {
        // Field like "overview.enrollment.value" → also update overview.enrollment.source
        const parentPath = parts.slice(0, -1).join('.');
        updatePayload[fieldPath] = upd.newValue;
        if (upd.source) updatePayload[`${parentPath}.source`] = upd.source;
        if (upd.sourceUrl) updatePayload[`${parentPath}.sourceUrl`] = upd.sourceUrl;
      } else {
        updatePayload[fieldPath] = upd.newValue;
      }

      await updateDoc(doc(db, 'schools', upd.schoolId), updatePayload);

      setMessages((prev) => prev.map((m) => {
        if (m.id !== msgId) return m;
        const newUpdates = [...(m.suggestedUpdates || [])];
        newUpdates[updateIdx] = { ...newUpdates[updateIdx], _applied: true };
        return { ...m, suggestedUpdates: newUpdates };
      }));
    } catch (err) {
      console.error('Apply update failed:', err);
    }
  }

  function handleDismissUpdate(msgId, updateIdx) {
    setMessages((prev) => prev.map((m) => {
      if (m.id !== msgId) return m;
      const newUpdates = [...(m.suggestedUpdates || [])];
      newUpdates[updateIdx] = { ...newUpdates[updateIdx], _dismissed: true };
      return { ...m, suggestedUpdates: newUpdates };
    }));
  }

  async function handleApplyRerank(msgId, schoolIds) {
    try {
      // Build the reordered schools array using the suggested IDs
      const reordered = schoolIds
        .map((id) => schools.find((s) => s.id === id))
        .filter(Boolean);
      // Append any schools not in the suggestion to the end
      const remaining = schools.filter((s) => !schoolIds.includes(s.id));
      await updateRanks([...reordered, ...remaining]);

      setMessages((prev) => prev.map((m) =>
        m.id === msgId ? { ...m, _rerankApplied: true } : m
      ));
    } catch (err) {
      console.error('Apply rerank failed:', err);
    }
  }

  function handleDismissRerank(msgId) {
    setMessages((prev) => prev.map((m) =>
      m.id === msgId ? { ...m, _rerankDismissed: true } : m
    ));
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  if (!user) return null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open chat"
        style={{
          position: 'fixed',
          bottom: isMobile ? '16px' : '24px',
          right: isMobile ? '16px' : '24px',
          width: isMobile ? 48 : 56,
          height: isMobile ? 48 : 56,
          borderRadius: '50%',
          background: '#E8976B', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(232,151,107,0.4)',
          zIndex: 1001,
          animation: showPulse && !open ? 'chatPulse 2s ease-in-out 3' : 'none',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {open
          ? <X size={22} color="#111" />
          : <MessageCircle size={22} color="#111" />
        }
      </button>

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: isMobile ? '100vw' : '420px',
        background: '#151515',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              margin: '0 0 0.15rem', fontFamily: "'DM Sans', sans-serif",
              fontSize: '1rem', fontWeight: 600, color: '#f5f0e8',
            }}>
              Ask Claire's Assistant
            </p>
            <p style={{
              margin: 0, fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.78rem', color: 'rgba(245,240,232,0.4)', lineHeight: 1.4,
            }}>
              Ask about your schools, compare programs, or get recommendations
            </p>
            {currentSchool && (
              <p style={{
                margin: '0.4rem 0 0', fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.75rem', color: 'rgba(232,151,107,0.7)',
              }}>
                Viewing: {currentSchool.name}
              </p>
            )}
          </div>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(245,240,232,0.45)', padding: '2px', flexShrink: 0,
            display: 'flex', alignItems: 'center',
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Messages area */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '1rem 1rem 0.5rem',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Quick chips */}
          {messages.length === 0 && !loading && (
            <div style={{ marginBottom: '1rem' }}>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: '0.78rem',
                color: 'rgba(245,240,232,0.3)', marginBottom: '0.6rem',
              }}>
                Try asking:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {QUICK_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => sendMessage(chip)}
                    style={{
                      padding: '0.5rem 0.85rem',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.09)',
                      borderRadius: '20px', cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif", fontSize: '0.82rem',
                      color: 'rgba(245,240,232,0.7)', textAlign: 'left',
                      transition: 'border-color 0.15s, color 0.15s',
                      display: 'flex', alignItems: 'center', gap: '0.4rem',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(232,151,107,0.4)'; e.currentTarget.style.color = '#f5f0e8'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = 'rgba(245,240,232,0.7)'; }}
                  >
                    <ChevronRight size={13} style={{ flexShrink: 0, color: 'rgba(232,151,107,0.6)' }} />
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              schools={schools}
              onApplyUpdate={handleApplyUpdate}
              onDismissUpdate={handleDismissUpdate}
              onApplyRerank={handleApplyRerank}
              onDismissRerank={handleDismissRerank}
            />
          ))}

          {/* Typing indicator */}
          {loading && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', marginBottom: '0.85rem',
            }}>
              <div style={{
                padding: '0.6rem 0.85rem', background: '#1A1A1A',
                borderRadius: '12px 12px 12px 4px',
                border: '1px solid rgba(255,255,255,0.07)',
              }}>
                <TypingDots />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div style={{
          padding: '0.75rem 1rem',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', gap: '0.5rem', alignItems: 'flex-end',
          flexShrink: 0,
          background: '#151515',
        }}>
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-resize
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your schools..."
            disabled={loading}
            style={{
              flex: 1,
              background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '20px', padding: '10px 16px',
              color: '#f5f0e8', fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem',
              outline: 'none', resize: 'none', lineHeight: 1.45,
              overflowY: 'hidden', minHeight: '40px',
              opacity: loading ? 0.6 : 1,
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: loading || !input.trim() ? 'rgba(232,151,107,0.3)' : '#E8976B',
              border: 'none', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
          >
            <Send size={16} color={loading || !input.trim() ? 'rgba(232,151,107,0.5)' : '#111'} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes chatPulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(232,151,107,0.4); }
          50% { box-shadow: 0 4px 32px rgba(232,151,107,0.75), 0 0 0 8px rgba(232,151,107,0.15); }
        }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @media (max-width: 480px) {
          [data-chatpanel] { width: 100% !important; }
        }
      `}</style>
    </>
  );
}
