/**
 * PipZoNe — Public Landing Page Logic
 * Page Group 3: /main/
 * Independent vanilla script — animations, live market canvas, split calculator, FAQ accordion.
 */

document.addEventListener('DOMContentLoaded', () => {
  // ===== 1. Theme Toggle System =====
  initThemeToggle();

  // ===== 2. Mobile Menu Drawer =====
  initMobileDrawer();

  // ===== 3. Hero Animated Market Canvas =====
  initHeroMarketCanvas();

  // ===== 4. Live Ticker Jitter Simulation =====
  initTickerJitter();

  // ===== 5. Number Count-Up Animations =====
  initCountUpAnimations();

  // ===== 6. Interactive Profit Split Calculator =====
  initSplitCalculator();

  // ===== 7. Populate Verified Performance Table =====
  initPerformanceTable();

  // ===== 8. FAQ Accordion =====
  initFaqAccordion();

  // ===== 9. Contact Form & File Attachment =====
  initContactForm();
});

/* ====================================================================
   1. Theme Toggle System
==================================================================== */
function initThemeToggle() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (!themeToggleBtn) return;

  const root = document.documentElement;

  const currentTheme = localStorage.getItem('pipzone_theme') || 'dark';
  root.setAttribute('data-theme', currentTheme);

  themeToggleBtn.addEventListener('click', () => {
    const nextTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';

    // Theme badalte waqt saare transitions band, taake sab ek saath foran badle
    root.classList.add('theme-switching');
    root.setAttribute('data-theme', nextTheme);
    localStorage.setItem('pipzone_theme', nextTheme);

    // browser ko naye colors apply karne dein, phir transitions wapas on
    window.getComputedStyle(root).getPropertyValue('background-color');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => root.classList.remove('theme-switching'));
    });
  });
}

/* ====================================================================
   2. Mobile Menu Drawer
==================================================================== */
function initMobileDrawer() {
  const menuBtn = document.getElementById('mobileMenuBtn');
  const drawer = document.getElementById('mobileDrawer');
  if (!menuBtn || !drawer) return;

  menuBtn.addEventListener('click', () => {
    drawer.classList.toggle('hidden');
  });

  const links = drawer.querySelectorAll('.mobile-nav-link');
  links.forEach(link => {
    link.addEventListener('click', () => drawer.classList.add('hidden'));
  });
}

