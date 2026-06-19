/**
 * World Cup 2026 — all 48 teams with FIFA ratings (June 2026)
 * Groups A–L, 4 teams each
 * FIFA points used directly as ELO base (updated from official rankings)
 */

const TEAMS = [
  // ── GROUP A ──────────────────────────────────────────────────────────
  { id: 'MEX', name: 'Mexico',       group: 'A', fifaRank: 15, fifaPoints: 1681, flag: '🇲🇽', confederation: 'CONCACAF' },
  { id: 'ZAF', name: 'South Africa', group: 'A', fifaRank: 71, fifaPoints: 1395, flag: '🇿🇦', confederation: 'CAF' },
  { id: 'KOR', name: 'South Korea',  group: 'A', fifaRank: 25, fifaPoints: 1589, flag: '🇰🇷', confederation: 'AFC' },
  { id: 'CZE', name: 'Czechia',      group: 'A', fifaRank: 41, fifaPoints: 1501, flag: '🇨🇿', confederation: 'UEFA' },

  // ── GROUP B ──────────────────────────────────────────────────────────
  { id: 'CAN', name: 'Canada',       group: 'B', fifaRank: 30, fifaPoints: 1556, flag: '🇨🇦', confederation: 'CONCACAF' },
  { id: 'BIH', name: 'Bosnia-Herzegovina', group: 'B', fifaRank: 54, fifaPoints: 1452, flag: '🇧🇦', confederation: 'UEFA' },
  { id: 'QAT', name: 'Qatar',        group: 'B', fifaRank: 59, fifaPoints: 1430, flag: '🇶🇦', confederation: 'AFC' },
  { id: 'SUI', name: 'Switzerland',  group: 'B', fifaRank: 19, fifaPoints: 1649, flag: '🇨🇭', confederation: 'UEFA' },

  // ── GROUP C ──────────────────────────────────────────────────────────
  { id: 'BRA', name: 'Brazil',       group: 'C', fifaRank: 6,  fifaPoints: 1761, flag: '🇧🇷', confederation: 'CONMEBOL' },
  { id: 'MAR', name: 'Morocco',      group: 'C', fifaRank: 8,  fifaPoints: 1756, flag: '🇲🇦', confederation: 'CAF' },
  { id: 'HTI', name: 'Haiti',        group: 'C', fifaRank: 102, fifaPoints: 1211, flag: '🇭🇹', confederation: 'CONCACAF' },
  { id: 'SCO', name: 'Scotland',     group: 'C', fifaRank: 43, fifaPoints: 1498, flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', confederation: 'UEFA' },

  // ── GROUP D ──────────────────────────────────────────────────────────
  { id: 'USA', name: 'United States', group: 'D', fifaRank: 16, fifaPoints: 1673, flag: '🇺🇸', confederation: 'CONCACAF' },
  { id: 'PAR', name: 'Paraguay',     group: 'D', fifaRank: 40, fifaPoints: 1504, flag: '🇵🇾', confederation: 'CONMEBOL' },
  { id: 'AUS', name: 'Australia',    group: 'D', fifaRank: 27, fifaPoints: 1581, flag: '🇦🇺', confederation: 'AFC' },
  { id: 'TUR', name: 'Türkiye',      group: 'D', fifaRank: 22, fifaPoints: 1599, flag: '🇹🇷', confederation: 'UEFA' },

  // ── GROUP E ──────────────────────────────────────────────────────────
  { id: 'GER', name: 'Germany',      group: 'E', fifaRank: 10, fifaPoints: 1730, flag: '🇩🇪', confederation: 'UEFA' },
  { id: 'CUW', name: 'Curaçao',      group: 'E', fifaRank: 108, fifaPoints: 1185, flag: '🇨🇼', confederation: 'CONCACAF' },
  { id: 'CIV', name: "Côte d'Ivoire", group: 'E', fifaRank: 34, fifaPoints: 1533, flag: '🇨🇮', confederation: 'CAF' },
  { id: 'ECU', name: 'Ecuador',      group: 'E', fifaRank: 23, fifaPoints: 1595, flag: '🇪🇨', confederation: 'CONMEBOL' },

  // ── GROUP F ──────────────────────────────────────────────────────────
  { id: 'NED', name: 'Netherlands',  group: 'F', fifaRank: 7,  fifaPoints: 1758, flag: '🇳🇱', confederation: 'UEFA' },
  { id: 'JPN', name: 'Japan',        group: 'F', fifaRank: 18, fifaPoints: 1660, flag: '🇯🇵', confederation: 'AFC' },
  { id: 'SWE', name: 'Sweden',       group: 'F', fifaRank: 38, fifaPoints: 1515, flag: '🇸🇪', confederation: 'UEFA' },
  { id: 'TUN', name: 'Tunisia',      group: 'F', fifaRank: 44, fifaPoints: 1483, flag: '🇹🇳', confederation: 'CAF' },

  // ── GROUP G ──────────────────────────────────────────────────────────
  { id: 'BEL', name: 'Belgium',      group: 'G', fifaRank: 9,  fifaPoints: 1735, flag: '🇧🇪', confederation: 'UEFA' },
  { id: 'EGY', name: 'Egypt',        group: 'G', fifaRank: 29, fifaPoints: 1563, flag: '🇪🇬', confederation: 'CAF' },
  { id: 'IRN', name: 'Iran',         group: 'G', fifaRank: 21, fifaPoints: 1615, flag: '🇮🇷', confederation: 'AFC' },
  { id: 'NZL', name: 'New Zealand',  group: 'G', fifaRank: 93, fifaPoints: 1278, flag: '🇳🇿', confederation: 'OFC' },

  // ── GROUP H ──────────────────────────────────────────────────────────
  { id: 'ESP', name: 'Spain',        group: 'H', fifaRank: 2,  fifaPoints: 1876, flag: '🇪🇸', confederation: 'UEFA' },
  { id: 'CPV', name: 'Cape Verde',   group: 'H', fifaRank: 73, fifaPoints: 1390, flag: '🇨🇻', confederation: 'CAF' },
  { id: 'KSA', name: 'Saudi Arabia', group: 'H', fifaRank: 57, fifaPoints: 1445, flag: '🇸🇦', confederation: 'AFC' },
  { id: 'URU', name: 'Uruguay',      group: 'H', fifaRank: 17, fifaPoints: 1673, flag: '🇺🇾', confederation: 'CONMEBOL' },

  // ── GROUP I ──────────────────────────────────────────────────────────
  { id: 'FRA', name: 'France',       group: 'I', fifaRank: 1,  fifaPoints: 1877, flag: '🇫🇷', confederation: 'UEFA' },
  { id: 'SEN', name: 'Senegal',      group: 'I', fifaRank: 14, fifaPoints: 1689, flag: '🇸🇳', confederation: 'CAF' },
  { id: 'IRQ', name: 'Iraq',         group: 'I', fifaRank: 75, fifaPoints: 1375, flag: '🇮🇶', confederation: 'AFC' },
  { id: 'NOR', name: 'Norway',       group: 'I', fifaRank: 31, fifaPoints: 1551, flag: '🇳🇴', confederation: 'UEFA' },

  // ── GROUP J ──────────────────────────────────────────────────────────
  { id: 'ARG', name: 'Argentina',    group: 'J', fifaRank: 3,  fifaPoints: 1875, flag: '🇦🇷', confederation: 'CONMEBOL' },
  { id: 'ALG', name: 'Algeria',      group: 'J', fifaRank: 28, fifaPoints: 1564, flag: '🇩🇿', confederation: 'CAF' },
  { id: 'AUT', name: 'Austria',      group: 'J', fifaRank: 24, fifaPoints: 1593, flag: '🇦🇹', confederation: 'UEFA' },
  { id: 'JOR', name: 'Jordan',       group: 'J', fifaRank: 88, fifaPoints: 1315, flag: '🇯🇴', confederation: 'AFC' },

  // ── GROUP K ──────────────────────────────────────────────────────────
  { id: 'POR', name: 'Portugal',     group: 'K', fifaRank: 5,  fifaPoints: 1764, flag: '🇵🇹', confederation: 'UEFA' },
  { id: 'COD', name: 'Congo DR',     group: 'K', fifaRank: 46, fifaPoints: 1478, flag: '🇨🇩', confederation: 'CAF' },
  { id: 'UZB', name: 'Uzbekistan',   group: 'K', fifaRank: 50, fifaPoints: 1465, flag: '🇺🇿', confederation: 'AFC' },
  { id: 'COL', name: 'Colombia',     group: 'K', fifaRank: 13, fifaPoints: 1693, flag: '🇨🇴', confederation: 'CONMEBOL' },

  // ── GROUP L ──────────────────────────────────────────────────────────
  { id: 'ENG', name: 'England',      group: 'L', fifaRank: 4,  fifaPoints: 1826, flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', confederation: 'UEFA' },
  { id: 'CRO', name: 'Croatia',      group: 'L', fifaRank: 11, fifaPoints: 1717, flag: '🇭🇷', confederation: 'UEFA' },
  { id: 'GHA', name: 'Ghana',        group: 'L', fifaRank: 62, fifaPoints: 1420, flag: '🇬🇭', confederation: 'CAF' },
  { id: 'PAN', name: 'Panama',       group: 'L', fifaRank: 33, fifaPoints: 1541, flag: '🇵🇦', confederation: 'CONCACAF' },
];

// Historical goal-scoring stats (approx. last 20 competitive matches)
// avgScored/avgConceded used for Poisson model
const TEAM_STATS = {
  MEX: { avgScored: 1.8, avgConceded: 1.1, wcAppearances: 17, lastWcRound: 'R16' },
  ZAF: { avgScored: 1.1, avgConceded: 1.3, wcAppearances: 3, lastWcRound: 'QF' },
  KOR: { avgScored: 1.6, avgConceded: 1.0, wcAppearances: 11, lastWcRound: 'R16' },
  CZE: { avgScored: 1.5, avgConceded: 1.1, wcAppearances: 9, lastWcRound: 'QF' },
  CAN: { avgScored: 1.7, avgConceded: 1.2, wcAppearances: 2, lastWcRound: 'GS' },
  BIH: { avgScored: 1.3, avgConceded: 1.4, wcAppearances: 1, lastWcRound: 'GS' },
  QAT: { avgScored: 1.1, avgConceded: 1.6, wcAppearances: 2, lastWcRound: 'GS' },
  SUI: { avgScored: 1.7, avgConceded: 0.9, wcAppearances: 12, lastWcRound: 'QF' },
  BRA: { avgScored: 2.1, avgConceded: 0.8, wcAppearances: 22, lastWcRound: 'QF' },
  MAR: { avgScored: 1.6, avgConceded: 0.7, wcAppearances: 7, lastWcRound: 'SF' },
  HTI: { avgScored: 0.9, avgConceded: 1.7, wcAppearances: 1, lastWcRound: 'GS' },
  SCO: { avgScored: 1.4, avgConceded: 1.2, wcAppearances: 8, lastWcRound: 'GS' },
  USA: { avgScored: 1.9, avgConceded: 1.0, wcAppearances: 11, lastWcRound: 'QF' },
  PAR: { avgScored: 1.3, avgConceded: 1.3, wcAppearances: 9, lastWcRound: 'SF' },
  AUS: { avgScored: 1.4, avgConceded: 1.2, wcAppearances: 6, lastWcRound: 'R16' },
  TUR: { avgScored: 1.7, avgConceded: 1.1, wcAppearances: 2, lastWcRound: 'SF' },
  GER: { avgScored: 2.0, avgConceded: 1.1, wcAppearances: 20, lastWcRound: 'GS' },
  CUW: { avgScored: 1.0, avgConceded: 1.6, wcAppearances: 0, lastWcRound: null },
  CIV: { avgScored: 1.6, avgConceded: 1.2, wcAppearances: 4, lastWcRound: 'GS' },
  ECU: { avgScored: 1.5, avgConceded: 1.2, wcAppearances: 4, lastWcRound: 'R16' },
  NED: { avgScored: 1.9, avgConceded: 1.0, wcAppearances: 11, lastWcRound: 'SF' },
  JPN: { avgScored: 1.8, avgConceded: 0.9, wcAppearances: 8, lastWcRound: 'R16' },
  SWE: { avgScored: 1.5, avgConceded: 1.0, wcAppearances: 12, lastWcRound: 'SF' },
  TUN: { avgScored: 1.1, avgConceded: 1.2, wcAppearances: 6, lastWcRound: 'GS' },
  BEL: { avgScored: 1.8, avgConceded: 0.9, wcAppearances: 14, lastWcRound: 'QF' },
  EGY: { avgScored: 1.5, avgConceded: 1.1, wcAppearances: 4, lastWcRound: 'GS' },
  IRN: { avgScored: 1.4, avgConceded: 0.9, wcAppearances: 6, lastWcRound: 'R16' },
  NZL: { avgScored: 0.9, avgConceded: 1.5, wcAppearances: 2, lastWcRound: 'GS' },
  ESP: { avgScored: 2.0, avgConceded: 0.8, wcAppearances: 16, lastWcRound: 'SF' },
  CPV: { avgScored: 1.2, avgConceded: 1.3, wcAppearances: 0, lastWcRound: null },
  KSA: { avgScored: 1.3, avgConceded: 1.5, wcAppearances: 7, lastWcRound: 'R16' },
  URU: { avgScored: 1.7, avgConceded: 0.9, wcAppearances: 14, lastWcRound: 'QF' },
  FRA: { avgScored: 2.1, avgConceded: 0.8, wcAppearances: 16, lastWcRound: 'W' },
  SEN: { avgScored: 1.7, avgConceded: 1.0, wcAppearances: 4, lastWcRound: 'QF' },
  IRQ: { avgScored: 1.2, avgConceded: 1.3, wcAppearances: 4, lastWcRound: 'GS' },
  NOR: { avgScored: 2.0, avgConceded: 1.0, wcAppearances: 3, lastWcRound: 'QF' },
  ARG: { avgScored: 2.0, avgConceded: 0.9, wcAppearances: 18, lastWcRound: 'W' },
  ALG: { avgScored: 1.5, avgConceded: 1.1, wcAppearances: 4, lastWcRound: 'R16' },
  AUT: { avgScored: 1.7, avgConceded: 1.1, wcAppearances: 7, lastWcRound: 'SF' },
  JOR: { avgScored: 1.1, avgConceded: 1.3, wcAppearances: 0, lastWcRound: null },
  POR: { avgScored: 2.0, avgConceded: 0.9, wcAppearances: 9, lastWcRound: 'SF' },
  COD: { avgScored: 1.3, avgConceded: 1.2, wcAppearances: 2, lastWcRound: 'GS' },
  UZB: { avgScored: 1.4, avgConceded: 1.1, wcAppearances: 0, lastWcRound: null },
  COL: { avgScored: 1.8, avgConceded: 1.0, wcAppearances: 7, lastWcRound: 'QF' },
  ENG: { avgScored: 2.0, avgConceded: 0.8, wcAppearances: 16, lastWcRound: 'F' },
  CRO: { avgScored: 1.7, avgConceded: 1.0, wcAppearances: 7, lastWcRound: 'SF' },
  GHA: { avgScored: 1.3, avgConceded: 1.3, wcAppearances: 4, lastWcRound: 'QF' },
  PAN: { avgScored: 1.2, avgConceded: 1.3, wcAppearances: 2, lastWcRound: 'GS' },
};

// Group stage match schedule — UTC dates and times, official venues (NBC Sports / Sky Sports)
const GROUP_MATCHES = [
  // GROUP A
  { id: 'A1', group: 'A', home: 'MEX', away: 'ZAF', date: '2026-06-11', time: '19:00', venue: 'Estadio Azteca, Mexico City' },
  { id: 'A2', group: 'A', home: 'KOR', away: 'CZE', date: '2026-06-12', time: '02:00', venue: 'Estadio Akron, Guadalajara' },
  { id: 'A3', group: 'A', home: 'MEX', away: 'KOR', date: '2026-06-19', time: '01:00', venue: 'Estadio Akron, Guadalajara' },
  { id: 'A4', group: 'A', home: 'ZAF', away: 'CZE', date: '2026-06-18', time: '16:00', venue: 'Mercedes-Benz Stadium, Atlanta' },
  { id: 'A5', group: 'A', home: 'ZAF', away: 'KOR', date: '2026-06-25', time: '01:00', venue: 'Estadio BBVA, Monterrey' },
  { id: 'A6', group: 'A', home: 'CZE', away: 'MEX', date: '2026-06-25', time: '01:00', venue: 'Estadio Azteca, Mexico City' },

  // GROUP B
  { id: 'B1', group: 'B', home: 'CAN', away: 'BIH', date: '2026-06-12', time: '19:00', venue: 'BMO Field, Toronto' },
  { id: 'B2', group: 'B', home: 'SUI', away: 'QAT', date: '2026-06-13', time: '19:00', venue: "Levi's Stadium, San Francisco" },
  { id: 'B3', group: 'B', home: 'CAN', away: 'QAT', date: '2026-06-18', time: '22:00', venue: 'BC Place, Vancouver' },
  { id: 'B4', group: 'B', home: 'BIH', away: 'SUI', date: '2026-06-18', time: '19:00', venue: 'SoFi Stadium, Los Angeles' },
  { id: 'B5', group: 'B', home: 'QAT', away: 'BIH', date: '2026-06-24', time: '19:00', venue: 'Lumen Field, Seattle' },
  { id: 'B6', group: 'B', home: 'SUI', away: 'CAN', date: '2026-06-24', time: '19:00', venue: 'BC Place, Vancouver' },

  // GROUP C
  { id: 'C1', group: 'C', home: 'BRA', away: 'SCO', date: '2026-06-24', time: '22:00', venue: 'Hard Rock Stadium, Miami' },
  { id: 'C2', group: 'C', home: 'MAR', away: 'HTI', date: '2026-06-24', time: '22:00', venue: 'Mercedes-Benz Stadium, Atlanta' },
  { id: 'C3', group: 'C', home: 'BRA', away: 'MAR', date: '2026-06-13', time: '22:00', venue: 'MetLife Stadium, New York' },
  { id: 'C4', group: 'C', home: 'HTI', away: 'SCO', date: '2026-06-14', time: '01:00', venue: 'Gillette Stadium, Boston' },
  { id: 'C5', group: 'C', home: 'MAR', away: 'SCO', date: '2026-06-19', time: '22:00', venue: 'Gillette Stadium, Boston' },
  { id: 'C6', group: 'C', home: 'HTI', away: 'BRA', date: '2026-06-20', time: '01:00', venue: 'Lincoln Financial Field, Philadelphia' },

  // GROUP D
  { id: 'D1', group: 'D', home: 'USA', away: 'PAR', date: '2026-06-13', time: '01:00', venue: 'SoFi Stadium, Los Angeles' },
  { id: 'D2', group: 'D', home: 'AUS', away: 'TUR', date: '2026-06-14', time: '04:00', venue: 'BC Place, Vancouver' },
  { id: 'D3', group: 'D', home: 'USA', away: 'AUS', date: '2026-06-19', time: '19:00', venue: 'Lumen Field, Seattle' },
  { id: 'D4', group: 'D', home: 'PAR', away: 'TUR', date: '2026-06-20', time: '04:00', venue: "Levi's Stadium, San Francisco" },
  { id: 'D5', group: 'D', home: 'AUS', away: 'PAR', date: '2026-06-26', time: '02:00', venue: "Levi's Stadium, San Francisco" },
  { id: 'D6', group: 'D', home: 'TUR', away: 'USA', date: '2026-06-26', time: '02:00', venue: 'SoFi Stadium, Los Angeles' },

  // GROUP E
  { id: 'E1', group: 'E', home: 'GER', away: 'CUW', date: '2026-06-14', time: '17:00', venue: 'NRG Stadium, Houston' },
  { id: 'E2', group: 'E', home: 'CIV', away: 'ECU', date: '2026-06-14', time: '23:00', venue: 'Lincoln Financial Field, Philadelphia' },
  { id: 'E3', group: 'E', home: 'GER', away: 'ECU', date: '2026-06-25', time: '20:00', venue: 'MetLife Stadium, New York' },
  { id: 'E4', group: 'E', home: 'CUW', away: 'CIV', date: '2026-06-25', time: '20:00', venue: 'Lincoln Financial Field, Philadelphia' },
  { id: 'E5', group: 'E', home: 'ECU', away: 'CUW', date: '2026-06-21', time: '00:00', venue: 'Arrowhead Stadium, Kansas City' },
  { id: 'E6', group: 'E', home: 'CIV', away: 'GER', date: '2026-06-20', time: '20:00', venue: 'BMO Field, Toronto' },

  // GROUP F
  { id: 'F1', group: 'F', home: 'NED', away: 'TUN', date: '2026-06-25', time: '23:00', venue: 'Arrowhead Stadium, Kansas City' },
  { id: 'F2', group: 'F', home: 'JPN', away: 'SWE', date: '2026-06-25', time: '23:00', venue: 'AT&T Stadium, Dallas' },
  { id: 'F3', group: 'F', home: 'NED', away: 'JPN', date: '2026-06-14', time: '20:00', venue: 'AT&T Stadium, Dallas' },
  { id: 'F4', group: 'F', home: 'SWE', away: 'TUN', date: '2026-06-15', time: '02:00', venue: 'Estadio BBVA, Monterrey' },
  { id: 'F5', group: 'F', home: 'JPN', away: 'TUN', date: '2026-06-21', time: '04:00', venue: 'Estadio BBVA, Monterrey' },
  { id: 'F6', group: 'F', home: 'SWE', away: 'NED', date: '2026-06-20', time: '17:00', venue: 'NRG Stadium, Houston' },

  // GROUP G
  { id: 'G1', group: 'G', home: 'BEL', away: 'NZL', date: '2026-06-27', time: '03:00', venue: 'BC Place, Vancouver' },
  { id: 'G2', group: 'G', home: 'IRN', away: 'EGY', date: '2026-06-27', time: '03:00', venue: 'Lumen Field, Seattle' },
  { id: 'G3', group: 'G', home: 'BEL', away: 'IRN', date: '2026-06-21', time: '19:00', venue: 'SoFi Stadium, Los Angeles' },
  { id: 'G4', group: 'G', home: 'NZL', away: 'EGY', date: '2026-06-22', time: '01:00', venue: 'BC Place, Vancouver' },
  { id: 'G5', group: 'G', home: 'IRN', away: 'NZL', date: '2026-06-16', time: '01:00', venue: 'SoFi Stadium, Los Angeles' },
  { id: 'G6', group: 'G', home: 'EGY', away: 'BEL', date: '2026-06-15', time: '19:00', venue: 'Lumen Field, Seattle' },

  // GROUP H
  { id: 'H1', group: 'H', home: 'ESP', away: 'CPV', date: '2026-06-15', time: '16:00', venue: 'Mercedes-Benz Stadium, Atlanta' },
  { id: 'H2', group: 'H', home: 'URU', away: 'KSA', date: '2026-06-15', time: '22:00', venue: 'Hard Rock Stadium, Miami' },
  { id: 'H3', group: 'H', home: 'ESP', away: 'KSA', date: '2026-06-21', time: '16:00', venue: 'Mercedes-Benz Stadium, Atlanta' },
  { id: 'H4', group: 'H', home: 'CPV', away: 'URU', date: '2026-06-21', time: '22:00', venue: 'Hard Rock Stadium, Miami' },
  { id: 'H5', group: 'H', home: 'KSA', away: 'CPV', date: '2026-06-27', time: '00:00', venue: 'NRG Stadium, Houston' },
  { id: 'H6', group: 'H', home: 'URU', away: 'ESP', date: '2026-06-27', time: '00:00', venue: 'Estadio Akron, Guadalajara' },

  // GROUP I
  { id: 'I1', group: 'I', home: 'FRA', away: 'IRQ', date: '2026-06-22', time: '21:00', venue: 'Lincoln Financial Field, Philadelphia' },
  { id: 'I2', group: 'I', home: 'SEN', away: 'NOR', date: '2026-06-23', time: '00:00', venue: 'MetLife Stadium, New York' },
  { id: 'I3', group: 'I', home: 'FRA', away: 'SEN', date: '2026-06-16', time: '19:00', venue: 'MetLife Stadium, New York' },
  { id: 'I4', group: 'I', home: 'IRQ', away: 'NOR', date: '2026-06-16', time: '22:00', venue: 'Gillette Stadium, Boston' },
  { id: 'I5', group: 'I', home: 'SEN', away: 'IRQ', date: '2026-06-26', time: '19:00', venue: 'BMO Field, Toronto' },
  { id: 'I6', group: 'I', home: 'NOR', away: 'FRA', date: '2026-06-26', time: '19:00', venue: 'Gillette Stadium, Boston' },

  // GROUP J
  { id: 'J1', group: 'J', home: 'ARG', away: 'JOR', date: '2026-06-28', time: '02:00', venue: 'AT&T Stadium, Dallas' },
  { id: 'J2', group: 'J', home: 'AUT', away: 'ALG', date: '2026-06-28', time: '02:00', venue: 'Arrowhead Stadium, Kansas City' },
  { id: 'J3', group: 'J', home: 'ARG', away: 'AUT', date: '2026-06-22', time: '17:00', venue: 'AT&T Stadium, Dallas' },
  { id: 'J4', group: 'J', home: 'JOR', away: 'ALG', date: '2026-06-23', time: '03:00', venue: "Levi's Stadium, San Francisco" },
  { id: 'J5', group: 'J', home: 'AUT', away: 'JOR', date: '2026-06-17', time: '04:00', venue: "Levi's Stadium, San Francisco" },
  { id: 'J6', group: 'J', home: 'ALG', away: 'ARG', date: '2026-06-17', time: '01:00', venue: 'Arrowhead Stadium, Kansas City' },

  // GROUP K
  { id: 'K1', group: 'K', home: 'POR', away: 'UZB', date: '2026-06-23', time: '17:00', venue: 'NRG Stadium, Houston' },
  { id: 'K2', group: 'K', home: 'COL', away: 'COD', date: '2026-06-24', time: '02:00', venue: 'Estadio Akron, Guadalajara' },
  { id: 'K3', group: 'K', home: 'POR', away: 'COL', date: '2026-06-27', time: '23:30', venue: 'Hard Rock Stadium, Miami' },
  { id: 'K4', group: 'K', home: 'UZB', away: 'COD', date: '2026-06-27', time: '23:30', venue: 'Mercedes-Benz Stadium, Atlanta' },
  { id: 'K5', group: 'K', home: 'COL', away: 'UZB', date: '2026-06-18', time: '02:00', venue: 'Estadio Azteca, Mexico City' },
  { id: 'K6', group: 'K', home: 'COD', away: 'POR', date: '2026-06-17', time: '17:00', venue: 'NRG Stadium, Houston' },

  // GROUP L
  { id: 'L1', group: 'L', home: 'ENG', away: 'PAN', date: '2026-06-27', time: '21:00', venue: 'MetLife Stadium, New York' },
  { id: 'L2', group: 'L', home: 'CRO', away: 'GHA', date: '2026-06-27', time: '21:00', venue: 'Lincoln Financial Field, Philadelphia' },
  { id: 'L3', group: 'L', home: 'ENG', away: 'GHA', date: '2026-06-23', time: '20:00', venue: 'Gillette Stadium, Boston' },
  { id: 'L4', group: 'L', home: 'PAN', away: 'CRO', date: '2026-06-23', time: '23:00', venue: 'BMO Field, Toronto' },
  { id: 'L5', group: 'L', home: 'GHA', away: 'PAN', date: '2026-06-17', time: '23:00', venue: 'BMO Field, Toronto' },
  { id: 'L6', group: 'L', home: 'CRO', away: 'ENG', date: '2026-06-17', time: '20:00', venue: 'AT&T Stadium, Dallas' },
];

module.exports = { TEAMS, TEAM_STATS, GROUP_MATCHES };
