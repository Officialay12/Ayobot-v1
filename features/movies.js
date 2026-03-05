import axios from "axios";
import { ENV } from "../index.js";
import { LOCAL_MOVIES } from "../utils/constants.js";
import {
  formatSuccess,
  formatError,
  formatInfo,
  formatData,
} from "../utils/formatters.js";

// ========== LOCAL MOVIE DATABASE (FALLBACK) ==========
const LOCAL_MOVIES_DB = {
  inception: {
    title: "Inception",
    year: "2010",
    rating: "8.8",
    runtime: "148 min",
    genre: "Action, Adventure, Sci-Fi",
    overview:
      "A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.",
    director: "Christopher Nolan",
    cast: "Leonardo DiCaprio, Joseph Gordon-Levitt, Ellen Page",
    poster: "https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
    imdb: "tt1375666",
  },
  "dark knight": {
    title: "The Dark Knight",
    year: "2008",
    rating: "9.0",
    runtime: "152 min",
    genre: "Action, Crime, Drama",
    overview:
      "When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.",
    director: "Christopher Nolan",
    cast: "Christian Bale, Heath Ledger, Aaron Eckhart",
    poster: "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    imdb: "tt0468569",
  },
  avatar: {
    title: "Avatar",
    year: "2009",
    rating: "7.8",
    runtime: "162 min",
    genre: "Action, Adventure, Fantasy",
    overview:
      "A paraplegic Marine dispatched to the moon Pandora on a unique mission becomes torn between following his orders and protecting the world he feels is his home.",
    director: "James Cameron",
    cast: "Sam Worthington, Zoe Saldana, Sigourney Weaver",
    poster: "https://image.tmdb.org/t/p/w500/kyeqWdyUXW608IyY3s436kTtiDf.jpg",
    imdb: "tt0499549",
  },
  interstellar: {
    title: "Interstellar",
    year: "2014",
    rating: "8.6",
    runtime: "169 min",
    genre: "Adventure, Drama, Sci-Fi",
    overview:
      "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.",
    director: "Christopher Nolan",
    cast: "Matthew McConaughey, Anne Hathaway, Jessica Chastain",
    poster: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
    imdb: "tt0816692",
  },
  "the matrix": {
    title: "The Matrix",
    year: "1999",
    rating: "8.7",
    runtime: "136 min",
    genre: "Action, Sci-Fi",
    overview:
      "A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.",
    director: "Lana Wachowski, Lilly Wachowski",
    cast: "Keanu Reeves, Laurence Fishburne, Carrie-Anne Moss",
    poster: "https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
    imdb: "tt0133093",
  },
  "pulp fiction": {
    title: "Pulp Fiction",
    year: "1994",
    rating: "8.9",
    runtime: "154 min",
    genre: "Crime, Drama",
    overview:
      "The lives of two mob hitmen, a boxer, a gangster and his wife intertwine in four tales of violence and redemption.",
    director: "Quentin Tarantino",
    cast: "John Travolta, Uma Thurman, Samuel L. Jackson",
    poster: "https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg",
    imdb: "tt0110912",
  },
  "forrest gump": {
    title: "Forrest Gump",
    year: "1994",
    rating: "8.8",
    runtime: "142 min",
    genre: "Drama, Romance",
    overview:
      "The presidencies of Kennedy and Johnson, the Vietnam War, the Watergate scandal and other historical events unfold from the perspective of an Alabama man with an IQ of 75.",
    director: "Robert Zemeckis",
    cast: "Tom Hanks, Robin Wright, Gary Sinise",
    poster: "https://image.tmdb.org/t/p/w500/saHP97rTPS5eLmrLQEcANmKrsFl.jpg",
    imdb: "tt0109830",
  },
  "fight club": {
    title: "Fight Club",
    year: "1999",
    rating: "8.8",
    runtime: "139 min",
    genre: "Drama",
    overview:
      "An insomniac office worker and a devil-may-care soap maker form an underground fight club that evolves into much more.",
    director: "David Fincher",
    cast: "Brad Pitt, Edward Norton, Helena Bonham Carter",
    poster: "https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
    imdb: "tt0137523",
  },
  "the godfather": {
    title: "The Godfather",
    year: "1972",
    rating: "9.2",
    runtime: "175 min",
    genre: "Crime, Drama",
    overview:
      "The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.",
    director: "Francis Ford Coppola",
    cast: "Marlon Brando, Al Pacino, James Caan",
    poster: "https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg",
    imdb: "tt0068646",
  },
  "shawshank redemption": {
    title: "The Shawshank Redemption",
    year: "1994",
    rating: "9.3",
    runtime: "142 min",
    genre: "Drama",
    overview:
      "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.",
    director: "Frank Darabont",
    cast: "Tim Robbins, Morgan Freeman, Bob Gunton",
    poster: "https://image.tmdb.org/t/p/w500/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg",
    imdb: "tt0111161",
  },
};

