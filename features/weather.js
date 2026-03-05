import axios from 'axios';
import { CONFIG } from '../config/config.js';
import * as helpers from '../utils/helpers.js';
import * as cache from '../utils/cache.js';
import * as formatters from '../utils/formatters.js';

export async function getWeather(city) {
    try {
        console.log(`🌤️ Fetching weather for: ${city}`);

        const cacheKey = `weather_${city.toLowerCase()}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        if (CONFIG.WEATHERAPI_KEY) {
            try {
                const response = await axios.get(
                    `http://api.weatherapi.com/v1/current.json?key=${CONFIG.WEATHERAPI_KEY}&q=${encodeURIComponent(city)}&aqi=no`,
                    { timeout: 10000 }
                );

                if (response.data) {
                    const data = response.data;
                    const weatherEmoji = helpers.getWeatherEmoji(data.current.condition.text);

                    const result = `${weatherEmoji} *WEATHER FOR ${data.location.name.toUpperCase()}*\n\n` +
                                 `📍 *Location:* ${data.location.name}, ${data.location.country}\n` +
                                 `🌡️ *Temperature:* ${data.current.temp_c}°C (${data.current.temp_f}°F)\n` +
                                 `☁️ *Condition:* ${data.current.condition.text}\n` +
                                 `💨 *Wind:* ${data.current.wind_kph} km/h, ${data.current.wind_dir}\n` +
                                 `💧 *Humidity:* ${data.current.humidity}%\n` +
                                 `👁️ *Visibility:* ${data.current.vis_km} km\n` +
                                 `🌄 *Local Time:* ${data.location.localtime}\n\n` +
                                 `📡 *Powered by WeatherAPI.com*\n` +
                                 `👑 *AYOBOT v1 by AyoCodes*`;

                    cache.set(cacheKey, result);
                    return result;
                }
            } catch (error) {
                console.log('❌ WeatherAPI failed:', error.message);
            }
        }

        if (CONFIG.OPENWEATHER_KEY) {
            try {
                const response = await axios.get(
                    `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${CONFIG.OPENWEATHER_KEY}&units=metric`,
                    { timeout: 10000 }
                );

                if (response.data) {
                    const data = response.data;
                    const weatherEmoji = helpers.getWeatherEmoji(data.weather[0].description);

                    const result = `${weatherEmoji} *WEATHER FOR ${data.name.toUpperCase()}*\n\n` +
                                 `📍 *Location:* ${data.name}, ${data.sys.country}\n` +
                                 `🌡️ *Temperature:* ${data.main.temp}°C (Feels like ${formatters.formatTemperature(data.main.feels_like)})\n` +
                                 `☁️ *Condition:* ${data.weather[0].description}\n` +
                                 `💨 *Wind:* ${data.wind.speed} m/s\n` +
                                 `💧 *Humidity:* ${data.main.humidity}%\n` +
                                 `☁️ *Clouds:* ${data.clouds.all}%\n` +
                                 `📊 *Pressure:* ${data.main.pressure} hPa\n\n` +
                                 `📡 *Powered by OpenWeatherMap*\n` +
                                 `👑 *AYOBOT v1 by AyoCodes*`;

                    cache.set(cacheKey, result);
                    return result;
                }
            } catch (error) {
                console.log('❌ OpenWeatherMap failed:', error.message);
            }
        }

        const result = `🌤️ *WEATHER FOR ${city.toUpperCase()}*\n\nWeather services unavailable.\n\n*Possible reasons:*\n• City name incorrect\n• Services down\n• Try major cities\n\n👑 *AYOBOT v1 by AyoCodes*\n📞 Contact: ${CONFIG.CREATOR.CONTACT}`;
        return result;

    } catch (error) {
        console.error('❌ Weather error:', error.message);
        return `🌤️ *WEATHER SERVICE ERROR*\n\nFailed to fetch weather.\n\n*Please try:*\n1. Check city spelling\n2. Try major cities\n3. Wait a few minutes\n\n👑 *Contact AyoCodes:* ${CONFIG.CREATOR.CONTACT}`;
    }
}

export async function getWeatherForecast(city, days = 3) {
    try {
        if (!CONFIG.WEATHERAPI_KEY) {
            return 'Weather forecast requires WeatherAPI key configuration.';
        }

        const response = await axios.get(
            `http://api.weatherapi.com/v1/forecast.json?key=${CONFIG.WEATHERAPI_KEY}&q=${encodeURIComponent(city)}&days=${days}&aqi=no&alerts=no`,
            { timeout: 10000 }
        );

        if (response.data) {
            const data = response.data;
            let forecastText = `📅 *${days}-DAY FORECAST FOR ${data.location.name.toUpperCase()}*\n\n`;

            data.forecast.forecastday.forEach((day, index) => {
                const date = new Date(day.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
                const emoji = helpers.getWeatherEmoji(day.day.condition.text);

                forecastText += `*${date}*\n`;
                forecastText += `${emoji} ${day.day.condition.text}\n`;
                forecastText += `🌡️ High: ${day.day.maxtemp_c}°C | Low: ${day.day.mintemp_c}°C\n`;
                forecastText += `💧 Humidity: ${day.day.avghumidity}%\n`;
                forecastText += `💨 Wind: ${day.day.maxwind_kph} km/h\n`;
                forecastText += `🌧️ Precipitation: ${day.day.totalprecip_mm}mm\n\n`;
            });

            forecastText += `📍 *Location:* ${data.location.name}, ${data.location.country}\n`;
            forecastText += `👑 *Powered by AYOBOT v1 | Created by AyoCodes*`;

            return forecastText;
        }

        return 'Unable to fetch weather forecast.';

    } catch (error) {
        console.error('❌ Forecast error:', error.message);
        return 'Weather forecast service unavailable.';
    }
}
