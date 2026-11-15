/* Reusable synthetic rental data for the local Entenhausen environment. */

const payment = (zahlung_id, vertrag_id, mietmonat, betrag, datum, art = 'Miete') => ({
  zahlung_id, vertrag_id, mietmonat, betrag, datum, art
});

const recurringPayments = (prefix, vertragId, year, firstMonth, lastMonth, amount, lateMonths = [], overrides = {}) => (
  Array.from({ length: lastMonth - firstMonth + 1 }, (_, index) => {
    const month = firstMonth + index;
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const day = lateMonths.includes(month) ? 20 : 5;
    return payment(`${prefix}_${String(month).padStart(2, '0')}`, vertragId, monthKey, overrides[month] ?? amount, `${monthKey}-${String(day).padStart(2, '0')}`);
  })
);

// Grundbestand für die Jahresfilter-Abnahme: Wohnungen 1–6 sind seit 2025
// belegt, Wohnung 7 ist Leerstand. Der separate Mieterwechsel TEST_WE_08
// bleibt in tenantChangeFixture und wird dort gezielt geprüft.
export const baselineRentalFixture = {
  einheiten: [
    { einheit_id: 'TEST_WE_01', objekt_id: 'TEST', typ: 'Wohnung', nummer: 'Wohnung 1' },
    { einheit_id: 'TEST_WE_02', objekt_id: 'TEST', typ: 'Wohnung', nummer: 'Wohnung 2' },
    { einheit_id: 'TEST_WE_03', objekt_id: 'TEST', typ: 'Wohnung', nummer: 'Wohnung 3' },
    { einheit_id: 'TEST_WE_04', objekt_id: 'TEST', typ: 'Wohnung', nummer: 'Wohnung 4' },
    { einheit_id: 'TEST_WE_05', objekt_id: 'TEST', typ: 'Wohnung', nummer: 'Wohnung 5' },
    { einheit_id: 'TEST_WE_06', objekt_id: 'TEST', typ: 'Wohnung', nummer: 'Wohnung 6' },
    { einheit_id: 'TEST_WE_07', objekt_id: 'TEST', typ: 'Wohnung', nummer: 'Wohnung 7' }
  ],
  personen: [
    { person_id: 'P1', vorname: 'Donald', name: 'Duck' },
    { person_id: 'P2', vorname: 'Mickey', name: 'Mouse' },
    { person_id: 'P3', vorname: 'Daisy', name: 'Duck' },
    { person_id: 'P4', vorname: 'Dagobert', name: 'Duck' },
    { person_id: 'P5', vorname: 'Gustav', name: 'Gans' },
    { person_id: 'P6', vorname: 'Tick', name: 'Duck' },
    { person_id: 'P7', vorname: 'Trick', name: 'Duck' }
  ],
  vertraege: [
    { vertrag_id: 'TEST_V1', einheit_id: 'TEST_WE_01', hauptperson_id: 'P1', start_datum: '2025-01-01', aktiv: true, mietmodell: 'Kalt+NK', erhoehungs_typ: 'Normal', soll_kaltmiete: 500, soll_nebenkosten: 150, soll_gesamt: 650, kaution_soll: 2000, kaution_ist: 1200, zahlungsziel_typ: 'WERKTAG', zahlungsziel_wert: 3 },
    { vertrag_id: 'TEST_V2', einheit_id: 'TEST_WE_02', hauptperson_id: 'P2', start_datum: '2025-01-15', aktiv: true, mietmodell: 'Kalt+NK', erhoehungs_typ: 'Normal', soll_kaltmiete: 700, soll_nebenkosten: 200, soll_gesamt: 900, kaution_soll: 2000, kaution_ist: 2000, zahlungsziel_typ: 'KALENDERTAG', zahlungsziel_wert: 15 },
    { vertrag_id: 'TEST_V3', einheit_id: 'TEST_WE_03', hauptperson_id: 'P3', start_datum: '2025-03-01', aktiv: true, mietmodell: 'Pauschal', erhoehungs_typ: 'Normal', soll_kaltmiete: 750, soll_nebenkosten: 0, soll_gesamt: 750, kaution_soll: 1500, kaution_ist: 750, zahlungsziel_typ: 'WERKTAG', zahlungsziel_wert: 4 },
    { vertrag_id: 'TEST_V4', einheit_id: 'TEST_WE_04', hauptperson_id: 'P4', start_datum: '2025-01-01', aktiv: true, mietmodell: 'Warmmiete', erhoehungs_typ: 'Normal', soll_kaltmiete: 1100, soll_nebenkosten: 350, soll_gesamt: 1450, kaution_soll: 2000, kaution_ist: 2000, zahlungsziel_typ: 'WERKTAG', zahlungsziel_wert: 3 },
    { vertrag_id: 'TEST_V5', einheit_id: 'TEST_WE_05', hauptperson_id: 'P5', start_datum: '2025-01-01', aktiv: true, mietmodell: 'Kalt+NK', erhoehungs_typ: 'Normal', soll_kaltmiete: 400, soll_nebenkosten: 100, soll_gesamt: 500, kaution_soll: 2000, kaution_ist: 2000, zahlungsziel_typ: 'WERKTAG', zahlungsziel_wert: 3 },
    { vertrag_id: 'TEST_V6', einheit_id: 'TEST_WE_06', hauptperson_id: 'P6', start_datum: '2025-02-01', aktiv: true, mietmodell: 'Kalt+NK', erhoehungs_typ: 'Normal', soll_kaltmiete: 600, soll_nebenkosten: 200, soll_gesamt: 800, kaution_soll: 1600, kaution_ist: 1000, zahlungsziel_typ: 'KALENDERTAG', zahlungsziel_wert: 15 },
    { vertrag_id: 'TEST_V7', einheit_id: 'TEST_WE_07', hauptperson_id: '', start_datum: '', aktiv: true, mietmodell: 'Pauschal', erhoehungs_typ: 'Normal', soll_kaltmiete: 0, soll_nebenkosten: 0, soll_gesamt: 0, kaution_soll: 0, kaution_ist: 0, zahlungsziel_typ: 'WERKTAG', zahlungsziel_wert: 3 }
  ],
  vertragsparteien: [
    { vertrag_id: 'TEST_V1', person_id: 'P1', rolle: 'Hauptmieter', ordnet: 1 },
    { vertrag_id: 'TEST_V2', person_id: 'P2', rolle: 'Hauptmieter', ordnet: 1 },
    { vertrag_id: 'TEST_V3', person_id: 'P3', rolle: 'Hauptmieter', ordnet: 1 },
    { vertrag_id: 'TEST_V4', person_id: 'P4', rolle: 'Hauptmieter', ordnet: 1 },
    { vertrag_id: 'TEST_V5', person_id: 'P5', rolle: 'Hauptmieter', ordnet: 1 },
    { vertrag_id: 'TEST_V6', person_id: 'P6', rolle: 'Hauptmieter', ordnet: 1 },
    { vertrag_id: 'TEST_V6', person_id: 'P7', rolle: 'Hauptmieter', ordnet: 2 }
  ],
  zahlungen: [
    ...recurringPayments('D_2025', 'TEST_V1', 2025, 1, 12, 650),
    ...recurringPayments('M_2025', 'TEST_V2', 2025, 1, 12, 900, [5]),
    ...recurringPayments('DAISY_2025', 'TEST_V3', 2025, 3, 12, 750, [], { 7: 300 }),
    ...recurringPayments('G_2025', 'TEST_V4', 2025, 1, 11, 1450, [4]),
    ...recurringPayments('GUS_2025', 'TEST_V5', 2025, 1, 12, 500, [], { 2: 600 }),
    ...recurringPayments('TICK_2025', 'TEST_V6', 2025, 2, 12, 800, [8])
  ]
};

