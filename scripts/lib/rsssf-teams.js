'use strict';
/**
 * RSSSF team names and season labels, shared by the historical migration
 * (rebuild/60-historical.js) and backfill-rsssf-rounds.js — both must resolve a
 * RSSSF row to the same Team row (by Hebrew name, per season).
 */

// RSSSF English → canonical Hebrew (matches DB current-team Hebrew where possible)
const RSSSF_TO_HE = {
  'Ashdod SC':                 'מ.ס. אשדוד',
  'Beitar Jerusalem':          'בית"ר ירושלים',
  'Beitar Netanya':            'בית"ר נתניה',
  'Beitar Tel-Aviv':           'בית"ר תל אביב',
  'Bnei-Yahuda Tel-Aviv':      'בני יהודה',
  'Bnei-Yehuda Tel-Aviv':      'בני יהודה',
  'Hakoah Amidar Ramat-Gan':   'הכח עמידר רמת גן',
  'Hakoah Maccabi Ramat-Gan':  'הכח מכבי רמת גן',
  'Hapoel Acre':               'הפועל עכו',
  'Hapoel Ashkelon':           'הפועל אשקלון',
  'Hapoel Balfuria':           'הפועל בלפוריה',
  'Hapoel Beer-Sheva':         'הפועל באר שבע',
  'Hapoel Beit Shean':         'הפועל בית שאן',
  'Hapoel Beit-Shean':         'הפועל בית שאן',
  'Hapoel Bnei Sakhnin':       'בני סכנין',
  'Hapoel Hadera':             'הפועל חדרה',
  'Hapoel Haifa':              'הפועל חיפה',
  'Hapoel Holon':              'הפועל חולון',
  'Hapoel Jerusalem':          'הפועל ירושלים',
  'Hapoel Kfar-Saba':          'הפועל כפר סבא',
  'Hapoel Kiriat-Shmona':      'עירוני קריית שמונה',
  'Hapoel Lod':                'הפועל לוד',
  'Hapoel Mahane-Yehuda':      'הפועל מחנה יהודה',
  'Hapoel Marmorek':           'הפועל מרמורק',
  'Hapoel Nazrat-Ilit':        'הפועל נוף הגליל',
  'Hapoel Petah-Tikva':        'הפועל פתח תקווה',
  'Hapoel Ramat-Gan':          'הפועל רמת גן',
  'Hapoel Rishon-Lezion':      'הפועל ראשון לציון',
  'Hapoel Taibe':              'הפועל טייבה',
  'Hapoel Tel-Aviv':           'הפועל תל אביב',
  'Hapoel Tiberias':           'הפועל טבריה',
  'Hapoel Tsafririm Holon':    'הפועל צפרירים חולון',
  'Hapoel Yehud':              'הפועל יהוד',
  'Hapoel Ironi Rishon-Lezion':'הפועל ראשון לציון',
  'Maccabi Ahi Nazareth':      'מכבי אחי נצרת',
  'Maccabi Haifa':             'מכבי חיפה',
  'Maccabi Herzliya':          'מכבי הרצליה',
  'Maccabi Ironi Ashdod':      'מכבי עירוני אשדוד',
  'Maccabi Jaffa':             'מכבי יפו',
  'Maccabi Kiryat-Gat':        'מכבי קריית גת',
  'Maccabi Nes-Ziona':         'מכבי נס ציונה',
  'Maccabi Netanya':           'מכבי נתניה',
  'Maccabi Petah-Tikva':       'מכבי פתח תקווה',
  'Maccabi Ramat-Amidar':      'מכבי רמת עמידר',
  'Maccabi Rehovot':           'מכבי רחובות',
  'Maccabi Rishon-Lezion':     'מכבי ראשון לציון',
  'Maccabi Shearaim':          'מכבי שעריים',
  'Maccabi Tel-Aviv':          'מכבי תל אביב',
  'Maccabi Yavne':             'מכבי יבנה',
  'Shimshon Tel-Aviv':         'שמשון תל אביב',
  'SK Nes-Ziona':              'סקציה נס ציונה',
};

function parseSeasonStartYear(s) {
  // RSSSF format "1949/1950" or "2007/2008"
  const m = s.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

module.exports = { RSSSF_TO_HE, parseSeasonStartYear };
