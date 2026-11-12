import http from 'node:http';
import { createMockConsumptionData } from './mock-consumption-fixtures.mjs';

const port = Number(process.env.PORT || 8787);

const rent = (zahlung_id, vertrag_id, mietmonat, betrag, datum, art = 'Miete', extra = {}) => ({
  zahlung_id, vertrag_id, mietmonat, betrag, datum, art, ...extra
});
const consumptionFixture = createMockConsumptionData();

const state = {
  Objekte: [{ objekt_id: 'TEST', bezeichnung: 'TEST · Entenhausen' }],
  Einheiten: [
    { einheit_id: 'TEST_WE_01', objekt_id: 'TEST', typ: 'Wohnung', nummer: 'Wohnung 1' },
    { einheit_id: 'TEST_WE_02', objekt_id: 'TEST', typ: 'Wohnung', nummer: 'Wohnung 2' },
    { einheit_id: 'TEST_WE_03', objekt_id: 'TEST', typ: 'Wohnung', nummer: 'Wohnung 3' },
    { einheit_id: 'TEST_WE_04', objekt_id: 'TEST', typ: 'Wohnung', nummer: 'Wohnung 4' },
    { einheit_id: 'TEST_WE_05', objekt_id: 'TEST', typ: 'Wohnung', nummer: 'Wohnung 5' },
    { einheit_id: 'TEST_WE_06', objekt_id: 'TEST', typ: 'Wohnung', nummer: 'Wohnung 6' },
    { einheit_id: 'TEST_WE_07', objekt_id: 'TEST', typ: 'Wohnung', nummer: 'Wohnung 7' },
    { einheit_id: 'TEST_Allgemein', objekt_id: 'TEST', typ: 'Allgemein', nummer: 'Allgemein' }
  ],
  Personen: [
    { person_id: 'P1', vorname: 'Donald', name: 'Duck' },
    { person_id: 'P2', vorname: 'Mickey', name: 'Mouse' },
    { person_id: 'P3', vorname: 'Daisy', name: 'Duck' },
    { person_id: 'P4', vorname: 'Dagobert', name: 'Duck' },
    { person_id: 'P5', vorname: 'Gustav', name: 'Gans' },
    { person_id: 'P6', vorname: 'Tick', name: 'Duck' },
    { person_id: 'P7', vorname: 'Trick', name: 'Duck' }
  ],
  Vertraege: [
    { vertrag_id: 'TEST_V1', einheit_id: 'TEST_WE_01', hauptperson_id: 'P1', start_datum: '2026-01-01', aktiv: true, mietmodell: 'Kalt+NK', erhoehungs_typ: 'Normal', soll_kaltmiete: 500, soll_nebenkosten: 150, soll_gesamt: 650, kaution_soll: 2000, kaution_ist: 1200, zahlungsziel_typ: 'WERKTAG', zahlungsziel_wert: 3 },
    { vertrag_id: 'TEST_V2', einheit_id: 'TEST_WE_02', hauptperson_id: 'P2', start_datum: '2026-01-15', aktiv: true, mietmodell: 'Kalt+NK', erhoehungs_typ: 'Normal', soll_kaltmiete: 700, soll_nebenkosten: 200, soll_gesamt: 900, kaution_soll: 2000, kaution_ist: 2000, zahlungsziel_typ: 'KALENDERTAG', zahlungsziel_wert: 15 },
    { vertrag_id: 'TEST_V3', einheit_id: 'TEST_WE_03', hauptperson_id: 'P3', start_datum: '2026-03-01', aktiv: true, mietmodell: 'Pauschal', erhoehungs_typ: 'Normal', soll_kaltmiete: 750, soll_nebenkosten: 0, soll_gesamt: 750, kaution_soll: 1500, kaution_ist: 750, zahlungsziel_typ: 'WERKTAG', zahlungsziel_wert: 4 },
    { vertrag_id: 'TEST_V4', einheit_id: 'TEST_WE_04', hauptperson_id: 'P4', start_datum: '2026-01-01', aktiv: true, mietmodell: 'Warmmiete', erhoehungs_typ: 'Normal', soll_kaltmiete: 1100, soll_nebenkosten: 350, soll_gesamt: 1450, kaution_soll: 2000, kaution_ist: 2000, zahlungsziel_typ: 'WERKTAG', zahlungsziel_wert: 3 },
    { vertrag_id: 'TEST_V5', einheit_id: 'TEST_WE_05', hauptperson_id: 'P5', start_datum: '2026-01-01', aktiv: true, mietmodell: 'Kalt+NK', erhoehungs_typ: 'Normal', soll_kaltmiete: 400, soll_nebenkosten: 100, soll_gesamt: 500, kaution_soll: 2000, kaution_ist: 2000, zahlungsziel_typ: 'WERKTAG', zahlungsziel_wert: 3 },
    { vertrag_id: 'TEST_V6', einheit_id: 'TEST_WE_06', hauptperson_id: 'P6', start_datum: '2026-02-01', aktiv: true, mietmodell: 'Kalt+NK', erhoehungs_typ: 'Normal', soll_kaltmiete: 600, soll_nebenkosten: 200, soll_gesamt: 800, kaution_soll: 1600, kaution_ist: 1000, zahlungsziel_typ: 'KALENDERTAG', zahlungsziel_wert: 15 },
    { vertrag_id: 'TEST_V7', einheit_id: 'TEST_WE_07', hauptperson_id: '', start_datum: '', aktiv: true, mietmodell: 'Pauschal', erhoehungs_typ: 'Normal', soll_kaltmiete: 0, soll_nebenkosten: 0, soll_gesamt: 0, kaution_soll: 0, kaution_ist: 0, zahlungsziel_typ: 'WERKTAG', zahlungsziel_wert: 3 }
  ],
  Vertragsparteien: [
    { vertrag_id: 'TEST_V1', person_id: 'P1', rolle: 'Hauptmieter', ordnet: 1 },
    { vertrag_id: 'TEST_V2', person_id: 'P2', rolle: 'Hauptmieter', ordnet: 1 },
    { vertrag_id: 'TEST_V3', person_id: 'P3', rolle: 'Hauptmieter', ordnet: 1 },
    { vertrag_id: 'TEST_V4', person_id: 'P4', rolle: 'Hauptmieter', ordnet: 1 },
    { vertrag_id: 'TEST_V5', person_id: 'P5', rolle: 'Hauptmieter', ordnet: 1 },
    { vertrag_id: 'TEST_V6', person_id: 'P6', rolle: 'Hauptmieter', ordnet: 1 },
    { vertrag_id: 'TEST_V6', person_id: 'P7', rolle: 'Hauptmieter', ordnet: 2 }
  ],
  Zaehler: consumptionFixture.zaehler,
  Zaehlerstaende: consumptionFixture.zaehlerstaende,
  Zahlungen: [
    rent('D_2026_01', 'TEST_V1', '2026-01', 650, '2026-01-05'),
    rent('D_2026_02', 'TEST_V1', '2026-02', 150, '2026-11-11'),
    rent('D_2026_03', 'TEST_V1', '2026-03', 650, '2026-03-05'),
    rent('D_2026_04', 'TEST_V1', '2026-04', 650, '2026-04-05'),
    rent('D_2026_05', 'TEST_V1', '2026-05', 650, '2026-05-05'),
    rent('D_2026_06', 'TEST_V1', '2026-06', 650, '2026-06-05'),
    rent('D_2026_07', 'TEST_V1', '2026-07', 650, '2026-07-05'),
    rent('D_2026_08', 'TEST_V1', '2026-08', 650, '2026-08-05'),
    rent('D_2026_09', 'TEST_V1', '2026-09', 650, '2026-09-05'),
    rent('D_2026_10', 'TEST_V1', '2026-10', 650, '2026-10-05'),
    rent('D_KAUTION', 'TEST_V1', '', 1200, '2026-01-03', 'Kaution'),
    ...Array.from({ length: 11 }, (_, index) => rent(`M_2026_${index + 1}`, 'TEST_V2', `2026-${String(index + 1).padStart(2, '0')}`, 900, index === 4 ? '2026-05-20' : `2026-${String(index + 1).padStart(2, '0')}-04`)),
    rent('M_KAUTION', 'TEST_V2', '', 2000, '2026-01-02', 'Kaution'),
    rent('G_01', 'TEST_V4', '2026-01', 1450, '2026-01-04'),
    rent('G_02', 'TEST_V4', '2026-02', 1450, '2026-02-04'),
    rent('G_03', 'TEST_V4', '2026-03', 1450, '2026-03-04'),
    rent('G_04', 'TEST_V4', '2026-04', 700, '2026-05-12'),
    rent('G_05', 'TEST_V4', '2026-05', 1450, '2026-05-20'),
    rent('G_06', 'TEST_V4', '2026-06', 1450, '2026-06-20'),
    rent('G_08', 'TEST_V4', '2026-08', 1450, '2026-08-20'),
    rent('G_09', 'TEST_V4', '2026-09', 1450, '2026-09-20'),
    rent('G_10', 'TEST_V4', '2026-10', 1450, '2026-10-20'),
    rent('G_11', 'TEST_V4', '2026-11', 1450, '2026-11-11'),
    rent('G_KAUTION', 'TEST_V4', '', 2000, '2026-01-02', 'Kaution'),
    rent('GUS_01', 'TEST_V5', '2026-01', 600, '2026-01-05'),
    rent('GUS_02', 'TEST_V5', '2026-02', 500, '2026-02-05'),
    rent('GUS_NACH', 'TEST_V5', '2026-02', 250, '2026-03-01', 'Nachzahlung'),
    rent('GUS_ERST', 'TEST_V5', '2026-03', -100, '2026-03-20', 'Erstattung'),
    rent('GUS_KAUTION', 'TEST_V5', '', 2000, '2026-01-02', 'Kaution'),
    rent('TICK_01', 'TEST_V6', '2026-01', 400, '2026-01-05'),
    rent('TRICK_01', 'TEST_V6', '2026-01', 400, '2026-01-05'),
    rent('TICK_02', 'TEST_V6', '2026-02', 800, '2026-02-20'),
    rent('TICK_KAUTION', 'TEST_V6', '', 1000, '2026-01-02', 'Kaution')
  ],
  Haustechnik: [],
  _view_aktive_mieter: [1, 2, 3, 4, 5, 6, 7].map(index => ({ objekt_id: 'TEST', einheit_id: `TEST_WE_0${index}`, vertrag_id: `TEST_V${index}`, mieter_name: ['Donald Duck', 'Mickey Mouse', 'Daisy Duck', 'Dagobert Duck', 'Gustav Gans', 'Tick Duck / Trick Duck', 'Leerstand'][index - 1], soll_gesamt: [650, 900, 750, 1450, 500, 800, 0][index - 1] })),
  _view_verbrauch_monat: consumptionFixture._view_verbrauch_monat,
  _view_verbrauch_jahr: consumptionFixture._view_verbrauch_jahr,
  _view_verbrauch_audit: consumptionFixture._view_verbrauch_audit,
  _view_verbrauch_bilanz_jahr: consumptionFixture._view_verbrauch_bilanz_jahr
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
  if (view === 'vertrag_capabilities') return {
    backend_version: '4.8.9-mock',
    access_protected: false,
    access_role: 'admin',
    contract_writes: true,
    payment_writes: true,
    payment_schema_ready: true,
    payment_schema_missing: []
  };
  return Object.fromEntries(Object.entries(state).filter(([key]) => !key.startsWith('_')));
}