export const tenantChangeFixture = {
  einheiten: [
    { einheit_id: 'TEST_WE_08', objekt_id: 'TEST', typ: 'Wohnung', nummer: 'Wohnung 8' }
  ],
  personen: [
    { person_id: 'P8', vorname: 'Pluto', name: '' },
    { person_id: 'P9', vorname: 'Goofy', name: '' }
  ],
  vertraege: [
    {
      vertrag_id: 'TEST_V8_ALT', einheit_id: 'TEST_WE_08', hauptperson_id: 'P8',
      start_datum: '2025-06-01', end_datum: '2026-05-31', aktiv: false,
      mietmodell: 'Kalt+NK', erhoehungs_typ: 'Normal', soll_kaltmiete: 550,
      soll_nebenkosten: 150, soll_gesamt: 700, kaution_soll: 1500,
      kaution_ist: 1500, zahlungsziel_typ: 'WERKTAG', zahlungsziel_wert: 3
    },
    {
      vertrag_id: 'TEST_V8', einheit_id: 'TEST_WE_08', hauptperson_id: 'P9',
      start_datum: '2026-06-01', end_datum: '', aktiv: true,
      mietmodell: 'Kalt+NK', erhoehungs_typ: 'Normal', soll_kaltmiete: 650,
      soll_nebenkosten: 150, soll_gesamt: 800, kaution_soll: 1800,
      kaution_ist: 900, zahlungsziel_typ: 'WERKTAG', zahlungsziel_wert: 3
    }
  ],
  vertragsparteien: [
    { vertrag_id: 'TEST_V8_ALT', person_id: 'P8', rolle: 'Hauptmieter', ordnet: 1 },
    { vertrag_id: 'TEST_V8', person_id: 'P9', rolle: 'Hauptmieter', ordnet: 1 }
  ],
  zahlungen: [
    payment('PLUTO_2025_06', 'TEST_V8_ALT', '2025-06', 700, '2025-06-05'),
    payment('PLUTO_2025_07', 'TEST_V8_ALT', '2025-07', 700, '2025-07-05'),
    payment('PLUTO_2025_08', 'TEST_V8_ALT', '2025-08', 700, '2025-08-05'),
    payment('PLUTO_2025_09', 'TEST_V8_ALT', '2025-09', 700, '2025-09-05'),
    payment('PLUTO_2025_10', 'TEST_V8_ALT', '2025-10', 700, '2025-10-05'),
    payment('PLUTO_2025_11', 'TEST_V8_ALT', '2025-11', 700, '2025-11-05'),
    payment('PLUTO_2025_12', 'TEST_V8_ALT', '2025-12', 700, '2025-12-05'),
    payment('PLUTO_2026_01', 'TEST_V8_ALT', '2026-01', 700, '2026-01-05'),
    payment('PLUTO_2026_02', 'TEST_V8_ALT', '2026-02', 700, '2026-02-05'),
    payment('PLUTO_2026_03', 'TEST_V8_ALT', '2026-03', 700, '2026-03-05'),
    payment('PLUTO_2026_04', 'TEST_V8_ALT', '2026-04', 700, '2026-05-12'),
    payment('PLUTO_2026_05', 'TEST_V8_ALT', '2026-05', 700, '2026-05-05'),
    payment('PLUTO_NACH_04', 'TEST_V8_ALT', '2026-04', 50, '2026-06-10', 'Nachzahlung'),
    { zahlung_id: 'PLUTO_NACH_04_STORNO', vertrag_id: 'TEST_V8_ALT', mietmonat: '2026-04', betrag: -50, datum: '2026-06-11', art: 'Storno', storno_von: 'PLUTO_NACH_04', gegen_art: 'Nachzahlung' },
    payment('PLUTO_KAUTION', 'TEST_V8_ALT', '', 1500, '2025-06-02', 'Kaution'),
    payment('GOOFY_2026_06', 'TEST_V8', '2026-06', 800, '2026-06-05'),
    payment('GOOFY_2026_07', 'TEST_V8', '2026-07', 400, '2026-07-12'),
    payment('GOOFY_2026_08', 'TEST_V8', '2026-08', 800, '2026-08-05'),
    payment('GOOFY_KAUTION', 'TEST_V8', '', 900, '2026-06-02', 'Kaution')
  ],
  activeViewRow: {
    objekt_id: 'TEST', einheit_id: 'TEST_WE_08', vertrag_id: 'TEST_V8',
    mieter_name: 'Goofy', soll_gesamt: 800
  },
  negativeCases: {
    gap: [
      { vertrag_id: 'TEST_GAP_OLD', einheit_id: 'TEST_WE_09', start_datum: '2025-01-01', end_datum: '2026-05-31', aktiv: false },
      { vertrag_id: 'TEST_GAP_NEW', einheit_id: 'TEST_WE_09', start_datum: '2026-07-01', end_datum: '', aktiv: true }
    ],
    overlap: [
      { vertrag_id: 'TEST_OVERLAP_OLD', einheit_id: 'TEST_WE_10', start_datum: '2025-01-01', end_datum: '2026-06-30', aktiv: false },
      { vertrag_id: 'TEST_OVERLAP_NEW', einheit_id: 'TEST_WE_10', start_datum: '2026-06-15', end_datum: '', aktiv: true }
    ],
    midMonth: [
      { vertrag_id: 'TEST_MID_OLD', einheit_id: 'TEST_WE_11', start_datum: '2025-01-01', end_datum: '2026-06-14', aktiv: false },
      { vertrag_id: 'TEST_MID_NEW', einheit_id: 'TEST_WE_11', start_datum: '2026-06-15', end_datum: '', aktiv: true }
    ]
  }
};
