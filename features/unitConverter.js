import {
  formatSuccess,
  formatError,
  formatInfo,
  formatData,
} from "../utils/formatters.js";

// ========== COMPREHENSIVE UNIT DATABASE ==========
const UNITS = {
  length: {
    // Metric
    m: { name: "meter", factor: 1 },
    km: { name: "kilometer", factor: 0.001 },
    dm: { name: "decimeter", factor: 10 },
    cm: { name: "centimeter", factor: 100 },
    mm: { name: "millimeter", factor: 1000 },
    µm: { name: "micrometer", factor: 1000000 },
    nm: { name: "nanometer", factor: 1000000000 },

    // Imperial/US
    mile: { name: "mile", factor: 0.000621371 },
    yard: { name: "yard", factor: 1.09361 },
    ft: { name: "foot", factor: 3.28084 },
    foot: { name: "foot", factor: 3.28084 },
    in: { name: "inch", factor: 39.3701 },
    inch: { name: "inch", factor: 39.3701 },

    // Nautical
    nmi: { name: "nautical mile", factor: 0.000539957 },

    // Astronomical
    ly: { name: "light year", factor: 1.057e-16 },
    au: { name: "astronomical unit", factor: 6.6846e-12 },
    pc: { name: "parsec", factor: 3.2408e-17 },
  },

  weight: {
    // Metric
    kg: { name: "kilogram", factor: 1 },
    g: { name: "gram", factor: 1000 },
    mg: { name: "milligram", factor: 1000000 },
    µg: { name: "microgram", factor: 1000000000 },
    t: { name: "tonne", factor: 0.001 },
    tonne: { name: "tonne", factor: 0.001 },

    // Imperial/US
    lb: { name: "pound", factor: 2.20462 },
    oz: { name: "ounce", factor: 35.274 },
    st: { name: "stone", factor: 0.157473 },
    ton: { name: "short ton", factor: 0.00110231 },

    // Other
    ct: { name: "carat", factor: 5000 },
    gr: { name: "grain", factor: 15432.4 },
  },

  temperature: {
    c: { name: "celsius", type: "special" },
    f: { name: "fahrenheit", type: "special" },
    k: { name: "kelvin", type: "special" },
  },

  speed: {
    "m/s": { name: "meter per second", factor: 1 },
    "km/h": { name: "kilometer per hour", factor: 3.6 },
    mph: { name: "mile per hour", factor: 2.23694 },
    knot: { name: "knot", factor: 1.94384 },
    "ft/s": { name: "foot per second", factor: 3.28084 },
    "in/s": { name: "inch per second", factor: 39.3701 },
    c: { name: "speed of light", factor: 3.3356e-9 },
    mach: { name: "mach", factor: 0.0029386 },
  },

  volume: {
    // Metric
    l: { name: "liter", factor: 1 },
    ml: { name: "milliliter", factor: 1000 },
    cl: { name: "centiliter", factor: 100 },
    dl: { name: "deciliter", factor: 10 },
    m3: { name: "cubic meter", factor: 0.001 },
    cm3: { name: "cubic centimeter", factor: 1000 },
    mm3: { name: "cubic millimeter", factor: 1000000 },

    // Imperial/US
    gal: { name: "gallon", factor: 0.264172 },
    qt: { name: "quart", factor: 1.05669 },
    pt: { name: "pint", factor: 2.11338 },
    cup: { name: "cup", factor: 4.22675 },
    floz: { name: "fluid ounce", factor: 33.814 },
    tbsp: { name: "tablespoon", factor: 67.628 },
    tsp: { name: "teaspoon", factor: 202.884 },
  },

  area: {
    m2: { name: "square meter", factor: 1 },
    km2: { name: "square kilometer", factor: 0.000001 },
    cm2: { name: "square centimeter", factor: 10000 },
    mm2: { name: "square millimeter", factor: 1000000 },
    ha: { name: "hectare", factor: 0.0001 },
    acre: { name: "acre", factor: 0.000247105 },
    mi2: { name: "square mile", factor: 3.861e-7 },
    yd2: { name: "square yard", factor: 1.19599 },
    ft2: { name: "square foot", factor: 10.7639 },
    in2: { name: "square inch", factor: 1550 },
  },

  time: {
    s: { name: "second", factor: 1 },
    ms: { name: "millisecond", factor: 1000 },
    µs: { name: "microsecond", factor: 1000000 },
    ns: { name: "nanosecond", factor: 1000000000 },
    min: { name: "minute", factor: 1 / 60 },
    h: { name: "hour", factor: 1 / 3600 },
    d: { name: "day", factor: 1 / 86400 },
    wk: { name: "week", factor: 1 / 604800 },
    mo: { name: "month", factor: 1 / 2.628e6 },
    yr: { name: "year", factor: 1 / 3.154e7 },
    decade: { name: "decade", factor: 1 / 3.154e8 },
    century: { name: "century", factor: 1 / 3.154e9 },
  },

  pressure: {
    pa: { name: "pascal", factor: 1 },
    kpa: { name: "kilopascal", factor: 0.001 },
    mpa: { name: "megapascal", factor: 0.000001 },
    bar: { name: "bar", factor: 0.00001 },
    mbar: { name: "millibar", factor: 0.01 },
    psi: { name: "pound per sq inch", factor: 0.000145038 },
    atm: { name: "atmosphere", factor: 9.8692e-6 },
    torr: { name: "torr", factor: 0.00750062 },
    mmHg: { name: "millimeter mercury", factor: 0.00750062 },
  },

  energy: {
    j: { name: "joule", factor: 1 },
    kj: { name: "kilojoule", factor: 0.001 },
    cal: { name: "calorie", factor: 0.239006 },
    kcal: { name: "kilocalorie", factor: 0.000239006 },
    wh: { name: "watt hour", factor: 0.000277778 },
    kwh: { name: "kilowatt hour", factor: 2.7778e-7 },
    ev: { name: "electronvolt", factor: 6.242e18 },
    btu: { name: "british thermal unit", factor: 0.000947817 },
  },

  power: {
    w: { name: "watt", factor: 1 },
    kw: { name: "kilowatt", factor: 0.001 },
    mw: { name: "megawatt", factor: 0.000001 },
    hp: { name: "horsepower", factor: 0.00134102 },
    btuph: { name: "btu per hour", factor: 3.41214 },
  },

  data: {
    b: { name: "bit", factor: 1 },
    B: { name: "byte", factor: 0.125 },
    kb: { name: "kilobit", factor: 0.001 },
    kB: { name: "kilobyte", factor: 0.000125 },
    Mb: { name: "megabit", factor: 0.000001 },
    MB: { name: "megabyte", factor: 1.25e-7 },
    Gb: { name: "gigabit", factor: 1e-9 },
    GB: { name: "gigabyte", factor: 1.25e-10 },
    Tb: { name: "terabit", factor: 1e-12 },
    TB: { name: "terabyte", factor: 1.25e-13 },
  },

  fuel: {
    "km/l": { name: "kilometer per liter", factor: 1 },
    "l/100km": { name: "liter per 100 km", factor: 100 }, // Special
    mpg: { name: "mile per gallon", factor: 2.35215 },
    "mpg(uk)": { name: "mile per gallon (UK)", factor: 2.82481 },
  },
};

