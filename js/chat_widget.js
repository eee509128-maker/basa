// Basa Veterinary Laboratory - Interactive Live Support Chat Widget & AI Assistant
(function () {
  let isChatOpen = false;
  let chatMode = localStorage.getItem('basa_chat_mode') || 'ai'; // 'ai' or 'human'
  let chatHistory = [];
  let unreadCount = 0;
  let activeReplyMsg = null; // { id, senderName, text }
  let hasDraggedSuggestions = false;

  const DEFAULT_REACTIONS = { '👍': 0, '❤️': 0, '💡': 0, '🩺': 0, '🙏': 0 };

  function getCurrentTime() {
    const d = new Date();
    return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  }

  // Initial welcome message
  const welcomeMessage = {
    id: 'msg_welcome',
    sender: 'bot',
    senderName: 'پشتیبانی هوشمند باسا',
    text: 'سلام! 👋 من «دستیار هوشمند پشتیبانی آزمایشگاه باسا» هستم.\nچطور می‌توانم در خصوص تعرفه‌ها، تست‌های تخصصی، ساعات پذیرش یا نمونه‌گیری به شما کمک کنم؟',
    time: getCurrentTime(),
    reactions: { ...DEFAULT_REACTIONS }
  };

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Inject HTML into DOM
  function initChatWidget() {
    if (document.getElementById('basa-chat-widget-container')) return;

    const container = document.createElement('div');
    container.id = 'basa-chat-widget-container';
    container.innerHTML = `
      <!-- Floating Trigger Button with 3D Magnetic Reaction & Orbital Ring -->
      <div class="basa-chat-trigger-wrap">
        <button id="basaChatTrigger" class="basa-chat-trigger-btn" aria-label="پشتیبانی آنلاین باسا">
          <div class="basa-chat-trigger-aura"></div>
          <div class="basa-chat-trigger-orbit"></div>
          <div id="basaChatBadge" class="basa-chat-badge" style="display:none;">1</div>
          <span class="basa-chat-trigger-icon-inner" id="basaTriggerIconInner">
            <svg id="basaIconChat" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              <path d="M8 10h.01M12 10h.01M16 10h.01"></path>
            </svg>
            <svg id="basaIconClose" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </span>
        </button>
        <div class="basa-chat-trigger-tooltip" id="basaChatTooltip">پشتیبانی آنلاین باسا</div>
      </div>

      <!-- Chat Window -->
      <div id="basaChatWindow" class="basa-chat-window">
        <!-- Header -->
        <div class="basa-chat-header">
          <div class="basa-chat-header-brand">
            <img src="/assets/logo.png" alt="پشتیبانی باسا" class="basa-chat-avatar">
            <div class="basa-chat-header-info">
              <h3>پشتیبانی آنلاین باسا</h3>
              <div class="basa-chat-header-status">
                <span class="basa-status-dot"></span>
                <span id="basaHeaderSubText">پاسخ‌دهی هوشمند jahesh 2</span>
              </div>
            </div>
          </div>
          <div class="basa-chat-header-actions">
            <button id="basaClearChatBtn" class="basa-header-btn" title="پاکسازی گفتگو">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
            <button id="basaCloseChatBtn" class="basa-header-btn" title="بستن چت">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>

        <!-- Subbar Mode Switcher -->
        <div class="basa-chat-subbar">
          <div id="basaModeBadge" class="basa-mode-badge ${chatMode === 'human' ? 'human' : ''}">
            <span>${chatMode === 'human' ? '📩 حالت: پیام مستقیم به کارشناسان' : '⚡ حالت: هوش مصنوعی باسا'}</span>
          </div>
          <button id="basaSwitchHumanBtn" class="basa-switch-human-btn">
            ${chatMode === 'human' ? '⚡ بازگشت به هوش مصنوعی' : '👨‍⚕️ صحبت با کارشناس'}
          </button>
        </div>

        <!-- Messages Area -->
        <div id="basaChatMessages" class="basa-chat-messages"></div>

        <!-- Quick Suggestions Chips (Draggable) -->
        <div id="basaChatSuggestions" class="basa-chat-suggestions" title="برای اسکرول بکشید">
          <button type="button" class="basa-sug-pill" data-query="ساعات کاری و آدرس آزمایشگاه چیست؟">📍 ساعات کاری و آدرس</button>
          <button type="button" class="basa-sug-pill" data-query="تعرفه آزمایش‌های سگ و گربه چقدر است؟">💰 تعرفه آزمایش‌ها</button>
          <button type="button" class="basa-sug-pill" data-query="شرایط ارسال نمونه از شهرستان چگونه است؟">🚚 ارسال نمونه از شهرستان</button>
          <button type="button" class="basa-sug-pill" data-query="زمان جواب‌دهی آزمایش‌ها چند ساعت است؟">⏱ زمان پاسخ‌دهی</button>
          <button type="button" class="basa-sug-pill" data-query="شرایط ناشتایی قبل از آزمایش خون چیست؟">🩸 شرایط ناشتایی</button>
        </div>

        <!-- Reply Preview Banner -->
        <div id="basaReplyPreviewBar" class="basa-reply-preview-bar" style="display:none;">
          <div class="basa-reply-preview-content">
            <span class="basa-reply-preview-title" id="basaReplyPreviewSender">پاسخ به پیام</span>
            <span class="basa-reply-preview-text" id="basaReplyPreviewText"></span>
          </div>
          <button type="button" id="basaCancelReplyBtn" class="basa-reply-cancel-btn" title="لغو ریپلای">✕</button>
        </div>

        <!-- Input Area -->
        <div class="basa-chat-input-area">
          <input type="text" id="basaChatInput" class="basa-chat-input" placeholder="سوال یا پیام خود را بنویسید..." autocomplete="off">
          <button id="basaChatSendBtn" class="basa-chat-send-btn" aria-label="ارسال">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(180deg);">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    loadHistory();
    setupEventListeners();
    setupMouseInteractions();
    startTicketPolling();
  }

  let ticketPollInterval = null;
  function startTicketPolling() {
    if (ticketPollInterval) clearInterval(ticketPollInterval);
    ticketPollInterval = setInterval(pollActiveTicketNow, 2500);
    setTimeout(pollActiveTicketNow, 600);
  }

  async function pollActiveTicketNow() {
    const activeId = localStorage.getItem('basa_active_ticket_id');
    if (!activeId) return;
    try {
      const resp = await fetch(`/api/support/ticket-status?ticketId=${encodeURIComponent(activeId)}&_t=${Date.now()}`, {
        cache: 'no-store'
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (!data.success || !data.ticket) return;

      const ticket = data.ticket;
      let changed = false;

      if (Array.isArray(ticket.messages) && ticket.messages.length > 0) {
        ticket.messages.forEach(srvMsg => {
          const existing = chatHistory.find(m => String(m.id) === String(srvMsg.id));
          if (!existing) {
            if (srvMsg.sender === 'admin') {
              chatHistory.push({
                id: srvMsg.id,
                sender: 'admin',
                senderName: srvMsg.senderName || 'دکتر مشاوری‌نیا (کارشناس باسا)',
                text: srvMsg.text,
                time: srvMsg.time || getCurrentTime(),
                replyTo: srvMsg.replyTo || null,
                reactions: { ...DEFAULT_REACTIONS, ...(srvMsg.reactions || {}) }
              });
              changed = true;
              notifyUnreadIfClosed();
            }
          } else if (srvMsg.reactions && typeof srvMsg.reactions === 'object') {
            const currentRxStr = JSON.stringify(existing.reactions || {});
            const mergedRx = { ...DEFAULT_REACTIONS, ...(existing.reactions || {}), ...srvMsg.reactions };
            if (JSON.stringify(mergedRx) !== currentRxStr) {
              existing.reactions = mergedRx;
              changed = true;
            }
          }
        });
      } else if (ticket.reply) {
        const legacyAdminId = 'msg-rep-' + ticket.id + '-' + ticket.reply.length;
        const alreadyHas = chatHistory.some(m => m.id === legacyAdminId || (m.sender === 'admin' && m.text === ticket.reply));
        if (!alreadyHas) {
          chatHistory.push({
            id: legacyAdminId,
            sender: 'admin',
            senderName: 'دکتر مشاوری‌نیا (کارشناس باسا)',
            text: ticket.reply,
            time: getCurrentTime(),
            reactions: { ...DEFAULT_REACTIONS }
          });
          changed = true;
          notifyUnreadIfClosed();
        }
      }

      if (changed) {
        saveHistory();
        renderMessages();
      }
    } catch (e) {
      // silent network retry
    }
  }

  function notifyUnreadIfClosed() {
    if (!isChatOpen) {
      unreadCount++;
      const badge = document.getElementById('basaChatBadge');
      if (badge) {
        badge.innerText = unreadCount;
        badge.style.display = 'block';
      }
    }
  }

  function setupMouseInteractions() {
    const btn = document.getElementById('basaChatTrigger');
    const innerIcon = document.getElementById('basaTriggerIconInner');
    if (btn) {
      // 3D Magnetic Cursor-Reactive Effect
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const relX = e.clientX - rect.left - rect.width / 2;
        const relY = e.clientY - rect.top - rect.height / 2;
        const tiltX = (-relY / (rect.height / 2)) * 14;
        const tiltY = (relX / (rect.width / 2)) * 14;
        btn.style.transform = `perspective(500px) translate3d(${relX * 0.28}px, ${relY * 0.28 - 4}px, 0) scale(1.1) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
        if (innerIcon) {
          innerIcon.style.transform = `translate3d(${relX * 0.14}px, ${relY * 0.14}px, 8px)`;
        }
      });

      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
        if (innerIcon) innerIcon.style.transform = '';
      });
    }

    // Touch & Mouse Drag-to-Scroll for Quick Suggestions (with click-drag guard)
    const sugContainer = document.getElementById('basaChatSuggestions');
    if (sugContainer) {
      let isDown = false;
      let startX = 0;
      let scrollLeft = 0;

      sugContainer.addEventListener('mousedown', (e) => {
        isDown = true;
        hasDraggedSuggestions = false;
        sugContainer.classList.add('dragging');
        startX = e.pageX - sugContainer.offsetLeft;
        scrollLeft = sugContainer.scrollLeft;
      });

      sugContainer.addEventListener('mouseleave', () => {
        isDown = false;
        sugContainer.classList.remove('dragging');
      });

      sugContainer.addEventListener('mouseup', () => {
        isDown = false;
        sugContainer.classList.remove('dragging');
        setTimeout(() => { hasDraggedSuggestions = false; }, 60);
      });

      sugContainer.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        const x = e.pageX - sugContainer.offsetLeft;
        const delta = x - startX;
        if (Math.abs(delta) > 5) {
          hasDraggedSuggestions = true;
          e.preventDefault();
          sugContainer.scrollLeft = scrollLeft - delta * 1.4;
        }
      });

      sugContainer.addEventListener('touchstart', (e) => {
        hasDraggedSuggestions = false;
        startX = e.touches[0].pageX - sugContainer.offsetLeft;
        scrollLeft = sugContainer.scrollLeft;
      }, { passive: true });

      sugContainer.addEventListener('touchmove', (e) => {
        const x = e.touches[0].pageX - sugContainer.offsetLeft;
        const delta = x - startX;
        if (Math.abs(delta) > 6) {
          hasDraggedSuggestions = true;
        }
        sugContainer.scrollLeft = scrollLeft - delta * 1.3;
      }, { passive: true });

      sugContainer.querySelectorAll('.basa-sug-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
          if (hasDraggedSuggestions) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          const q = pill.getAttribute('data-query');
          if (q) window.sendBasaQuickQuery(q);
        });
      });
    }
  }

  function setupEventListeners() {
    const trigger = document.getElementById('basaChatTrigger');
    const closeBtn = document.getElementById('basaCloseChatBtn');
    const clearBtn = document.getElementById('basaClearChatBtn');
    const sendBtn = document.getElementById('basaChatSendBtn');
    const input = document.getElementById('basaChatInput');
    const switchHumanBtn = document.getElementById('basaSwitchHumanBtn');
    const cancelReplyBtn = document.getElementById('basaCancelReplyBtn');

    if (trigger) trigger.addEventListener('click', toggleChat);
    if (closeBtn) closeBtn.addEventListener('click', closeChat);
    if (clearBtn) clearBtn.addEventListener('click', clearHistory);
    if (cancelReplyBtn) cancelReplyBtn.addEventListener('click', clearReplyTarget);

    if (sendBtn) sendBtn.addEventListener('click', handleUserSend);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleUserSend();
        }
      });
    }

    if (switchHumanBtn) {
      switchHumanBtn.addEventListener('click', () => {
        if (chatMode === 'ai') {
          chatMode = 'human';
          localStorage.setItem('basa_chat_mode', 'human');
          document.getElementById('basaModeBadge').className = 'basa-mode-badge human';
          document.getElementById('basaModeBadge').innerHTML = '<span>📩 حالت: پیام مستقیم به کارشناسان</span>';
          const subText = document.getElementById('basaHeaderSubText');
          if (subText) subText.innerText = 'گفتگوی مستقیم با کارشناسان باسا';
          switchHumanBtn.innerText = '⚡ بازگشت به هوش مصنوعی';
          appendBotMessage('✅ شما به کارشناسان آزمایشگاه باسا متصل شدید.');
        } else {
          chatMode = 'ai';
          localStorage.setItem('basa_chat_mode', 'ai');
          document.getElementById('basaModeBadge').className = 'basa-mode-badge';
          document.getElementById('basaModeBadge').innerHTML = '<span>⚡ حالت: هوش مصنوعی باسا</span>';
          const subText = document.getElementById('basaHeaderSubText');
          if (subText) subText.innerText = 'پاسخ‌دهی هوشمند jahesh 2';
          switchHumanBtn.innerText = '👨‍⚕️ صحبت با کارشناس';
          appendBotMessage('به حالت **پاسخ‌دهی هوشمند jahesh 2** بازگشتید. می‌توانید سوالات خود را بپرسید.');
        }
      });
    }
  }

  function toggleChat() {
    isChatOpen = !isChatOpen;
    const win = document.getElementById('basaChatWindow');
    const iconChat = document.getElementById('basaIconChat');
    const iconClose = document.getElementById('basaIconClose');
    const badge = document.getElementById('basaChatBadge');

    if (isChatOpen) {
      win.classList.add('active');
      iconChat.style.display = 'none';
      iconClose.style.display = 'block';
      badge.style.display = 'none';
      unreadCount = 0;
      pollActiveTicketNow();
      setTimeout(() => document.getElementById('basaChatInput')?.focus(), 200);
      scrollToBottom();
    } else {
      win.classList.remove('active');
      iconChat.style.display = 'block';
      iconClose.style.display = 'none';
    }
  }

  function closeChat() {
    isChatOpen = false;
    document.getElementById('basaChatWindow')?.classList.remove('active');
    document.getElementById('basaIconChat').style.display = 'block';
    document.getElementById('basaIconClose').style.display = 'none';
  }

  function loadHistory() {
    try {
      const saved = localStorage.getItem('basa_chat_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          chatHistory = parsed;
        }
      }
    } catch (e) {}

    if (chatHistory.length === 0) {
      chatHistory = [welcomeMessage];
    }
    renderMessages();
  }

  function saveHistory() {
    try {
      localStorage.setItem('basa_chat_history', JSON.stringify(chatHistory));
    } catch (e) {}
  }

  function clearHistory() {
    chatHistory = [
      {
        ...welcomeMessage,
        time: getCurrentTime(),
        reactions: { ...DEFAULT_REACTIONS }
      }
    ];
    clearReplyTarget();
    saveHistory();
    renderMessages();
  }

  window.replyToBasaMsg = function (msgId) {
    const target = chatHistory.find(m => String(m.id) === String(msgId));
    if (!target) return;
    const senderLabel = target.sender === 'user' ? 'شما' : (target.sender === 'admin' ? (target.senderName || 'کارشناس باسا') : 'پشتیبانی باسا');
    activeReplyMsg = {
      id: target.id,
      senderName: senderLabel,
      text: target.text.substring(0, 120)
    };
    const bar = document.getElementById('basaReplyPreviewBar');
    const senderEl = document.getElementById('basaReplyPreviewSender');
    const textEl = document.getElementById('basaReplyPreviewText');
    if (bar && senderEl && textEl) {
      senderEl.innerText = `در پاسخ به ${senderLabel}:`;
      textEl.innerText = activeReplyMsg.text;
      bar.style.display = 'flex';
    }
    document.getElementById('basaChatInput')?.focus();
  };

  function clearReplyTarget() {
    activeReplyMsg = null;
    const bar = document.getElementById('basaReplyPreviewBar');
    if (bar) bar.style.display = 'none';
  }

  function renderMessages() {
    const container = document.getElementById('basaChatMessages');
    if (!container) return;

    container.innerHTML = chatHistory.map(msg => {
      const isUser = msg.sender === 'user';
      const isAdmin = msg.sender === 'admin';
      const rowClass = isUser ? 'user' : (isAdmin ? 'bot admin-msg' : 'bot');
      const senderTitle = isUser ? 'شما' : (isAdmin ? `👨‍⚕️ ${msg.senderName || 'کارشناس آزمایشگاه باسا'}` : '🩺 پشتیبانی هوشمند باسا');

      const safeText = escapeHtml(msg.text)
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      let replyBlockHtml = '';
      if (msg.replyTo && msg.replyTo.text) {
        replyBlockHtml = `
          <div class="basa-msg-quoted">
            <div class="basa-msg-quoted-sender">${escapeHtml(msg.replyTo.senderName || 'پیام قبلی')}</div>
            <div class="basa-msg-quoted-text">${escapeHtml(msg.replyTo.text)}</div>
          </div>
        `;
      }

      const reactionsHtml = renderReactions(msg);

      return `
        <div class="basa-msg-row ${rowClass}" data-msg-id="${escapeHtml(msg.id)}">
          <div class="basa-msg-bubble">
            ${isAdmin ? `<div class="basa-admin-badge-head">👨‍⚕️ پاسخ کارشناس آزمایشگاه باسا</div>` : ''}
            ${replyBlockHtml}
            <div class="basa-msg-text-body">${safeText}</div>
            <div class="basa-msg-footer-tools">
              ${reactionsHtml}
              <button type="button" class="basa-msg-reply-btn" onclick="window.replyToBasaMsg('${escapeHtml(msg.id)}')" title="پاسخ به این پیام">
                ↩ پاسخ
              </button>
            </div>
          </div>
          <div class="basa-msg-time">
            <span>${escapeHtml(senderTitle)}</span> • <span>${escapeHtml(msg.time || '')}</span>
          </div>
        </div>
      `;
    }).join('');

    scrollToBottom();
  }

  function renderReactions(msg) {
    const rx = { ...DEFAULT_REACTIONS, ...(msg.reactions || {}) };
    return `
      <div class="basa-reactions-bar">
        ${Object.keys(rx).map(emoji => `
          <button type="button" class="basa-reaction-pill ${rx[emoji] > 0 ? 'active' : ''}" onclick="window.reactToBasaMsg('${escapeHtml(msg.id)}', '${emoji}')">
            <span>${emoji}</span>${rx[emoji] > 0 ? `<span class="rx-count">${rx[emoji]}</span>` : ''}
          </button>
        `).join('')}
      </div>
    `;
  }

  window.reactToBasaMsg = async function (msgId, emoji) {
    const msg = chatHistory.find(m => String(m.id) === String(msgId));
    if (msg) {
      if (!msg.reactions) msg.reactions = { ...DEFAULT_REACTIONS };
      msg.reactions[emoji] = (Number(msg.reactions[emoji]) || 0) + 1;
      saveHistory();
      renderMessages();

      const activeTicketId = localStorage.getItem('basa_active_ticket_id');
      if (activeTicketId) {
        try {
          await fetch('/api/support/react', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketId: activeTicketId, msgId, emoji })
          });
        } catch (e) {}
      }
    }
  };

  window.sendBasaQuickQuery = function (text) {
    const input = document.getElementById('basaChatInput');
    if (input) {
      input.value = text;
      handleUserSend();
    }
  };

  async function handleUserSend() {
    const input = document.getElementById('basaChatInput');
    const text = input ? input.value.trim() : '';
    if (!text) return;

    input.value = '';
    const currentReply = activeReplyMsg ? { ...activeReplyMsg } : null;
    clearReplyTarget();

    const msgId = 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const msgTime = getCurrentTime();

    // Push User message
    const userMsg = {
      id: msgId,
      sender: 'user',
      text: text,
      time: msgTime,
      replyTo: currentReply,
      reactions: { ...DEFAULT_REACTIONS }
    };
    chatHistory.push(userMsg);
    saveHistory();
    renderMessages();

    if (chatMode === 'human') {
      // Send message to existing or new ticket in admin panel without repeating connection bot message
      try {
        const user = window.currentUser || {};
        const existingTicketId = localStorage.getItem('basa_active_ticket_id') || '';
        const resp = await fetch('/api/support/ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketId: existingTicketId,
            msgId: msgId,
            time: msgTime,
            replyTo: currentReply,
            customerName: user.fullName || user.username || 'مراجع وب‌سایت',
            mobile: user.mobile || 'ثبت‌نشده',
            message: text,
            history: chatHistory
          })
        });
        const data = await resp.json();
        if (data.success && data.ticket && data.ticket.id) {
          localStorage.setItem('basa_active_ticket_id', data.ticket.id);
          startTicketPolling();
        }
      } catch (e) {}
      return;
    }

    // AI Mode: Show Typing Indicator & Call API
    showTypingIndicator();
    try {
      const resp = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, history: chatHistory })
      });

      hideTypingIndicator();

      if (resp.ok) {
        const data = await resp.json();
        if (data.success && data.reply) {
          appendBotMessage(data.reply);
          return;
        }
      }
    } catch (e) {
      console.warn('Support Chat API fallback:', e);
    }

    hideTypingIndicator();
    const fallbackReply = generateIntelligentSupportFallback(text);
    appendBotMessage(fallbackReply);
  }

  function appendBotMessage(text, customSender) {
    const botMsg = {
      id: 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      sender: customSender || 'bot',
      text: text,
      time: getCurrentTime(),
      reactions: { ...DEFAULT_REACTIONS }
    };
    chatHistory.push(botMsg);
    saveHistory();
    renderMessages();
    notifyUnreadIfClosed();
  }

  function showTypingIndicator() {
    const container = document.getElementById('basaChatMessages');
    if (!container) return;

    let typingEl = document.getElementById('basaTypingIndicator');
    if (!typingEl) {
      typingEl = document.createElement('div');
      typingEl.id = 'basaTypingIndicator';
      typingEl.className = 'basa-typing-indicator';
      typingEl.innerHTML = `
        <span class="basa-typing-dot"></span>
        <span class="basa-typing-dot"></span>
        <span class="basa-typing-dot"></span>
      `;
      container.appendChild(typingEl);
      scrollToBottom();
    }
  }

  function hideTypingIndicator() {
    const typingEl = document.getElementById('basaTypingIndicator');
    if (typingEl) typingEl.remove();
  }

  function scrollToBottom() {
    const container = document.getElementById('basaChatMessages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function generateIntelligentSupportFallback(query) {
    const q = query.toLowerCase();

    if (q.includes('ساعت') || q.includes('آدرس') || q.includes('کجاست') || q.includes('لوکیشن') || q.includes('تلفن') || q.includes('تماس')) {
      return `📍 **آدرس و ساعات کاری آزمایشگاه دامپزشکی باسا:**\n\n• **آدرس:** مشهد، بلوار اندیشه، اندیشه ۹، پلاک ۵۴\n• **ساعات پذیرش حضوری:** همه‌روزه از ساعت ۸:۰۰ صبح الی ۲۰:۰۰ شب (پذیرش آنلاین ۲۴ ساعته)\n• **تلفن مستقیم:** ۰۹۱۵۵۱۹۳۶۷۸\n• **مسئول فنی:** دکتر علی مشاوری نیا`;
    }

    if (q.includes('قیمت') || q.includes('تعرفه') || q.includes('هزینه') || q.includes('چقدر')) {
      return `💰 **تعرفه مصوب برخی از پرتکرارترین آزمایش‌های باسا:**\n\n• **CBC کامل و شمارش افتراقی:** ۲۴۳,۰۰۰ تومان (تحویل ۳ ساعته)\n• **پنل بیوشیمی پایه (کبد، کلیه، قند):** ۴۸۶,۰۰۰ تومان\n• **تست مولکولی Real-Time PCR:** ۹۴۵,۰۰۰ تومان (تحویل ۲۴ ساعته)\n• **کشت میکروبی و آنتی‌بیوگرام:** ۳۷۸,۰۰۰ تومان\n\nبرای مشاهده فهرست کامل تست‌ها، از دکمه **«پذیرش نمونه»** در بالای سایت استفاده فرمایید.`;
    }

    if (q.includes('شهرستان') || q.includes('ارسال') || q.includes('پیک') || q.includes('تیپاکس') || q.includes('نمونه')) {
      return `🚚 **راهنمای ارسال نمونه از مشهد و سایر شهرها:**\n\n۱. **مراجعین مشهد:** امکان ارسال با پیک پس از ثبت پذیرش آنلاین.\n۲. **همکاران و مراجعین شهرستان:** نمونه‌های خون (لوله EDTA یا سرم جداشده) را در مجاورت **یخ خشک یا آیس‌پک** بسته‌بندی کرده و از طریق **ترمینال اتوبوسرانی یا تیپاکس** به آدرس مشهد، اندیشه ۹، پلاک ۵۴ ارسال نمایید.`;
    }

    if (q.includes('جواب') || q.includes('نتیجه') || q.includes('چند ساعت') || q.includes('زمان') || q.includes('کی آماده')) {
      return `⏱ **زمان پاسخ‌دهی آزمایش‌ها در باسا:**\n\n• **هماتولوژی (CBC) و کیت‌های سریع:** ۲ تا ۳ ساعت\n• **بیوشیمی خون، هورمون و الکترولیت‌ها:** ۴ تا ۶ ساعت\n• **تست‌های مولکولی PCR:** ۲۴ ساعت\n• **پاتولوژی و کشت میکروبی:** ۴۸ تا ۷۲ ساعت\n\nبلافاصله پس از آماده شدن، فایل PDF نتیجه از طریق پیامک برای شما ارسال می‌گردد.`;
    }

    if (q.includes('ناشتا')) {
      return `🩸 **شرایط ناشتایی قبل از خونگیری:**\n\nبرای دقت بالای آزمایش‌های بیوشیمی خون (به‌ویژه قند، کلسترول و تری‌گلیسیرید)، توصیه می‌شود حیوان خانگی شما **۸ الی ۱۲ ساعت قبل از نمونه‌گیری ناشتا** باشد. نوشیدن آب تمیز بلامانع است.`;
    }

    return `سپاس از پیام شما در پشتیبانی آزمایشگاه تخصصی باسا. 🩺\n\nبرای ثبت آنلاین آزمایش و دریافت مشاوره بالینی هوشمند، کافیست روی دکمه **«پذیرش نمونه»** کلیک کنید.\nاگر نیاز به گفتگوی مستقیم با کارشناسان پذیرش دارید، دکمه نارنجی **«👨‍⚕️ صحبت با کارشناس»** را در بالای همین پنجره انتخاب فرمایید.`;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatWidget);
  } else {
    initChatWidget();
  }
})();
