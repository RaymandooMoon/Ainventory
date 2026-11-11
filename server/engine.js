import { computeBodyMetrics } from './wardrobeStatsAndGenerator.js';

const CITY_COORDS = {
  seoul: { name: '서울', lat: 37.5665, lon: 126.9780 },
  bundang: { name: '성남 · 분당', lat: 37.3827, lon: 127.1189 },
  incheon: { name: '인천 · 송도', lat: 37.3886, lon: 126.6430 },
  daejeon: { name: '대전', lat: 36.3504, lon: 127.3845 },
  daegu: { name: '대구', lat: 35.8714, lon: 128.6014 },
  busan: { name: '부산', lat: 35.1796, lon: 129.0756 },
  jeju: { name: '제주', lat: 33.4996, lon: 126.5312 },
};

const WEATHER_SCENARIOS = {
  crisp_autumn: {
    label: '선선한 가을 맑음',
    condition: '맑음',
    weatherCode: 1,
    tempMin: 7,
    tempMax: 16,
    precipProb: 10,
    windSpeed: 11,
    isSimulated: true,
  },
  rainy_cool: {
    label: '비 오는 쌀쌀한 날',
    condition: '비 예보',
    weatherCode: 61,
    tempMin: 9,
    tempMax: 13,
    precipProb: 80,
    windSpeed: 18,
    isSimulated: true,
  },
  warm_spring: {
    label: '포근한 봄 · 초여름',
    condition: '구름 조금',
    weatherCode: 2,
    tempMin: 14,
    tempMax: 24,
    precipProb: 15,
    windSpeed: 9,
    isSimulated: true,
  },
  winter_cold: {
    label: '영하권 겨울 추위',
    condition: '맑고 추움',
    weatherCode: 0,
    tempMin: -4,
    tempMax: 4,
    precipProb: 10,
    windSpeed: 20,
    isSimulated: true,
  },
};

const PERSONAL_COLOR_INFO = {
  spring_warm: {
    labelKo: '봄 웜톤 (Spring Warm)',
    bestHexes: ['#EDE3D2', '#D4B895', '#E38C74', '#C18F59', '#889667', '#F6F0E4', '#DDD3C2'],
    adviceKo: '아이보리·웜베이지·코랄·카멜 등 명도와 채도가 따뜻한 컬러가 혈색을 가장 화사하게 밝혀줍니다.',
  },
  summer_cool: {
    labelKo: '여름 쿨톤 (Summer Cool)',
    bestHexes: ['#F3F4F6', '#94B8D7', '#ABA9BC', '#C695A0', '#283852', '#969CA6', '#F2F1EC'],
    adviceKo: '소프트 화이트·스카이블루·라벤더 그레이·네이비 등 청량하고 부드러운 뮤트 톤이 피부 결을 깨끗하게 정돈해줍니다.',
  },
  autumn_warm: {
    labelKo: '가을 웜톤 (Autumn Warm)',
    bestHexes: ['#C4B193', '#A64B2A', '#6F7759', '#684934', '#DDD3C2', '#C49A45', '#7D836D'],
    adviceKo: '베이지·테라코타·올리브 카키·딥 브라운 등 깊이감 있는 얼씨(Earthy) 톤이 지적인 분위기를 극대화합니다.',
  },
  winter_cool: {
    labelKo: '겨울 쿨톤 (Winter Cool)',
    bestHexes: ['#1B1C1E', '#F4F5F7', '#34373D', '#1A2438', '#253D63', '#681F2B', '#1C2538'],
    adviceKo: '선명한 블랙·퓨어 화이트·차콜·다크 네이비·버건디 등 대비감이 뚜렷한 컬러가 도시적인 윤곽을 살려줍니다.',
  },
};

const weatherCache = new Map();