// ========== UNIT ALIASES ==========
const UNIT_ALIASES = {
  // Length
  meter: "m",
  meters: "m",
  kilometer: "km",
  kilometers: "km",
  centimeter: "cm",
  centimeters: "cm",
  millimeter: "mm",
  millimeters: "mm",
  mile: "mile",
  miles: "mile",
  yard: "yard",
  yards: "yard",
  foot: "ft",
  feet: "ft",
  inch: "in",
  inches: "in",

  // Weight
  kilogram: "kg",
  kilograms: "kg",
  gram: "g",
  grams: "g",
  milligram: "mg",
  milligrams: "mg",
  pound: "lb",
  pounds: "lb",
  ounce: "oz",
  ounces: "oz",

  // Temperature
  celsius: "c",
  centigrade: "c",
  fahrenheit: "f",
  kelvin: "k",

  // Volume
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  milliliter: "ml",
  milliliters: "ml",
  gallon: "gal",
  gallons: "gal",
  quart: "qt",
  quarts: "qt",
  pint: "pt",
  pints: "pt",
  cup: "cup",
  cups: "cup",

  // Speed
  kmh: "km/h",
  kph: "km/h",
  mph: "mph",
  knots: "knot",

  // Time
  second: "s",
  seconds: "s",
  minute: "min",
  minutes: "min",
  hour: "h",
  hours: "h",
  day: "d",
  days: "d",
  week: "wk",
  weeks: "wk",
  month: "mo",
  months: "mo",
  year: "yr",
  years: "yr",
};

