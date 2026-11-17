/** Shared payment rules for the browser, Apps Script and the synthetic backend. */
var paymentRules = (() => {
  const arts = { miete: 'Miete', kaution: 'Kaution', nachzahlung: 'Nachzahlung', erstattung: 'Erstattung', storno: 'Storno' };
  const pad2 = value => String(value).padStart(2, '0');

  const localDate = value => {
    if (value instanceof Date && !isNaN(value.getTime())) return value;
    const text = String(value === undefined || value === null ? '' : value).trim();
    let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    const parsed = new Date(text);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatDate = (value, dateFormatter) => {
    if (value instanceof Date && !isNaN(value.getTime()) && typeof dateFormatter === 'function') return dateFormatter(value);
    const text = String(value === undefined || value === null ? '' : value).trim();
    const date = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(text)
      ? localDate(new Date(text))
      : localDate(value);
    if (!date) return '';
    if (typeof dateFormatter === 'function') return dateFormatter(date);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  };

  const normalizeArt = (value, fallback = 'Miete') => {
    const text = value === undefined || value === null || String(value).trim() === ''
      ? String(fallback).trim().toLowerCase() : String(value).trim().toLowerCase();
    return arts[text] || '';
  };

  const normalizeMonth = (value, dateFormatter) => {
    if (value === undefined || value === null || String(value).trim() === '') return '';
    if (value instanceof Date) {
      const date = formatDate(value, dateFormatter);
      return date ? date.slice(0, 7) : null;
    }
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(text)) {
      const date = formatDate(text, dateFormatter);
      return date ? date.slice(0, 7) : null;
    }
    const iso = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
    if (iso && Number(iso[2]) >= 1 && Number(iso[2]) <= 12) return `${iso[1]}-${pad2(iso[2])}`;
    const german = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (german && Number(german[2]) >= 1 && Number(german[2]) <= 12) return `${german[3]}-${pad2(german[2])}`;
    return null;
  };
  const normalizeAssignedMonth = (payment, dateFormatter) => {
    const month = normalizeMonth(payment && payment.mietmonat, dateFormatter);
    if (month === null) return null;
    return isDeposit(payment) ? '' : month;
  };

  const receiptMonth = (payment, dateFormatter) => normalizeDate(payment && (payment.datum || payment.buchungsdatum || payment.zahlungsdatum), dateFormatter).slice(0, 7);
  const normalizeDate = (value, dateFormatter) => formatDate(value, dateFormatter);
  const explicitCredit = payment => !normalizeMonth(payment && payment.mietmonat) && Boolean(String(payment && payment.zahlungsgruppe_id || '').trim());
  const effectiveMonth = (payment, dateFormatter) => {
    if (isDeposit(payment)) return '';
    const assigned = normalizeMonth(payment && payment.mietmonat, dateFormatter);
    return assigned || (explicitCredit(payment) ? '' : receiptMonth(payment, dateFormatter));
  };
  const paymentArt = payment => normalizeArt(payment && payment.art);
  const isDeposit = payment => {
    const art = paymentArt(payment);
    return art === 'Kaution' || (art === 'Storno' && normalizeArt(payment && payment.gegen_art, '') === 'Kaution');
  };
  const isRefund = payment => paymentArt(payment) === 'Erstattung';
  const isRentSettlement = payment => {
    const art = paymentArt(payment);
    const against = normalizeArt(payment && payment.gegen_art, '');
    return art === 'Miete' || art === 'Nachzahlung'
      || (art === 'Storno' && against !== 'Kaution' && against !== 'Erstattung');
  };
  const normalizeAmount = value => {
    const text = String(value === undefined || value === null ? '' : value).trim().replace(/\s/g, '');
    if (!text) return null;
    const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
    const amount = Number(normalized);
    return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
  };
  const comparable = (item, field, dateFormatter) => {
    if (field === 'betrag') return normalizeAmount(item && item[field]);
    if (field === 'art') return normalizeArt(item && item[field]);
    if (field === 'datum') return normalizeDate(item && item[field], dateFormatter);
    if (field === 'mietmonat') return normalizeMonth(item && item[field], dateFormatter) || '';
    const value = item && item[field];
    return String(value === undefined || value === null ? '' : value).trim();
  };
  const stornoMetadata = (original, dateFormatter) => {
    const group = String(original && original.zahlungsgruppe_id || '').trim();
    const originalArt = paymentArt(original);
    let month = normalizeMonth(original && original.mietmonat, dateFormatter);
    if (!month && !group && originalArt !== 'Kaution') month = receiptMonth(original, dateFormatter);
    return {
      mietmonat: month || '',
      gegen_art: normalizeArt(original && original.gegen_art, '') || originalArt,
      zahlungsgruppe_id: group
    };
  };

  const dayOnly = value => {
    const date = localDate(value);
    return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : null;
  };
  const paymentStatus = ({ outsidePeriod = '', due = 0, paid = 0, dueDate = null, currentDate = new Date(), settledDate = null } = {}) => {
    const current = dayOnly(currentDate);
    const deadline = dayOnly(dueDate);
    let status = outsidePeriod || (due <= 0 ? 'leerstand' : 'offen');
    if (due > 0) {
      if (paid >= due - 0.009) status = 'bezahlt';
      else if (paid > 0) status = 'teilbezahlt';
      else if (deadline && current > deadline) status = 'überfällig';
      else if (deadline && deadline > current) status = 'zukünftig';
    }
    const settled = dayOnly(settledDate);
    const settledLate = settled && deadline && settled > deadline;
    const stillOpenLate = deadline && current > deadline && ['offen', 'teilbezahlt', 'überfällig'].includes(status);
    return { status, verspaetet: due > 0 && Boolean(settledLate || stillOpenLate) };
  };

  return {
    arts, normalizeArt, normalizeMonth, normalizeDate, normalizeAmount, receiptMonth,
    explicitCredit, effectiveMonth, normalizeAssignedMonth, paymentArt, isDeposit, isRefund, isRentSettlement,
    comparable, stornoMetadata, paymentStatus
  };
})();
