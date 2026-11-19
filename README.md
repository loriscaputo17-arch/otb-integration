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

## Aggiornare il player Algho (MCR-4851)

Il player si carica **una volta sola, con la versione fissata** nel JS:

```js
var ALGHO_VERSIONE = '2.1.605';
// -> https://virtualassistant.alghoncloud.com/js/2.1.605/algho-viewer.min.js
```

Non usare `https://virtualassistant.alghoncloud.com/algho-viewer.min.js` (senza
versione): è un caricatore di 515 byte che inietta a sua volta
`/js/<ultima versione>/algho-viewer.min.js`. Il risultato sono due richieste per
pagina, e la versione cambia quando la cambia Algho, senza prove da parte nostra.

Per passare a una versione nuova:

1. Leggi l'ultima versione dal caricatore:
   `curl -s https://virtualassistant.alghoncloud.com/algho-viewer.min.js | grep 'const v'`
2. Verifica che il file esista:
   `curl -sI https://virtualassistant.alghoncloud.com/js/<versione>/algho-viewer.min.js` (deve dare 200).
3. Cambia `ALGHO_VERSIONE` nel JS e fai il push (solo staging legge questo repo).
4. Su staging.marni.com prova almeno: apertura del widget, una ricerca con le
   schede prodotto, il "+" al carrello, lo store locator e la chat in inglese.
5. In DevTools > Network, filtro "algho-viewer": ci deve essere **una sola**
   richiesta a `algho-viewer.min.js`, quella con la versione nuova (più il suo
   pezzo `algho-viewer.chat.min.js`).
6. Se qualcosa si rompe, si torna indietro rimettendo la versione precedente.

Il tag `<script>` del player ha `id="algho-viewer-js"`, lo stesso id che controlla
il caricatore di Algho: se qualcuno aggiungesse anche il tag senza versione, non
inietterebbe un secondo player. E l'integrazione intera non riparte se il suo
tag è incluso due volte nella pagina (`window.__mrIntegrazioneAlgho`).