// ========== MOVIE COMMAND - ULTIMATE VERSION ==========
export async function movie({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "MOVIE INFO",
        "🎬 *Get detailed information about any movie*\n\n" +
          "📌 *Usage:* .movie <movie title>\n" +
          "📋 *Examples:*\n" +
          "▰ .movie Inception\n" +
          "▰ .movie The Dark Knight\n" +
          "▰ .movie Avatar 2009\n\n" +
          "✨ *Returns:* Title, year, rating, plot, cast, poster",
      ),
    });
    return;
  }

  await sock.sendMessage(from, { text: `🎬 *Searching for "${fullArgs}"...*` });

  const query = fullArgs.trim();
  const lowerQuery = query.toLowerCase();

  // ===== CHECK LOCAL DATABASE FIRST (FASTEST) =====
  for (const [key, movie] of Object.entries(LOCAL_MOVIES_DB)) {
    if (lowerQuery.includes(key)) {
      const movieInfo = `╔══════════════════════════╗
║        🎬 *MOVIE*         ║
╚══════════════════════════╝

📽️ *Title:* ${movie.title}
📅 *Year:* ${movie.year}
⭐ *Rating:* ${movie.rating}/10
⏱️ *Runtime:* ${movie.runtime}
🎭 *Genre:* ${movie.genre}

📝 *Plot:*
${movie.overview}

🎬 *Director:* ${movie.director}
⭐ *Cast:* ${movie.cast}
🔗 *IMDb:* https://www.imdb.com/title/${movie.imdb}

━━━━━━━━━━━━━━━━━━━━━
📊 *Source:* Local Database
⚡ *AYOBOT v1* | 👑 Created by AYOCODES`;

      // Try to send poster
      try {
        await sock.sendMessage(from, {
          image: { url: movie.poster },
          caption: movieInfo,
        });
      } catch (e) {
        await sock.sendMessage(from, { text: movieInfo });
      }
      return;
    }
  }

  // ===== MULTIPLE API FALLBACKS =====
  const movieApis = [
    // API 1: TMDB (Primary)
    {
      name: "TMDB",
      search: async () => {
        const searchRes = await axios.get(
          `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&api_key=${ENV.TMDB_API_KEY}`,
          { timeout: 8000 },
        );
        if (!searchRes.data.results?.length) throw new Error("No results");
        return searchRes.data.results[0];
      },
      details: async (movieId) => {
        const detailsRes = await axios.get(
          `https://api.themoviedb.org/3/movie/${movieId}?api_key=${ENV.TMDB_API_KEY}&append_to_response=credits,images,videos`,
          { timeout: 8000 },
        );
        return detailsRes.data;
      },
    },

    // API 2: OMDb (Fallback)
    {
      name: "OMDb",
      search: async () => {
        const res = await axios.get(
          `http://www.omdbapi.com/?t=${encodeURIComponent(query)}&apikey=7a8d4b4a`,
          { timeout: 8000 },
        );
        if (res.data.Response === "False") throw new Error("No results");
        return res.data;
      },
      details: async (data) => data,
    },

    // API 3: The Movie DB (Alternative API key)
    {
      name: "TMDB Alt",
      search: async () => {
        const searchRes = await axios.get(
          `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&api_key=4d12b2b226af3e650f6e6d7738d3930d`,
          { timeout: 8000 },
        );
        if (!searchRes.data.results?.length) throw new Error("No results");
        return searchRes.data.results[0];
      },
      details: async (movieId) => {
        const detailsRes = await axios.get(
          `https://api.themoviedb.org/3/movie/${movieId}?api_key=4d12b2b226af3e650f6e6d7738d3930d&append_to_response=credits`,
          { timeout: 8000 },
        );
        return detailsRes.data;
      },
    },
  ];

  let movieData = null;
  let details = null;
  let usedApi = "";

  for (const api of movieApis) {
    try {
      console.log(`🎬 Trying ${api.name}...`);
      movieData = await api.search();
      details = await api.details(movieData.id || movieData.imdbID);
      usedApi = api.name;
      break;
    } catch (e) {
      console.log(`${api.name} failed:`, e.message);
      continue;
    }
  }

  // If all APIs fail, use local database as ultimate fallback
  if (!details) {
    // Try to find closest match in local DB
    for (const [key, movie] of Object.entries(LOCAL_MOVIES_DB)) {
      if (lowerQuery.includes(key) || key.includes(lowerQuery)) {
        const movieInfo = `╔══════════════════════════╗
║        🎬 *MOVIE*         ║
╚══════════════════════════╝

📽️ *Title:* ${movie.title}
📅 *Year:* ${movie.year}
⭐ *Rating:* ${movie.rating}/10
⏱️ *Runtime:* ${movie.runtime}
🎭 *Genre:* ${movie.genre}

📝 *Plot:*
${movie.overview}

🎬 *Director:* ${movie.director}
⭐ *Cast:* ${movie.cast}
🔗 *IMDb:* https://www.imdb.com/title/${movie.imdb}

━━━━━━━━━━━━━━━━━━━━━
📊 *Source:* Local Database (Fallback)
⚡ *AYOBOT v1* | 👑 Created by AYOCODES`;

        try {
          await sock.sendMessage(from, {
            image: { url: movie.poster },
            caption: movieInfo,
          });
        } catch (e) {
          await sock.sendMessage(from, { text: movieInfo });
        }
        return;
      }
    }

    return await sock.sendMessage(from, {
      text: formatError(
        "NOT FOUND",
        `❌ No results found for "${query}".\n\n` +
          "💡 *Try:*\n" +
          "• Using the full movie title\n" +
          "• Adding the year (e.g., Inception 2010)\n" +
          "• Checking spelling\n\n" +
          "📝 *Example:* .movie The Dark Knight",
      ),
    });
  }

  // ===== EXTRACT MOVIE DATA =====
  let title,
    year,
    rating,
    runtime,
    genres,
    overview,
    director,
    cast,
    poster,
    imdb,
    tagline;

  if (usedApi === "OMDb") {
    // OMDb format
    title = details.Title || "N/A";
    year = details.Year || "N/A";
    rating = details.imdbRating || "N/A";
    runtime = details.Runtime || "N/A";
    genres = details.Genre || "N/A";
    overview = details.Plot || "No plot available";
    director = details.Director || "N/A";
    cast = details.Actors || "N/A";
    imdb = details.imdbID || "";
    poster = details.Poster !== "N/A" ? details.Poster : ENV.WELCOME_IMAGE_URL;
    tagline = "";
  } else {
    // TMDB format
    title = details.title || details.original_title || "N/A";
    year = details.release_date ? details.release_date.split("-")[0] : "N/A";
    rating = details.vote_average ? details.vote_average.toFixed(1) : "N/A";
    runtime = details.runtime ? `${details.runtime} min` : "N/A";
    genres = details.genres?.map((g) => g.name).join(", ") || "N/A";
    overview = details.overview || "No overview available";
    tagline = details.tagline ? `"${details.tagline}"` : "";
    director =
      details.credits?.crew?.find((c) => c.job === "Director")?.name || "N/A";
    cast =
      details.credits?.cast
        ?.slice(0, 5)
        .map((c) => c.name)
        .join(", ") || "N/A";
    imdb = details.imdb_id || "";
    poster = details.poster_path
      ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
      : ENV.WELCOME_IMAGE_URL;
  }

  // Get trailer if available
  let trailer = "";
  if (details.videos?.results?.length > 0) {
    const trailerVideo = details.videos.results.find(
      (v) => v.type === "Trailer" && v.site === "YouTube",
    );
    if (trailerVideo) {
      trailer = `https://www.youtube.com/watch?v=${trailerVideo.key}`;
    }
  }

  // Build movie info
  const movieInfo = `╔══════════════════════════╗
║        🎬 *MOVIE*         ║
╚══════════════════════════╝

📽️ *Title:* ${title}
📅 *Year:* ${year}
⭐ *Rating:* ${rating}/10
⏱️ *Runtime:* ${runtime}
🎭 *Genre:* ${genres}
${tagline ? `\n💬 *Tagline:* ${tagline}\n` : ""}
📝 *Plot:*
${overview.substring(0, 300)}${overview.length > 300 ? "..." : ""}

🎬 *Director:* ${director}
⭐ *Cast:* ${cast.substring(0, 100)}${cast.length > 100 ? "..." : ""}
🔗 *IMDb:* ${imdb ? `https://www.imdb.com/title/${imdb}` : "N/A"}
${trailer ? `🎥 *Trailer:* ${trailer}` : ""}