function writePayments(items) {
  const input = Array.isArray(items) ? items : [items];
  if (!input.length || input.some(item => !item || !String(item.zahlung_id || '').trim())) {
    return { status: 'error', code: 'PAYMENT_ID_MISSING', message: 'Jede Zahlung benötigt eine eindeutige zahlung_id.' };
  }
  const allowedArts = new Map([['miete', 'Miete'], ['kaution', 'Kaution'], ['nachzahlung', 'Nachzahlung'], ['erstattung', 'Erstattung'], ['storno', 'Storno']]);
  const normalizeMonth = value => {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const match = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
    return match && Number(match[2]) >= 1 && Number(match[2]) <= 12 ? `${match[1]}-${match[2]}` : null;
  };
  const normalized = [];
  for (const raw of input) {
    const art = allowedArts.get(String(raw.art || 'Miete').trim().toLowerCase());
    if (!art) return { status: 'error', code: 'PAYMENT_ART_INVALID', message: 'Unbekannte Zahlungsart.' };
    const amount = Math.round(Number(String(raw.betrag ?? '').replace(',', '.')) * 100) / 100;
    if (!Number.isFinite(amount) || amount === 0 || (amount < 0 && !['Storno', 'Erstattung'].includes(art)) || (art === 'Erstattung' && amount > 0)) {
      return { status: 'error', code: 'PAYMENT_AMOUNT_INVALID', message: 'Erstattungen müssen negativ sein; andere Zahlungsarten dürfen nicht negativ sein.' };
    }
    const item = { ...raw, zahlung_id: String(raw.zahlung_id).trim(), art, betrag: amount };
    if (Object.prototype.hasOwnProperty.call(raw, 'mietmonat')) {
      item.mietmonat = normalizeMonth(raw.mietmonat);
      if (item.mietmonat === null) return { status: 'error', code: 'PAYMENT_MONTH_INVALID', message: 'Der fachliche Mietmonat ist ungültig.' };
    }
    normalized.push(item);
  }
  const existingById = new Map(state.Zahlungen.map(row => [String(row.zahlung_id), row]));
  const recordsById = new Map(existingById);
  const stornoByOriginal = new Map(state.Zahlungen.filter(row => String(row.art || '').toLowerCase() === 'storno' && row.storno_von).map(row => [String(row.storno_von), String(row.zahlung_id)]));
  normalized.forEach(item => recordsById.set(item.zahlung_id, item));
  let alreadyPresent = 0;
  const append = [];
  const comparable = (row, field) => {
    if (field === 'betrag') return Math.round(Number(row?.[field] || 0) * 100) / 100;
    if (field === 'art') return allowedArts.get(String(row?.[field] || 'Miete').trim().toLowerCase()) || String(row?.[field] || '').trim();
    if (field === 'mietmonat') return normalizeMonth(row?.[field]) || '';
    return String(row?.[field] ?? '').trim();
  };
  for (const item of normalized) {
    const existing = existingById.get(item.zahlung_id);
    if (existing) {
      const equivalent = ['zahlung_id', 'vertrag_id', 'datum', 'betrag', 'art', 'mietmonat', 'storno_von', 'gegen_art', 'zahlungsgruppe_id']
        .every(field => comparable(item, field) === comparable(existing, field));
      if (!equivalent) return { status: 'error', code: 'PAYMENT_ID_CONFLICT', message: `Die zahlung_id ${item.zahlung_id} ist bereits mit anderen Daten gespeichert.`, zahlung_id: item.zahlung_id };
      alreadyPresent++;
      continue;
    }
    if (item.art === 'Storno') {
      const originalId = String(item.storno_von || '').trim();
      const original = recordsById.get(originalId);
      if (!original) return { status: 'error', code: 'STORNO_ORIGINAL_NOT_FOUND', message: 'Ein Storno muss auf eine vorhandene Originalzahlung verweisen.' };
      if (String(original.vertrag_id || '') !== String(item.vertrag_id || '')) return { status: 'error', code: 'STORNO_CONTRACT_MISMATCH', message: 'Originalzahlung und Storno müssen zum selben Vertrag gehören.' };
      if (Math.abs(Number(original.betrag || 0) + Number(item.betrag || 0)) > 0.009) return { status: 'error', code: 'STORNO_AMOUNT_MISMATCH', message: 'Das Storno muss den Originalbetrag mit umgekehrtem Vorzeichen ausgleichen.' };
      if (stornoByOriginal.has(originalId)) return { status: 'error', code: 'PAYMENT_ALREADY_STORNOED', message: 'Diese Zahlung wurde bereits storniert.' };
      stornoByOriginal.set(originalId, item.zahlung_id);
    }
    append.push(item);
    existingById.set(item.zahlung_id, item);
  }
  state.Zahlungen.push(...append);
  return { status: 'success', message: append.length ? 'Zahlung gespeichert.' : 'Zahlung war bereits gespeichert.', angelegt: append.length, bereits_vorhanden: alreadyPresent };
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
