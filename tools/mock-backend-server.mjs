import http from 'node:http';

const port = Number(process.env.PORT || 8787);

const state = {
  Objekte: [{ objekt_id: 'TEST', bezeichnung: 'TEST · Entenhausen' }],
  Einheiten: [{ einheit_id: 'TEST_WE_01', objekt_id: 'TEST', typ: 'Wohnung', nummer: 'Wohnung 1' }],
  Personen: [{ person_id: 'P1', vorname: 'Donald', name: 'Duck' }],
  Vertraege: [{ vertrag_id: 'TEST_V1', einheit_id: 'TEST_WE_01', hauptperson_id: 'P1', aktiv: true, soll_gesamt: 650 }],
  Vertragsparteien: [{ vertrag_id: 'TEST_V1', person_id: 'P1', rolle: 'Hauptmieter', ordnet: 1 }],
  Zaehler: [{ zaehler_id: 'Z_TEST_STROM', objekt_id: 'TEST', einheit_id: 'TEST_WE_01', medium: 'Strom', bezeichnung: 'Strom Wohnung 1', einheit: 'kWh', aktiv: true, erfassbar: true }],
  Zaehlerstaende: [{ stand_id: 'ST_TEST_1', objekt_id: 'TEST', einheit_id: 'TEST_WE_01', zaehler_id: 'Z_TEST_STROM', zeitstempel: '01.11.2026 08:00', wert: 1000, quelle: 'Mock' }],
  Zahlungen: [{ zahlung_id: 'MOCK_PAYMENT_2026_10', vertrag_id: 'TEST_V1', datum: '2026-10-03', betrag: 650, art: 'Miete' }],
  Haustechnik: [],
  _view_aktive_mieter: [{ objekt_id: 'TEST', einheit_id: 'TEST_WE_01', vertrag_id: 'TEST_V1', mieter_name: 'Duck, Donald', soll_gesamt: 650 }],
  _view_verbrauch_monat: [],
  _view_verbrauch_jahr: [],
  _view_verbrauch_audit: [],
  _view_verbrauch_bilanz_jahr: []
};

function json(response, status = 200) {
  return JSON.stringify(response);
}

function readView(view) {
  if (view === 'dashboard') return { _view_aktive_mieter: state._view_aktive_mieter };
  if (view === 'verbrauch') return {
    _view_verbrauch_monat: state._view_verbrauch_monat,
    _view_verbrauch_jahr: state._view_verbrauch_jahr,
    _view_verbrauch_audit: state._view_verbrauch_audit,
    _view_verbrauch_bilanz_jahr: state._view_verbrauch_bilanz_jahr
  };
  if (view === 'zaehlerstaende') return { Zaehlerstaende: state.Zaehlerstaende };
  if (view === 'vertrag_capabilities') return { backend_version: '4.8.6-mock', access_protected: false, access_role: 'admin', contract_writes: true };
  return Object.fromEntries(Object.entries(state).filter(([key]) => !key.startsWith('_')));
}

function writePayments(items) {
  let added = 0;
  let alreadyPresent = 0;
  for (const item of items) {
    const existing = state.Zahlungen.find(row => row.zahlung_id === item.zahlung_id);
    if (existing) {
      alreadyPresent++;
      continue;
    }
    state.Zahlungen.push({ ...item });
    added++;
  }
  return { status: 'success', message: added ? 'Zahlung gespeichert.' : 'Zahlung war bereits gespeichert.', angelegt: added, bereits_vorhanden: alreadyPresent };
}

function handle(payload) {
  if (payload?.typ === 'LESEN') return readView(payload.view);
  if (payload?.typ === 'VERBRAUCH_VIEWS_AKTUALISIEREN') return { status: 'success', message: 'Mock-Verbrauchsviews aktualisiert.' };
  if (payload?.typ === 'ZAHLUNG') return writePayments(Array.isArray(payload.data) ? payload.data : [payload.data]);
  if (payload?.typ === 'ZAEHLERSTAND_NEU') {
    const items = Array.isArray(payload.data) ? payload.data : [payload.data];
    state.Zaehlerstaende.push(...items);
    return { status: 'success', message: 'Mock-Zählerstand gespeichert.', angelegt: items.length, bereits_vorhanden: 0, ueberschrieben: 0 };
  }
  if (payload?.typ === 'VERTRAG_AKTUALISIEREN' || payload?.typ === 'INDEX_ANWENDEN') {
    return { status: 'success', message: 'Mock-Vertrag gespeichert.', vertrag: {}, anpassung: {} };
  }
  return { status: 'error', code: 'UNKNOWN_TYPE', message: 'Unbekannter Mock-Vorgang.' };
}

const server = http.createServer((request, response) => {
  const origin = String(request.headers.origin || '');
  if (/^https?:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Headers', 'content-type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
  if (request.method !== 'POST') { response.writeHead(405, { 'content-type': 'application/json' }); response.end(json({ status: 'error', message: 'Nur POST' })); return; }
  let body = '';
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    try {
      const result = handle(JSON.parse(body));
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(json(result));
    } catch (error) {
      response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      response.end(json({ status: 'error', message: error.message }));
    }
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Hausverwaltung Mock-Backend läuft auf http://127.0.0.1:${port}`);
  console.log('Nur synthetische Entenhausen-Daten; es werden keine echten Schlüssel verwendet.');
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