function hexToRgb(hex) {
  const clean = (hex || '#888888').replace('#', '').trim();
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return { r: 128, g: 128, b: 128 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToLab({ r, g, b }) {
  let rn = r / 255;
  let gn = g / 255;
  let bn = b / 255;

  rn = rn > 0.04045 ? ((rn + 0.055) / 1.055) ** 2.4 : rn / 12.92;
  gn = gn > 0.04045 ? ((gn + 0.055) / 1.055) ** 2.4 : gn / 12.92;
  bn = bn > 0.04045 ? ((bn + 0.055) / 1.055) ** 2.4 : bn / 12.92;

  let x = (rn * 0.4124 + gn * 0.3576 + bn * 0.1805) / 0.95047;
  let y = (rn * 0.2126 + gn * 0.7152 + bn * 0.0722) / 1.00000;
  let z = (rn * 0.0193 + gn * 0.1192 + bn * 0.9505) / 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function colorSimilarityScore(hexA, hexB, nameA = '', nameB = '') {
  const labA = rgbToLab(hexToRgb(hexA));
  const labB = rgbToLab(hexToRgb(hexB));
  const deltaE = Math.sqrt(
    (labA.L - labB.L) ** 2 +
    (labA.a - labB.a) ** 2 +
    (labA.b - labB.b) ** 2
  );

  let ratio = Math.max(0, 1 - deltaE / 48);
  const normA = nameA.trim();
  const normB = nameB.trim();
  if (normA && normB && normA === normB) {
    ratio = Math.max(ratio, 0.88);
  } else if (
    (normA.includes('네이비') && normB.includes('인디고')) ||
    (normA.includes('인디고') && normB.includes('네이비')) ||
    (normA.includes('화이트') && normB.includes('크림')) ||
    (normA.includes('크림') && normB.includes('화이트')) ||
    (normA.includes('차콜') && normB.includes('블랙')) ||
    (normA.includes('블랙') && normB.includes('차콜'))
  ) {
    ratio = Math.max(ratio, 0.65);
  }
  return Math.min(1, ratio);
}

const RELATED_SUBCATEGORIES = {
  knit: ['cardigan', 'sweatshirt'],
  cardigan: ['knit', 'jacket'],
  shirt: ['blouse', 'tshirt'],
  tshirt: ['shirt', 'sweatshirt'],
  trench: ['coat', 'jacket'],
  coat: ['trench', 'blazer', 'padding'],
  blazer: ['jacket', 'coat'],
  jacket: ['blazer', 'trench', 'cardigan'],
  slacks: ['chinos', 'denim'],
  denim: ['chinos', 'slacks'],
  sneakers: ['loafers', 'boots'],
  loafers: ['sneakers', 'boots'],
};

const NEUTRAL_COLORS = new Set(['블랙', '화이트', '크림', '그레이', '차콜', '베이지', '네이비', '인디고']);

function isColorHarmonious(colorA, colorB) {
  if (NEUTRAL_COLORS.has(colorA) || NEUTRAL_COLORS.has(colorB)) {
    if ((colorA === '네이비' && colorB === '블랙') || (colorA === '블랙' && colorB === '네이비')) {
      return 0.72;
    }
    return 0.95;
  }
  if (colorA === colorB) return 0.78;
  return 0.84;
}

export function analyzeShoppingCandidate(candidate, closetGarments, partnerGarments = []) {
  const {
    name = '오프라인 매장 촬영 아이템',
    category = 'top',
    subcategory = 'knit',
    color_name = '네이비',
    color_hex = '#1E273B',
    price = 0,
  } = candidate;

  const sameCategoryItems = closetGarments.filter((g) => g.category === category);

  const scored = sameCategoryItems.map((item) => {
    let subScore = 14;
    if (item.subcategory === subcategory) {
      subScore = 45;
    } else if ((RELATED_SUBCATEGORIES[subcategory] || []).includes(item.subcategory)) {
      subScore = 28;
    }

    const cRatio = colorSimilarityScore(color_hex, item.color_hex, color_name, item.color_name);
    const colorPoints = Math.round(cRatio * 53);
    const similarity = Math.min(98, subScore + colorPoints);

    const cpw = item.wear_count > 0 ? Math.round(item.price / item.wear_count) : item.price;

    return {
      ...item,
      similarity,
      cpw,
    };
  }).sort((a, b) => b.similarity - a.similarity);

  const similarItems = scored.filter((i) => i.similarity >= 68);
  const nearDuplicates = scored.filter((i) => i.similarity >= 83);
  const maxSimilarity = scored.length > 0 ? scored[0].similarity : 0;
  const unwornSimilar = similarItems.filter((i) => i.wear_count <= 2);

  let verdict = 'buy';
  let headline = '';
  let summary = '';
  let confidenceLabel = '';

  if (nearDuplicates.length >= 1 && similarItems.length >= 2) {
    verdict = 'skip';
    confidenceLabel = '중복 구매 주의 · 보유 아이템 활용 권장';
    headline = `내 옷장에 비슷한 옷이 ${similarItems.length}벌 있습니다`;
    const sleepingText = unwornSimilar.length > 0
      ? ` 특히 보유 중인 '${unwornSimilar[0].name}'은(는) 착용 횟수가 ${unwornSimilar[0].wear_count}회뿐이라, 새 옷 구매 대신 기존 옷을 먼저 꺼내 입으시는 걸 추천합니다.`
      : ` '${similarItems[0].name}'(유사도 ${similarItems[0].similarity}%)과 색감·카테고리가 크게 겹쳐 구매 보류를 지지합니다.`;
    summary = `촬영하신 ${color_name} 톤 ${getCategoryLabel(category)} 아이템은 이미 옷장에 충분한 대안이 있습니다.${sleepingText}`;
  } else if (nearDuplicates.length === 1 || similarItems.length === 1) {
    const match = similarItems[0];
    if (match.similarity >= 86) {
      verdict = 'skip';
      confidenceLabel = '거의 동일한 아이템 보유 중';
      headline = `내 옷장에 거의 같은 옷이 1벌 있습니다 (유사도 ${match.similarity}%)`;
      summary = `'${match.name}'과(와) 컬러·실루엣이 매우 흡사합니다. 핏이나 두께감이 완전히 다른 대체 목적이 아니라면 패스하셔도 후회 없을 선택입니다.`;
    } else {
      verdict = 'consider';
      confidenceLabel = '비슷한 무드 1벌 보유 · 디테일 비교 권장';
      headline = `비슷한 계열의 옷이 1벌 있습니다 (유사도 ${match.similarity}%)`;
      summary = `보유 중인 '${match.name}'과 같은 계열이지만 소재감이나 디테일에 차이가 있다면 교차 착용용으로 고려해볼 만합니다.`;
    }
  } else {
    verdict = 'buy';
    confidenceLabel = '옷장 빈틈 채우기 · 구매 적극 지지';
    headline = `내 옷장에 비슷한 옷이 없습니다. 사셔도 좋습니다!`;
    summary = `현재 옷장에 ${color_name} 계열의 ${getSubcategoryLabel(subcategory)} 아이템이 0벌입니다. 중복 걱정 없이 옷장 스펙트럼을 넓혀주는 현명한 소비입니다.`;
  }

  const activeCloset = closetGarments.filter((g) => g.status === 'active');
  const pairingOutfits = buildCandidatePairings(
    { name, category, subcategory, color_name, color_hex },
    activeCloset
  );

  let partnerInsight = null;
  const partnerColorMatch = partnerGarments.find(
    (pg) => colorSimilarityScore(color_hex, pg.color_hex, color_name, pg.color_name) >= 0.76
  );
  if (partnerColorMatch) {
    partnerInsight = `배우자 옷장의 '${partnerColorMatch.name}'(${partnerColorMatch.color_name})과 톤온톤 커플 시밀러룩 연출도 가능한 컬러입니다.`;
  }

  const complementaryItems = activeCloset.filter(
    (g) => g.category !== category && isColorHarmonious(color_name, g.color_name) >= 0.78
  );

  return {
    verdict,
    confidenceLabel,
    headline,
    summary,
    similarCount: similarItems.length,
    maxSimilarity,
    similarItems: similarItems.slice(0, 4),
    closestOtherItems: similarItems.length === 0 ? scored.slice(0, 2) : [],
    compatibleCount: complementaryItems.length,
    pairingOutfits,
    partnerInsight,
    estimatedCpw10Wears: price > 0 ? Math.round(price / 10) : null,
  };
}

function buildCandidatePairings(candidate, closetItems) {
  const tops = closetItems.filter((g) => g.category === 'top');
  const bottoms = closetItems.filter((g) => g.category === 'bottom');
  const outers = closetItems.filter((g) => g.category === 'outer');
  const shoes = closetItems.filter((g) => g.category === 'shoes');

  const sortHarmonious = (list) =>
    [...list].sort(
      (a, b) =>
        isColorHarmonious(candidate.color_name, b.color_name) -
        isColorHarmonious(candidate.color_name, a.color_name)
    );

  const hTops = sortHarmonious(tops);
  const hBottoms = sortHarmonious(bottoms);
  const hOuters = sortHarmonious(outers);
  const hShoes = sortHarmonious(shoes);

  const combos = [];
  for (let i = 0; i < 3; i++) {
    const items = [];
    if (candidate.category === 'outer') {
      if (hTops[i % Math.max(1, hTops.length)]) items.push(hTops[i % hTops.length]);
      if (hBottoms[i % Math.max(1, hBottoms.length)]) items.push(hBottoms[i % hBottoms.length]);
      if (hShoes[i % Math.max(1, hShoes.length)]) items.push(hShoes[i % hShoes.length]);
    } else if (candidate.category === 'top') {
      if (i > 0 && hOuters[(i - 1) % Math.max(1, hOuters.length)]) {
        items.push(hOuters[(i - 1) % hOuters.length]);
      }
      if (hBottoms[i % Math.max(1, hBottoms.length)]) items.push(hBottoms[i % hBottoms.length]);
      if (hShoes[i % Math.max(1, hShoes.length)]) items.push(hShoes[i % hShoes.length]);
    } else if (candidate.category === 'bottom') {
      if (i === 0 && hOuters[0]) items.push(hOuters[0]);
      if (hTops[i % Math.max(1, hTops.length)]) items.push(hTops[i % hTops.length]);
      if (hShoes[i % Math.max(1, hShoes.length)]) items.push(hShoes[i % hShoes.length]);
    } else {
      if (hTops[i % Math.max(1, hTops.length)]) items.push(hTops[i % hTops.length]);
      if (hBottoms[i % Math.max(1, hBottoms.length)]) items.push(hBottoms[i % hBottoms.length]);
    }
    if (items.length >= 2) {
      const key = items.map((x) => x.id).join('-');
      if (!combos.some((c) => c.key === key)) {
        combos.push({
          key,
          label: i === 0 ? '즉시 활용 데일리 조합' : i === 1 ? '출근 · 스마트 매칭' : '주말 캐주얼 매칭',
          existingItems: items,
        });
      }
    }
  }
  return combos;
}

function weatherCodeToKorean(code) {
  if (code === 0) return '쾌청함';
  if (code === 1 || code === 2) return '대체로 맑음';
  if (code === 3) return '흐림';
  if (code >= 45 && code <= 48) return '안개';
  if (code >= 51 && code <= 67) return '비 예보';
  if (code >= 71 && code <= 77) return '눈 예보';
  if (code >= 80 && code <= 82) return '소나기 가능성';
  if (code >= 95) return '뇌우 동반 비';
  return '구름 조금';
}

function inferWeatherMotion(code, precipProb, windSpeed, condition = '') {
  if (
    precipProb >= 45 ||
    (code >= 51 && code <= 99) ||
    /비|눈|소나기|우산|뇌우/.test(String(condition))
  ) {
    return 'umbrella';
  }
  if (windSpeed >= 17) {
    return 'walk';
  }
  return 'idle';
}

export async function fetchTomorrowWeather(cityKey = 'seoul', scenario = 'live', customCoords = null) {
  const hasCustom =
    customCoords &&
    Number.isFinite(Number(customCoords.lat)) &&
    Number.isFinite(Number(customCoords.lon));
  const city = hasCustom
    ? {
        name: customCoords.label || '현재 위치',
        lat: Number(customCoords.lat),
        lon: Number(customCoords.lon),
      }
    : CITY_COORDS[cityKey] || CITY_COORDS.seoul;

  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);

  if (scenario && scenario !== 'live' && WEATHER_SCENARIOS[scenario]) {
    const preset = WEATHER_SCENARIOS[scenario];
    return {
      cityKey: hasCustom ? 'gps' : cityKey,
      cityName: city.name,
      date: tomorrowStr,
      ...preset,
      recommendedMotion: inferWeatherMotion(
        preset.weatherCode,
        preset.precipProb,
        preset.windSpeed,
        preset.condition
      ),
    };
  }

  const cacheKey = `${hasCustom ? `${city.lat.toFixed(2)},${city.lon.toFixed(2)}` : cityKey}:${tomorrowStr}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < 20 * 60 * 1000) {
    return cached.data;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=Asia%2FSeoul&forecast_days=3`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const idx = json.daily?.time?.length > 1 ? 1 : 0;
    const code = json.daily.weather_code[idx] ?? 1;
    const condition = weatherCodeToKorean(code);
    const precipProb = Math.round(json.daily.precipitation_probability_max?.[idx] ?? 10);
    const windSpeed = Math.round(json.daily.wind_speed_10m_max?.[idx] ?? 10);
    const data = {
      cityKey: hasCustom ? 'gps' : cityKey,
      cityName: city.name,
      date: json.daily.time[idx] || tomorrowStr,
      condition,
      weatherCode: code,
      tempMin: Math.round(json.daily.temperature_2m_min[idx]),
      tempMax: Math.round(json.daily.temperature_2m_max[idx]),
      precipProb,
      windSpeed,
      isSimulated: false,
      recommendedMotion: inferWeatherMotion(code, precipProb, windSpeed, condition),
    };
    weatherCache.set(cacheKey, { fetchedAt: Date.now(), data });
    return data;
  } catch {
    return {
      cityKey: hasCustom ? 'gps' : cityKey,
      cityName: city.name,
      date: tomorrowStr,
      condition: '대체로 맑음',
      weatherCode: 1,
      tempMin: 8,
      tempMax: 16,
      precipProb: 15,
      windSpeed: 11,
      isSimulated: false,
      fallbackUsed: true,
      recommendedMotion: 'idle',
    };
  }
}

function personalColorMatchBonus(itemHex, personalColorKey) {
  const pc = PERSONAL_COLOR_INFO[personalColorKey];
  if (!pc || !itemHex) return 0;
  let best = 0;
  for (const targetHex of pc.bestHexes) {
    const sim = colorSimilarityScore(itemHex, targetHex);
    if (sim > best) best = sim;
  }
  return Math.round(best * 18);
}

export function buildWeatherRecommendations(weather, closetGarments, recentLogs = [], userProfile = null) {
  const active = closetGarments.filter((g) => g.status === 'active');
  const avgTemp = Math.round(weather.tempMin * 0.45 + weather.tempMax * 0.55);
  const diurnalSwing = weather.tempMax - weather.tempMin;
  const isRainy = weather.precipProb >= 45 || (weather.weatherCode >= 51 && weather.weatherCode <= 82);
  const needOuter = avgTemp <= 19 || diurnalSwing >= 8 || isRainy;
  const needWarmAcc = avgTemp <= 9;

  const bodyMetrics = computeBodyMetrics(userProfile || {});
  const personalColorKey = userProfile?.personal_color || userProfile?.personalColor || 'autumn_warm';
  const pcInfo = PERSONAL_COLOR_INFO[personalColorKey] || PERSONAL_COLOR_INFO.autumn_warm;

  const wornYesterdayIds = new Set();
  if (recentLogs.length > 0) {
    try {
      const latestIds = JSON.parse(recentLogs[0].item_ids || '[]');
      latestIds.forEach((id) => wornYesterdayIds.add(id));
    } catch {
      // ignore parse errors
    }
  }

  const scoreItem = (item, preferredFormality) => {
    let score = 50;
    if (avgTemp >= item.min_temp && avgTemp <= item.max_temp) {
      score += 28;
    } else {
      const dist = avgTemp < item.min_temp ? item.min_temp - avgTemp : avgTemp - item.max_temp;
      score -= Math.min(35, dist * 3.5);
    }

    if (isRainy) {
      if (item.water_resistant) score += 22;
      if (item.color_name === '화이트' && (item.category === 'bottom' || item.category === 'shoes')) {
        score -= 18;
      }
      if ((item.notes || '').includes('스웨이드')) {
        score -= 20;
      }
    }

    if (preferredFormality && item.formality === preferredFormality) {
      score += 14;
    } else if (preferredFormality === 'formal' && item.formality === 'smart') {
      score += 10;
    }

    // Personal color harmony boost
    score += personalColorMatchBonus(item.color_hex, personalColorKey);

    if (wornYesterdayIds.has(item.id)) {
      score -= 16;
    }
    if (item.wear_count <= 3) {
      score += 6;
    }

    return score;
  };

  const byCat = (cat) => active.filter((g) => g.category === cat);
  const pools = {
    headwear: byCat('headwear'),
    neckwear: byCat('neckwear'),
    outer: byCat('outer'),
    top: byCat('top'),
    bottom: byCat('bottom'),
    dress: byCat('dress'),
    gloves: byCat('gloves'),
    underwear: byCat('underwear'),
    socks: byCat('socks'),
    shoes: byCat('shoes'),
    accessory: byCat('accessory').concat(byCat('bag')),
  };

  const themes = [
    {
      id: 'commute',
      badge: '출근 · 스마트 포멀',
      title: isRainy ? '비 예보 대비 단정한 출근 코디' : '일교차 대응 깔끔한 오피스룩',
      formality: 'formal',
    },
    {
      id: 'daily',
      badge: '데일리 · 미니멀 캐주얼',
      title: '하루 종일 편안하고 정돈된 데일리룩',
      formality: 'smart',
    },
    {
      id: 'relaxed',
      badge: '오프타임 · 감각적 매치',
      title: '옷장 속 숨은 아이템을 깨우는 기분 전환룩',
      formality: 'casual',
    },
  ];

  const usedCombos = new Set();
  const recommendations = [];

  themes.forEach((theme, idx) => {
    const pickBest = (catKey, offset = 0) => {
      const list = [...(pools[catKey] || [])].sort(
        (a, b) => scoreItem(b, theme.formality) - scoreItem(a, theme.formality)
      );
      return list.length > 0 ? list[offset % list.length] : null;
    };

    const chosenOuter = needOuter ? pickBest('outer', idx) : null;
    const chosenTop = pickBest('top', idx);
    const chosenBottom = pickBest('bottom', idx);
    const chosenShoes = pickBest('shoes', isRainy ? 0 : idx);
    const chosenHeadwear = (needWarmAcc || idx === 2 || weather.tempMax >= 23) ? pickBest('headwear', idx) : pickBest('headwear', idx);
    const chosenNeckwear = (needWarmAcc || theme.formality === 'formal') ? pickBest('neckwear', idx) : pickBest('neckwear', idx);
    const chosenGloves = needWarmAcc ? pickBest('gloves', idx) : pickBest('gloves', idx);
    const chosenUnderwear = pickBest('underwear', idx);
    const chosenSocks = pickBest('socks', idx);
    const chosenAccessory = pickBest('accessory', idx);
    const chosenDress = idx === 2 && userProfile?.gender === 'female' ? pickBest('dress', 0) : null;

    const slotMap = {
      headwear: chosenHeadwear,
      neckwear: chosenNeckwear,
      outer: chosenOuter,
      top: chosenTop,
      bottom: chosenBottom,
      dress: chosenDress,
      gloves: chosenGloves,
      underwear: chosenUnderwear,
      socks: chosenSocks,
      shoes: chosenShoes,
      accessory: chosenAccessory,
    };

    const coreItems = [
      chosenHeadwear,
      chosenNeckwear,
      chosenOuter,
      chosenTop,
      chosenBottom,
      chosenDress,
      chosenGloves,
      chosenUnderwear,
      chosenSocks,
      chosenShoes,
      chosenAccessory,
    ].filter(Boolean);

    const comboKey = [chosenOuter?.id, chosenTop?.id, chosenBottom?.id, chosenShoes?.id]
      .filter(Boolean)
      .join('-');

    if (coreItems.length >= 2 && !usedCombos.has(comboKey)) {
      usedCombos.add(comboKey);

      const reasons = [];
      if (needOuter && chosenOuter) {
        if (isRainy && chosenOuter.water_resistant) {
          reasons.push(`강수 확률 ${weather.precipProb}%에 대비해 발수 소재 '${chosenOuter.name}'을(를) 선택했습니다.`);
        } else if (diurnalSwing >= 8) {
          reasons.push(`아침 최저 ${weather.tempMin}°C · 낮 최고 ${weather.tempMax}°C(일교차 ${diurnalSwing}°C)라 탈착하기 편한 '${chosenOuter.name}'을(를) 매치했습니다.`);
        } else {
          reasons.push(`체감 온도 약 ${avgTemp}°C에 알맞은 보온감의 '${chosenOuter.name}' 중심 레이어드입니다.`);
        }
      } else {
        reasons.push(`낮 기온이 ${weather.tempMax}°C까지 올라 아우터 없이 쾌적한 단품 실루엣을 구성했습니다.`);
      }

      reasons.push(
        `[${pcInfo.labelKo} · ${bodyMetrics.shapeShortKo}(${bodyMetrics.chestCm}-${bodyMetrics.waistCm}-${bodyMetrics.hipCm}cm)] ${bodyMetrics.stylingAdvice}`
      );

      const pcSync = Math.min(
        99,
        Math.round(
          78 +
            coreItems.reduce((acc, it) => acc + personalColorMatchBonus(it.color_hex, personalColorKey), 0) /
              Math.max(1, coreItems.length)
        )
      );

      recommendations.push({
        id: theme.id,
        badge: theme.badge,
        title: theme.title,
        items: coreItems,
        loadoutBySlot: slotMap,
        rationale: reasons.join(' '),
        suitabilityScore: Math.min(99, Math.max(84, 96 - idx * 3)),
        personalColorSync: pcSync,
      });
    }
  });

  let weatherTip = '';
  if (isRainy) {
    weatherTip = `내일 비 소식(${weather.precipProb}%)이 있습니다. 밝은 밑단 바지나 스웨이드 슈즈는 피하고 발수 아우터·가죽 슈즈 위주로 준비하세요.`;
  } else if (diurnalSwing >= 9) {
    weatherTip = `내일 아침(${weather.tempMin}°C)과 낮(${weather.tempMax}°C) 기온 차가 ${diurnalSwing}°C로 큽니다. 얇은 이너 위에 탈착하기 좋은 아우터가 필수입니다.`;
  } else if (avgTemp <= 4) {
    weatherTip = `내일은 평균 ${avgTemp}°C로 쌀쌀합니다. 캐시미어·울 니트와 머플러·장갑 레이어드로 체온을 지켜주세요.`;
  } else {
    weatherTip = `내일 ${weather.cityName} 기온은 ${weather.tempMin}°C ~ ${weather.tempMax}°C로 활동하기 쾌적합니다.`;
  }

  return {
    weather: {
      ...weather,
      avgTemp,
      diurnalSwing,
      isRainy,
      weatherTip,
    },
    stylingProfile: {
      personalColor: personalColorKey,
      personalColorLabel: pcInfo.labelKo,
      personalColorAdvice: pcInfo.adviceKo,
      skinToneHex: userProfile?.skin_tone_hex || userProfile?.skinToneHex || '#E2C6AE',
      ...bodyMetrics,
    },
    cities: Object.entries(CITY_COORDS).map(([key, val]) => ({ key, name: val.name })),
    scenarios: [
      { key: 'live', label: '실시간 내일 예보' },
      ...Object.entries(WEATHER_SCENARIOS).map(([key, val]) => ({ key, label: val.label })),
    ],
    recommendations,
  };
}

export function getCategoryLabel(cat) {
  const map = {
    headwear: '모자 · 헤드웨어',
    neckwear: '목도리 · 스카프 · 타이',
    outer: '아우터',
    top: '상의',
    bottom: '하의',
    dress: '원피스',
    gloves: '장갑',
    underwear: '언더웨어 · 이너',
    socks: '양말',
    shoes: '신발',
    accessory: '가방 · 액세서리',
    bag: '가방 · 액세서리',
  };
  return map[cat] || cat;
}

export function getSubcategoryLabel(sub) {
  const map = {
    beanie: '비니 · 니트모자',
    cap: '볼캡 · 캡모자',
    beret: '베레모',
    bucket_hat: '버킷햇',
    scarf: '머플러 · 스카프',
    muffler: '니트 스카프',
    necktie: '실크 타이',
    trench: '트렌치 · 맥코트',
    coat: '울 · 캐시미어 코트',
    blazer: '블레이저',
    jacket: '자켓 · 점퍼',
    padding: '패딩 · 다운',
    knit: '니트 · 스웨터',
    cardigan: '가디건',
    shirt: '셔츠',
    blouse: '블라우스',
    tshirt: '티셔츠',
    sweatshirt: '맨투맨 · 후드',
    slacks: '슬랙스 · 팬츠',
    denim: '데님 · 청바지',
    chinos: '치노 · 면바지',
    skirt: '스커트',
    shorts: '쇼츠 · 하프팬츠',
    dress: '원피스',
    onepiece: '롱 원피스',
    gloves: '니트 장갑',
    leather_gloves: '가죽 장갑',
    inner_top: '발열 이너탑',
    underwear: '언더웨어',
    crew_socks: '크루 삭스',
    socks: '앵클 삭스',
    sneakers: '스니커즈',
    loafers: '로퍼 · 구두',
    boots: '부츠',
    heels: '힐 · 펌프스',
    briefcase: '서류가방 · 브리프케이스',
    tote: '토트백 · 쇼퍼백',
    bag: '가방 · 크로스백',
    watch: '시계 · 워치',
    belt: '레더 벨트',
    glasses: '아이웨어 · 안경',
  };
  return map[sub] || sub;
}

const MANIFEST_GLB_BY_SUB = {
  beanie: { slotKey: 'headwear', baseGlb: 'headwear_beanie', physicsPreset: 'rigid_fitted' },
  cap: { slotKey: 'headwear', baseGlb: 'headwear_cap', physicsPreset: 'rigid_fitted' },
  beret: { slotKey: 'headwear', baseGlb: 'headwear_beret', physicsPreset: 'rigid_fitted' },
  bucket_hat: { slotKey: 'headwear', baseGlb: 'headwear_fedora', physicsPreset: 'rigid_fitted' },
  scarf: { slotKey: 'neckwear', baseGlb: 'neckwear_scarf', physicsPreset: 'soft_jiggle_muffler' },
  muffler: { slotKey: 'neckwear', baseGlb: 'neckwear_scarf', physicsPreset: 'soft_jiggle_muffler' },
  necktie: { slotKey: 'neckwear', baseGlb: 'neckwear_tie', physicsPreset: 'soft_jiggle_tie' },
  trench: { slotKey: 'outer', baseGlb: 'outer_coat', physicsPreset: 'hem_sway_coat' },
  coat: { slotKey: 'outer', baseGlb: 'outer_coat', physicsPreset: 'hem_sway_coat' },
  blazer: { slotKey: 'outer', baseGlb: 'outer_blazer', physicsPreset: 'rigid_fitted' },
  jacket: { slotKey: 'outer', baseGlb: 'outer_jacket', physicsPreset: 'rigid_fitted' },
  padding: { slotKey: 'outer', baseGlb: 'outer_jacket', physicsPreset: 'rigid_fitted' },
  cardigan: { slotKey: 'top', baseGlb: 'top_cardigan', physicsPreset: 'rigid_fitted' },
  knit: { slotKey: 'top', baseGlb: 'top_knit', physicsPreset: 'rigid_fitted' },
  shirt: { slotKey: 'top', baseGlb: 'top_shirt', physicsPreset: 'rigid_fitted' },
  blouse: { slotKey: 'top', baseGlb: 'top_shirt', physicsPreset: 'rigid_fitted' },
  tshirt: { slotKey: 'top', baseGlb: 'top_tshirt', physicsPreset: 'rigid_fitted' },
  sweatshirt: { slotKey: 'top', baseGlb: 'top_sweatshirt', physicsPreset: 'rigid_fitted' },
  slacks: { slotKey: 'bottom', baseGlb: 'bottom_slacks', physicsPreset: 'rigid_fitted' },
  chinos: { slotKey: 'bottom', baseGlb: 'bottom_slacks', physicsPreset: 'rigid_fitted' },
  denim: { slotKey: 'bottom', baseGlb: 'bottom_denim', physicsPreset: 'rigid_fitted' },
  skirt: { slotKey: 'bottom', baseGlb: 'bottom_skirt', physicsPreset: 'hem_sway_skirt' },
  shorts: { slotKey: 'bottom', baseGlb: 'bottom_shorts', physicsPreset: 'rigid_fitted' },
  dress: { slotKey: 'dress', baseGlb: 'dress_shift', physicsPreset: 'hem_sway_skirt' },
  onepiece: { slotKey: 'dress', baseGlb: 'dress_onepiece', physicsPreset: 'hem_sway_skirt' },
  gloves: { slotKey: 'gloves', baseGlb: 'gloves_short', physicsPreset: 'rigid_fitted' },
  leather_gloves: { slotKey: 'gloves', baseGlb: 'gloves_short', physicsPreset: 'rigid_fitted' },
  inner_top: { slotKey: 'underwear', baseGlb: 'underwear_top', physicsPreset: 'rigid_fitted' },
  underwear: { slotKey: 'underwear', baseGlb: 'underwear_briefs', physicsPreset: 'rigid_fitted' },
  crew_socks: { slotKey: 'socks', baseGlb: 'socks_crew', physicsPreset: 'rigid_fitted' },
  socks: { slotKey: 'socks', baseGlb: 'socks_ankle', physicsPreset: 'rigid_fitted' },
  sneakers: { slotKey: 'shoes', baseGlb: 'shoes_sneakers', physicsPreset: 'rigid_fitted' },
  loafers: { slotKey: 'shoes', baseGlb: 'shoes_loafers', physicsPreset: 'rigid_fitted' },
  boots: { slotKey: 'shoes', baseGlb: 'shoes_boots', physicsPreset: 'rigid_fitted' },
  heels: { slotKey: 'shoes', baseGlb: 'shoes_heels', physicsPreset: 'rigid_fitted' },
  briefcase: { slotKey: 'accessory', baseGlb: 'accessory_briefcase', physicsPreset: 'pendulum_briefcase' },
  tote: { slotKey: 'accessory', baseGlb: 'accessory_tote', physicsPreset: 'pendulum_tote' },
  bag: { slotKey: 'accessory', baseGlb: 'accessory_bag', physicsPreset: 'pendulum_crossbody' },
  watch: { slotKey: 'accessory', baseGlb: 'accessory_watch', physicsPreset: 'rigid_fitted' },
  belt: { slotKey: 'accessory', baseGlb: 'accessory_belt', physicsPreset: 'rigid_fitted' },
  glasses: { slotKey: 'accessory', baseGlb: 'accessory_glasses', physicsPreset: 'rigid_fitted' },
};

export function resolveManifestSlotAndGlb(category = 'top', subcategory = 'knit') {
  const cleanCat = String(category || 'top').toLowerCase();
  const cleanSub = String(subcategory || '').toLowerCase();
  if (MANIFEST_GLB_BY_SUB[cleanSub]) {
    if (cleanCat === 'outer' && cleanSub === 'cardigan') {
      return { slotKey: 'outer', baseGlb: 'outer_jacket', physicsPreset: 'rigid_fitted' };
    }
    return MANIFEST_GLB_BY_SUB[cleanSub];
  }
  const fallbackByCat = {
    headwear: MANIFEST_GLB_BY_SUB.cap,
    neckwear: MANIFEST_GLB_BY_SUB.scarf,
    outer: MANIFEST_GLB_BY_SUB.coat,
    top: MANIFEST_GLB_BY_SUB.knit,
    bottom: MANIFEST_GLB_BY_SUB.slacks,
    dress: MANIFEST_GLB_BY_SUB.dress,
    gloves: MANIFEST_GLB_BY_SUB.gloves,
    underwear: MANIFEST_GLB_BY_SUB.inner_top,
    socks: MANIFEST_GLB_BY_SUB.crew_socks,
    shoes: MANIFEST_GLB_BY_SUB.sneakers,
    accessory: MANIFEST_GLB_BY_SUB.bag,
  };
  return fallbackByCat[cleanCat] || MANIFEST_GLB_BY_SUB.knit;
}

export function buildTripPackingList({
  destination = '도쿄',
  startDate,
  endDate,
  climate = 'mild',
  garments = [],
}) {
  const s = startDate ? new Date(startDate) : new Date();
  const e = endDate ? new Date(endDate) : new Date(Date.now() + 2 * 86400000);
  const days = Math.max(1, Math.min(21, Math.round((e - s) / 86400000) + 1));

  const targetTemp = climate === 'cold' ? 3 : climate === 'warm' ? 25 : climate === 'rainy' ? 13 : 16;
  const active = garments.filter((g) => g.status === 'active');

  const pickByCat = (cat, limit) => {
    return [...active]
      .filter((g) => g.category === cat)
      .sort((a, b) => {
        const fitA = Math.abs(((a.min_temp + a.max_temp) / 2) - targetTemp) - (climate === 'rainy' && a.water_resistant ? 8 : 0);
        const fitB = Math.abs(((b.min_temp + b.max_temp) / 2) - targetTemp) - (climate === 'rainy' && b.water_resistant ? 8 : 0);
        return fitA - fitB;
      })
      .slice(0, limit);
  };

  const chosen = [
    ...pickByCat('outer', climate === 'warm' ? 1 : Math.min(2, Math.ceil(days / 3))),
    ...pickByCat('top', Math.min(5, Math.max(2, days))),
    ...pickByCat('bottom', Math.min(3, Math.max(1, Math.ceil(days / 2)))),
    ...pickByCat('shoes', Math.min(2, days >= 3 ? 2 : 1)),
    ...pickByCat('underwear', Math.min(3, days)),
    ...pickByCat('socks', Math.min(3, days)),
    ...pickByCat('accessory', 1),
  ];

  if (climate === 'cold') {
    chosen.push(...pickByCat('neckwear', 1), ...pickByCat('gloves', 1));
  }

  const seen = new Set();
  const items = [];
  for (const g of chosen) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    items.push({
      key: `g-${g.id}`,
      garment_id: g.id,
      name: g.name,
      category: g.category,
      image_url: g.image_url,
      qty: g.category === 'socks' || g.category === 'underwear' ? Math.min(days, 4) : 1,
      checked: false,
    });
  }

  // Always include essential travel care items
  items.push(
    {
      key: 'essential-pouch',
      garment_id: null,
      name: `${destination} 여행 워시 파우치 · 충전 키트`,
      category: 'essential',
      image_url: null,
      qty: 1,
      checked: false,
    },
    ...(climate === 'rainy'
      ? [
          {
            key: 'essential-umbrella',
            garment_id: null,
            name: '초경량 방풍 우산',
            category: 'essential',
            image_url: null,
            qty: 1,
            checked: false,
          },
        ]
      : [])
  );

  return { days, items };
}

