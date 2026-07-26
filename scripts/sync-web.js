#!/usr/bin/env node
/**
 * sync-web.js
 * ============================================================
 * Descarrega l'enllaç oficial (web) de totes les biblioteques
 * des de l'API de dades obertes de la Diputació de Barcelona, i
 * el fusiona amb data/biblioteques.json fent servir el codi PI
 * (camp "codi" al nostre JSON = camp "id_secundari" a l'API).
 *
 * A diferència dels horaris (que canvien constantment i calen
 * revisar-se sovint), l'adreça web d'una biblioteca gairebé mai
 * canvia, així que aquest script només cal executar-lo de tant
 * en tant (o cada cop que afegim biblioteques noves al llistat).
 *
 * Ús:
 *   node scripts/sync-web.js
 *
 * Requereix Node.js 18+ (té fetch nadiu). No necessita cap
 * paquet extra ni clau d'API: el dataset és públic.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const API_URL = 'https://do.diba.cat/api/dataset/biblioteques/format/json';
const DATA_PATH = path.join(__dirname, '..', 'data', 'biblioteques.json');

async function main() {
  console.log('Descarregant dataset de biblioteques de do.diba.cat...');
  const res = await fetch(API_URL);
  if (!res.ok) {
    throw new Error(`Error HTTP ${res.status} en consultar l'API`);
  }
  const json = await res.json();
  const elements = json.elements || [];
  console.log(`Rebudes ${elements.length} biblioteques de l'API.`);

  // Construïm un mapa codi PI -> dades estables (web, telèfon, adreça)
  const infoPerCodi = {};
  for (const el of elements) {
    const codi = el.id_secundari;
    if (!codi) continue;
    infoPerCodi[codi] = {
      web: el.url_general || '',
      telefon: (el.telefon_contacte && el.telefon_contacte[0]) || '',
      adreca: el.grup_adreca ? el.grup_adreca.adreca_completa : '',
      font: 'do.diba.cat',
      actualitzat: new Date().toISOString().slice(0, 10)
    };
  }

  // Llegim el nostre JSON actual
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  const biblioteques = JSON.parse(raw);

  let trobades = 0;
  let senseWeb = [];
  let noTrobades = [];
  for (const lib of biblioteques) {
    if (!lib.codi) continue;
    const info = infoPerCodi[lib.codi];
    if (info) {
      lib.horaris = info; // es manté el nom de camp "horaris" per compatibilitat amb l'app.js existent
      trobades++;
      if (!info.web) senseWeb.push(lib.codi);
    } else {
      noTrobades.push(lib.codi);
    }
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(biblioteques, null, 1), 'utf-8');

  console.log(`\nFet. Enllaços afegits a ${trobades} biblioteques.`);
  if (senseWeb.length) {
    console.log(`\n${senseWeb.length} biblioteques no tenen web pròpia registrada:`);
    console.log(senseWeb.join(', '));
  }
  if (noTrobades.length) {
    console.log(`\nNo s'ha trobat cap dada per a ${noTrobades.length} codis (Serveis Centrals, bibliobusos, instituts estrangers...):`);
    console.log(noTrobades.join(', '));
  }
}

main().catch(err => {
  console.error('Error executant sync-web.js:', err);
  process.exit(1);
});