/* ====================================================================
   3. Hero Animated Candlestick & Gradient Area Chart (Canvas)
==================================================================== */
function initHeroMarketCanvas() {
  const canvas = document.getElementById('heroMarketCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Set internal resolution matching display
  let dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = (rect.width || 520) * dpr;
  canvas.height = (rect.height || 230) * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width || 520;
  const H = rect.height || 230;

  // Generate synthetic candles
  const candleCount = 28;
  const candles = [];
  let basePrice = 100;

  for (let i = 0; i < candleCount; i++) {
    const change = (Math.random() - 0.46) * 3.5;
    const open = basePrice;
    const close = basePrice + change;
    const high = Math.max(open, close) + Math.random() * 2.2;
    const low = Math.min(open, close) - Math.random() * 2.2;
    candles.push({ open, close, high, low });
    basePrice = close;
  }

  let animationOffset = 0;

  function renderChart() {
    ctx.clearRect(0, 0, W, H);

    // Subtle background grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let y = 30; y < H; y += 45) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    for (let x = 40; x < W; x += 65) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // Min and Max prices for scaling
    let minP = Infinity, maxP = -Infinity;
    candles.forEach(c => {
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
    });
    const pad = (maxP - minP) * 0.18 || 1;
    minP -= pad;
    maxP += pad;

    const getY = (val) => H - 20 - ((val - minP) / (maxP - minP)) * (H - 45);
    const candleWidth = (W - 40) / candleCount;

    // Draw Smooth Area Gradient under Close curve
    ctx.beginPath();
    candles.forEach((c, i) => {
      const x = 20 + i * candleWidth + candleWidth / 2;
      const y = getY(c.close);
      if (i === 0) ctx.moveTo(x, y);
      else {
        const prevX = 20 + (i - 1) * candleWidth + candleWidth / 2;
        const prevY = getY(candles[i - 1].close);
        const midX = (prevX + x) / 2;
        ctx.bezierCurveTo(midX, prevY, midX, y, x, y);
      }
    });

    const lastX = 20 + (candleCount - 1) * candleWidth + candleWidth / 2;
    ctx.lineTo(lastX, H);
    ctx.lineTo(20 + candleWidth / 2, H);
    ctx.closePath();

    const areaGrad = ctx.createLinearGradient(0, 20, 0, H);
    areaGrad.addColorStop(0, 'rgba(47, 191, 131, 0.28)');
    areaGrad.addColorStop(1, 'rgba(47, 191, 131, 0.0)');
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Draw Candlesticks
    candles.forEach((c, i) => {
      const cx = 20 + i * candleWidth + candleWidth / 2;
      const isGreen = c.close >= c.open;
      const color = isGreen ? '#5EEAB0' : '#F2735E';

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx, getY(c.high));
      ctx.lineTo(cx, getY(c.low));
      ctx.stroke();

      // Body
      const bodyTop = getY(Math.max(c.open, c.close));
      const bodyHeight = Math.max(3, Math.abs(getY(c.open) - getY(c.close)));
      const bw = candleWidth * 0.58;

      ctx.fillStyle = color;
      ctx.fillRect(cx - bw / 2, bodyTop, bw, bodyHeight);
    });

    // Animate latest price ping
    animationOffset += 0.05;
    const latestC = candles[candles.length - 1];
    const latestX = 20 + (candleCount - 1) * candleWidth + candleWidth / 2;
    const latestY = getY(latestC.close);

    ctx.fillStyle = '#5EEAB0';
    ctx.beginPath();
    ctx.arc(latestX, latestY, 4, 0, Math.PI * 2);
    ctx.fill();

    const rippleRadius = 4 + (Math.sin(animationOffset) + 1) * 5;
    ctx.strokeStyle = `rgba(94, 234, 176, ${0.7 - rippleRadius / 20})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(latestX, latestY, rippleRadius, 0, Math.PI * 2);
    ctx.stroke();

    requestAnimationFrame(renderChart);
  }

  // Periodic candle drift
  setInterval(() => {
    const last = candles[candles.length - 1];
    const shift = (Math.random() - 0.45) * 1.8;
    last.close += shift;
    last.high = Math.max(last.high, last.close);
    last.low = Math.min(last.low, last.close);

    // If drift is large, roll candles
    if (Math.random() > 0.6) {
      candles.shift();
      const nextOpen = last.close;
      const nextClose = nextOpen + (Math.random() - 0.48) * 2.8;
      candles.push({
        open: nextOpen,
        close: nextClose,
        high: Math.max(nextOpen, nextClose) + Math.random() * 1.5,
        low: Math.min(nextOpen, nextClose) - Math.random() * 1.5
      });
    }
  }, 900);

  requestAnimationFrame(renderChart);
}

/* ====================================================================
   4. Live Ticker Jitter Simulation
==================================================================== */
function initTickerJitter() {
  const xauVal = document.getElementById('price-xau');
  const xauChg = document.getElementById('chg-xau');
  const btcVal = document.getElementById('price-btc');
  const btcChg = document.getElementById('chg-btc');
  const eurVal = document.getElementById('price-eur');
  const eurChg = document.getElementById('chg-eur');

  let xau = 2654.80;
  let btc = 94210.50;
  let eur = 1.0842;

  setInterval(() => {
    // Jitter Gold
    const dXau = (Math.random() - 0.49) * 0.85;
    xau += dXau;
    if (xauVal) xauVal.textContent = xau.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (xauChg && Math.random() > 0.65) {
      const chg = (1.42 + (Math.random() - 0.5) * 0.1).toFixed(2);
      xauChg.textContent = `+${chg}%`;
    }

    // Jitter BTC
    const dBtc = (Math.random() - 0.48) * 14.5;
    btc += dBtc;
    if (btcVal) btcVal.textContent = btc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Jitter EUR
    const dEur = (Math.random() - 0.5) * 0.00015;
    eur += dEur;
    if (eurVal) eurVal.textContent = eur.toFixed(4);
  }, 1400);
}

/* ====================================================================
   5. Number Count-Up Animations
==================================================================== */
function initCountUpAnimations() {
  const counters = document.querySelectorAll('.counter-num');
  if (!counters.length) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        startCountUp(entry.target);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  counters.forEach(counter => observer.observe(counter));
}

function startCountUp(element) {
  const target = parseFloat(element.getAttribute('data-target')) || 0;
  const decimals = parseInt(element.getAttribute('data-decimals'), 10) || 0;
  const duration = 1800; // ms
  const startTime = performance.now();

  function updateCount(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Smooth easeOutExpo
    const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    const currentVal = target * easeProgress;

    if (decimals > 0) {
      element.textContent = currentVal.toFixed(decimals);
    } else {
      element.textContent = Math.floor(currentVal).toLocaleString('en-US');
    }

    if (progress < 1) {
      requestAnimationFrame(updateCount);
    } else {
      if (decimals > 0) {
        element.textContent = target.toFixed(decimals);
      } else {
        element.textContent = target.toLocaleString('en-US');
      }
    }
  }

  requestAnimationFrame(updateCount);
}

/* ====================================================================
   6. Interactive Profit Split Calculator
==================================================================== */
function initSplitCalculator() {
  const depositSlider = document.getElementById('depositAmountSlider');
  const returnSlider = document.getElementById('modelResultSlider');
  const depositDisplay = document.getElementById('depositAmountDisplay');
  const returnDisplay = document.getElementById('modelResultDisplay');
  const clientPayout = document.getElementById('calcClientPayout');
  const deskPayout = document.getElementById('calcDeskPayout');
  const newBalance = document.getElementById('calcNewBalance');
  const clientBar = document.getElementById('calcClientBar');
  const deskBar = document.getElementById('calcDeskBar');

  if (!depositSlider || !returnSlider) return;

  function recalculate() {
    const principal = parseFloat(depositSlider.value) || 5000;
    const returnPct = parseFloat(returnSlider.value) || 8.5;

    // Gross dollar yield
    const grossDollar = principal * (returnPct / 100);

    // Displays
    depositDisplay.textContent = `$${principal.toLocaleString('en-US')}`;

    if (returnPct >= 0) {
      returnDisplay.textContent = `+${returnPct.toFixed(1)}% (+$${grossDollar.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
      returnDisplay.style.color = 'var(--accent-profit)';
    } else {
      returnDisplay.textContent = `${returnPct.toFixed(1)}% (-$${Math.abs(grossDollar).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
      returnDisplay.style.color = 'var(--accent-loss)';
    }

    // Split rule:
    // If profit > 0: 60% client, 40% desk
    // If loss <= 0: client absorbs net loss, desk takes $0 (100% no desk fee on loss)
    let clientShare = 0;
    let deskShare = 0;

    if (grossDollar > 0) {
      clientShare = grossDollar * 0.60;
      deskShare = grossDollar * 0.40;
      clientPayout.textContent = `+$${clientShare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      deskPayout.textContent = `+$${deskShare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      clientBar.style.width = '60%';
      clientBar.textContent = 'Client (60%)';
      deskBar.style.width = '40%';
      deskBar.textContent = 'Desk (40%)';
    } else {
      clientShare = grossDollar;
      deskShare = 0;
      clientPayout.textContent = `-$${Math.abs(clientShare).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      deskPayout.textContent = `$0.00 (No fee)`;

      clientBar.style.width = '100%';
      clientBar.textContent = 'Client (100% of Drawdown)';
      deskBar.style.width = '0%';
      deskBar.textContent = '';
    }

    const finalBalance = principal + clientShare;
    newBalance.textContent = `$${finalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  depositSlider.addEventListener('input', recalculate);
  returnSlider.addEventListener('input', recalculate);

  recalculate();
}

/* ====================================================================
   7. Populate Verified Performance Table
==================================================================== */
function initPerformanceTable() {
  const tbody = document.getElementById('performanceTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  HISTORICAL_PERFORMANCE.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${row.month}</strong></td>
      <td><span class="mono" style="font-size: 0.85rem; color: var(--text-secondary);">${row.focus}</span></td>
      <td><span class="mono highlight-green font-bold">${row.gross}</span></td>
      <td><span class="mono highlight-green">${row.client}</span></td>
      <td><span class="mono text-white">${row.desk}</span></td>
      <td><span class="mono">${row.winRate}</span></td>
      <td>
        <div class="table-progress-track">
          <div class="table-progress-fill" style="width: ${row.progress}%;"></div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ====================================================================
   8. FAQ Accordion
==================================================================== */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');
  if (!faqItems.length) return;

  faqItems.forEach(item => {
    const btn = item.querySelector('.faq-question-btn');
    const panel = item.querySelector('.faq-answer-panel');

    btn.addEventListener('click', () => {
      const isActive = item.classList.contains('active');

      // Close other open items for neatness
      faqItems.forEach(other => {
        if (other !== item) {
          other.classList.remove('active');
          const otherPanel = other.querySelector('.faq-answer-panel');
          const otherBtn = other.querySelector('.faq-question-btn');
          if (otherPanel) otherPanel.style.maxHeight = null;
          if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
        }
      });

      // Toggle current
      if (isActive) {
        item.classList.remove('active');
        panel.style.maxHeight = null;
        btn.setAttribute('aria-expanded', 'false');
      } else {
        item.classList.add('active');
        panel.style.maxHeight = panel.scrollHeight + 'px';
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

/* ====================================================================
   9. Contact Form & File Attachment
==================================================================== */
function initContactForm() {
  const form = document.getElementById('landingContactForm');
  const fileDropzone = document.getElementById('fileUploadDropzone');
  const fileInput = document.getElementById('contactFile');
  const fileLabel = document.getElementById('fileUploadLabel');
  const submitBtn = document.getElementById('contactSubmitBtn');
  const feedback = document.getElementById('contactFeedback');

  if (!form) return;

  // File input trigger
  if (fileDropzone && fileInput) {
    fileDropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        fileLabel.textContent = `Attached: ${fileInput.files[0].name}`;
        fileLabel.style.color = 'var(--accent-profit)';
      }
    });
  }

  const CONTACT_FUNCTION = 'send-contact-email';
  const CONTACT_BUCKET = 'contact-attachments';
  const MAX_CONTACT_FILE = 5 * 1024 * 1024; // 5 MB
  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];

  function showFeedback(text, color) {
    if (!feedback) return;
    feedback.textContent = text;
    feedback.style.color = color;
    feedback.classList.remove('hidden');
  }

  function safeName(name) {
    return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  }

  // Attachment ko storage mein upload karke uska link wapas deta hai
  async function uploadAttachment(client, file) {
    const rand = Math.random().toString(36).slice(2, 10);
    const path = `contact/${Date.now()}-${rand}-${safeName(file.name)}`;

    const { error } = await client.storage
      .from(CONTACT_BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });

    if (error) throw error;

    const { data } = client.storage.from(CONTACT_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  // File choose karte hi type/size check
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0];
      if (!f) return;

      const okType = ALLOWED_TYPES.includes(f.type) || /\.(png|jpe?g|pdf)$/i.test(f.name);

      if (!okType || f.size > MAX_CONTACT_FILE) {
        fileInput.value = '';
        if (fileLabel) {
          fileLabel.innerHTML = 'Drag & drop receipt/file or <span class="file-browse-link">browse</span>';
          fileLabel.style.color = '';
        }
        showFeedback(
          !okType ? 'Only PNG, JPG or PDF files are allowed.' : 'Attachment must be 5 MB or smaller.',
          'var(--accent-loss)'
        );
      }
    });
  }

  // Drag & drop
  if (fileDropzone && fileInput) {
    fileDropzone.addEventListener('dragover', (e) => e.preventDefault());
    fileDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      try {
        const dt = new DataTransfer();
        dt.items.add(f);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change'));
      } catch (err) { /* browser allow nahi karta */ }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('contactName').value.trim();
    const email = document.getElementById('contactEmail').value.trim();
    const subject = document.getElementById('contactSubject').value;
    const message = document.getElementById('contactMessage').value.trim();

    if (!name || !email || !message) {
      showFeedback('Please fill out all required fields.', 'var(--accent-loss)');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFeedback('Please enter a valid email address.', 'var(--accent-loss)');
      return;
    }

    if (message.length < 10) {
      showFeedback('Please write at least 10 characters in your message.', 'var(--accent-loss)');
      return;
    }

    const client = window.supabaseClient;

    if (!client) {
      showFeedback('Messaging is unavailable right now. Please email support.pipzone@gmail.com.', 'var(--accent-loss)');
      return;
    }

    // Button loading
    submitBtn.disabled = true;
    const btnText = submitBtn.querySelector('.btn-text');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');
    if (btnText) btnText.textContent = 'Sending message...';
    if (btnSpinner) btnSpinner.classList.remove('hidden');

    let ok = false;
    let errorText = 'We could not send your message. Please try again or email support.pipzone@gmail.com.';

    try {
      const payload = { name, email, subject, message };

      const f = fileInput && fileInput.files[0];
      if (f) {
        payload.attachment_url = await uploadAttachment(client, f);
      }

      const { data, error } = await client.functions.invoke(CONTACT_FUNCTION, { body: payload });

      if (error) throw error;
      if (data && data.success === false) { errorText = data.error || errorText; throw new Error(data.error); }

      ok = true;
    } catch (err) {
      console.error('Contact form failed:', err);
    }

    submitBtn.disabled = false;
    if (btnText) btnText.textContent = 'Send Message to Desk';
    if (btnSpinner) btnSpinner.classList.add('hidden');

    if (!ok) {
      showFeedback(errorText, 'var(--accent-loss)');
      return;
    }

    showFeedback('Thank you! Your message has been sent to the PipZoNe desk. We will reply to your email address.', 'var(--accent-profit)');

    form.reset();
    if (fileLabel) {
      fileLabel.innerHTML = 'Drag & drop receipt/file or <span class="file-browse-link">browse</span>';
      fileLabel.style.color = '';
    }
  });
}

/**
 * PipZoNe — Hero Live Market Terminal (BTC / ETH)
 * Data: Binance public klines. Chart: TradingView lightweight-charts
 * (library index.html <head> mein load hoti hai)
 */
(function () {
  'use strict';

  const KLINES_URL = 'https://api.binance.com/api/v3/klines';
  const REFRESH_MS = 4000;
  const SYMBOLS = { BTC: 'BTCUSDT', ETH: 'ETHUSDT' };
  const LABELS = { BTC: 'BTC/USDT', ETH: 'ETH/USDT' };
  const INTERVALS = ['1m', '5m', '15m', '1h', '4h'];

  const $ = (id) => document.getElementById(id);

  let heroAsset = 'BTC';
  let heroTf = '1m';
  let heroEntry = null;

  function chartColors() {
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    return light
      ? { up: '#10B981', down: '#E0533D', grid: 'rgba(0,0,0,0.07)', text: '#475569' }
      : { up: '#5EEAB0', down: '#F2735E', grid: 'rgba(255,255,255,0.06)', text: '#94A3B8' };
  }

  function seriesOptions(c) {
    return {
      upColor: c.up, downColor: c.down,
      borderUpColor: c.up, borderDownColor: c.down,
      wickUpColor: c.up, wickDownColor: c.down
    };
  }

  function chartOptions(c) {
    return {
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: c.text,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11
      },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.grid },
      timeScale: { borderColor: c.grid, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 }
    };
  }

  async function loadCandles(symbol, tf, limit = 120) {
    try {
      const res = await fetch(`${KLINES_URL}?symbol=${symbol}&interval=${tf}&limit=${limit}`);
      if (!res.ok) throw new Error('Binance request failed: ' + res.status);
      const rows = await res.json();
      return rows.map((r) => ({
        time: Math.floor(r[0] / 1000),
        open: +r[1], high: +r[2], low: +r[3], close: +r[4]
      }));
    } catch (err) {
      console.error('Binance candles error:', err);
      return [];
    }
  }

  function updateDisplay(price, refPrice) {
    const priceEl = $('heroPrice');
    const changeEl = $('heroChange');

    if (priceEl) {
      priceEl.textContent = '$' + price.toLocaleString(undefined, {
        minimumFractionDigits: 2, maximumFractionDigits: 2
      });
    }
    if (changeEl && Number.isFinite(refPrice) && refPrice > 0) {
      const diff = price - refPrice;
      const pct = (diff / refPrice) * 100;
      changeEl.textContent =
        (diff >= 0 ? '+' : '') + diff.toFixed(2) +
        ' (' + (diff >= 0 ? '+' : '') + pct.toFixed(2) + '%)';
      changeEl.classList.toggle('up', diff >= 0);
      changeEl.classList.toggle('down', diff < 0);
    }
  }

  async function refresh(entry) {
    const candles = await loadCandles(SYMBOLS[entry.asset], entry.tf);
    if (entry.destroyed || !candles.length) return;

    try {
      if (!entry.loaded) {
        entry.series.setData(candles);
        entry.chart.timeScale().fitContent();
        entry.loaded = true;
      } else {
        // sirf aakhri known candle ya us se nayi candles update hon
        candles
          .filter((c) => c.time >= entry.lastTime)
          .forEach((c) => entry.series.update(c));
      }
      entry.lastTime = candles[candles.length - 1].time;
    } catch (err) {
      // agar kabhi order bigde to poora data dobara set kar do, error na aaye
      entry.series.setData(candles);
      entry.lastTime = candles[candles.length - 1].time;
    }

    const last = candles[candles.length - 1];
    updateDisplay(last.close, candles[0].open);
  }

  function destroyEntry(entry) {
    if (!entry) return;
    entry.destroyed = true;
    if (entry.timer) clearInterval(entry.timer);
    if (entry.observer) entry.observer.disconnect();
    try { entry.chart.remove(); } catch (e) {}
  }

  function buildHeroChart() {
    destroyEntry(heroEntry);

    const el = $('heroChart');
    if (!el || typeof LightweightCharts === 'undefined') return;
    el.innerHTML = '';

    const colors = chartColors();
    const chart = LightweightCharts.createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      ...chartOptions(colors)
    });
    const series = chart.addCandlestickSeries(seriesOptions(colors));

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);

    heroEntry = {
      chart, series, observer,
      asset: heroAsset, tf: heroTf,
      loaded: false, destroyed: false, lastTime: 0
    };

    const priceEl = $('heroPrice');
    const changeEl = $('heroChange');
    if (priceEl) priceEl.textContent = '—';
    if (changeEl) { changeEl.textContent = '—'; changeEl.classList.remove('up', 'down'); }

    refresh(heroEntry);
    heroEntry.timer = setInterval(() => refresh(heroEntry), REFRESH_MS);
  }

  function switchHeroAsset(asset) {
    heroAsset = asset;
    document.querySelectorAll('#heroAssetTabs .market-tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.asset === asset);
    });
    const label = $('heroMarketLabel');
    if (label) label.textContent = LABELS[asset];
    buildHeroChart();
  }

  function wireTimeframes() {
    const row = $('heroTfRow');
    if (!row) return;
    row.querySelectorAll('.tf-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!INTERVALS.includes(btn.dataset.tf)) return;
        row.querySelectorAll('.tf-chip').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        heroTf = btn.dataset.tf;
        buildHeroChart();
      });
    });
  }

  // Theme toggle hone par chart ke colors bhi badlein
  function watchTheme() {
    new MutationObserver(() => {
      if (!heroEntry) return;
      const c = chartColors();
      heroEntry.chart.applyOptions(chartOptions(c));
      heroEntry.series.applyOptions(seriesOptions(c));
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  function init() {
    if (!$('heroChart')) return;
    if (typeof LightweightCharts === 'undefined') {
      console.error('lightweight-charts load nahi hui — live chart band hai.');
      return;
    }
    wireTimeframes();
    watchTheme();
    buildHeroChart();
  }

  // index.html ke onclick="switchHeroAsset('BTC')" ke liye global
  window.switchHeroAsset = switchHeroAsset;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();