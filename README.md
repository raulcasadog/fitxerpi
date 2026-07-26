# Fitxer PI — Cercador de biblioteques (Préstec Interbibliotecari)

Web estàtica per consultar si una biblioteca de la Xarxa de Biblioteques Municipals
pot rebre i servir peticions de préstec interbibliotecari, el seu codi PI i la
freqüència de recollida.

## Estructura del projecte

```
fitxer-pi-web/
├── index.html          → pàgina principal (cercador)
├── style.css            → estils
├── app.js                → lògica de cerca i càlcul d'estat (obert/tancat)
├── privacy.html          → política de privacitat (necessària per AdSense)
├── data/
│   └── biblioteques.json → dades de totes les biblioteques
└── README.md
```

## Com publicar-ho a GitHub Pages (pas a pas)

1. **Crea un repositori nou a GitHub** (per exemple, `fitxer-pi`).
   - Pot ser públic (necessari si tens un compte GitHub gratuït i vols Pages gratis).

2. **Puja tots els fitxers d'aquesta carpeta** al repositori, mantenint l'estructura
   (especialment la carpeta `data/`).
   - Pots fer-ho arrossegant els fitxers des de la interfície web de GitHub
     ("Add file" → "Upload files"), o amb `git`:
     ```bash
     git init
     git add .
     git commit -m "Primera versió del cercador"
     git branch -M main
     git remote add origin https://github.com/EL_TEU_USUARI/fitxer-pi.git
     git push -u origin main
     ```

3. **Activa GitHub Pages**:
   - Vés a `Settings` (Configuració) del repositori.
   - Al menú lateral, clica `Pages`.
   - A "Source" (Origen), selecciona la branca `main` i la carpeta `/ (root)`.
   - Desa. En un parell de minuts la web serà accessible a:
     `https://EL_TEU_USUARI.github.io/fitxer-pi/`

4. **(Opcional) Domini propi**: a la mateixa pantalla de `Pages` pots afegir un
   domini personalitzat (p. ex. `fitxerpi.cat`) al camp "Custom domain", un cop
   l'hagis comprat en un registrador (Namecheap, OVH, etc.) i hagis configurat
   els registres DNS que GitHub indica.

## Com actualitzar les dades quan surti un PDF nou

1. Obre `data/biblioteques.json`.
2. Per a cada biblioteca amb canvis (nou tancament, reobertura, canvi de
   freqüència...), edita els camps corresponents:
   - `"estat"`: `"obert"`, `"tancat"`, `"restringit"` o `"no_actiu"`
   - `"tancament_fi"`: data en format `"AAAA-MM-DD"` si se sap quan reobrirà,
     o `null` si és "fins a nou avís"
   - `"observacions"`: text lliure que es mostra a la fitxa
3. Puja el fitxer canviat al repositori (o demana'm que et regeneri el JSON
   sencer a partir del PDF nou i substitueix-lo).
4. GitHub Pages es torna a publicar automàticament en pujar els canvis —
   no cal tornar a activar res.

## Calendari de tancaments d'estiu

A més del sistema de tancaments manuals (`estat` / `tancament_fi` /
`observacions`), cada biblioteca pot tenir un camp `tancaments_estiu`amb
una llista de períodes concrets (una setmana o més) en què tanca per
vacances. La web comprova sola, cada vegada que es consulta, si la data
d'avui cau dins d'algun d'aquests períodes:

```json
"tancaments_estiu": [
  {"inici": "2026-08-03", "fi": "2026-08-23"}
]
```

Aquestes dades venen del document "Préstec interbibliotecari - Vacances
estiu" que la Diputació publica cada estiu amb un calendari setmanal
(graella amb caselles pintades de groc = tancada aquella setmana). Quan
surti una versió nova d'aquest PDF, envia-me'l i te'n regenero el bloc
sencer.

Els dos sistemes conviuen sense conflicte: si una biblioteca ja està
marcada com a tancada manualment (`estat: "tancat"`), es manté tancada
independentment del calendari d'estiu; si no, la web mostra automàticament
"Tancada" només durant les setmanes de vacances marcades, i torna a
"Oberta" sola en acabar-les.

## Enllaç a la web oficial de cada biblioteca

En lloc de mostrar horaris detallats (que canvien molt sovint i són difícils
de mantenir), la fitxa de cada biblioteca mostra un enllaç directe a la seva
pàgina web oficial, on l'ajuntament corresponent ja manté els horaris
actualitzats. Aquest enllaç ve del mateix portal de dades obertes de la
Diputació de Barcelona, i es guarda dins del camp `"horaris"` (per
compatibilitat amb el codi existent) amb aquesta forma:

```json
"horaris": {
  "web": "https://www.exemple.cat/biblioteca",
  "font": "do.diba.cat",
  "actualitzat": "2026-07-24"
}
```

Com que un enllaç web gairebé mai canvia, no cal actualitzar-ho gaire sovint.

## Actualització automàtica dels enllaços web (GitHub Actions)

Aquest projecte inclou `.github/workflows/sync-web.yml`, que fa que
GitHub executi `scripts/sync-web.js` **per tu**, sense que hagis
d'instal·lar res al teu ordinador:

- **Automàticament**: un cop al mes, GitHub descarrega els enllaços web
  actualitzats i els puja al repositori tot sol (si hi ha canvis).
- **Manualment, quan vulguis**: vés a la pestanya **Actions** del teu
  repositori a GitHub → selecciona "Actualitza enllaços web de biblioteques"
  al menú lateral → clica el botó **"Run workflow"**.

No necessites fer res més un cop pujat el projecte: en un parell de minuts
tindràs el `data/biblioteques.json` actualitzat i, com que GitHub Pages es
regenera sol en cada canvi, la web es posarà al dia automàticament.

## Provar-ho en local abans de publicar

Com que `app.js` carrega `data/biblioteques.json` amb `fetch`, obrir
`index.html` fent doble clic (`file://`) no funcionarà en alguns navegadors.
Per provar-ho en local, executa un petit servidor des d'aquesta carpeta:

```bash
python3 -m http.server 8000
```

I obre `http://localhost:8000` al navegador.
