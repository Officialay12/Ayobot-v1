// @ts-nocheck
import axios from "axios";
import {
  formatData,
  formatError,
  formatInfo,
  formatSuccess,
} from "../utils/formatters.js";

// Configuration with environment variables
const API_CONFIG = {
  WHOIS_XML_API_KEY: process.env.WHOIS_XML_API_KEY || "",
  WHOAPI_KEY: process.env.WHOAPI_KEY || "",
  TIMEOUT: 8000,
  WHOIS_TIMEOUT: 10000,
  DNS_TIMEOUT: 5000,
  MAX_RETRIES: 3,
};

// Validation utilities
const validators = {
  isValidIPv4: (ip) => {
    const ipv4Regex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(ip.trim());
  },

  isValidDomain: (domain) => {
    // More lenient domain validation
    const domainRegex = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
    const cleaned = domain.trim().toLowerCase();
    return domainRegex.test(cleaned) && cleaned.length <= 255;
  },

  sanitizeInput: (input) => {
    return input
      .trim()
      .toLowerCase()
      .replace(/[<>'"]/g, "");
  },
};

// Axios instance with retry logic
const axiosInstance = axios.create();

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 429) {
      // Rate limited - don't retry
      return Promise.reject(new Error("Rate limited"));
    }
    return Promise.reject(error);
  },
);

// Helper function for retry logic
async function retryWithBackoff(fn, maxRetries = 2) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      // Exponential backoff
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, i) * 1000),
      );
    }
  }
}

// IP Lookup Command
export async function ip({ fullArgs: e, from: t, sock: a }) {
  if (!e) {
    return void (await a.sendMessage(t, {
      text: formatInfo(
        "IP LOOKUP",
        "🌐 *Get detailed information about any IP address*\n\n📌 *Usage:* .ip <IP address>\n📋 *Examples:*\n▰ .ip 8.8.8.8\n▰ .ip 1.1.1.1\n▰ .ip 208.67.222.222\n\n✨ *Returns:* Location, ISP, coordinates, and more",
      ),
    }));
  }

  const ipAddress = e.trim();

  if (!validators.isValidIPv4(ipAddress)) {
    return await a.sendMessage(t, {
      text: formatError(
        "INVALID IP",
        "❌ Please provide a valid IPv4 address.\n\n✅ *Examples:* 8.8.8.8, 1.1.1.1, 208.67.222.222",
      ),
    });
  }

  await a.sendMessage(t, {
    text: `🌐 *Looking up IP: ${ipAddress}...*`,
  });

  const apiProviders = [
    async () =>
      (
        await axiosInstance.get(`http://ip-api.com/json/${ipAddress}`, {
          timeout: API_CONFIG.TIMEOUT,
          params: {
            fields:
              "status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query,mobile,proxy,hosting",
          },
        })
      ).data,

    async () => {
      const response = await axiosInstance.get(
        `https://ipapi.co/${ipAddress}/json/`,
        {
          timeout: API_CONFIG.TIMEOUT,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
        },
      );

      return {
        status: "success",
        query: ipAddress,
        country: response.data.country_name || "Unknown",
        countryCode: response.data.country_code || "XX",
        regionName: response.data.region || "Unknown",
        city: response.data.city || "Unknown",
        zip: response.data.postal || "N/A",
        lat: response.data.latitude || null,
        lon: response.data.longitude || null,
        timezone: response.data.timezone || "Unknown",
        isp: response.data.org || "Unknown",
        org: response.data.org || "Unknown",
        as: response.data.asn || "N/A",
        mobile: response.data.is_mobile === true,
        proxy: response.data.is_proxy === true,
        hosting: response.data.is_hosting === true,
      };
    },

    async () => {
      const response = await axiosInstance.get(
        `https://ipinfo.io/${ipAddress}/json`,
        {
          timeout: API_CONFIG.TIMEOUT,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
        },
      );

      const [lat, lon] = (response.data.loc || "0,0")
        .split(",")
        .map(parseFloat);

      return {
        status: "success",
        query: ipAddress,
        country: response.data.country || "Unknown",
        countryCode: response.data.country_code || "XX",
        regionName: response.data.region || "Unknown",
        city: response.data.city || "Unknown",
        zip: response.data.postal || "N/A",
        lat: lat || null,
        lon: lon || null,
        timezone: response.data.timezone || "Unknown",
        isp: response.data.org || "Unknown",
        org: response.data.org || "Unknown",
        as: response.data.asn || "N/A",
        mobile: false,
        proxy: false,
        hosting: false,
      };
    },
  ];

  let result = null;
  let source = "";

  for (let i = 0; i < apiProviders.length; i++) {
    try {
      result = await retryWithBackoff(apiProviders[i], 2);
      source = ["ip-api.com", "ipapi.co", "ipinfo.io"][i];

      if (result?.status === "success") {
        break;
      }
    } catch (error) {
      console.error(`API ${i + 1} failed:`, error.message);
      continue;
    }
  }

  if (!result || result.status !== "success") {
    return await a.sendMessage(t, {
      text: formatError(
        "LOOKUP FAILED",
        "❌ Could not fetch information for this IP address.\n\n💡 *Try:*\n• Checking if the IP is valid\n• Trying a different IP\n• Using a public DNS like 8.8.8.8",
      ),
    });
  }

  const mapUrl =
    result.lat && result.lon
      ? `https://www.google.com/maps?q=${result.lat},${result.lon}`
      : null;

  const dataDisplay = {
    "🌍 IP Address": result.query || ipAddress,
    "📍 Country": `${result.country || "Unknown"} ${result.countryCode ? `(${result.countryCode})` : ""}`,
    "🏙️ City": result.city || "Unknown",
    "🗺️ Region": result.regionName || "Unknown",
    "📮 Postal Code": result.zip || "N/A",
    "🧭 Coordinates":
      result.lat && result.lon
        ? `${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}`
        : "N/A",
    "⏰ Timezone": result.timezone || "N/A",
    "📡 ISP": result.isp || result.org || "Unknown",
    "🏢 Organization": result.org || "N/A",
    "🔗 ASN": result.as || "N/A",
    "📱 Mobile Network": result.mobile ? "✅ Yes" : "❌ No",
    "🖥️ Proxy/VPN": result.proxy ? "✅ Yes" : "❌ No",
    "🏠 Hosting": result.hosting ? "✅ Yes" : "❌ No",
    "🔍 Source": source,
  };

  let message = formatData("📍 IP INFORMATION", dataDisplay);

  if (mapUrl) {
    message += `\n\n🗺️ *View on Maps:*\n${mapUrl}`;
  }

  message += "\n\n👑 *AYOBOT v1* | Created by AYOCODES";

  await a.sendMessage(t, { text: message });
  console.log(`✅ IP lookup completed for ${ipAddress} using ${source}`);
}

