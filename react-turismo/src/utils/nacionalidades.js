// nacionalidades.js · Código de nacionalidad de la MRZ del pasaporte (ICAO 9303, 3 letras) -> nombre del país.
//
// La MRZ usa códigos ISO 3166-1 alfa-3 ("PER", "USA"…), más algunos propios de ICAO:
// "D" = Alemania; GBD/GBN/GBO/GBP/GBS = variantes británicas; UNO/UNA/UNK = Naciones Unidas;
// XXA/XXB/XXC/XXX = apátrida, refugiado o sin nacionalidad declarada.
// El nombre lo da el navegador (Intl.DisplayNames) a partir del código alfa-2.

const ALFA3_A_ALFA2 = Object.fromEntries(
  (
    'AFG:AF ALA:AX ALB:AL DZA:DZ ASM:AS AND:AD AGO:AO AIA:AI ATA:AQ ATG:AG ARG:AR ARM:AM ABW:AW AUS:AU AUT:AT ' +
    'AZE:AZ BHS:BS BHR:BH BGD:BD BRB:BB BLR:BY BEL:BE BLZ:BZ BEN:BJ BMU:BM BTN:BT BOL:BO BES:BQ BIH:BA BWA:BW ' +
    'BVT:BV BRA:BR IOT:IO BRN:BN BGR:BG BFA:BF BDI:BI CPV:CV KHM:KH CMR:CM CAN:CA CYM:KY CAF:CF TCD:TD CHL:CL ' +
    'CHN:CN CXR:CX CCK:CC COL:CO COM:KM COG:CG COD:CD COK:CK CRI:CR CIV:CI HRV:HR CUB:CU CUW:CW CYP:CY CZE:CZ ' +
    'DNK:DK DJI:DJ DMA:DM DOM:DO ECU:EC EGY:EG SLV:SV GNQ:GQ ERI:ER EST:EE SWZ:SZ ETH:ET FLK:FK FRO:FO FJI:FJ ' +
    'FIN:FI FRA:FR GUF:GF PYF:PF ATF:TF GAB:GA GMB:GM GEO:GE DEU:DE D:DE GHA:GH GIB:GI GRC:GR GRL:GL GRD:GD ' +
    'GLP:GP GUM:GU GTM:GT GGY:GG GIN:GN GNB:GW GUY:GY HTI:HT HMD:HM VAT:VA HND:HN HKG:HK HUN:HU ISL:IS IND:IN ' +
    'IDN:ID IRN:IR IRQ:IQ IRL:IE IMN:IM ISR:IL ITA:IT JAM:JM JPN:JP JEY:JE JOR:JO KAZ:KZ KEN:KE KIR:KI PRK:KP ' +
    'KOR:KR KWT:KW KGZ:KG LAO:LA LVA:LV LBN:LB LSO:LS LBR:LR LBY:LY LIE:LI LTU:LT LUX:LU MAC:MO MDG:MG MWI:MW ' +
    'MYS:MY MDV:MV MLI:ML MLT:MT MHL:MH MTQ:MQ MRT:MR MUS:MU MYT:YT MEX:MX FSM:FM MDA:MD MCO:MC MNG:MN MNE:ME ' +
    'MSR:MS MAR:MA MOZ:MZ MMR:MM NAM:NA NRU:NR NPL:NP NLD:NL NCL:NC NZL:NZ NIC:NI NER:NE NGA:NG NIU:NU NFK:NF ' +
    'MKD:MK MNP:MP NOR:NO OMN:OM PAK:PK PLW:PW PSE:PS PAN:PA PNG:PG PRY:PY PER:PE PHL:PH PCN:PN POL:PL PRT:PT ' +
    'PRI:PR QAT:QA REU:RE ROU:RO RUS:RU RWA:RW BLM:BL SHN:SH KNA:KN LCA:LC MAF:MF SPM:PM VCT:VC WSM:WS SMR:SM ' +
    'STP:ST SAU:SA SEN:SN SRB:RS SYC:SC SLE:SL SGP:SG SXM:SX SVK:SK SVN:SI SLB:SB SOM:SO ZAF:ZA SGS:GS SSD:SS ' +
    'ESP:ES LKA:LK SDN:SD SUR:SR SJM:SJ SWE:SE CHE:CH SYR:SY TWN:TW TJK:TJ TZA:TZ THA:TH TLS:TL TGO:TG TKL:TK ' +
    'TON:TO TTO:TT TUN:TN TUR:TR TKM:TM TCA:TC TUV:TV UGA:UG UKR:UA ARE:AE GBR:GB GBD:GB GBN:GB GBO:GB GBP:GB ' +
    'GBS:GB USA:US UMI:UM URY:UY UZB:UZ VUT:VU VEN:VE VNM:VN VGB:VG VIR:VI WLF:WF ESH:EH YEM:YE ZMB:ZM ZWE:ZW ' +
    'RKS:XK'
  )
    .split(' ')
    .map((par) => par.split(':'))
);

const ESPECIALES = {
  UNO: 'Naciones Unidas', UNA: 'Naciones Unidas', UNK: 'Naciones Unidas (Kosovo)',
  XXA: 'Apátrida', XXB: 'Refugiado', XXC: 'Refugiado', XXX: 'Nacionalidad no especificada',
  EUE: 'Unión Europea',
};

let nombres = null;
try {
  nombres = new Intl.DisplayNames(['es'], { type: 'region' });
} catch {
  nombres = null; // navegador muy antiguo: se muestra solo el código
}

// "PER" -> "Perú (PER)". Si el código no se conoce, se devuelve tal cual.
export function nombreNacionalidad(codigo) {
  const c = String(codigo || '').toUpperCase().replace(/</g, '');
  if (!c) return '';
  if (ESPECIALES[c]) return `${ESPECIALES[c]} (${c})`;
  const alfa2 = ALFA3_A_ALFA2[c];
  const nombre = alfa2 && nombres ? nombres.of(alfa2) : '';
  return nombre && nombre !== alfa2 ? `${nombre} (${c})` : c;
}
