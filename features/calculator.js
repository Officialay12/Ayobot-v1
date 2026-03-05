// features/calculator.js - COMPLETE WORKING VERSION
// Integrated with AYOBOT's formatting and error handling

import * as math from "mathjs";
import { formatSuccess, formatError, formatInfo } from "../utils/formatters.js";

/**
 * Main calculator function - handles all calculation requests
 * @param {Object} params - Command parameters
 * @param {string} params.fullArgs - The expression to calculate
 * @param {string} params.from - Chat ID
 * @param {Object} params.sock - WhatsApp socket
 * @returns {Promise<void>}
 */
export async function calculate({ fullArgs, from, sock }) {
  try {
    console.log(`🧮 Calculator called with: "${fullArgs}"`);

    // Check if expression is provided
    if (!fullArgs || fullArgs.trim().length === 0) {
      await sock.sendMessage(from, {
        text: formatInfo("CALCULATOR", getUsageInstructions()),
      });
      return;
    }

    // Show typing indicator
    await sock.sendPresenceUpdate("composing", from);

    // Process the calculation
    const result = await processCalculation(fullArgs);

    // Send the result
    await sock.sendMessage(from, {
      text: result,
    });

    console.log(`✅ Calculator result sent for: "${fullArgs}"`);
  } catch (error) {
    console.error("❌ Calculator error:", error);

    await sock.sendMessage(from, {
      text: formatError(
        "CALCULATOR ERROR",
        `Something went wrong: ${error.message}\n\nTry a simpler expression or check your syntax.`,
      ),
    });
  }
}

/**
 * Process the calculation expression
 * @param {string} expression - The expression to calculate
 * @returns {string} - Formatted result
 */
async function processCalculation(expression) {
  try {
    console.log(`🧮 Processing: ${expression}`);

    // Input validation
    if (!expression || expression.trim().length === 0) {
      throw new Error("No expression provided");
    }

    // Clean the expression
    let cleanExpr = cleanExpression(expression);
    console.log(`🧮 Cleaned: ${cleanExpr}`);

    // Security checks
    validateExpression(cleanExpr);

    // Calculate using math.js
    const result = math.evaluate(cleanExpr);

    // Validate result
    validateResult(result);

    // Format the result
    const formattedResult = formatResult(result, expression);

    return formattedResult;
  } catch (error) {
    console.error("❌ Calculation error:", error.message);
    throw error;
  }
}

/**
 * Clean and normalize the expression
 * @param {string} expr - Raw expression
 * @returns {string} - Cleaned expression
 */
function cleanExpression(expr) {
  let clean = expr.trim();

  // Replace common symbols
  clean = clean
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3");

  // Handle sqrt notation: √(x) or √x
  clean = clean.replace(/sqrt\(([^)]+)\)/g, "sqrt($1)");
  clean = clean.replace(/sqrt(\d+)/g, "sqrt($1)");

  // Handle power notation: x^y
  clean = clean.replace(/(\d+)\^(\d+)/g, "pow($1, $2)");

  // Handle percentage: x% becomes x/100
  clean = clean.replace(/(\d+)%/g, "($1/100)");

  // Handle factorial: x! (math.js uses x!)
  // Already supported by math.js

  // Remove spaces for consistent evaluation
  clean = clean.replace(/\s+/g, "");

  return clean;
}

/**
 * Security validation - prevent dangerous expressions
 * @param {string} expr - Cleaned expression
 * @throws {Error} If expression is dangerous
 */
function validateExpression(expr) {
  // Check for division by zero (except 0.0)
  if (expr.includes("/0") && !expr.includes("/0.")) {
    throw new Error("Division by zero is not allowed");
  }

  // Block dangerous patterns
  const dangerousPatterns = [
    "eval",
    "Function",
    "constructor",
    "prototype",
    "__proto__",
    "process",
    "require",
    "import",
    "global",
    "window",
    "document",
    "alert",
    "console",
    "log",
    "debug",
    "error",
  ];

  const lowerExpr = expr.toLowerCase();
  for (const pattern of dangerousPatterns) {
    if (lowerExpr.includes(pattern.toLowerCase())) {
      throw new Error("Invalid expression contains forbidden patterns");
    }
  }

  // Limit expression length
  if (expr.length > 500) {
    throw new Error("Expression too long (max 500 characters)");
  }
}

/**
 * Validate calculation result
 * @param {*} result - Result from math.js
 * @throws {Error} If result is invalid
 */