// Get user's public IP
export async function myip({ from: e, sock: t }) {
  await t.sendMessage(e, {
    text: "🌐 *Fetching your public IP...*",
  });

  try {
    const publicIp = (
      await retryWithBackoff(
        () =>
          axiosInstance.get("https://api.ipify.org?format=json", {
            timeout: API_CONFIG.TIMEOUT,
          }),
        2,
      )
    ).data.ip;

    if (!validators.isValidIPv4(publicIp)) {
      throw new Error("Invalid IP returned");
    }

    const ipInfo = (
      await retryWithBackoff(
        () =>
          axiosInstance.get(`http://ip-api.com/json/${publicIp}`, {
            timeout: API_CONFIG.TIMEOUT,
          }),
        2,
      )
    ).data;

    if (ipInfo.status === "success") {
      const dataDisplay = {
        "🌍 Your IP": ipInfo.query || publicIp,
        "📍 Location": `${ipInfo.city || "Unknown"}, ${ipInfo.country || "Unknown"}`,
        "📡 ISP": ipInfo.isp || "Unknown",
        "🗺️ Region": ipInfo.regionName || "Unknown",
        "🧭 Timezone": ipInfo.timezone || "Unknown",
      };

      await t.sendMessage(e, {
        text:
          formatData("YOUR PUBLIC IP", dataDisplay) +
          "\n\n👑 Created by AYOCODES",
      });
    } else {
      await t.sendMessage(e, {
        text: formatSuccess("YOUR IP", `🌐 ${publicIp}\n\n👑 AYOCODES`),
      });
    }
  } catch (error) {
    console.error("MYIP Error:", error.message);
    await t.sendMessage(e, {
      text: formatError(
        "ERROR",
        "❌ Could not fetch your public IP.\n\nPlease try again later.",
      ),
    });
  }
}

