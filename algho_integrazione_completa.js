// ============================================================
// INTEGRAZIONE ALGHO COMPLETA per il sito Marni
// - AJWT unsigned (identita' utente loggato da localStorage user_info)
// - Caricamento widget Algho
// - Snippet GPS per lo Store Locator
// ============================================================

// ---------- 1. Helper AJWT ----------
function b64url(obj) {
  var json = JSON.stringify(obj);
  var b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function creaAJWTunsigned(utente) {
  var header = { alg: 'none', typ: 'JWT' };
  // I cookie di sessione restano sul browser: n8n non li vede. Ma l'AJWT
  // viaggia fino ai flussi nell'header algho-json-web-token, quindi e' li'
  // che va messa la prova di sessione. Senza, lo stato considera OSPITE
  // qualunque cliente, e wishlist, profilo e guardaroba deviano sempre
  // sull'alternativa anche a chi ha fatto l'accesso.
  var cquid = leggiCookie('cquid') || '';
  var dwsid = leggiCookie('dwsid') || '';
  var payload = {
    payload: {
      email: utente.email || '',
      customerId: utente.customerId || '',
      customerNo: utente.customerNo || '',
      name: utente.name || '',
      // prova di sessione reale, gia' verificata da isLoginAttivo()
      sessione: true,
      cquid: cquid,
      dwsid: dwsid ? dwsid.slice(0, 12) : '',   // basta un frammento
      emessoIl: Date.now()
    }
  };
  return b64url(header) + '.' + b64url(payload) + '.';
}
// legge un cookie per nome
function getCookie(nome) {
  var value = '; ' + document.cookie;
  var parts = value.split('; ' + nome + '=');
  if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
  return '';
}
// verifica se l'utente e' REALMENTE loggato ORA (non un dato residuo).
// e sparisce al logout; 'user_info' invece resta (residuo) -> non affidabile da solo.
// ---------- RILEVAMENTO LOGIN ----------
// user_info pero' resta popolato anche dopo il logout (problema noto lato sito), quindi
// lo incrociamo con il cookie cquid, che Salesforce valorizza per i clienti autenticati.
function leggiCookie(nome) {
  try {
    var parti = document.cookie.split(';');
    for (var i = 0; i < parti.length; i++) {
      var p = parti[i].trim();
      if (p.indexOf(nome + '=') === 0) return decodeURIComponent(p.substring(nome.length + 1));
    }
  } catch (e) {}
  return '';
}

function datiUtente() {
  try {
    var raw = localStorage.getItem('user_info');
    if (!raw) return null;
    var u = JSON.parse(raw);
    if (!u || !u.customer_id) return null;
    return u;
  } catch (e) { return null; }
}

function isLoginAttivo() {
  var u = datiUtente();
  if (!u) return false;

  // user_info resta nel localStorage anche dopo il logout: da solo non prova
  // nulla. Serve un cookie di SESSIONE, che il sito cancella all'uscita.
  // Trattare da loggato chi non lo e' e' peggio del contrario: l'agente
  // parlerebbe di ordini e preferiti di una sessione che il sito non riconosce.

  // cquid: Salesforce lo valorizza per i clienti autenticati.
  // Attenzione: per i guest vale "||" (due barre), che NON e' una sessione.
  var cquid = leggiCookie('cquid');
  if (cquid && cquid.replace(/\|/g, '').trim().length > 1) return true;

  // NB: dwsid NON prova il login: Salesforce lo assegna a qualunque visita,
  // anche ospite. Usarlo faceva partire AJWT e proattivo "area riservata"
  // per tutti (MCR-4523 / MCR-4551). Conta solo cquid.
  // nessuna sessione autenticata: i dati in localStorage sono un residuo
  return false;
}

// recupera i dati dell'utente loggato dal sito Marni.
function getUtenteLoggato() {
  // se non c'e' login attivo, sono guest (ignoro user_info residuo)
  if (!isLoginAttivo()) {
    return { email: '', customerId: '', customerNo: '', name: '' };
  }
  // login attivo: leggo i dati da user_info
  try {
    var raw = localStorage.getItem('user_info');
    if (raw) {
      var info = JSON.parse(raw);
      if (info && (info.customer_id || info.customer_email)) {
        return {
          email: info.customer_email || '',
          customerId: info.customer_id || '',
          customerNo: info.customer_cc_id || '',
          name: ''
        };
      }
    }
  } catch (e) {}
  // login attivo ma user_info assente: provo il cookie email
  var email = '';
  var attn = getCookie('attntv_mstore_email');
  if (attn) email = attn.split(':')[0].trim();
  if (email && email.indexOf('@') === -1) email = '';
  return { email: email, customerId: '', customerNo: '', name: '' };
}
// imposta l'AJWT su Algho (se l'utente e' loggato)
var _ultimaIdentita = '';

function impostaIdentitaAlgho() {
  var u = getUtenteLoggato();
  if (!u.email && !u.customerId) {
    // Guest: niente AJWT. Ma se prima era loggato ed e' uscito, bisogna
    // dirlo, altrimenti Algho continua a mandare l'identita' di prima.
    if (_ultimaIdentita && window.algho && window.algho.setAJWT) {
      window.algho.setAJWT('');
      _ultimaIdentita = '';
    }
    return false;
  }
  var token = creaAJWTunsigned(u);
  var firma = (u.customerId || '') + '|' + (u.email || '');
  if (window.algho && window.algho.setAJWT) {
    window.algho.setAJWT(token);
    _ultimaIdentita = firma;
    return true;
  }
  return false;
}

// ---------- 2. Snippet GPS per lo Store Locator ----------
// Funzione globale chiamata dal bottone "Usa la mia posizione" nelle card store.
// Chiede la geolocalizzazione al browser; se concessa imposta GPS:lat,lon nel
// context e invia un messaggio che attiva lo store locator; se negata ripiega
// sulla richiesta della citta'.
window.askGeoAndFindStore = function () {
  // se abbiamo gia' il consenso, la posizione e' gia' nel widget: chiediamo e basta
  if (window.chiediPosizione) {
    window.chiediPosizione(function (ok) {
      try {
        var f = window.algho && window.algho.sendUserMessage;
        if (f) f(ok ? 'Qual e\' il negozio Marni piu\' vicino a me?' : 'Cerca un negozio Marni');
      } catch (e) {}
    });
    return;
  }
  function send(msg) {
    try { if (window.algho && window.algho.sendUserMessage) { window.algho.sendUserMessage(msg); } } catch (e) {}
  }
  function setCtx(v) {
    try { if (window.algho && window.algho.setContext) { window.algho.setContext(v); } } catch (e) {}
  }
  // avviso al cliente dentro la chat: mai un alert() del browser
  function avvisa(testo) {
    try { if (window.algho && window.algho.sendBotMessage) { window.algho.sendBotMessage(testo); } } catch (e) {}
  }
  // se la geolocalizzazione non e' supportata, avviso senza generare loop di messaggi
  if (!navigator.geolocation) {
    avvisa('La geolocalizzazione non e\' disponibile. Scrivimi il nome della tua citta\'.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    function (pos) {
      // SUCCESSO: metto le coordinate nel context e attivo lo store locator
      var lat = pos.coords.latitude.toFixed(6);
      var lon = pos.coords.longitude.toFixed(6);
      setCtx('GPS:' + lat + ',' + lon);
      send('Negozio Marni piu vicino a me');
    },
    function (err) {
      // ERRORE/NEGATO: avviso in chat, NON rilancio la richiesta citta' (evito loop)
      avvisa('Non riesco a rilevare la tua posizione. Scrivimi il nome della tua citta\' (es. Milano).');
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
  );
};

// ---------- 3. Caricamento widget Algho ----------
// Lingua del widget = lingua della pagina (it-it, en-gb, fr-fr...). Senza questo
// attributo Algho riceve sempre userLang=it e risponde in italiano anche a chi
// scrive in inglese (SDA e flussi n8n leggono userLang). Lingue fuori lista -> en.
function linguaPagina() {
  var l = (document.documentElement.lang || '').toLowerCase().slice(0, 2);
  if (!l) { var m = window.location.pathname.match(/^\/([a-z]{2})-[a-z]{2}\//i); l = m ? m[1].toLowerCase() : 'it'; }
  return /^(it|en|fr|de|es)$/.test(l) ? l : 'en';
}

var tag = document.createElement("algho-viewer");
tag.setAttribute("bot-id", "077b660a2a26b329e9de6a8b60758320");
tag.setAttribute("language", linguaPagina());
tag.setAttribute("widget", "true");
tag.setAttribute("audio", "false");
tag.setAttribute("voice", "false");
tag.setAttribute("open", "false");
tag.setAttribute("theme-style", "light");
tag.setAttribute("theme-css", "https://loriscaputo17-arch.github.io/otb-integration/otb-agent-marni.css?v=" + Math.floor(Date.now()/300000));
tag.setAttribute("widget-border-color", "#000000");
tag.setAttribute("z-index", "9999");
// Schermata iniziale: testi e privacy vengono dal widget (prop native del viewer:
// start-message, privacy-message, privacy-url, invert-privacy), non dal CSS.
// start-message e' solo testo: la prima riga e' il titolo (::first-line nel CSS),
// dopo l'a-capo il sottotitolo. privacy-message accetta HTML.
// hide-menu toglie il menu a sinistra del campo di scrittura.
(function () {
  var lingua = linguaPagina();
  var m = window.location.pathname.match(/^\/([a-z]{2}-[a-z]{2})\//i);
  var locale = m ? m[1].toLowerCase() : (lingua === 'it' ? 'it-it' : 'en-gb');
  var urlPrivacy = '/' + locale + '/help?content=privacy-policy';
  var TESTI = {
    it: { inizio: 'Ciao, sono Marni Agent\nSono qui per aiutarti con ordini, resi, prodotti e consigli di stile.',
          privacy: 'Continuando accetti la <a href="' + urlPrivacy + '" target="_blank">Privacy Policy</a> di Marni.' },
    en: { inizio: 'Hi, I am Marni Agent\nI am here to help you with orders, returns, products and style advice.',
          privacy: 'By continuing you accept Marni\'s <a href="' + urlPrivacy + '" target="_blank">Privacy Policy</a>.' },
    fr: { inizio: 'Bonjour, je suis Marni Agent\nJe suis l\u00e0 pour vous aider avec vos commandes, retours, produits et conseils de style.',
          privacy: 'En continuant, vous acceptez la <a href="' + urlPrivacy + '" target="_blank">Politique de confidentialit\u00e9</a> de Marni.' },
    de: { inizio: 'Hallo, ich bin Marni Agent\nIch helfe Ihnen bei Bestellungen, Retouren, Produkten und Stilfragen.',
          privacy: 'Mit dem Fortfahren akzeptieren Sie die <a href="' + urlPrivacy + '" target="_blank">Datenschutzerkl\u00e4rung</a> von Marni.' },
    es: { inizio: 'Hola, soy Marni Agent\nEstoy aqu\u00ed para ayudarte con pedidos, devoluciones, productos y consejos de estilo.',
          privacy: 'Al continuar aceptas la <a href="' + urlPrivacy + '" target="_blank">Pol\u00edtica de privacidad</a> de Marni.' }
  };
  var t = TESTI[lingua] || TESTI.en;
  tag.setAttribute("start-message", t.inizio);
  tag.setAttribute("privacy-message", t.privacy);
  tag.setAttribute("privacy-url", urlPrivacy);
  tag.setAttribute("invert-privacy", "true");
  tag.setAttribute("hide-menu", "true");
})();
document.body.appendChild(tag);

var script = document.createElement("script");
script.setAttribute("id", "algho-viewer-module");
script.setAttribute("type", "text/javascript");
script.setAttribute("defer", "defer");
script.setAttribute("charset", "UTF-8");
script.setAttribute("src", "https://staging-fe.alghoncloud.com/algho-viewer.min.js");
document.body.appendChild(script);

// ---------- 4. Imposta l'AJWT QUANDO Algho e' pronto ----------
(function attendiAlghoEImpostaAJWT() {
  var tentativi = 0;
  var maxTentativi = 60; // ~30s
  var timer = setInterval(function () {
    tentativi++;
    if (window.algho && window.algho.setAJWT) {
      impostaIdentitaAlgho();
      clearInterval(timer);
      // P47 (2026-09-21): il login puo' avvenire senza ricaricare la pagina
      // (accesso via popup/AJAX): senza questo controllo la conversazione gia'
      // aperta restava "ospite" fino al reload. impostaIdentitaAlgho() manda il
      // token solo se l'identita' e' cambiata.
      setInterval(function () { try { impostaIdentitaAlgho(); } catch (e) {} }, 5000);
    } else if (tentativi >= maxTentativi) {
      clearInterval(timer);
    }
  }, 500);
})();

// ---------- 4b. Eventi GA4 per le azioni della chat (P47) ----------
// Il clic sul carrello nelle card e' l'unica azione del cliente che parte dal
// widget: si registra come add_to_cart nel dataLayer (fonte "chat"). Gli altri
// eventi (rimozioni, look, handover) attendono la mappa KPI di OTB (#45).
(function EventiGA4() {
  function push(ev) {
    try { window.dataLayer = window.dataLayer || []; window.dataLayer.push(ev); } catch (e) {}
  }
  document.addEventListener('click', function (e) {
    try {
      var path = e.composedPath ? e.composedPath() : [];
      for (var i = 0; i < path.length; i++) {
        var el = path[i];
        if (!el || !el.getAttribute) continue;
        var titolo = el.getAttribute('title') || '';
        var onclick = el.getAttribute('onclick') || '';
        if (/mr-btn/.test(el.className || '') && /carrello|bag|panier|warenkorb|cesta/i.test(titolo)) {
          var m = onclick.match(/setContext\(['"]([A-Z0-9]{8,})['"]\)/i);
          push({ event: 'add_to_cart', source: 'chat', items: [{ item_id: m ? m[1] : '' }] });
          return;
        }
      }
    } catch (err) {}
  }, true);
})();

// ---------- 5. LIFE SIGNAL — anima il notch (dentro shadow DOM di algho-viewer) ----------
// Condizioni (Ila):
//   1. Ogni pagina: dopo 20s di inattività
//   2. PLP: a fine pagina
//   3. Help area: dopo 1 min
//   4. Search result: a fine scrolling
(function () {
  var CONFIG = {
    inactivitySeconds: 20,
    helpAreaSeconds: 60,
    animationClass: 'algho-life-signal',
    animationDurationMs: 2600,
    repeatCooldownMs: 30000,
    notchSelectors: [
      '.chat-widget.chat-button',
      'button.chat-widget',
      '.chat-button',
      '[class*="chat-button"]',
      'button'
    ],
    // PLP = pagine categoria/listing. NB: le PDP (pagina prodotto) terminano col nome
    //  prodotto e NON devono contare come PLP. Le PLP di Marni sono tipo /it-it/uomo/borse/
    plpPattern: /\/(uomo|donna|men|women|kids|bambino|bambina)\/[^/]+\/?$/i,
    helpPattern: /\/help\b|\/assistenza\b|\/customer-care\b/i,
    searchPattern: /\/search\b|[?&]q=/i
  };

  // Animazione: piu' evidente (scale + doppio alone), colore scuro elegante.
  var CSS =
    '@keyframes alghoLifePulse {' +
    '  0%   { transform: scale(1);    box-shadow: 0 0 0 0 rgba(20,20,20,0.45); }' +
    '  15%  { transform: scale(1.18); box-shadow: 0 0 0 8px rgba(20,20,20,0.22); }' +
    '  35%  { transform: scale(1.06); box-shadow: 0 0 0 16px rgba(20,20,20,0.10); }' +
    '  55%  { transform: scale(1.18); box-shadow: 0 0 0 24px rgba(20,20,20,0.05); }' +
    '  75%  { transform: scale(1.04); box-shadow: 0 0 0 32px rgba(20,20,20,0); }' +
    '  100% { transform: scale(1);    box-shadow: 0 0 0 0 rgba(20,20,20,0); }' +
    '}' +
    '.' + CONFIG.animationClass + '{' +
    '  animation: alghoLifePulse 1.3s ease-out 2 !important;' +
    '  transform-origin: center !important;' +
    '  border-radius: 50% !important;' +
    '}';

  function getShadow() {
    var host = document.querySelector('algho-viewer');
    return host ? host.shadowRoot : null;
  }
  var cssInjected = false;
  function injectCss(shadow) {
    if (cssInjected || !shadow) return;
    var st = document.createElement('style');
    st.textContent = CSS;
    shadow.appendChild(st);
    cssInjected = true;
  }
  function getNotch() {
    var shadow = getShadow();
    if (!shadow) return null;
    for (var i = 0; i < CONFIG.notchSelectors.length; i++) {
      var el = shadow.querySelector(CONFIG.notchSelectors[i]);
      if (el) return el;
    }
    return shadow.querySelector('.algho') || null;
  }

  var lastSignal = 0;
  function chatIsOpen() {
    try { return !!(window.algho && typeof window.algho.isOpen === 'function' && window.algho.isOpen()); }
    catch (e) { return false; }
  }
  function triggerSignal(reason) {
    var now = Date.now();
    if (now - lastSignal < CONFIG.repeatCooldownMs) return; // cooldown
    var shadow = getShadow();
    if (!shadow) return;
    injectCss(shadow);
    var notch = getNotch();
    if (!notch) return;
    if (chatIsOpen()) return;
    lastSignal = now;
    notch.classList.remove(CONFIG.animationClass);
    // reflow per poter riavviare l'animazione anche subito
    void notch.offsetWidth;
    notch.classList.add(CONFIG.animationClass);
    setTimeout(function () { notch.classList.remove(CONFIG.animationClass); }, CONFIG.animationDurationMs);
  }
  window.__lifeSignalTest = function () { lastSignal = 0; triggerSignal('manual-test'); };

  // ---- Condizione 1: inattività (ogni pagina) ----
  var inactivityTimer = null;
  function armInactivity() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(function () {
      triggerSignal('inactivity');
      // ri-arma per la prossima finestra di inattività
      armInactivity();
    }, CONFIG.inactivitySeconds * 1000);
  }
  // eventi che indicano attività reale dell'utente (escludo scroll passivi automatici)
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'click', 'wheel'].forEach(function (ev) {
    window.addEventListener(ev, armInactivity, { passive: true });
  });
  armInactivity();

  // ---- tipo di pagina ----
  var lsUrl = window.location.pathname + window.location.search;
  var isPLP = CONFIG.plpPattern.test(lsUrl);
  var isHelp = CONFIG.helpPattern.test(lsUrl);
  var isSearch = CONFIG.searchPattern.test(lsUrl);

  // ---- Condizione 3: help area dopo 1 min ----
  if (isHelp) {
    setTimeout(function () { triggerSignal('help-area'); }, CONFIG.helpAreaSeconds * 1000);
  }

  // ---- Condizioni 2 e 4: fine pagina (PLP e search) ----
  // "arrivato in fondo" scatta UNA volta; si ri-arma solo quando l'utente
  // si allontana dal fondo (torna su), evitando il flicker ripetuto.
  if (isPLP || isSearch) {
    var atBottom = false;
    window.addEventListener('scroll', function () {
      var scrolled = window.innerHeight + window.scrollY;
      var full = document.documentElement.scrollHeight || document.body.offsetHeight;
      var nearBottom = scrolled >= full - 200;
      if (nearBottom && !atBottom) {
        atBottom = true;
        triggerSignal(isPLP ? 'plp-end' : 'search-end');
      } else if (!nearBottom && atBottom) {
        // l'utente si e' allontanato dal fondo: ri-armo per la prossima volta
        if (scrolled < full - 400) atBottom = false;
      }
    }, { passive: true });
  }
})();

// ---------- 6. CONTESTO DI PAGINA ----------
// Algho non aggiorna currentUrl a ogni messaggio: la passiamo noi tramite setContext,
// cosi' l'agente sa sempre quale prodotto o quale pagina il cliente sta guardando.
(function contestoPagina() {
  var ultimoInviato = '';

  function idProdottoDaUrl(u) {
    // le schede prodotto finiscono con -<ID>.html (es. camicie-CUJU0015L4USCW23SDB50.html)
    var m = String(u || '').match(/-([A-Z0-9]{10,})\.html/i);
    return m ? m[1].toUpperCase() : '';
  }

  function inviaContesto() {
    try {
      if (!window.algho || !window.algho.setContext) return;
      var url = window.location.href;
      if (url === ultimoInviato) return;
      var pid = idProdottoDaUrl(url);
      // il widget espone setCurrentUrl: e' il modo corretto di tenerlo allineato
      // alla pagina. Il context porta l'id prodotto, che i flussi leggono.
      if (window.algho.setCurrentUrl) window.algho.setCurrentUrl(url);
      // Se non siamo piu' su una scheda prodotto azzero il contesto: lasciarlo
      // fermo sul capo di prima fa comporre look attorno al prodotto sbagliato.
      window.algho.setContext(pid ? pid : '');
      ultimoInviato = url;
    } catch (e) {}
  }

  // all'avvio, appena il widget e' pronto
  var tentativi = 0;
  var attesa = setInterval(function () {
    tentativi++;
    if (window.algho && window.algho.setContext) { inviaContesto(); clearInterval(attesa); }
    else if (tentativi > 60) clearInterval(attesa);
  }, 500);

  // a ogni cambio pagina, anche senza ricaricare (navigazione lato client)
  ['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m];
    history[m] = function () { var r = orig.apply(this, arguments); setTimeout(inviaContesto, 300); return r; };
  });
  window.addEventListener('popstate', function () { setTimeout(inviaContesto, 300); });
  setInterval(inviaContesto, 2000);   // rete di sicurezza per i siti che cambiano vista senza eventi
})();



// ---------- 7. FUNZIONI PROATTIVE ----------
// ============================================================
// FUNZIONI PROATTIVE — l'agente prende l'iniziativa nei momenti giusti.
// Da aggiungere in fondo allo script di integrazione Algho sul sito.
//
// Principi seguiti:
//  - una sola volta per tipo di pagina e per sessione: mai insistere
//  - mai se il cliente ha gia' scritto in chat: sta facendo altro
//  - mai se la chat e' gia' aperta: non si interrompe una conversazione
//  - solo dove serve davvero: area riservata e scheda prodotto
// ============================================================
(function proattivo() {

  var CONFIG = {
    // Sulla scheda prodotto l'invito automatico e' stato disattivato: interrompe
    // il cliente mentre guarda il capo. Basta metterlo a true per riaccenderlo.
    suPaginaProdotto: false,
    attesaPdp: 25000,        // sulla scheda prodotto: dopo 25 secondi di permanenza
    attesaRiservata: 2500,   // in area riservata: quasi subito, e' il momento giusto
    chiaveSessione: 'algho_proattivo_fatti'
  };

  // ---------- memoria di cosa abbiamo gia' proposto ----------
  function giaFatto(tipo) {
    try {
      var v = sessionStorage.getItem(CONFIG.chiaveSessione) || '';
      return v.split(',').indexOf(tipo) !== -1;
    } catch (e) { return false; }
  }
  function segnaFatto(tipo) {
    try {
      var v = sessionStorage.getItem(CONFIG.chiaveSessione) || '';
      var l = v ? v.split(',') : [];
      if (l.indexOf(tipo) === -1) l.push(tipo);
      sessionStorage.setItem(CONFIG.chiaveSessione, l.join(','));
    } catch (e) {}
  }

  // ---------- il cliente ha gia' scritto? allora lasciamolo fare ----------
  // Non ci si puo' fidare delle classi CSS del widget: parole come "user" o "right"
  // compaiono anche in elementi che non sono messaggi del cliente. Tengo traccia
  // io degli invii, intercettando sendUserMessage.
  var clienteHaScritto = false;
  try {
    if (window.algho && typeof window.algho.sendUserMessage === 'function') {
      var origSend = window.algho.sendUserMessage.bind(window.algho);
      window.algho.sendUserMessage = function (msg) {
        // i messaggi che inviamo noi in automatico non contano come scrittura del cliente
        if (!window.__alghoInvioAutomatico) clienteHaScritto = true;
        return origSend.apply(null, arguments);
      };
    }
  } catch (e) {}
  // Non basta intercettare sendUserMessage: il cliente puo' aver scritto
  // direttamente nel widget, o aperto la chat cliccando il pulsante. Guardiamo
  // la conversazione vera: se c'e' anche un solo messaggio, lasciamolo fare.
  function conversazioneInCorso() {
    try {
      var host = document.querySelector('algho-viewer');
      var radice = (host && host.shadowRoot) ? host.shadowRoot : null;
      if (!radice) return false;
      // messaggi del cliente
      var miei = radice.querySelectorAll('.myself-message, .message-myself, [class*="myself"]');
      if (miei && miei.length) return true;
      // messaggi dell'agente oltre al benvenuto: segno che si sta conversando
      var altri = radice.querySelectorAll('.other-message, [class*="other-message"]');
      if (altri && altri.length > 1) return true;
      // il campo di scrittura contiene testo: sta digitando
      var input = radice.querySelector('input[type="text"], textarea, [contenteditable="true"]');
      if (input && String(input.value || input.textContent || '').trim().length > 1) return true;
    } catch (e) {}
    return false;
  }

  function conversazioneAvviata() { return clienteHaScritto || conversazioneInCorso(); }

  // il widget non espone isOpen: tengo traccia io delle aperture
  var chatApertaOra = false;
  try {
    ['open','showChat'].forEach(function (m) {
      if (window.algho && typeof window.algho[m] === 'function') {
        var orig = window.algho[m].bind(window.algho);
        window.algho[m] = function () { chatApertaOra = true; return orig.apply(null, arguments); };
      }
    });
    ['close','hideChat'].forEach(function (m) {
      if (window.algho && typeof window.algho[m] === 'function') {
        var orig2 = window.algho[m].bind(window.algho);
        window.algho[m] = function () { chatApertaOra = false; return orig2.apply(null, arguments); };
      }
    });
  } catch (e) {}
  // Il cliente puo' aver aperto la chat cliccando il widget, senza passare
  // dai metodi che intercettiamo: controlliamo se il pannello e' visibile.
  function pannelloVisibile() {
    try {
      var host = document.querySelector('algho-viewer');
      var radice = (host && host.shadowRoot) ? host.shadowRoot : null;
      if (!radice) return false;
      var pannello = radice.querySelector('.chat-panel-container, .chat-container, [class*="chat-panel"]');
      if (!pannello) return false;
      var r = pannello.getBoundingClientRect();
      return r.width > 100 && r.height > 100;
    } catch (e) { return false; }
  }

  function chatAperta() { return chatApertaOra || pannelloVisibile(); }

  function pronto() {
    return !!(window.algho && window.algho.sendUserMessage);
  }

  // ---------- invio del messaggio proattivo ----------
  // L'agente si presenta con un invito e OFFRE una chip: e' il cliente a
  // scegliere. Prima lo script inviava da solo un messaggio "del cliente"
  // (sendUserMessage), che compariva in chat come se l'avesse scritto lui
  // (ticket MCR-4523). Ora la richiesta parte solo al clic sulla chip.
  function proponi(tipo, messaggio, contesto, invito) {
    if (giaFatto(tipo)) return false;
    if (!pronto()) return false;
    if (chatAperta() || conversazioneAvviata()) return false;
    // MCR-4550: mai riaprire dopo una chiusura esplicita, e una sola apertura
    // automatica per sessione. Sulle altre pagine resta il life signal del bubble.
    if (window.marniChatChiusaDalCliente && window.marniChatChiusaDalCliente()) return false;
    try { if (sessionStorage.getItem('marni_proattivo_aperto') === '1') return false; } catch (e) {}
    segnaFatto(tipo);
    try { sessionStorage.setItem('marni_proattivo_aperto', '1'); } catch (e) {}
    try {
      if (contesto && window.algho.setContext) window.algho.setContext(contesto);
      // teniamo l'agente allineato alla pagina corrente
      if (window.algho.setCurrentUrl) window.algho.setCurrentUrl(window.location.href);
      // apro il pannello: showChat mostra il widget, open lo espande
      if (window.algho.showChat) window.algho.showChat();
      if (window.algho.open) window.algho.open();
      if (!window.algho.sendBotMessage) return false;
      var testo = invito || messaggio;
      var chips = '';
      if (invito && messaggio) {
        chips = '<div class="mr-chips">' +
          '<button class="mr-chip" onclick="window.algho.sendUserMessage(' + attr(messaggio) + ')">' + esc(CHIP.si) + '</button>' +
          '<button class="mr-chip" onclick="window.algho.sendBotMessage(' + attr(CHIP.noRisposta) + ')">' + esc(CHIP.no) + '</button>' +
          '</div>';
      }
      window.algho.sendBotMessage('<p>' + esc(testo) + '</p>' + chips);
      return true;
    } catch (e) { return false; }
  }
  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // valore JS dentro un attributo onclick: apici singoli, escape di ' e "
  function attr(t) {
    return "'" + String(t).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;') + "'";
  }

  // ---------- riconoscimento della pagina ----------
  function tipoPagina() {
    var u = window.location.pathname + window.location.search;
    if (/\/(wishlist|preferiti|lista-desideri)/i.test(u)) return 'wishlist';
    if (/\/(cart|carrello|shopping-bag|bag)\b/i.test(u))  return 'carrello';
    if (/\/(order|ordini|order-history)/i.test(u))        return 'ordini';
    if (/\/(account|my-account|area-riservata|profilo)/i.test(u)) return 'account';
    if (/-([A-Z0-9]{10,})\.html/i.test(u))                return 'prodotto';
    return '';
  }

  function utenteRiconosciuto() {
    try { return typeof isLoginAttivo === 'function' ? isLoginAttivo() : false; }
    catch (e) { return false; }
  }

  // ---------- i messaggi, nella lingua della pagina ----------
  var LINGUA = (document.documentElement.lang || 'it').toLowerCase().slice(0, 2);
  var FRASI = {
    it: {
      account:  'Cosa mi consigli in base ai miei acquisti?',
      ordini:   'A che punto sono i miei ordini?',
      carrello: 'Cosa posso abbinare a quello che ho nel carrello?',
      wishlist: 'Cosa mi consigli fra i miei preferiti?',
      prodotto: 'Completa il look con questo prodotto'
    },
    en: {
      account:  'What do you recommend based on my purchases?',
      ordini:   'How are my orders doing?',
      carrello: 'What can I pair with what is in my bag?',
      wishlist: 'What do you suggest from my wishlist?',
      prodotto: 'Complete the look with this product'
    },
    fr: {
      account:  'Que me conseillez-vous selon mes achats ?',
      ordini:   'Ou en sont mes commandes ?',
      carrello: 'Avec quoi puis-je associer mon panier ?',
      wishlist: 'Que me conseillez-vous parmi mes favoris ?',
      prodotto: 'Completer le look avec ce produit'
    },
    de: {
      account:  'Was empfehlen Sie mir basierend auf meinen Kaufen?',
      ordini:   'Wie ist der Stand meiner Bestellungen?',
      carrello: 'Womit kann ich meinen Warenkorb kombinieren?',
      wishlist: 'Was empfehlen Sie aus meiner Wunschliste?',
      prodotto: 'Vervollstandige den Look mit diesem Produkt'
    },
    es: {
      account:  'Que me recomiendas segun mis compras?',
      ordini:   'Como van mis pedidos?',
      carrello: 'Con que puedo combinar lo que tengo en la cesta?',
      wishlist: 'Que me sugieres de mis favoritos?',
      prodotto: 'Completa el look con este producto'
    }
  };
  var T = FRASI[LINGUA] || FRASI.en;

  // Frase con cui l'agente apre: e' lui a prendere l'iniziativa, non il cliente.
  var INVITI = {
    it: {
      account:  'Bentornato. Vuoi che ti mostri qualcosa in linea con i tuoi acquisti?',
      ordini:   'Posso mostrarti a che punto sono i tuoi ordini, se ti fa comodo.',
      carrello: 'Vuoi che ti suggerisca come completare quello che hai nel carrello?',
      wishlist: 'Posso aiutarti a scegliere fra i capi che hai salvato.',
      prodotto: 'Ti interessa vedere come abbinare questo capo?'
    },
    en: {
      account:  'Welcome back. Shall I show you something in line with your purchases?',
      ordini:   'I can show you where your orders are, if that helps.',
      carrello: 'Would you like suggestions to complete what is in your bag?',
      wishlist: 'I can help you choose among your saved pieces.',
      prodotto: 'Would you like to see how to style this piece?'
    },
    fr: {
      account:  'Bon retour. Souhaitez-vous des suggestions selon vos achats ?',
      ordini:   'Je peux vous montrer ou en sont vos commandes.',
      carrello: 'Voulez-vous des idees pour completer votre panier ?',
      wishlist: 'Je peux vous aider a choisir parmi vos favoris.',
      prodotto: 'Souhaitez-vous voir comment porter cette piece ?'
    },
    de: {
      account:  'Willkommen zuruck. Soll ich Ihnen Passendes zu Ihren Kaufen zeigen?',
      ordini:   'Ich kann Ihnen den Stand Ihrer Bestellungen zeigen.',
      carrello: 'Mochten Sie Vorschlage zu Ihrem Warenkorb?',
      wishlist: 'Ich helfe Ihnen gern bei der Auswahl aus Ihrer Wunschliste.',
      prodotto: 'Mochten Sie sehen, wie man dieses Teil kombiniert?'
    },
    es: {
      account:  'Bienvenido de nuevo. Te muestro algo acorde a tus compras?',
      ordini:   'Puedo mostrarte en que punto estan tus pedidos.',
      carrello: 'Quieres sugerencias para completar tu cesta?',
      wishlist: 'Puedo ayudarte a elegir entre tus favoritos.',
      prodotto: 'Quieres ver como combinar esta prenda?'
    }
  };
  var INV = INVITI[LINGUA] || INVITI.en;
  // le due chip dell'invito, nella lingua della pagina
  var CHIPS = {
    it: { si: 'Si, mostrami',     no: 'No, grazie',  noRisposta: 'Va bene. Sono qui se ti serve qualcosa.' },
    en: { si: 'Yes, show me',     no: 'No, thanks',  noRisposta: 'All right. I am here if you need anything.' },
    fr: { si: 'Oui, montrez-moi', no: 'Non, merci',  noRisposta: 'Tres bien. Je suis la si besoin.' },
    de: { si: 'Ja, zeigen',       no: 'Nein, danke', noRisposta: 'In Ordnung. Ich bin da, wenn Sie mich brauchen.' },
    es: { si: 'Si, muestrame',    no: 'No, gracias', noRisposta: 'De acuerdo. Aqui estoy si necesitas algo.' }
  };
  var CHIP = CHIPS[LINGUA] || CHIPS.en;

  // ---------- id del prodotto in pagina ----------
  function idProdotto() {
    var m = String(window.location.href).match(/-([A-Z0-9]{10,})\.html/i);
    return m ? m[1].toUpperCase() : '';
  }

  // ---------- avvio ----------
  function avvia() {
    var tipo = tipoPagina();
    if (!tipo) return;

    // AREA RISERVATA: ha senso solo se il cliente e' riconosciuto
    if (tipo === 'account' || tipo === 'ordini' || tipo === 'wishlist') {
      if (!utenteRiconosciuto()) return;
      setTimeout(function () { proponi(tipo, T[tipo], null, INV[tipo]); }, CONFIG.attesaRiservata);
      return;
    }

    // CARRELLO: solo se contiene qualcosa
    if (tipo === 'carrello') {
      var vuoto = /vuot|empty|leer|vide|vacio/i.test(document.body.innerText.slice(0, 3000));
      if (vuoto) return;
      setTimeout(function () { proponi('carrello', T.carrello, null, INV.carrello); }, CONFIG.attesaRiservata);
      return;
    }

    // SCHEDA PRODOTTO: dopo una permanenza che indica interesse reale
    if (tipo === 'prodotto') {
      if (!CONFIG.suPaginaProdotto) return;
      var pid = idProdotto();
      if (!pid) return;
      var attivo = true;
      // se il cliente aggiunge al carrello o va via, non proponiamo piu'
      window.addEventListener('beforeunload', function () { attivo = false; });
      setTimeout(function () {
        // ricontrollo adesso: nei 25 secondi il cliente puo' aver iniziato a scrivere
        if (attivo && !chatAperta() && !conversazioneAvviata()) {
          proponi('prodotto', T.prodotto, pid, INV.prodotto);
        }
      }, CONFIG.attesaPdp);
    }
  }

  // attendo che il widget sia pronto
  var tentativi = 0;
  var attesa = setInterval(function () {
    tentativi++;
    if (pronto()) { clearInterval(attesa); avvia(); }
    else if (tentativi > 60) clearInterval(attesa);
  }, 500);

  // per provarlo subito da console, senza aspettare:
  window.__proattivoTest = function (tipo, forza) {
    try { sessionStorage.removeItem(CONFIG.chiaveSessione); } catch (e) {}
    if (forza !== false) { clienteHaScritto = false; chatApertaOra = false; }
    var t = tipo || tipoPagina();
    var partito = proponi(t, T[t] || T.prodotto, t === 'prodotto' ? idProdotto() : null, INV[t]);
    return { tipo: t, messaggio: T[t], invito: INV[t], partito: partito,
             pronto: pronto(), loggato: utenteRiconosciuto(),
             chat_aperta: chatAperta(), gia_scritto: conversazioneAvviata() };
  };
})();



// ---------- POSIZIONE PER IL WIDGET ----------
// Il widget espone setGpsLocation: una volta impostata, la posizione viaggia
// con ogni messaggio e il flusso dei negozi non deve piu' chiedere la citta'.
// Non la chiediamo all'avvio (sarebbe invadente): la memorizziamo al primo
// consenso e la riusiamo per tutta la sessione.
(function PosizioneCondivisa(){
  var CHIAVE = 'algho_posizione';

  function salva(lat, lon){
    try{ sessionStorage.setItem(CHIAVE, lat + ',' + lon); }catch(e){}
    try{
      if (window.algho && window.algho.setGpsLocation) window.algho.setGpsLocation(lat, lon);
      if (window.algho && window.algho.setContext) window.algho.setContext('GPS:' + lat + ',' + lon);
    }catch(e){}
  }

  function salvata(){
    try{
      var v = sessionStorage.getItem(CHIAVE);
      if (!v) return null;
      var p = v.split(',');
      return { lat: parseFloat(p[0]), lon: parseFloat(p[1]) };
    }catch(e){ return null; }
  }

  // se l'abbiamo gia', la ripassiamo al widget appena e' pronto
  var att = 0;
  var t = setInterval(function(){
    att++;
    if (window.algho && window.algho.setGpsLocation) {
      clearInterval(t);
      var p = salvata();
      if (p) salva(p.lat, p.lon);
    } else if (att > 60) clearInterval(t);
  }, 500);

  // richiesta esplicita: la chiamiamo dal pulsante "Usa la mia posizione"
  window.chiediPosizione = function(callback){
    var p = salvata();
    if (p) { salva(p.lat, p.lon); if (callback) callback(true); return; }
    if (!navigator.geolocation) { if (callback) callback(false); return; }
    navigator.geolocation.getCurrentPosition(
      function(pos){
        salva(pos.coords.latitude.toFixed(5), pos.coords.longitude.toFixed(5));
        if (callback) callback(true);
      },
      function(){ if (callback) callback(false); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  };

  // Se il permesso e' gia' stato concesso in passato, il browser lo dice senza
  // mostrare alcun avviso: in quel caso prendiamo la posizione subito.
  try{
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(function(st){
        if (st.state === 'granted') window.chiediPosizione();
      }).catch(function(){});
    }
  }catch(e){}
})();


// ---------- SINCRONIZZAZIONE CARRELLO ----------
// La chat opera sul basket SCAPI; il sito ha la sua vista, che non si accorge
// del cambiamento finche' non ricarica. Quando la chat conferma un'aggiunta,
// aggiorniamo il sito: da loggato il basket e' lo stesso, quindi basta
// rileggerlo perche' il contatore e la pagina carrello si allineino.
(function SincronizzazioneCarrello(){

  function aggiornaSito(){
    try{
      // 1) se il sito espone un proprio aggiornamento, usiamo quello
      if (window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('cart:update'));
        window.dispatchEvent(new CustomEvent('minicart:update'));
        window.dispatchEvent(new CustomEvent('basket:refresh'));
      }
      // 2) se siamo sulla pagina carrello, la ricarichiamo: e' l'unico modo
      //    affidabile per mostrare il contenuto aggiornato
      if (/\/(cart|carrello|shopping-bag)\b/i.test(window.location.pathname)) {
        setTimeout(function(){ window.location.reload(); }, 1200);
        return;
      }
      // 3) altrove rileggiamo il minicart e aggiorniamo il contatore.
      //    Su questo tema il numero e' il testo dell'elemento con le classi
      //    .minicart-action.counter-icon, e il contenuto del carrello sta in
      //    .product-summary: se e' vuoto, il conteggio e' zero.
      fetch('/on/demandware.store/Sites-MarniEU-Site/it_IT/Cart-MiniCartShow', { credentials: 'include' })
        .then(function(r){ return r.ok ? r.text() : null; })
        .then(function(html){
          if (!html) return;
          var doc = new DOMParser().parseFromString(html, 'text/html');
          // conto le righe prodotto nel riepilogo
          var righe = doc.querySelectorAll('.product-summary .product-line-item, .product-summary .line-item, .product-summary [class*="product-info"]');
          var n = righe.length;
          // se il tema espone un conteggio esplicito, quello ha la precedenza
          var esplicito = doc.querySelector('[data-item-count], .minicart-quantity, .counter-icon');
          if (esplicito) {
            var v = esplicito.getAttribute('data-item-count') || (esplicito.textContent || '').trim();
            if (/^\d+$/.test(v)) n = parseInt(v, 10);
          }
          document.querySelectorAll('.minicart-action.counter-icon, .layer-minicart, [data-cart-count], .minicart-quantity').forEach(function(el){
            // aggiorno solo gli elementi che contengono davvero un numero
            var t = (el.textContent || '').trim();
            if (/^\d+$/.test(t)) el.textContent = String(n);
            else {
              var f = el.querySelector('.counter-icon, .minicart-quantity');
              if (f && /^\d+$/.test((f.textContent || '').trim())) f.textContent = String(n);
            }
          });
        })
        .catch(function(){});
    }catch(e){}
  }

  // La chat non espone un evento di "aggiunta riuscita": osserviamo le risposte.
  // Quando compare la conferma di un'aggiunta, allineiamo il sito.
  function osserva(){
    try{
      var host = document.querySelector('algho-viewer');
      var radice = (host && host.shadowRoot) ? host.shadowRoot : document.body;
      var mo = new MutationObserver(function(muts){
        for (var i = 0; i < muts.length; i++) {
          var nodi = muts[i].addedNodes || [];
          for (var j = 0; j < nodi.length; j++) {
            var t = (nodi[j].textContent || '');
            if (/aggiunt[oa] al carrello|added to (your )?(bag|cart)|Il tuo carrello \(/i.test(t)) {
              aggiornaSito();
              return;
            }
          }
        }
      });
      mo.observe(radice, { childList: true, subtree: true });
    }catch(e){}
  }

  var att = 0;
  var t = setInterval(function(){
    att++;
    if (document.querySelector('algho-viewer')) { clearInterval(t); osserva(); }
    else if (att > 60) clearInterval(t);
  }, 500);

  // richiamabile a mano per provarla
  window.__sincronizzaCarrello = aggiornaSito;
})();


// ---------- TRASFERIMENTO AL CARRELLO DEL SITO ----------
// Da guest il carrello della chat e quello del sito sono due sessioni diverse.
// Il sito espone Cart-AddProduct in POST con il solo pid (l'EAN della variante)
// e nessun token: possiamo quindi travasare i capi usando la sessione del sito,
// perche' questa funzione gira dentro la pagina.
(function TrasferimentoCarrello(){

  function endpoint(nome){
    // ricavo il percorso dei controller dalla pagina, cosi' resta valido
    // anche cambiando sito o lingua
    var base = '/on/demandware.store/Sites-MarniEU-Site/it_IT/';
    try{
      var a = document.querySelector('a[href*="/on/demandware.store/"], form[action*="/on/demandware.store/"]');
      var href = a ? (a.getAttribute('href') || a.getAttribute('action') || '') : '';
      var m = href.match(/(\/on\/demandware\.store\/Sites-[^/]+\/[^/]+\/)/);
      if (m) base = m[1];
    }catch(e){}
    return base + nome;
  }

  function aggiungiUno(pid, quantita){
    return fetch(endpoint('Cart-AddProduct'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: 'pid=' + encodeURIComponent(pid) + '&quantity=' + (quantita || 1)
    }).then(function(r){ return r.ok ? r.json() : null; })
      .catch(function(){ return null; });
  }

  // Trasferisce i capi e porta al carrello. Gli id sono gli EAN delle varianti,
  // gli stessi che la chat usa per aggiungere al basket SCAPI.
  window.trasferisciAlCarrello = function(ids, vaiAlCarrello){
    var elenco = (ids || []).filter(Boolean);
    if (!elenco.length) { if (vaiAlCarrello !== false) window.location.href = '/it-it/cart'; return; }
    var fatti = 0;
    var catena = elenco.reduce(function(p, pid){
      return p.then(function(){
        return aggiungiUno(pid, 1).then(function(res){
          if (res && res.error === false) fatti++;
        });
      });
    }, Promise.resolve());
    return catena.then(function(){
      if (vaiAlCarrello !== false) {
        var loc = (window.location.pathname.match(/^\/([a-z]{2}-[a-z]{2})\//i) || [null,'it-it'])[1];
        window.location.href = '/' + loc + '/cart';
      }
      return fatti;
    });
  };
})();

// ---------- DIAGNOSTICA ----------
// Da console: __alghoDiagnostica()  -> mostra se l'identita' viene riconosciuta e inviata
window.__alghoDiagnostica = function () {
  var u = getUtenteLoggato();
  var info = null;
  try { info = JSON.parse(localStorage.getItem('user_info') || 'null'); } catch (e) {}
  var out = {
    login_rilevato: isLoginAttivo(),
    user_info_presente: !!info,
    email: u.email || '(vuota)',
    customerId: u.customerId || '(vuoto)',
    cookie_cquid: leggiCookie('cquid') || '(assente)',
    algho_pronto: !!(window.algho && window.algho.setAJWT),
    ajwt_inviato: false,
    proattivo_attivo: typeof window.__proattivoTest === 'function',
    // distinguo il login vero dal residuo nel localStorage: e' la differenza
    // fra un cliente riconosciuto e uno che il sito considera guest
    sessione_reale: (function(){
      try{
        var cq = leggiCookie('cquid');
        var dw = leggiCookie('dwsid');
        var ui = !!localStorage.getItem('user_info');
        return {
          user_info_presente: ui,
          cquid: cq || '(assente)',
          dwsid: dw ? '(presente)' : '(assente)',
          login_riconosciuto: isLoginAttivo(),
          nota: (ui && !isLoginAttivo()) ? 'dati residui di un accesso passato: il sito ti considera guest' : ''
        };
      }catch(e){ return '(errore)'; }
    })(),
    carrello_sito: (function(){
      try{
        var el = document.querySelector('.minicart-action.counter-icon');
        return el ? (el.textContent || '').trim() : '(contatore non trovato)';
      }catch(e){ return '(errore)'; }
    })()
  };
  if (window.algho && window.algho.setAJWT && (u.email || u.customerId)) {
    try { window.algho.setAJWT(creaAJWTunsigned(u)); out.ajwt_inviato = true; } catch (e) { out.errore = String(e); }
  }
  console.log(out);
  return out;
};


// ---------- 8. NAVIGAZIONE GUIDATA (funzioni proattive #04-#06, #11-#12, #16, #18, #28-#29, #32-#33, #35, #40-#41) ----------
// I flussi rispondono con link e bottoni verso pagine del sito (scheda prodotto,
// carrello, preferiti, ordini, boutique, categoria, regali, ricerca). Il clic del
// cliente e' la conferma richiesta dai casi d'uso: da qui in poi l'agente lo
// PORTA sulla pagina nella stessa scheda, invece di aprirne una nuova. I link
// esterni (Maps, documenti) restano in nuova scheda.
(function NavigazioneGuidata() {
  var HOST_SITO = /(^|\.)marni\.com$/i;
  var ESTERNI = /google\.[a-z.]+\/maps|maps\.apple|\.pdf(\?|$)/i;

  function stessoSito(href) {
    try {
      var u = new URL(href, window.location.href);
      return HOST_SITO.test(u.hostname) && !ESTERNI.test(u.href);
    } catch (e) { return false; }
  }

  function vai(href) {
    try {
      // il pannello resta aperto dopo la navigazione: il widget rilegge il suo stato
      // da sessionStorage, e la conversazione prosegue sulla pagina di arrivo
      if (window.algho && window.algho.setCurrentUrl) window.algho.setCurrentUrl(href);
    } catch (e) {}
    window.location.assign(href);
  }

  function aggancia(radice) {
    if (!radice || radice.__marniNavAgganciata) return;
    radice.__marniNavAgganciata = true;
    radice.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(javascript|mailto|tel):/i.test(href)) return;
      if (!stessoSito(a.href)) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return; // il cliente vuole una nuova scheda
      ev.preventDefault();
      ev.stopPropagation();
      vai(a.href);
    }, true);
  }

  var att = 0;
  var t = setInterval(function () {
    att++;
    var host = document.querySelector('algho-viewer');
    var radice = host && host.shadowRoot;
    if (radice) { clearInterval(t); aggancia(radice); }
    else if (att > 60) clearInterval(t);
  }, 500);

  // per i flussi: window.marniVai(url) porta il cliente su una pagina del sito
  window.marniVai = function (href) { if (stessoSito(href)) vai(href); else window.open(href, '_blank'); };
})();

// ---------- 9. RICOMINCIA — bottone nell'header del widget ----------
// Svuota la conversazione (storico + stato lato Algho) e riparte dal saluto:
// il cliente non deve chiudere e riaprire la chat per cambiare argomento.
(function Ricomincia() {
  var TESTO = { it: 'Ricomincia', en: 'Start over', fr: 'Recommencer', de: 'Neu starten', es: 'Empezar de nuevo' };
  var lingua = linguaPagina();

  function inserisci(radice) {
    var chiusura = radice.querySelector('.header-chat .header-close');
    if (!chiusura || chiusura.querySelector('.mr-ricomincia')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'mr-ricomincia';
    b.textContent = TESTO[lingua] || TESTO.it;
    b.setAttribute('aria-label', b.textContent);
    b.addEventListener('click', function (ev) {
      ev.preventDefault();
      try {
        // P47 (2026-09-21): lo stato della conversazione lato n8n e' legato allo
        // userId di Algho: senza cambiarlo, "Ricomincia" svuotava solo la chat e
        // genere, taglia e colore restavano applicati alle ricerche successive.
        // P84 (2026-09-24, MCR-4586): setUserId apre gia' una conversazione nuova e
        // ripulisce la finestra; chiamando anche resetChatHistory il messaggio di
        // benvenuto veniva stampato due volte ("double incipit").
        if (window.algho && window.algho.setUserId) window.algho.setUserId('mr-' + Date.now().toString(36));
        else if (window.algho && window.algho.resetChatHistory) window.algho.resetChatHistory();
        else if (window.algho && window.algho.clearChatHistory) window.algho.clearChatHistory();
        // l'identita' del cliente loggato va rimandata sulla nuova conversazione
        _ultimaIdentita = '';
        setTimeout(function () { try { impostaIdentitaAlgho(); } catch (e) {} }, 500);
      } catch (e) {}
    });
    chiusura.insertBefore(b, chiusura.firstChild);
  }

  var att = 0;
  var t = setInterval(function () {
    att++;
    var host = document.querySelector('algho-viewer');
    var radice = host && host.shadowRoot;
    if (!radice) { if (att > 120) clearInterval(t); return; }
    inserisci(radice);
    if (att > 120) clearInterval(t); // l'header viene ricreato quando il pannello si riapre: si continua a controllare per un minuto
  }, 500);
  // ...e a ogni riapertura del pannello
  document.addEventListener('click', function () { setTimeout(function () { var h = document.querySelector('algho-viewer'); if (h && h.shadowRoot) inserisci(h.shadowRoot); }, 600); }, true);
})();

// ---------- 10. PULIZIA TESTO — residui di tag nelle risposte da documentazione ----------
// Algho spezza le risposte SDA in paragrafi e a volte lascia in testa al testo
// un frammento di tag ("p>", ">", "</p>"). Lo togliamo appena il messaggio
// compare, prima che il cliente lo legga.
(function PuliziaTesto() {
  var RESIDUO = /^\s*(?:<\/?p>|<\/?br\s*\/?>|p>|>|\*\s)+/;

  function pulisci(nodo) {
    var testi = [];
    if (nodo.nodeType === 3) testi.push(nodo);
    else if (nodo.querySelectorAll) {
      nodo.querySelectorAll('.other-message .message-text').forEach(function (m) {
        var w = document.createTreeWalker(m, NodeFilter.SHOW_TEXT);
        var n; while ((n = w.nextNode())) testi.push(n);
      });
    }
    testi.forEach(function (t) {
      if (RESIDUO.test(t.textContent)) t.textContent = t.textContent.replace(RESIDUO, '');
    });
  }

  function osserva(radice) {
    if (radice.__marniPulizia) return;
    radice.__marniPulizia = true;
    new MutationObserver(function (muts) {
      muts.forEach(function (mu) {
        mu.addedNodes.forEach(pulisci);
        if (mu.type === 'characterData') pulisci(mu.target);
      });
    }).observe(radice, { childList: true, subtree: true, characterData: true });
  }

  var att = 0;
  var t = setInterval(function () {
    att++;
    var host = document.querySelector('algho-viewer');
    if (host && host.shadowRoot) { clearInterval(t); osserva(host.shadowRoot); }
    else if (att > 120) clearInterval(t);
  }, 500);
})();

// ---------- 11. CHIUSURA PERSISTENTE (MCR-4550) ----------
// Il widget salva in sessionStorage solo lo stato "aperto": chiusa la chat con
// la X, alla pagina dopo ricompariva aperta. Qui la chiusura esplicita del
// cliente viene ricordata per tutta la sessione e rispettata a ogni pagina;
// il flag si azzera quando e' il cliente a riaprire dal bubble.
(function ChiusuraPersistente() {
  var CHIAVE = 'marni_chat_chiusa';
  function leggi() { try { return sessionStorage.getItem(CHIAVE) === '1'; } catch (e) { return false; } }
  function scrivi(v) { try { if (v) sessionStorage.setItem(CHIAVE, '1'); else sessionStorage.removeItem(CHIAVE); } catch (e) {} }
  window.marniChatChiusaDalCliente = leggi;

  function aggancia(radice) {
    if (radice.__marniChiusura) return;
    radice.__marniChiusura = true;
    radice.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('.header-close button.chat-button')) { scrivi(true); return; }   // X del pannello
      if (t.closest('.chat-widget')) scrivi(false);                                    // bubble: riapre lui
    }, true);
  }

  // il widget ripristina "aperto" a ogni caricamento: se il cliente aveva chiuso, si richiude
  var richiuso = false;
  function applica() {
    if (richiuso || !leggi()) return;
    if (!(window.algho && typeof window.algho.close === 'function')) return;
    try { window.algho.close(); richiuso = true; } catch (e) {}
  }

  var att = 0;
  var t = setInterval(function () {
    att++;
    var host = document.querySelector('algho-viewer');
    if (host && host.shadowRoot) { aggancia(host.shadowRoot); applica(); }
    if (richiuso || att > 60) clearInterval(t);
  }, 500);
})();


// ---------- 12. SCELTA TAGLIA / COLORE IN UN PANNELLO DAL BASSO ----------
// "Aggiungi al carrello" chiede la taglia, e le taglie arrivavano come bottoni
// dentro il messaggio: in una chat lunga finivano sopra la piega e su mobile si
// perdevano. Qui il blocco viene spostato in un pannello che sale dal basso
// (disegno Figma "add to cart"), con il resto della chat in ombra.
// Il messaggio resta in cronologia con un bottone per riaprire il pannello.
// I bottoni sono gli STESSI creati dai flussi: l'azione non cambia.
(function PannelloScelta() {
  var TESTI = {
    it: { taglia: 'Scegli la taglia', colore: 'Scegli il colore', guida: 'Guida alle taglie', chiudi: 'Chiudi', riapri: 'Scegli la taglia', riapriC: 'Scegli il colore', esaurita: 'Esaurita' },
    en: { taglia: 'Choose your size', colore: 'Choose the colour', guida: 'Size guide', chiudi: 'Close', riapri: 'Choose your size', riapriC: 'Choose the colour', esaurita: 'Sold out' },
    fr: { taglia: 'Choisissez la taille', colore: 'Choisissez la couleur', guida: 'Guide des tailles', chiudi: 'Fermer', riapri: 'Choisissez la taille', riapriC: 'Choisissez la couleur', esaurita: 'Épuisée' },
    de: { taglia: 'Größe wählen', colore: 'Farbe wählen', guida: 'Größentabelle', chiudi: 'Schließen', riapri: 'Größe wählen', riapriC: 'Farbe wählen', esaurita: 'Ausverkauft' },
    es: { taglia: 'Elige la talla', colore: 'Elige el color', guida: 'Guía de tallas', chiudi: 'Cerrar', riapri: 'Elige la talla', riapriC: 'Elige el color', esaurita: 'Agotada' }
  };
  var T = TESTI[linguaPagina()] || TESTI.en;

  function urlGuidaTaglie() {
    var m = window.location.pathname.match(/^\/([a-z]{2}-[a-z]{2})\//i);
    return '/' + (m ? m[1].toLowerCase() : 'it-it') + '/help?content=help-size-guide';
  }

  function chiudi(radice) {
    var p = radice.querySelector('.mr-sheet');
    if (p) p.classList.remove('mr-sheet--aperto');
    var o = radice.querySelector('.mr-sheet-velo');
    if (o) o.classList.remove('mr-sheet-velo--aperto');
  }

  // crea (una sola volta) il pannello e il velo dentro la chat
  function contenitore(radice) {
    var corpo = radice.querySelector('.chat-body') || radice.querySelector('.chat');
    if (!corpo) return null;
    var p = radice.querySelector('.mr-sheet');
    if (p) return p;

    var velo = document.createElement('div');
    velo.className = 'mr-sheet-velo';
    velo.addEventListener('click', function () { chiudi(radice); });
    corpo.appendChild(velo);

    p = document.createElement('div');
    p.className = 'mr-sheet';
    p.innerHTML =
      '<div class="mr-sheet-testa">' +
        '<div class="mr-sheet-titolo"></div>' +
        '<button class="mr-sheet-chiudi" aria-label="' + T.chiudi + '">✕</button>' +
      '</div>' +
      '<div class="mr-sheet-corpo"></div>' +
      '<div class="mr-sheet-piede"><a class="mr-sheet-guida" target="_blank" href="' + urlGuidaTaglie() + '">' + T.guida + '</a></div>';
    p.querySelector('.mr-sheet-chiudi').addEventListener('click', function () { chiudi(radice); });
    corpo.appendChild(p);
    return p;
  }

  function apri(radice, titolo, elenco, conGuida) {
    var p = contenitore(radice);
    if (!p) return;
    p.querySelector('.mr-sheet-titolo').textContent = titolo;
    var corpo = p.querySelector('.mr-sheet-corpo');
    corpo.innerHTML = '';
    corpo.appendChild(elenco);
    p.querySelector('.mr-sheet-piede').style.display = conGuida ? '' : 'none';
    // il clic su una scelta esegue l'azione del flusso e chiude il pannello
    elenco.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
      if (b && !b.disabled) setTimeout(function () { chiudi(radice); }, 50);
    }, true);
    radice.querySelector('.mr-sheet-velo').classList.add('mr-sheet-velo--aperto');
    p.classList.add('mr-sheet--aperto');
  }

  // sposta il blocco delle scelte dal messaggio al pannello
  function prendi(radice, blocco, tipo) {
    if (!blocco || blocco.dataset.mrSheet === '1') return;
    blocco.dataset.mrSheet = '1';

    // il titolo: la frase che il flusso ha scritto sopra le scelte
    var intro = blocco.previousElementSibling;
    var dentro = blocco.querySelector('.mr-etichetta');   // i colori portano l'etichetta dentro il blocco
    var titolo = ((dentro ? dentro.textContent : '') ||
                  (intro && /mr-intro|mr-etichetta/.test(intro.className) ? intro.textContent : '')).trim();
    if (!titolo) titolo = tipo === 'colore' ? T.colore : T.taglia;
    titolo = titolo.replace(/:\s*$/, '');
    if (intro && /mr-intro|mr-etichetta/.test(intro.className)) intro.style.display = 'none';

    var elenco = blocco.cloneNode(true);
    elenco.classList.add('mr-sheet-elenco');
    // le taglie esaurite restano visibili ma non selezionabili
    Array.prototype.forEach.call(elenco.querySelectorAll('.mr-taglia--esaurita'), function (b) {
      b.disabled = true;
      if (b.tagName === 'BUTTON' && !/•/.test(b.textContent)) b.textContent = b.textContent.trim() + '  ·  ' + T.esaurita;
    });

    // al posto del blocco, nel messaggio resta un bottone per riaprire
    var riapri = document.createElement('button');
    riapri.className = 'mr-btn-largo mr-sheet-riapri';
    riapri.textContent = tipo === 'colore' ? T.riapriC : T.riapri;
    riapri.addEventListener('click', function () { apri(radice, titolo, elenco.cloneNode(true), tipo === 'taglia'); });
    blocco.parentNode.insertBefore(riapri, blocco);
    blocco.style.display = 'none';

    apri(radice, titolo, elenco, tipo === 'taglia');
  }

  function scansiona(radice) {
    // taglie: solo quando sono una scelta da fare (bottoni cliccabili)
    Array.prototype.forEach.call(radice.querySelectorAll('.mr-taglie'), function (b) {
      if (b.querySelector('button:not([disabled])')) prendi(radice, b, 'taglia');
    });
    // colori: stessa cosa, l'elenco delle varianti
    Array.prototype.forEach.call(radice.querySelectorAll('.mr-colori'), function (b) {
      if (b.querySelector('button')) prendi(radice, b, 'colore');
    });
  }

  function osserva(radice) {
    if (radice.__mrSheetOsserva) return;
    radice.__mrSheetOsserva = true;
    var zona = radice.querySelector('.container-message-display') || radice;
    var mo = new MutationObserver(function () { scansiona(radice); });
    mo.observe(zona, { childList: true, subtree: true });
    scansiona(radice);
  }

  var t = setInterval(function () {
    var host = document.querySelector('algho-viewer');
    if (host && host.shadowRoot && host.shadowRoot.querySelector('.chat-body')) { osserva(host.shadowRoot); }
  }, 800);
  setTimeout(function () { clearInterval(t); }, 120000);
})();

// ============================================================
// 13. BENVENUTO MARNI (P84, MCR-4586 / Figma "ChatsuPDP")
// Algho apre ogni conversazione con la sua frase di sistema
// ("Ciao. Rivolgimi domande precise..."), che non e' il tono del
// brand e non e' configurabile dal nostro lato. Il primo messaggio
// del bot — quello che arriva prima di qualunque domanda e che non
// contiene markup dei flussi (classi mr-*) — viene riscritto con il
// testo del Figma, nella lingua della chat.
// ============================================================
(function BenvenutoMarni() {
  var TESTI = {
    it: 'Buongiorno! Richiedi informazioni sul tuo ordine, esplora le collezioni o acquista outfit personalizzati.',
    en: 'Hello! Ask about your order, explore the collections or shop a personalised outfit.',
    fr: 'Bonjour ! Demandez des informations sur votre commande, explorez les collections ou achetez une tenue personnalisée.',
    es: '¡Hola! Consulta tu pedido, explora las colecciones o compra un look personalizado.',
    de: 'Guten Tag! Frag nach deiner Bestellung, entdecke die Kollektionen oder kaufe ein personalisiertes Outfit.'
  };

  var CHIP = {
    it: [['Esplora nuovi arrivi', 'Mostrami le novit\u00e0 della collezione'],
         ['Outfit da sera', 'Vorrei un outfit da sera'],
         ['Look per il rientro in ufficio', 'Vorrei un look per l\u2019ufficio'],
         ['Look completi', 'Mostrami dei look completi']],
    en: [['Explore new arrivals', 'Show me the new arrivals'],
         ['Evening outfit', 'I would like an evening outfit'],
         ['Back-to-office look', 'I would like a look for the office'],
         ['Complete looks', 'Show me some complete looks']],
    fr: [['D\u00e9couvrir les nouveaut\u00e9s', 'Montrez-moi les nouveaut\u00e9s'],
         ['Tenue de soir\u00e9e', 'Je voudrais une tenue de soir\u00e9e'],
         ['Look pour le bureau', 'Je voudrais un look pour le bureau'],
         ['Looks complets', 'Montrez-moi des looks complets']],
    es: [['Explora las novedades', 'Mu\u00e9strame las novedades'],
         ['Look de noche', 'Quiero un look de noche'],
         ['Look para la oficina', 'Quiero un look para la oficina'],
         ['Looks completos', 'Mu\u00e9strame looks completos']],
    de: [['Neuheiten entdecken', 'Zeig mir die Neuheiten'],
         ['Abend-Outfit', 'Ich m\u00f6chte ein Abend-Outfit'],
         ['Look f\u00fcr das B\u00fcro', 'Ich m\u00f6chte einen Look f\u00fcrs B\u00fcro'],
         ['Komplette Looks', 'Zeig mir komplette Looks']]
  };

  function lingua() {
    var l = '';
    try { l = String(document.documentElement.lang || '').slice(0, 2).toLowerCase(); } catch (e) {}
    if (!l) { try { l = String((navigator.language || 'it')).slice(0, 2).toLowerCase(); } catch (e) { l = 'it'; } }
    return TESTI[l] ? l : 'it';
  }

  function scansiona(radice) {
    var messaggi = radice.querySelectorAll('.message-text');
    if (!messaggi.length) return;
    // solo all'apertura: se il cliente ha gia' scritto, non si tocca nulla
    if (radice.querySelector('.my-message, .user-message')) return;
    var primo = messaggi[0];
    if (primo.__mrBenvenuto) return;
    // i messaggi dei flussi hanno sempre markup mr-*: quelli non si toccano
    if (primo.querySelector('[class*="mr-"]')) { primo.__mrBenvenuto = true; return; }
    if (messaggi.length > 1) return; // non e' piu' il solo messaggio di apertura
    primo.__mrBenvenuto = true;
    var lg = lingua();
    var p = primo.querySelector('p') || primo;
    p.textContent = TESTI[lg];
    // le quattro proposte del Figma: sono semplici messaggi, come i chip dei flussi
    try {
      if (!primo.querySelector('.mr-chips')) {
        var box = document.createElement('div');
        box.className = 'mr-chips';
        (CHIP[lg] || CHIP.it).forEach(function (c) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'mr-chip';
          b.textContent = c[0];
          b.addEventListener('click', function () {
            try { if (window.algho && window.algho.sendUserMessage) window.algho.sendUserMessage(c[1]); } catch (e) {}
          });
          box.appendChild(b);
        });
        (primo.querySelector('p') ? primo : primo).appendChild(box);
      }
    } catch (e) {}
  }

  function osserva(radice) {
    if (radice.__mrBenvenutoOsserva) return;
    radice.__mrBenvenutoOsserva = true;
    var zona = radice.querySelector('.container-message-display') || radice;
    var mo = new MutationObserver(function () { scansiona(radice); });
    mo.observe(zona, { childList: true, subtree: true });
    scansiona(radice);
  }

  var t = setInterval(function () {
    var host = document.querySelector('algho-viewer');
    if (host && host.shadowRoot && host.shadowRoot.querySelector('.chat-body')) { osserva(host.shadowRoot); }
  }, 800);
  setTimeout(function () { clearInterval(t); }, 180000);
})();