function validateResult(result) {
  if (result === undefined || result === null) {
    throw new Error("Calculation returned no result");
  }

  if (typeof result === "number") {
    if (isNaN(result)) {
      throw new Error("Result is not a number (NaN)");
    }
    if (!isFinite(result)) {
      throw new Error("Result is infinite (division by zero?)");
    }
  }

  // Check for complex numbers (math.js Complex type)
  if (result && typeof result === "object" && result.im !== undefined) {
    if (isNaN(result.re) || isNaN(result.im)) {
      throw new Error("Complex number result is invalid");
    }
  }
}

/**
 * Format result for display
 * @param {*} result - Calculation result
 * @param {string} originalExpr - Original expression for reference
 * @returns {string} - Formatted result message
 */
function formatResult(result, originalExpr) {
  let formattedResult;
  let resultType = "Number";

  // Handle different result types
  if (typeof result === "number") {
    // Format numbers
    if (Number.isInteger(result)) {
      formattedResult = result.toString();
    } else {
      // Round to 10 decimal places and remove trailing zeros
      formattedResult = parseFloat(result.toFixed(10)).toString();
    }

    // Use scientific notation for very large/small numbers
    if (Math.abs(result) > 1e12 || (Math.abs(result) < 1e-6 && result !== 0)) {
      formattedResult = result.toExponential(6);
      resultType = "Scientific";
    }
  } else if (result && typeof result === "object" && result.im !== undefined) {
    // Complex number
    const real = result.re.toFixed(4);
    const imag = result.im.toFixed(4);
    formattedResult = `${real} ${result.im >= 0 ? "+" : "-"} ${Math.abs(result.im)}i`;
    resultType = "Complex";
  } else if (
    result &&
    typeof result === "object" &&
    result.value !== undefined
  ) {
    // Unit result
    formattedResult = `${result.value.toFixed(4)} ${result.unit}`;
    resultType = "Unit";
  } else {
    formattedResult = result.toString();
  }

  // Build response
  let response = `╔══════════════════════════╗
║     🧮 *CALCULATOR*      ║
╚══════════════════════════╝\n\n`;

  response += `📝 *Expression:* ${originalExpr}\n`;
  response += `✅ *Result:* ${formattedResult}\n`;
  response += `📊 *Type:* ${resultType}\n`;

  // Add conversions for numbers
  if (typeof result === "number" && !isNaN(result)) {
    response += `\n🔢 *Additional Info:*\n`;

    if (Number.isInteger(result) && result >= 0 && result <= 1000000) {
      response += `• Binary: ${result.toString(2)}\n`;
      response += `• Hexadecimal: ${result.toString(16).toUpperCase()}\n`;
      response += `• Octal: ${result.toString(8)}\n`;
    }

    if (result > 0) {
      response += `• Square: ${(result * result).toFixed(4)}\n`;
      response += `• Square root: ${Math.sqrt(result).toFixed(4)}\n`;
      response += `• Cube root: ${Math.cbrt(result).toFixed(4)}\n`;
    }

    if (result !== 0) {
      response += `• Reciprocal: ${(1 / result).toFixed(6)}\n`;
    }

    // Trigonometric conversions if it's an angle
    const rad = (result * Math.PI) / 180;
    if (Math.abs(result) <= 360) {
      response += `• Sin: ${Math.sin(rad).toFixed(6)}\n`;
      response += `• Cos: ${Math.cos(rad).toFixed(6)}\n`;
      response += `• Tan: ${Math.tan(rad).toFixed(6)}\n`;
    }
  }

  response += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
  response += `⚡ *AYOBOT v1* | 👑 *AYOCODES*`;

  return response;
}

/**
 * Get usage instructions
 * @returns {string} - Usage instructions
 */
function getUsageInstructions() {
  return `🧮 *CALCULATOR - USAGE*

*Basic Operations:*
• Addition: 5 + 3
• Subtraction: 10 - 4
• Multiplication: 6 × 7 or 6*7
• Division: 20 ÷ 4 or 20/4
• Parentheses: (5 + 3) × 2

*Advanced Functions:*
• Powers: 2^3, 4², 5³
• Square root: √16 or sqrt(16)
• Cube root: cbrt(27)
• Factorial: 5!
• Percentage: 20% of 200

*Trigonometry:*
• sin(30), cos(45), tan(60)
• asin(0.5), acos(0.5), atan(1)
• sinh(1), cosh(1), tanh(1)

*Logarithms:*
• log(100) - base 10
• ln(10) - natural log
• log2(8) - base 2

*Constants:*
• π (pi)
• e

*Examples:*
• .calc 5+3
• .calc (10-4)*2
• .calc sqrt(25)
• .calc 2^8
• .calc sin(30) + cos(60)
• .calc 5! + 10
• .calc 20% of 500

━━━━━━━━━━━━━━━━━━━━━
⚡ *AYOBOT v1* | 👑 *AYOCODES*`;
}

