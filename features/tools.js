import axios from "axios";
import NodeCache from "node-cache";
import { CONFIG } from "../config/config.js";
import * as helpers from "../utils/helpers.js";
import * as formatters from "../utils/formatters.js";

// ========== CACHE SETUP ==========
const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

// ========== URL SHORTENER - ULTIMATE VERSION ==========
export async function shortenUrl(url) {
  try {
    console.log(`🔗 Shortening URL: ${url.substring(0, 50)}...`);

    // Validate URL
    if (!url.startsWith("http")) {
      url = "https://" + url;
    }

    // Check cache
    const cacheKey = `url_${url}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log("✅ Returning cached result");
      return cached;
    }

    // Multiple URL shortening services
    const services = [
      // Service 1: CleanURI (Free, no API key)
      {
        name: "CleanURI",
        shorten: async () => {
          const response = await axios.post(
            "https://cleanuri.com/api/v1/shorten",
            `url=${encodeURIComponent(url)}`,
            {
              timeout: 8000,
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
            },
          );

          if (response.data && response.data.result_url) {
            return {
              original: url,
              shortened: response.data.result_url,
              service: "CleanURI",
            };
          }
          throw new Error("CleanURI failed");
        },
      },

      // Service 2: is.gd (Very reliable)
      {
        name: "is.gd",
        shorten: async () => {
          const response = await axios.get(
            `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`,
            { timeout: 8000 },
          );

          const result = response.data.trim();
          if (result && result.includes("https://is.gd/")) {
            return {
              original: url,
              shortened: result,
              service: "is.gd",
            };
          }
          throw new Error("is.gd failed");
        },
      },

      // Service 3: v.gd (Backup)
      {
        name: "v.gd",
        shorten: async () => {
          const response = await axios.get(
            `https://v.gd/create.php?format=simple&url=${encodeURIComponent(url)}`,
            { timeout: 8000 },
          );

          const result = response.data.trim();
          if (result && result.includes("https://v.gd/")) {
            return {
              original: url,
              shortened: result,
              service: "v.gd",
            };
          }
          throw new Error("v.gd failed");
        },
      },

      // Service 4: TinyURL (Classic)
      {
        name: "TinyURL",
        shorten: async () => {
          const response = await axios.get(
            `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
            { timeout: 8000 },
          );

          const result = response.data.trim();
          if (result && result.startsWith("http")) {
            return {
              original: url,
              shortened: result,
              service: "TinyURL",
            };
          }
          throw new Error("TinyURL failed");
        },
      },

      // Service 5: 1pt.co (Simple)
      {
        name: "1pt.co",
        shorten: async () => {
          const response = await axios.post(
            "https://1pt.co/api/1pt/",
            { longurl: url },
            {
              timeout: 8000,
              headers: { "Content-Type": "application/json" },
            },
          );

          if (response.data && response.data.short) {
            return {
              original: url,
              shortened: `https://1pt.co/${response.data.short}`,
              service: "1pt.co",
            };
          }
          throw new Error("1pt.co failed");
        },
      },

      // Service 6: Your custom AyoLink (if available)
      {
        name: "AyoLink",
        shorten: async () => {
          if (!CONFIG.SHORTENER_API) throw new Error("AyoLink not configured");

          const response = await axios.post(
            `${CONFIG.SHORTENER_API}/shorten`,
            { url, apiKey: CONFIG.SHORTENER_API_KEY },
            {
              timeout: 8000,
              headers: { "Content-Type": "application/json" },
            },
          );

          if (response.data && response.data.shortUrl) {
            return {
              original: url,
              shortened: response.data.shortUrl,
              service: "AyoLink",
            };
          }
          throw new Error("AyoLink failed");
        },
      },
    ];

    // Try each service in sequence
    let result = null;
    for (const service of services) {
      try {
        result = await service.shorten();
        if (result) {
          console.log(`✅ URL shortened using ${service.name}`);
          break;
        }
      } catch (e) {
        console.log(`❌ ${service.name} failed:`, e.message);
        continue;
      }
    }

    if (!result) {
      throw new Error("All URL shortening services failed");
    }

    // Cache the result
    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("❌ URL shortener error:", error.message);

    // Return a fallback response with the original URL
    return {
      original: url,
      shortened: url,
      service: "Original URL",
      error: error.message,
    };
  }
}