━━━━━━━━━━━━━━━━━━━━━
📊 *Source:* ${usedApi}
⚡ *AYOBOT v1* | 👑 Created by AYOCODES`;

  // Send movie info with poster
  try {
    await sock.sendMessage(from, {
      image: { url: poster },
      caption: movieInfo,
    });
  } catch (imgError) {
    // If image fails, send text only
    await sock.sendMessage(from, { text: movieInfo });
  }

  // Send additional details as separate message if needed
  if (trailer) {
    await sock.sendMessage(from, {
      text: formatInfo("TRAILER", `🎥 *Watch Trailer:*\n${trailer}`),
    });
  }

  console.log(`✅ Movie found: ${title} (${year}) via ${usedApi}`);
}

// ========== TV SERIES INFO ==========
export async function tv({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "TV SERIES",
        "📺 *Get information about TV series*\n\n" +
          "📌 *Usage:* .tv <series name>\n" +
          "📋 *Examples:*\n" +
          "▰ .tv Breaking Bad\n" +
          "▰ .tv Game of Thrones\n\n" +
          "✨ *Returns:* Series details, seasons, episodes",
      ),
    });
    return;
  }

  await sock.sendMessage(from, { text: `📺 *Searching for "${fullArgs}"...*` });

  const query = fullArgs.trim();

  try {
    // Search for TV series using TMDB
    const searchRes = await axios.get(
      `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(query)}&api_key=${ENV.TMDB_API_KEY}`,
      { timeout: 8000 },
    );

    if (!searchRes.data.results?.length) {
      return await sock.sendMessage(from, {
        text: formatError("NOT FOUND", `No TV series found for "${query}".`),
      });
    }

    const series = searchRes.data.results[0];

    // Get detailed info
    const detailsRes = await axios.get(
      `https://api.themoviedb.org/3/tv/${series.id}?api_key=${ENV.TMDB_API_KEY}&append_to_response=credits,external_ids`,
      { timeout: 8000 },
    );

    const details = detailsRes.data;

    const title = details.name || details.original_name;
    const year = details.first_air_date
      ? details.first_air_date.split("-")[0]
      : "N/A";
    const rating = details.vote_average
      ? details.vote_average.toFixed(1)
      : "N/A";
    const seasons = details.number_of_seasons || "N/A";
    const episodes = details.number_of_episodes || "N/A";
    const status = details.status || "N/A";
    const networks = details.networks?.map((n) => n.name).join(", ") || "N/A";
    const genres = details.genres?.map((g) => g.name).join(", ") || "N/A";
    const overview = details.overview || "No overview available";
    const poster = details.poster_path
      ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
      : ENV.WELCOME_IMAGE_URL;
    const imdb = details.external_ids?.imdb_id || "";

    const seriesInfo = `╔══════════════════════════╗
║        📺 *TV SERIES*      ║
╚══════════════════════════╝

📺 *Title:* ${title}
📅 *First Aired:* ${year}
⭐ *Rating:* ${rating}/10
📊 *Seasons:* ${seasons}
📝 *Episodes:* ${episodes}
📡 *Status:* ${status}
📺 *Network:* ${networks}
🎭 *Genre:* ${genres}

📝 *Overview:*
${overview.substring(0, 300)}${overview.length > 300 ? "..." : ""}

${imdb ? `🔗 *IMDb:* https://www.imdb.com/title/${imdb}` : ""}