// WHOIS Lookup
export async function whois({ fullArgs: e, from: t, sock: a }) {
  if (!e) {
    return void (await a.sendMessage(t, {
      text: formatInfo(
        "WHOIS LOOKUP",
        "🔍 *Get domain registration information*\n\n📌 *Usage:* .whois <domain>\n📋 *Examples:*\n▰ .whois google.com\n▰ .whois github.com\n▰ .whois stackoverflow.com\n\n✨ *Returns:* Registration details, expiry, registrar",
      ),
    }));
  }

  const domain = validators.sanitizeInput(e);

  if (!validators.isValidDomain(domain)) {
    return await a.sendMessage(t, {
      text: formatError(
        "INVALID DOMAIN",
        "❌ Please provide a valid domain name.\n\n✅ *Examples:* google.com, github.com, stackoverflow.com",
      ),
    });
  }

  await a.sendMessage(t, {
    text: `🔍 *Performing WHOIS lookup for ${domain}...*`,
  });

  const whoisProviders = [
    // WhoisXML API
    async () => {
      if (!API_CONFIG.WHOIS_XML_API_KEY) {
        throw new Error("API key not configured");
      }
      const response = await axiosInstance.get(
        `https://www.whoisxmlapi.com/whoisserver/WhoisService?domainName=${domain}&apiKey=${API_CONFIG.WHOIS_XML_API_KEY}&outputFormat=JSON`,
        { timeout: API_CONFIG.WHOIS_TIMEOUT },
      );
      return response.data?.WhoisRecord || null;
    },

    // Fallback: Domain Tools API (limited free tier)
    async () => {
      const response = await axiosInstance.get(
        `https://api.domaintools.com/v1/${domain}/whois/`,
        {
          timeout: API_CONFIG.WHOIS_TIMEOUT,
          headers: { Accept: "application/json" },
        },
      );
      return response.data?.whois || null;
    },

    // Fallback: WhoAPI
    async () => {
      if (!API_CONFIG.WHOAPI_KEY) {
        throw new Error("API key not configured");
      }
      const response = await axiosInstance.get(
        `https://api.whoapi.com/?domain=${domain}&r=whois&apikey=${API_CONFIG.WHOAPI_KEY}`,
        { timeout: API_CONFIG.WHOIS_TIMEOUT },
      );

      if (response.data?.status === "0") {
        return {
          createdDate: response.data.created || null,
          updatedDate: response.data.updated || null,
          expiresDate: response.data.expires || null,
          registrarName: response.data.registrar || "Unknown",
          registrantEmail: response.data.emails || "N/A",
          registrantTelephone: response.data.phone || "N/A",
          nameServers: response.data.ns
            ? response.data.ns.split(" ").filter(Boolean)
            : [],
        };
      }
      throw new Error("WhoAPI request failed");
    },
  ];

  let result = null;
  let source = "";

  for (let i = 0; i < whoisProviders.length; i++) {
    try {
      result = await retryWithBackoff(whoisProviders[i], 2);
      source = ["WhoisXML API", "DomainTools", "WhoAPI"][i];

      if (result) {
        break;
      }
    } catch (error) {
      console.error(`WHOIS API ${i + 1} failed:`, error.message);
      continue;
    }
  }

  if (!result) {
    return await a.sendMessage(t, {
      text: formatError(
        "LOOKUP FAILED",
        `❌ Could not fetch WHOIS information for ${domain}.\n\n💡 *Try:*\n• Checking if the domain is valid\n• Using a different domain\n• Visiting whois.domaintools.com manually`,
      ),
    });
  }

  // Date formatter utility
  const formatDate = (date) => {
    if (!date) return "N/A";
    try {
      return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return String(date);
    }
  };

  // Calculate days until expiry
  const calculateDaysUntilExpiry = (expiryDate) => {
    if (!expiryDate) return null;
    try {
      const expiry = new Date(expiryDate);
      const now = new Date();
      return Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  };

  const createdDate = formatDate(result.createdDate || result.created);
  const updatedDate = formatDate(result.updatedDate || result.updated);
  const expiresDate = formatDate(result.expiresDate || result.expires);
  const daysUntilExpiry = calculateDaysUntilExpiry(
    result.expiresDate || result.expires,
  );

  const nameServers = Array.isArray(result.nameServers)
    ? result.nameServers.filter(Boolean).slice(0, 3)
    : [];

  const dataDisplay = {
    "🌐 Domain": domain,
    "📅 Created": createdDate,
    "🔄 Updated": updatedDate,
    "⏰ Expires": expiresDate,
    "⏳ Days Until Expiry": daysUntilExpiry ? `${daysUntilExpiry} days` : "N/A",
    "🏢 Registrar": result.registrarName || result.registrar || "Unknown",
    "📧 Email": result.registrantEmail || result.emails || "N/A",
    "📞 Phone": result.registrantTelephone || result.phone || "N/A",
    "🖥️ Name Servers":
      nameServers.length > 0 ? nameServers.join("\n    ") : "N/A",
    "🔍 Source": source,
  };

  let message = formatData("🔍 WHOIS INFORMATION", dataDisplay);

  if (daysUntilExpiry !== null) {
    if (daysUntilExpiry < 0) {
      message += "\n\n❌ *DOMAIN EXPIRED!*";
    } else if (daysUntilExpiry < 30) {
      message += "\n\n⚠️ *WARNING:* Domain expires in less than 30 days!";
    }
  }

  message += "\n\n👑 *AYOBOT v1* | Created by AYOCODES";

  await a.sendMessage(t, { text: message });
  console.log(`✅ WHOIS lookup completed for ${domain} using ${source}`);
}

// DNS Lookup
export async function dns({ fullArgs: e, from: t, sock: a }) {
  if (!e) {
    return void (await a.sendMessage(t, {
      text: formatInfo(
        "DNS LOOKUP",
        "🔍 *Get DNS records for a domain*\n\n📌 *Usage:* .dns <domain>\n📋 *Example:* .dns google.com\n\n✨ *Returns:* A, MX, TXT, NS, CNAME records",
      ),
    }));
  }

  const domain = validators.sanitizeInput(e);

  if (!validators.isValidDomain(domain)) {
    return await a.sendMessage(t, {
      text: formatError(
        "INVALID DOMAIN",
        "❌ Please provide a valid domain name.\n\n✅ *Examples:* google.com, github.com, example.org",
      ),
    });
  }

  await a.sendMessage(t, {
    text: `🔍 *Fetching DNS records for ${domain}...*`,
  });

  try {
    const recordTypes = ["A", "MX", "TXT", "NS", "CNAME"];
    const records = {};

    for (const type of recordTypes) {
      try {
        const response = await retryWithBackoff(
          () =>
            axiosInstance.get(
              `https://dns.google/resolve?name=${domain}&type=${type}`,
              {
                timeout: API_CONFIG.DNS_TIMEOUT,
              },
            ),
          2,
        );

        if (response.data?.Answer && Array.isArray(response.data.Answer)) {
          records[type] = response.data.Answer.map((answer) => answer.data)
            .filter(Boolean)
            .slice(0, 5);
        } else {
          records[type] = [];
        }
      } catch (error) {
        console.warn(`DNS lookup failed for ${type} record:`, error.message);
        records[type] = [];
      }
    }

    const dataDisplay = {
      "🌐 Domain": domain,
      "📌 A Records":
        records.A?.length > 0 ? records.A.join("\n    ") : "No records found",
      "📧 MX Records":
        records.MX?.length > 0 ? records.MX.join("\n    ") : "No records found",
      "📝 TXT Records":
        records.TXT?.length > 0
          ? records.TXT.join("\n    ")
          : "No records found",
      "🖥️ NS Records":
        records.NS?.length > 0 ? records.NS.join("\n    ") : "No records found",
      "🔗 CNAME":
        records.CNAME?.length > 0
          ? records.CNAME.join("\n    ")
          : "No records found",
    };

    await a.sendMessage(t, {
      text:
        formatData("🔍 DNS RECORDS", dataDisplay) +
        "\n\n👑 Created by AYOCODES",
    });
  } catch (error) {
    console.error("DNS Lookup Error:", error.message);
    await a.sendMessage(t, {
      text: formatError(
        "ERROR",
        `❌ Could not fetch DNS records for ${domain}.\n\nPlease try again later.`,
      ),
    });
  }
}