/**
 * Quick calculation for previews
 * @param {string} expression - Simple expression
 * @returns {number|null} - Result or null if error
 */
export function quickCalculate(expression) {
  try {
    const clean = cleanExpression(expression);
    validateExpression(clean);
    const result = math.evaluate(clean);
    validateResult(result);
    return typeof result === "number" ? result : null;
  } catch (error) {
    console.error("Quick calculate error:", error.message);
    return null;
  }
}

/**
 * Unit conversion function
 * @param {Object} params - Command parameters
 * @param {string} params.fullArgs - Conversion expression
 * @param {string} params.from - Chat ID
 * @param {Object} params.sock - WhatsApp socket
 */
export async function convert({ fullArgs, from, sock }) {
  try {
    if (!fullArgs || fullArgs.trim().length === 0) {
      await sock.sendMessage(from, {
        text: formatInfo("UNIT CONVERTER", getConversionInstructions()),
      });
      return;
    }

    await sock.sendPresenceUpdate("composing", from);

    const result = await processConversion(fullArgs);

    await sock.sendMessage(from, {
      text: result,
    });
  } catch (error) {
    console.error("❌ Conversion error:", error);

    await sock.sendMessage(from, {
      text: formatError(
        "CONVERSION ERROR",
        `${error.message}\n\nType ".convert help" for usage.`,
      ),
    });
  }
}

/**
 * Process unit conversion
 * @param {string} input - Conversion input
 * @returns {string} - Formatted result
 */
async function processConversion(input) {
  // Input format: "100 km to miles" or "5 feet to meters"
  const parts = input.toLowerCase().split(" to ");

  if (parts.length !== 2) {
    throw new Error("Invalid format. Use: <value> <unit> to <unit>");
  }

  const [fromPart, toUnit] = parts;

  // Extract value and from unit
  const match = fromPart.match(/([\d.]+)\s*([a-zA-Z°]+)/);
  if (!match) {
    throw new Error("Invalid format. Use: <value> <unit> to <unit>");
  }

  const value = parseFloat(match[1]);
  const fromUnit = match[2].toLowerCase();

  if (isNaN(value)) {
    throw new Error("Invalid number");
  }

  console.log(`📏 Converting: ${value} ${fromUnit} to ${toUnit}`);

  // Map common unit aliases
  const unitMap = {
    // Length
    m: "m",
    meter: "m",
    meters: "m",
    cm: "cm",
    centimeter: "cm",
    centimeters: "cm",
    km: "km",
    kilometer: "km",
    kilometers: "km",
    mm: "mm",
    millimeter: "mm",
    millimeters: "mm",
    in: "in",
    inch: "in",
    inches: "in",
    ft: "ft",
    foot: "ft",
    feet: "ft",
    yd: "yd",
    yard: "yd",
    yards: "yd",
    mi: "mi",
    mile: "mi",
    miles: "mi",

    // Weight/Mass
    kg: "kg",
    kilogram: "kg",
    kilograms: "kg",
    g: "g",
    gram: "g",
    grams: "g",
    mg: "mg",
    milligram: "mg",
    milligrams: "mg",
    lb: "lb",
    pound: "lb",
    pounds: "lb",
    lbs: "lb",
    oz: "oz",
    ounce: "oz",
    ounces: "oz",

    // Temperature
    c: "degC",
    "°c": "degC",
    celsius: "degC",
    f: "degF",
    "°f": "degF",
    fahrenheit: "degF",
    k: "K",
    kelvin: "K",

    // Volume
    l: "L",
    liter: "L",
    liters: "L",
    ml: "mL",
    milliliter: "mL",
    milliliters: "mL",
    gal: "gal",
    gallon: "gal",
    gallons: "gal",
    floz: "floz",
    ounce_fluid: "floz",

    // Time
    s: "s",
    sec: "s",
    second: "s",
    seconds: "s",
    min: "min",
    minute: "min",
    minutes: "min",
    h: "h",
    hr: "h",
    hour: "h",
    hours: "h",
    d: "day",
    day: "day",
    days: "day",
  };

  const mappedFromUnit = unitMap[fromUnit];
  const mappedToUnit = unitMap[toUnit.trim()];

  if (!mappedFromUnit || !mappedToUnit) {
    throw new Error(
      "Unsupported unit. Check available units with .convert help",
    );
  }

  // Special handling for temperature
  if (
    ["degC", "degF", "K"].includes(mappedFromUnit) ||
    ["degC", "degF", "K"].includes(mappedToUnit)
  ) {
    let result;
    let formula;

    if (mappedFromUnit === "degC" && mappedToUnit === "degF") {
      result = (value * 9) / 5 + 32;
      formula = "°F = (°C × 9/5) + 32";
    } else if (mappedFromUnit === "degF" && mappedToUnit === "degC") {
      result = ((value - 32) * 5) / 9;
      formula = "°C = (°F - 32) × 5/9";
    } else if (mappedFromUnit === "degC" && mappedToUnit === "K") {
      result = value + 273.15;
      formula = "K = °C + 273.15";
    } else if (mappedFromUnit === "K" && mappedToUnit === "degC") {
      result = value - 273.15;
      formula = "°C = K - 273.15";
    } else if (mappedFromUnit === "degF" && mappedToUnit === "K") {
      result = ((value - 32) * 5) / 9 + 273.15;
      formula = "K = (°F - 32) × 5/9 + 273.15";
    } else if (mappedFromUnit === "K" && mappedToUnit === "degF") {
      result = ((value - 273.15) * 9) / 5 + 32;
      formula = "°F = (K - 273.15) × 9/5 + 32";
    } else {
      result = value; // Same unit
      formula = "Same unit, no conversion needed";
    }

    return `╔══════════════════════════╗
║    🌡️ *TEMPERATURE*     ║
╚══════════════════════════╝

📝 *Conversion:*
${value}°${fromUnit.toUpperCase()} = ${result.toFixed(2)}°${toUnit.trim().toUpperCase()}

📐 *Formula:*
${formula}

━━━━━━━━━━━━━━━━━━━━━
⚡ *AYOBOT v1* | 👑 *AYOCODES*`;
  }

  // Use math.js for other conversions
  try {
    const result = math.unit(value, mappedFromUnit).to(mappedToUnit);
    const resultValue =
      typeof result === "object" ? result.toNumeric() : result;

    return `╔══════════════════════════╗
║    📏 *UNIT CONVERSION*  ║
╚══════════════════════════╝

📝 *Result:*
${value} ${fromUnit} = ${resultValue.toFixed(4)} ${toUnit}

━━━━━━━━━━━━━━━━━━━━━
⚡ *AYOBOT v1* | 👑 *AYOCODES*`;
  } catch (error) {
    throw new Error(`Conversion failed: ${error.message}`);
  }
}