// ========== EXPAND URL ==========
export async function expandUrl(shortUrl) {
  try {
    console.log(`🔍 Expanding URL: ${shortUrl}`);

    if (!shortUrl.startsWith("http")) {
      shortUrl = "https://" + shortUrl;
    }

    const response = await axios.head(shortUrl, {
      timeout: 10000,
      maxRedirects: 10,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    const expandedUrl =
      response.request?.res?.responseUrl ||
      response.request?.socket?.servername ||
      shortUrl;

    return {
      shortUrl: shortUrl,
      expandedUrl: expandedUrl,
      statusCode: response.status,
      statusText: response.statusText || "OK",
    };
  } catch (error) {
    console.error("❌ URL expand error:", error.message);

    // Try with GET if HEAD fails
    try {
      const response = await axios.get(shortUrl, {
        timeout: 10000,
        maxRedirects: 10,
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      });

      const expandedUrl = response.request?.res?.responseUrl || shortUrl;

      return {
        shortUrl: shortUrl,
        expandedUrl: expandedUrl,
        statusCode: response.status,
        statusText: response.statusText || "OK",
      };
    } catch (getError) {
      throw new Error(`Could not expand URL: ${error.message}`);
    }
  }
}

// ========== GET IP INFORMATION - ULTIMATE VERSION ==========
export async function getIPInfo(ip = "") {
  try {
    // If no IP provided, get current IP
    if (!ip) {
      const ipRes = await axios.get("https://api.ipify.org?format=json", {
        timeout: 5000,
      });
      ip = ipRes.data.ip;
    }

    // Validate IP format
    const ipRegex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ip)) {
      return `🌐 *IP INFORMATION*\n\n❌ Invalid IP address format.\n\n👑 *AYOBOT v1 by AyoCodes*`;
    }

    // Multiple IP info APIs for reliability
    const apis = [
      // API 1: ip-api.com (Free, no key)
      async () => {
        const res = await axios.get(`http://ip-api.com/json/${ip}`, {
          timeout: 8000,
          params: {
            fields:
              "status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query,mobile,proxy,hosting",
          },
        });

        if (res.data.status === "success") {
          const d = res.data;
          let info = `🌐 *IP INFORMATION*\n\n`;
          info += `📍 *IP Address:* ${d.query}\n`;
          info += `🏙️ *City:* ${d.city || "N/A"}\n`;
          info += `🏛️ *Region:* ${d.regionName || d.region || "N/A"}\n`;
          info += `🇺🇸 *Country:* ${d.country || "N/A"} (${d.countryCode || "N/A"})\n`;
          info += `📮 *Postal Code:* ${d.zip || "N/A"}\n`;
          info += `🕐 *Timezone:* ${d.timezone || "N/A"}\n`;
          info += `🏢 *ISP:* ${d.isp || d.org || "N/A"}\n`;
          info += `🔗 *ASN:* ${d.as || "N/A"}\n`;

          if (d.lat && d.lon) {
            info += `🗺️ *Coordinates:* ${d.lat}, ${d.lon}\n`;
            info += `📍 *Google Maps:* https://maps.google.com/?q=${d.lat},${d.lon}\n`;
          }

          info += `📱 *Mobile:* ${d.mobile ? "Yes" : "No"}\n`;
          info += `🖥️ *Proxy/VPN:* ${d.proxy ? "Yes" : "No"}\n`;
          info += `🏠 *Hosting:* ${d.hosting ? "Yes" : "No"}\n\n`;
          info += `👑 *Powered by ip-api.com | AYOBOT v1 by AyoCodes*`;

          return info;
        }
        throw new Error("ip-api.com failed");
      },

      // API 2: ipinfo.io (Requires token)
      async () => {
        if (!CONFIG.IPINFO_TOKEN)
          throw new Error("IPInfo token not configured");

        const res = await axios.get(
          `https://ipinfo.io/${ip}?token=${CONFIG.IPINFO_TOKEN}`,
          {
            timeout: 8000,
          },
        );

        const d = res.data;
        let info = `🌐 *IP INFORMATION*\n\n`;
        info += `📍 *IP Address:* ${d.ip}\n`;
        info += `🏙️ *City:* ${d.city || "N/A"}\n`;
        info += `🏛️ *Region:* ${d.region || "N/A"}\n`;
        info += `🇺🇸 *Country:* ${d.country || "N/A"}\n`;
        info += `📮 *Postal Code:* ${d.postal || "N/A"}\n`;
        info += `🕐 *Timezone:* ${d.timezone || "N/A"}\n`;
        info += `🏢 *ISP:* ${d.org || "N/A"}\n`;

        if (d.loc) {
          const [lat, lon] = d.loc.split(",");
          info += `🗺️ *Location:* ${lat}, ${lon}\n`;
          info += `📍 *Google Maps:* https://maps.google.com/?q=${lat},${lon}\n`;
        }

        info += `\n👑 *Powered by ipinfo.io | AYOBOT v1 by AyoCodes*`;

        return info;
      },

      // API 3: ipapi.co (Free fallback)
      async () => {
        const res = await axios.get(`https://ipapi.co/${ip}/json/`, {
          timeout: 8000,
          headers: { "User-Agent": "Mozilla/5.0" },
        });

        const d = res.data;
        let info = `🌐 *IP INFORMATION*\n\n`;
        info += `📍 *IP Address:* ${d.ip}\n`;
        info += `🏙️ *City:* ${d.city || "N/A"}\n`;
        info += `🏛️ *Region:* ${d.region || "N/A"}\n`;
        info += `🇺🇸 *Country:* ${d.country_name || d.country || "N/A"}\n`;
        info += `📮 *Postal Code:* ${d.postal || "N/A"}\n`;
        info += `🕐 *Timezone:* ${d.timezone || "N/A"}\n`;
        info += `🏢 *ISP:* ${d.org || d.isp || "N/A"}\n`;

        if (d.latitude && d.longitude) {
          info += `🗺️ *Coordinates:* ${d.latitude}, ${d.longitude}\n`;
          info += `📍 *Google Maps:* https://maps.google.com/?q=${d.latitude},${d.longitude}\n`;
        }

        info += `\n👑 *Powered by ipapi.co | AYOBOT v1 by AyoCodes*`;

        return info;
      },
    ];

    // Try each API
    for (const api of apis) {
      try {
        const result = await api();
        return result;
      } catch (e) {
        console.log("IP API failed:", e.message);
        continue;
      }
    }

    return `🌐 *IP INFORMATION*\n\nUnable to fetch IP information for "${ip}".\n\n👑 *AYOBOT v1 by AyoCodes*`;
  } catch (error) {
    console.error("❌ IP info error:", error.message);
    return `🌐 *IP INFORMATION*\n\nError: ${error.message}\n\n👑 *AYOBOT v1 by AyoCodes*`;
  }
}

