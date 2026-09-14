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
  var payload = {
    payload: {
      email: utente.email || '',
      customerId: utente.customerId || '',
      customerNo: utente.customerNo || '',
      name: utente.name || ''
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
  // conferma dal cookie di sessione autenticata
  var cquid = leggiCookie('cquid');
  if (cquid && cquid.length > 1) return true;
  // in mancanza del cookie, mi affido a user_info: meglio riconoscere il cliente
  // che trattarlo da guest quando ha appena effettuato l'accesso
  return true;
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
function impostaIdentitaAlgho() {
  var u = getUtenteLoggato();
  if (!u.email && !u.customerId) return false; // guest: niente AJWT
  var token = creaAJWTunsigned(u);
  if (window.algho && window.algho.setAJWT) {
    window.algho.setAJWT(token);
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
  // se la geolocalizzazione non e' supportata, avviso senza generare loop di messaggi
  if (!navigator.geolocation) {
    alert('La geolocalizzazione non e disponibile. Scrivi il nome della tua citta.');
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
      // ERRORE/NEGATO: avviso nativo, NON rilancio la richiesta citta' (evito loop)
      alert('Non riesco a rilevare la tua posizione. Scrivi il nome della tua citta (es. Milano).');
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
  );
};

// ---------- 3. Caricamento widget Algho ----------
var tag = document.createElement("algho-viewer");
tag.setAttribute("bot-id", "83d45a8e7c5ecc3878be0e97c8691a57");
tag.setAttribute("widget", "true");
tag.setAttribute("audio", "false");
tag.setAttribute("voice", "false");
tag.setAttribute("open", "false");
tag.setAttribute("theme-style", "light");
tag.setAttribute("theme-css", "https://cdn.jsdelivr.net/gh/loriscaputo17-arch/otb-integration@main/otb-agent-marni.css");
tag.setAttribute("widget-border-color", "#000000");
tag.setAttribute("z-index", "9999");
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
    } else if (tentativi >= maxTentativi) {
      clearInterval(timer);
    }
  }, 500);
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
  function conversazioneAvviata() { return clienteHaScritto; }

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
  function chatAperta() { return chatApertaOra; }

  function pronto() {
    return !!(window.algho && window.algho.sendUserMessage);
  }

  // ---------- invio del messaggio proattivo ----------
  function proponi(tipo, messaggio, contesto, invito) {
    if (giaFatto(tipo)) return false;
    if (!pronto()) return false;
    if (chatAperta() || conversazioneAvviata()) return false;
    segnaFatto(tipo);
    try {
      if (contesto && window.algho.setContext) window.algho.setContext(contesto);
      // teniamo l'agente allineato alla pagina corrente
      if (window.algho.setCurrentUrl) window.algho.setCurrentUrl(window.location.href);
      // apro il pannello: showChat mostra il widget, open lo espande
      if (window.algho.showChat) window.algho.showChat();
      if (window.algho.open) window.algho.open();
      // Prima l'agente si presenta con un invito, poi parte la richiesta vera.
      // sendBotMessage fa parlare l'agente senza simulare un messaggio del cliente.
      window.__alghoInvioAutomatico = true;
      if (invito && window.algho.sendBotMessage) {
        window.algho.sendBotMessage(invito);
        setTimeout(function () {
          try { window.algho.sendUserMessage(messaggio); } catch (e) {}
          window.__alghoInvioAutomatico = false;
        }, 900);
      } else {
        window.algho.sendUserMessage(messaggio);
        window.__alghoInvioAutomatico = false;
      }
      return true;
    } catch (e) { return false; }
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
      account:  'Bentornato. Vuole che le mostri qualcosa in linea con i suoi acquisti?',
      ordini:   'Posso mostrarle a che punto sono i suoi ordini, se le fa comodo.',
      carrello: 'Vuole che le suggerisca come completare quello che ha nel carrello?',
      wishlist: 'Posso aiutarla a scegliere fra i capi che ha salvato.',
      prodotto: 'Le interessa vedere come abbinare questo capo?'
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
      account:  'Bienvenido de nuevo. Le muestro algo acorde a sus compras?',
      ordini:   'Puedo mostrarle en que punto estan sus pedidos.',
      carrello: 'Quiere sugerencias para completar su cesta?',
      wishlist: 'Puedo ayudarle a elegir entre sus favoritos.',
      prodotto: 'Quiere ver como combinar esta prenda?'
    }
  };
  var INV = INVITI[LINGUA] || INVITI.en;

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
      var pid = idProdotto();
      if (!pid) return;
      var attivo = true;
      // se il cliente aggiunge al carrello o va via, non proponiamo piu'
      window.addEventListener('beforeunload', function () { attivo = false; });
      setTimeout(function () {
        if (attivo) proponi('prodotto', T.prodotto, pid, INV.prodotto);
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