// ========== GET STANDARD UNIT ==========
function getStandardUnit(unit) {
  const lowerUnit = unit.toLowerCase();

  // Check if it's already a standard unit
  for (const category of Object.values(UNITS)) {
    if (category[lowerUnit]) return lowerUnit;
  }

  // Check aliases
  if (UNIT_ALIASES[lowerUnit]) return UNIT_ALIASES[lowerUnit];

  return null;
}

// ========== GET UNIT NAME ==========
function getUnitName(unit) {
  for (const category of Object.values(UNITS)) {
    if (category[unit]) return category[unit].name;
  }
  return unit;
}

// ========== GET CATEGORY ==========
function getCategory(unit) {
  for (const [catName, catUnits] of Object.entries(UNITS)) {
    if (catUnits[unit]) return catName;
  }
  return null;
}

// ========== TEMPERATURE CONVERSION ==========
function convertTemperature(value, from, to) {
  // Convert to celsius first
  let celsius;

  if (from === "c") celsius = value;
  else if (from === "f") celsius = ((value - 32) * 5) / 9;
  else if (from === "k") celsius = value - 273.15;
  else return null;

  // Convert from celsius to target
  if (to === "c") return celsius;
  if (to === "f") return (celsius * 9) / 5 + 32;
  if (to === "k") return celsius + 273.15;

  return null;
}

// ========== FUEL ECONOMY CONVERSION (Special) ==========
function convertFuelEconomy(value, from, to) {
  // l/100km is inverse of km/l
  if (from === "km/l" && to === "l/100km") {
    return value > 0 ? 100 / value : Infinity;
  }
  if (from === "l/100km" && to === "km/l") {
    return value > 0 ? 100 / value : Infinity;
  }

  // Convert to km/l first
  let kmpl;
  if (from === "km/l") kmpl = value;
  else if (from === "mpg") kmpl = value * 0.425144;
  else if (from === "mpg(uk)") kmpl = value * 0.354006;
  else return null;

  // Convert from km/l to target
  if (to === "km/l") return kmpl;
  if (to === "mpg") return kmpl * 2.35215;
  if (to === "mpg(uk)") return kmpl * 2.82481;
  if (to === "l/100km") return kmpl > 0 ? 100 / kmpl : Infinity;

  return null;
}

