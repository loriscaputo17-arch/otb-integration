# Integrazione Algho per Marni

Due file, serviti da **GitHub Pages**. È da lì che il sito li carica davvero:

- JS: `https://loriscaputo17-arch.github.io/otb-integration/algho_integrazione_completa.js`
  (è il tag `<script>` sulle pagine di staging.marni.com)
- CSS: `https://loriscaputo17-arch.github.io/otb-integration/otb-agent-marni.css`
  (**paracadute**: in uso solo con `?mr-css=github` nella barra degli indirizzi)

## Come si pubblica una modifica

`git push origin main`, e basta: Pages ricostruisce da sé. Il build si segue con

```
gh api repos/loriscaputo17-arch/otb-integration/pages/builds/latest --jq '{status,commit}'
```

Poi la risposta del CDN resta in cache **10 minuti** (`cache-control: max-age=600`),
sia sul CDN che nel browser di chi ha già aperto la pagina. Non c'è un purge:
si aspetta, oppure in prova si forza con
`fetch(url, {cache:'reload'})` dalla console e un ricarico.

## Attenzione: jsDelivr non c'entra

Questi URL di purge erano l'unica cosa scritta qui, e sono fuorvianti:

```
https://purge.jsdelivr.net/gh/loriscaputo17-arch/otb-integration@main/algho_integrazione_completa.js
https://purge.jsdelivr.net/gh/loriscaputo17-arch/otb-integration@main/otb-agent-marni.css
```

jsDelivr serve gli stessi file dal repo, ma **il sito non li prende da lì**:
purgare jsDelivr non cambia niente su staging. Lasciati qui solo perché i
vecchi link possono girare ancora.

## Il foglio di stile del widget

Il tema del widget **non** è il CSS di questo repo: arriva da Algho, che lo
serve per ambiente. Nel JS, riga ~274:

```js
var CSS_SORGENTE = "algho";   // -> theme-css = "{base-url}/theme/marni.css"
```

Il CSS di questo repo è il paracadute, e si prova con `?mr-css=github`.
Le due copie si sono separate dopo P201 del 28/09: vedi
`fase2/css_per_il_collega_14-10.md` per cosa manca da una parte e dall'altra.

## Il player Algho (P261, 20/11/2026)

Il player si carica dal **caricatore senza versione**, come indicato da Algho:

```js
var ALGHO_PLAYER = 'https://virtualassistant.alghoncloud.com/algho-viewer.min.js';
```

Il caricatore inietta `/js/<versione corrente>/algho-viewer.min.js`: così arrivano
subito le correzioni di Algho (anche l'accessibilità), senza toccare questo repo.
Dal 19/11 (P256, MCR-4851) la versione era fissata a 2.1.605 e le modifiche di
Algho non si vedevano: non rifissarla senza accordo con Algho.

Il nostro tag `<script>` ha `id="algho-viewer-caricatore"` e **non**
`algho-viewer-js`: quell'id lo cerca il caricatore prima di iniettare il player,
e lo assegna al player stesso. Se lo avesse il nostro tag, il caricatore
troverebbe se stesso e non caricherebbe niente. Il player non parte due volte:
niente se nella pagina c'è già `algho-viewer-js` o `algho-viewer-caricatore`.
L'integrazione intera non riparte se il suo tag è incluso due volte nella
pagina (`window.__mrIntegrazioneAlgho`).

Prova dopo un cambio: in DevTools > Network, filtro "algho-viewer", ci devono
essere `algho-viewer.min.js` (il caricatore) e `js/<versione>/algho-viewer.min.js`
(una volta sola), poi apertura del widget, una ricerca con le schede, il "+" al
carrello, lo store locator e la chat in inglese.