// ========== GET TIMEZONE INFORMATION ==========
export async function getTimezone(location) {
  try {
    console.log(`🕐 Fetching timezone for: ${location}`);

    // Try multiple timezone APIs
    const apis = [
      // API 1: WorldTimeAPI
      async () => {
        const response = await axios.get(
          `https://worldtimeapi.org/api/timezone/${encodeURIComponent(location.replace(/ /g, "_"))}`,
          { timeout: 8000 },
        );

        if (response.data) {
          const d = response.data;
          const dateTime = new Date(d.datetime);

          let info = `🕐 *TIMEZONE INFORMATION*\n\n`;
          info += `📍 *Location:* ${location}\n`;
          info += `🕐 *Current Time:* ${dateTime.toLocaleString()}\n`;
          info += `🌐 *Timezone:* ${d.timezone}\n`;
          info += `🌅 *UTC Offset:* ${d.utc_offset}\n`;
          info += `🌞 *DST:* ${d.dst ? "Yes" : "No"}\n`;
          info += `📅 *Date:* ${d.date}\n`;
          info += `⏰ *Day of Year:* ${d.day_of_year}\n`;
          info += `🌍 *Week Number:* ${d.week_number}\n\n`;
          info += `👑 *Powered by WorldTimeAPI | AYOBOT v1 by AyoCodes*`;

          return info;
        }
        throw new Error("WorldTimeAPI failed");
      },

      // API 2: TimeZoneDB (if configured)
      async () => {
        if (!CONFIG.TIMEZONEDB_KEY)
          throw new Error("TimeZoneDB key not configured");

        // Try to find timezone by city
        const response = await axios.get(
          `http://api.timezonedb.com/v2.1/get-time-zone?key=${CONFIG.TIMEZONEDB_KEY}&format=json&by=zone&zone=${encodeURIComponent(location)}`,
          { timeout: 8000 },
        );

        if (response.data && response.data.status === "OK") {
          const d = response.data;

          let info = `🕐 *TIMEZONE INFORMATION*\n\n`;
          info += `📍 *Location:* ${d.zoneName}\n`;
          info += `🕐 *Current Time:* ${new Date(d.formatted).toLocaleString()}\n`;
          info += `🌐 *Timezone:* ${d.abbreviation} (UTC${d.gmtOffset >= 0 ? "+" : ""}${d.gmtOffset / 3600})\n`;
          info += `🌅 *DST:* ${d.dst ? "Yes" : "No"}\n`;
          info += `📅 *Country:* ${d.countryName}\n`;
          info += `🏙️ *City:* ${d.cityName || location}\n\n`;
          info += `👑 *Powered by TimeZoneDB | AYOBOT v1 by AyoCodes*`;

          return info;
        }
        throw new Error("TimeZoneDB failed");
      },

      // API 3: TimeAPI.io
      async () => {
        const response = await axios.get(
          `https://timeapi.io/api/Time/current/zone?timeZone=${encodeURIComponent(location)}`,
          { timeout: 8000 },
        );

        if (response.data) {
          const d = response.data;

          let info = `🕐 *TIMEZONE INFORMATION*\n\n`;
          info += `📍 *Location:* ${d.timeZone || location}\n`;
          info += `🕐 *Current Time:* ${d.dateTime || "N/A"}\n`;
          info += `🌐 *Timezone:* ${d.timeZone || "N/A"}\n`;
          info += `🌅 *UTC Offset:* ${d.utcOffset || "N/A"}\n`;
          info += `🌞 *DST:* ${d.isDayLightSavingTime ? "Yes" : "No"}\n`;
          info += `📅 *Day of Week:* ${d.dayOfWeek || "N/A"}\n`;
          info += `🌍 *Week Number:* ${d.weekNumber || "N/A"}\n\n`;
          info += `👑 *Powered by TimeAPI.io | AYOBOT v1 by AyoCodes*`;

          return info;
        }
        throw new Error("TimeAPI.io failed");
      },

      // API 4: Google Timezone API (if configured)
      async () => {
        if (!CONFIG.GOOGLE_MAPS_API_KEY)
          throw new Error("Google Maps API key not configured");

        // First geocode the location
        const geocodeRes = await axios.get(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${CONFIG.GOOGLE_MAPS_API_KEY}`,
          { timeout: 8000 },
        );

        if (!geocodeRes.data.results?.length)
          throw new Error("Location not found");

        const { lat, lng } = geocodeRes.data.results[0].geometry.location;

        // Get timezone
        const timestamp = Math.floor(Date.now() / 1000);
        const tzRes = await axios.get(
          `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${CONFIG.GOOGLE_MAPS_API_KEY}`,
          { timeout: 8000 },
        );

        if (tzRes.data && tzRes.data.status === "OK") {
          const d = tzRes.data;
          const offset = d.rawOffset / 3600;
          const dstOffset = d.dstOffset / 3600;

          let info = `🕐 *TIMEZONE INFORMATION*\n\n`;
          info += `📍 *Location:* ${location}\n`;
          info += `🌐 *Timezone:* ${d.timeZoneName}\n`;
          info += `🆔 *ID:* ${d.timeZoneId}\n`;
          info += `🌅 *UTC Offset:* ${offset >= 0 ? "+" : ""}${offset} hours\n`;
          info += `🌞 *DST Offset:* ${dstOffset >= 0 ? "+" : ""}${dstOffset} hours\n`;
          info += `🗺️ *Coordinates:* ${lat}, ${lng}\n`;
          info += `📍 *Google Maps:* https://maps.google.com/?q=${lat},${lng}\n\n`;
          info += `👑 *Powered by Google Maps | AYOBOT v1 by AyoCodes*`;

          return info;
        }
        throw new Error("Google Timezone API failed");
      },
    ];

    // Try each API
    for (const api of apis) {
      try {
        const result = await api();
        return result;
      } catch (e) {
        console.log("Timezone API failed:", e.message);
        continue;
      }
    }

    return `🕐 *TIMEZONE INFORMATION*\n\nUnable to fetch timezone information for "${location}".\n\n👑 *AYOBOT v1 by AyoCodes*`;
  } catch (error) {
    console.error("❌ Timezone error:", error.message);
    return `🕐 *TIMEZONE INFORMATION*\n\nError: ${error.message}\n\n👑 *AYOBOT v1 by AyoCodes*`;
  }
}

// ========== GET TIME BY CITY ==========
export async function getTimeByCity(city) {
  try {
    const timezone = await getTimezone(city);
    return timezone;
  } catch (error) {
    return `🕐 *TIME INFORMATION*\n\nCould not find time for "${city}".\n\n👑 *AYOBOT v1 by AyoCodes*`;
  }
}

// ========== MY IP COMMAND ==========
export async function myIP() {
  try {
    const ipRes = await axios.get("https://api.ipify.org?format=json", {
      timeout: 5000,
    });
    const ip = ipRes.data.ip;

    // Get IP info
    const ipInfo = await getIPInfo(ip);
    return ipInfo;
  } catch (error) {
    return `🌐 *YOUR IP*\n\nCould not fetch your public IP.\n\n👑 *AYOBOT v1 by AyoCodes*`;
  }
}

// ========== EXPORT ALL ==========
export default {
  shortenUrl,
  expandUrl,
  getIPInfo,
  getTimezone,
  getTimeByCity,
  myIP,
};