// ========== MAIN CONVERTER FUNCTION ==========
export async function convert({ fullArgs, from, sock }) {
  if (!fullArgs) {
    const categories = Object.keys(UNITS)
      .map((c) => `▰ ${c.charAt(0).toUpperCase() + c.slice(1)}`)
      .join("\n");

    await sock.sendMessage(from, {
      text: formatInfo(
        "UNIT CONVERTER",
        "📏 *Universal Unit Converter*\n\n" +
          "📌 *Usage:* .convert <value> <from> to <to>\n" +
          "📋 *Examples:*\n" +
          "▰ .convert 10 km to miles\n" +
          "▰ .convert 100 kg to lb\n" +
          "▰ .convert 30 c to f\n" +
          "▰ .convert 5 m to ft\n" +
          "▰ .convert 1 week to hours\n" +
          "▰ .convert 100 MB to GB\n\n" +
          "📊 *Supported Categories:*\n" +
          categories,
      ),
    });
    return;
  }

  // Parse input: "10 km to miles" or "100 kg to lb"
  const match = fullArgs.match(
    /^(\d+(?:\.\d+)?)\s*([a-zA-Z0-9\/]+(?:\/[a-zA-Z0-9]+)?)\s+to\s+([a-zA-Z0-9\/]+(?:\/[a-zA-Z0-9]+)?)$/i,
  );

  if (!match) {
    return await sock.sendMessage(from, {
      text: formatError(
        "INVALID FORMAT",
        "❌ Use format: .convert <value> <from> to <to>\n\n" +
          "✅ *Examples:*\n" +
          "▰ .convert 10 km to miles\n" +
          "▰ .convert 100 kg to lb\n" +
          "▰ .convert 30 c to f",
      ),
    });
  }

  const value = parseFloat(match[1]);
  const fromUnitRaw = match[2].toLowerCase();
  const toUnitRaw = match[3].toLowerCase();

  // Get standard units
  const fromUnit = getStandardUnit(fromUnitRaw);
  const toUnit = getStandardUnit(toUnitRaw);

  if (!fromUnit || !toUnit) {
    return await sock.sendMessage(from, {
      text: formatError(
        "INVALID UNIT",
        `❌ Unrecognized units: "${fromUnitRaw}" or "${toUnitRaw}"\n\n` +
          "💡 *Try common units:* km, m, cm, kg, g, lb, c, f",
      ),
    });
  }

  // Check if units are in the same category
  const fromCategory = getCategory(fromUnit);
  const toCategory = getCategory(toUnit);

  if (fromCategory !== toCategory) {
    return await sock.sendMessage(from, {
      text: formatError(
        "CATEGORY MISMATCH",
        `❌ Cannot convert ${getUnitName(fromUnit)} to ${getUnitName(toUnit)}.\n\n` +
          `📊 *${fromUnitRaw}* is in category: ${fromCategory}\n` +
          `📊 *${toUnitRaw}* is in category: ${toCategory}`,
      ),
    });
  }

  let result;
  let formula = "";

  // ===== SPECIAL CONVERSIONS =====

  // Temperature
  if (fromCategory === "temperature") {
    result = convertTemperature(value, fromUnit, toUnit);
    formula = getTemperatureFormula(fromUnit, toUnit);

    if (result === null) {
      return await sock.sendMessage(from, {
        text: formatError("ERROR", "Temperature conversion failed."),
      });
    }

    const resultData = {
      "📊 From": `${value}°${fromUnit.toUpperCase()} (${getUnitName(fromUnit)})`,
      "📈 To": `${result.toFixed(2)}°${toUnit.toUpperCase()} (${getUnitName(toUnit)})`,
      "📝 Formula": formula,
    };

    await sock.sendMessage(from, {
      text: formatData("🌡️ TEMPERATURE CONVERSION", resultData),
    });
    return;
  }

  // Fuel Economy (special case)
  if (fromCategory === "fuel") {
    result = convertFuelEconomy(value, fromUnit, toUnit);

    if (result === null || result === Infinity) {
      return await sock.sendMessage(from, {
        text: formatError("ERROR", "Fuel economy conversion failed."),
      });
    }

    const resultData = {
      "📊 From": `${value} ${fromUnitRaw} (${getUnitName(fromUnit)})`,
      "📈 To": `${result.toFixed(2)} ${toUnitRaw} (${getUnitName(toUnit)})`,
    };

    await sock.sendMessage(from, {
      text: formatData("⛽ FUEL ECONOMY", resultData),
    });
    return;
  }

  // ===== STANDARD CONVERSIONS =====
  const fromFactor = UNITS[fromCategory][fromUnit]?.factor;
  const toFactor = UNITS[fromCategory][toUnit]?.factor;

  if (!fromFactor || !toFactor) {
    return await sock.sendMessage(from, {
      text: formatError("ERROR", "Conversion factors not found."),
    });
  }

  // Convert to base unit then to target
  const baseValue = value / fromFactor;
  result = baseValue * toFactor;

  // Format result based on magnitude
  let formattedResult;
  if (Math.abs(result) >= 1000000) {
    formattedResult = result.toExponential(4);
  } else if (Math.abs(result) >= 1000) {
    formattedResult = result.toFixed(2);
  } else if (Math.abs(result) >= 1) {
    formattedResult = result.toFixed(4);
  } else {
    formattedResult = result.toFixed(6);
  }

  const categoryName =
    fromCategory.charAt(0).toUpperCase() + fromCategory.slice(1);

  const resultData = {
    "📊 From": `${value} ${fromUnitRaw} (${getUnitName(fromUnit)})`,
    "📈 To": `${formattedResult} ${toUnitRaw} (${getUnitName(toUnit)})`,
    "📐 Category": categoryName,
    "🔄 Factor": `1 ${fromUnitRaw} = ${(toFactor / fromFactor).toFixed(6)} ${toUnitRaw}`,
  };

  // Add extra info for data storage
  if (fromCategory === "data") {
    resultData["💾 Note"] = "1 KB = 1024 B, 1 MB = 1024 KB";
  }

  await sock.sendMessage(from, {
    text: formatData("📏 CONVERSION RESULT", resultData),
  });
}

