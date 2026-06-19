// Maps our 3-letter team IDs to ISO 3166-1 alpha-2 codes used by flagcdn.com
const ISO2 = {
  ARG: 'ar', BRA: 'br', ENG: 'gb-eng', FRA: 'fr', GER: 'de', ESP: 'es',
  POR: 'pt', NED: 'nl', BEL: 'be', CRO: 'hr', URU: 'uy', MEX: 'mx',
  USA: 'us', KOR: 'kr', JPN: 'jp', MAR: 'ma', SEN: 'sn', COL: 'co',
  SUI: 'ch', NOR: 'no', AUS: 'au', TUR: 'tr', CAN: 'ca', ECU: 'ec',
  AUT: 'at', ALG: 'dz', EGY: 'eg', CIV: 'ci', IRN: 'ir', SWE: 'se',
  TUN: 'tn', CZE: 'cz', SCO: 'gb-sct', GHA: 'gh', PAN: 'pa', PAR: 'py',
  UZB: 'uz', COD: 'cd', CPV: 'cv', CUW: 'cw', HTI: 'ht', NZL: 'nz',
  KSA: 'sa', IRQ: 'iq', JOR: 'jo', ZAF: 'za', BIH: 'ba', QAT: 'qa',
};

export function getFlagUrl(teamId, imgWidth = 160) {
  const code = ISO2[teamId];
  if (!code) return null;
  return `https://flagcdn.com/w${imgWidth}/${code}.png`;
}
