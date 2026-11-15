/* Reusable synthetic rental data for the local Entenhausen environment. */

const payment = (zahlung_id, vertrag_id, mietmonat, betrag, datum, art = 'Miete') => ({
  zahlung_id, vertrag_id, mietmonat, betrag, datum, art
});

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
    payment('PLUTO_2026_01', 'TEST_V8_ALT', '2026-01', 700, '2026-01-05'),
    payment('PLUTO_2026_02', 'TEST_V8_ALT', '2026-02', 700, '2026-02-05'),
    payment('PLUTO_2026_03', 'TEST_V8_ALT', '2026-03', 700, '2026-03-05'),
    payment('PLUTO_2026_04', 'TEST_V8_ALT', '2026-04', 700, '2026-05-12'),
    payment('PLUTO_2026_05', 'TEST_V8_ALT', '2026-05', 700, '2026-05-05'),
    payment('PLUTO_KAUTION', 'TEST_V8_ALT', '', 1500, '2025-06-02', 'Kaution'),
    payment('GOOFY_2026_06', 'TEST_V8', '2026-06', 800, '2026-06-05'),
    payment('GOOFY_2026_07', 'TEST_V8', '2026-07', 400, '2026-07-12'),
    payment('GOOFY_2026_08', 'TEST_V8', '2026-08', 800, '2026-08-05'),
    payment('GOOFY_KAUTION', 'TEST_V8', '', 900, '2026-06-02', 'Kaution')
  ],
  activeViewRow: {
    objekt_id: 'TEST', einheit_id: 'TEST_WE_08', vertrag_id: 'TEST_V8',
    mieter_name: 'Goofy', soll_gesamt: 800
  }
};