━━━━━━━━━━━━━━━━━━━━━
📊 *Source:* TMDB
⚡ *AYOBOT v1* | 👑 Created by AYOCODES`;

    try {
      await sock.sendMessage(from, {
        image: { url: poster },
        caption: seriesInfo,
      });
    } catch (e) {
      await sock.sendMessage(from, { text: seriesInfo });
    }
  } catch (error) {
    console.error("TV series error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not fetch TV series information."),
    });
  }
}

// ========== MOVIE RECOMMENDATIONS ==========
export async function recommend({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "RECOMMENDATIONS",
        "🎬 *Get movie recommendations*\n\n" +
          "📌 *Usage:* .recommend <genre>\n" +
          "📋 *Examples:*\n" +
          "▰ .recommend action\n" +
          "▰ .recommend comedy\n" +
          "▰ .recommend sci-fi\n\n" +
          "✨ *Returns:* 5 random movies in that genre",
      ),
    });
    return;
  }

  const genre = fullArgs.trim().toLowerCase();

  // Map common genres to TMDB genre IDs
  const genreMap = {
    action: 28,
    adventure: 12,
    animation: 16,
    comedy: 35,
    crime: 80,
    documentary: 99,
    drama: 18,
    family: 10751,
    fantasy: 14,
    history: 36,
    horror: 27,
    music: 10402,
    mystery: 9648,
    romance: 10749,
    "sci-fi": 878,
    thriller: 53,
    war: 10752,
    western: 37,
  };

  const genreId = genreMap[genre];

  if (!genreId) {
    return await sock.sendMessage(from, {
      text: formatError(
        "INVALID GENRE",
        `❌ Genre "${genre}" not recognized.\n\n` +
          "✅ *Available genres:*\n" +
          "action, adventure, animation, comedy, crime, documentary, drama,\n" +
          "family, fantasy, history, horror, music, mystery, romance,\n" +
          "sci-fi, thriller, war, western",
      ),
    });
  }

  await sock.sendMessage(from, { text: `🎬 *Finding ${genre} movies...*` });

  try {
    const res = await axios.get(
      `https://api.themoviedb.org/3/discover/movie?api_key=${ENV.TMDB_API_KEY}&with_genres=${genreId}&sort_by=popularity.desc&vote_count.gte=100`,
      { timeout: 8000 },
    );

    if (!res.data.results?.length) {
      return await sock.sendMessage(from, {
        text: formatError("NOT FOUND", `No ${genre} movies found.`),
      });
    }

    const movies = res.data.results.slice(0, 5);

    let recText = `╔══════════════════════════╗
║   🎬 *${genre.toUpperCase()} MOVIES*   ║
╚══════════════════════════╝\n\n`;

    movies.forEach((movie, i) => {
      const year = movie.release_date
        ? movie.release_date.split("-")[0]
        : "N/A";
      recText += `${i + 1}. *${movie.title}* (${year})\n`;
      recText += `   ⭐ Rating: ${movie.vote_average.toFixed(1)}/10\n`;
      recText += `   📝 ${movie.overview.substring(0, 100)}...\n\n`;
    });

    recText += `━━━━━━━━━━━━━━━━━━━━━\n⚡ *AYOBOT v1* | 👑 Created by AYOCODES`;

    await sock.sendMessage(from, { text: recText });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not fetch movie recommendations."),
    });
  }
}