// ========== GET TEMPERATURE FORMULA ==========
function getTemperatureFormula(from, to) {
  const formulas = {
    c_to_f: "°F = (°C × 9/5) + 32",
    c_to_k: "K = °C + 273.15",
    f_to_c: "°C = (°F - 32) × 5/9",
    f_to_k: "K = (°F - 32) × 5/9 + 273.15",
    k_to_c: "°C = K - 273.15",
    k_to_f: "°F = (K - 273.15) × 9/5 + 32",
  };

  const key = `${from}_to_${to}`;
  return formulas[key] || "Standard temperature conversion";
}

// ========== LIST AVAILABLE UNITS ==========
export async function units({ fullArgs, from, sock }) {
  const category = fullArgs ? fullArgs.toLowerCase() : null;

  if (category && UNITS[category]) {
    // Show specific category
    const units = UNITS[category];
    let unitList = `╔══════════════════════════╗
║   📚 *${category.toUpperCase()} UNITS*   ║
╚══════════════════════════╝\n\n`;

    for (const [code, info] of Object.entries(units)) {
      unitList += `▰ ${code.padEnd(8)} - ${info.name}\n`;
    }

    unitList += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
    unitList += `💡 *Example:* .convert 10 ${Object.keys(units)[0]} to ${Object.keys(units)[1]}\n`;
    unitList += `👑 Created by AYOCODES`;

    await sock.sendMessage(from, { text: unitList });
    return;
  }

  // Show all categories
  let catList = `╔══════════════════════════╗
║   📋 *AVAILABLE CATEGORIES* ║
╚══════════════════════════╝\n\n`;

  for (const [cat, units] of Object.entries(UNITS)) {
    const unitCount = Object.keys(units).length;
    catList += `▰ ${cat.charAt(0).toUpperCase() + cat.slice(1)} - ${unitCount} units\n`;
  }

  catList += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
  catList += `💡 *Usage:* .units <category>\n`;
  catList += `✅ *Example:* .units length\n`;
  catList += `👑 Created by AYOCODES`;

  await sock.sendMessage(from, { text: catList });
}

// ========== LIST ALL UNITS ==========
export async function allunits({ from, sock }) {
  let fullList = `╔══════════════════════════╗
║   📚 *ALL CONVERTIBLE UNITS* ║
╚══════════════════════════╝\n\n`;

  for (const [cat, units] of Object.entries(UNITS)) {
    fullList += `*${cat.toUpperCase()}*\n`;
    const unitNames = Object.keys(units).slice(0, 10).join(", ");
    fullList += `▰ ${unitNames}${Object.keys(units).length > 10 ? "..." : ""}\n`;
    fullList += `   (${Object.keys(units).length} units total)\n\n`;
  }

  fullList += `━━━━━━━━━━━━━━━━━━━━━\n`;
  fullList += `💡 *Use .units <category> for full list*\n`;
  fullList += `👑 Created by AYOCODES`;

  await sock.sendMessage(from, { text: fullList });
}