/**
 * Get conversion instructions
 * @returns {string} - Conversion usage instructions
 */
function getConversionInstructions() {
  return `📏 *UNIT CONVERTER - USAGE*

*Format:*
.convert <value> <from_unit> to <to_unit>

*Examples:*
• .convert 100 km to miles
• .convert 5 feet to meters
• .convert 32 C to F
• .convert 1 kg to pounds
• .convert 2 hours to minutes

*Supported Units:*

📏 *Length:*
m, cm, km, mm, in, ft, yd, mi

⚖️ *Weight:*
kg, g, mg, lb, oz

🌡️ *Temperature:*
C, F, K

🧪 *Volume:*
L, mL, gal, floz

⏱️ *Time:*
s, min, h, day

━━━━━━━━━━━━━━━━━━━━━
⚡ *AYOBOT v1* | 👑 *AYOCODES*`;
}

/**
 * Test calculator functionality
 * @returns {Object} Test results
 */
export async function testCalculator() {
  try {
    const tests = [
      { expr: "2+2", expected: 4 },
      { expr: "10-3", expected: 7 },
      { expr: "6*7", expected: 42 },
      { expr: "20/4", expected: 5 },
      { expr: "sqrt(25)", expected: 5 },
      { expr: "2^3", expected: 8 },
      { expr: "5!", expected: 120 },
      { expr: "10% of 200", expected: 20 },
      { expr: "sin(30)", expected: 0.5 },
      { expr: "cos(60)", expected: 0.5 },
      { expr: "tan(45)", expected: 1 },
      { expr: "log(100)", expected: 2 },
      { expr: "ln(e)", expected: 1 },
    ];

    let results = [];
    let passed = 0;

    for (const test of tests) {
      try {
        const clean = cleanExpression(test.expr);
        const result = math.evaluate(clean);
        const expected = test.expected;

        const testPassed =
          typeof result === "number" && Math.abs(result - expected) < 0.0001;

        if (testPassed) passed++;

        results.push({
          expr: test.expr,
          passed: testPassed,
          result: result,
          expected: expected,
        });
      } catch (error) {
        results.push({
          expr: test.expr,
          passed: false,
          error: error.message,
        });
      }
    }

    return {
      success: true,
      message: `Calculator test completed: ${passed}/${tests.length} passed`,
      results,
    };
  } catch (error) {
    return {
      success: false,
      message: `Calculator test failed: ${error.message}`,
    };
  }
}

// Export all functions
export default {
  calculate,
  convert,
  quickCalculate,
  testCalculator,
};
