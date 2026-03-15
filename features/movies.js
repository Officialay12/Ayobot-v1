import axios from "axios";
import { ENV } from "../index.js";
import { formatError, formatInfo } from "../utils/formatters.js";

// ========== COMPREHENSIVE LOCAL MOVIE DATABASE (ULTIMATE FALLBACK) ==========
const LOCAL_MOVIES_DB = {
  // Popular Movies
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
    backdrop:
      "https://image.tmdb.org/t/p/original/s3TBrRGB1iav7gFOCNx3H31MoES.jpg",
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
    backdrop:
      "https://image.tmdb.org/t/p/original/h5UzYZquMwO9o4ZcQrgf27txVHq.jpg",
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
    backdrop:
      "https://image.tmdb.org/t/p/original/oo7h6pP54oP6w0sO3h4x70F3nR8.jpg",
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
    backdrop:
      "https://image.tmdb.org/t/p/original/xJHokMbljvjADTditAyAoP6pW3b.jpg",
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
    backdrop:
      "https://image.tmdb.org/t/p/original/czPU7pUe3RfrA4n3beq9uCcEAcB.jpg",
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
    backdrop:
      "https://image.tmdb.org/t/p/original/6xKCYgH16UuwEGAyroLU6p8HLIn.jpg",
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
    backdrop:
      "https://image.tmdb.org/t/p/original/bRs0jZ92yiJm41nBQqZinTYE2u9.jpg",
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
    backdrop:
      "https://image.tmdb.org/t/p/original/8tP2YrJk64JmWxVmOLUWLwPqzal.jpg",
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
    backdrop:
      "https://image.tmdb.org/t/p/original/tmU7GeKVybMWFButWEGl2M4GeiP.jpg",
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
    backdrop:
      "https://image.tmdb.org/t/p/original/avedvodZHnUNiQZPv7owx5GXD6Q.jpg",
    imdb: "tt0111161",
  },
  "the lion king": {
    title: "The Lion King",
    year: "1994",
    rating: "8.5",
    runtime: "88 min",
    genre: "Animation, Adventure, Drama",
    overview:
      "Lion prince Simba and his father are targeted by his bitter uncle, who wants to ascend the throne himself.",
    director: "Roger Allers, Rob Minkoff",
    cast: "Matthew Broderick, Jeremy Irons, James Earl Jones",
    poster: "https://image.tmdb.org/t/p/w500/sKCr78MXSLixwmZ8DyJLrpMsd15.jpg",
    backdrop:
      "https://image.tmdb.org/t/p/original/wXqKD7nGpblhJbIwsypwBqHGNrQ.jpg",
    imdb: "tt0110357",
  },
  titanic: {
    title: "Titanic",
    year: "1997",
    rating: "7.9",
    runtime: "194 min",
    genre: "Drama, Romance",
    overview:
      "A seventeen-year-old aristocrat falls in love with a kind but poor artist aboard the luxurious, ill-fated R.M.S. Titanic.",
    director: "James Cameron",
    cast: "Leonardo DiCaprio, Kate Winslet, Billy Zane",
    poster: "https://image.tmdb.org/t/p/w500/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg",
    backdrop:
      "https://image.tmdb.org/t/p/original/fGjJX6YHrP8DIPjpIMTN4YyrK9L.jpg",
    imdb: "tt0120338",
  },
  "jurassic park": {
    title: "Jurassic Park",
    year: "1993",
    rating: "8.1",
    runtime: "127 min",
    genre: "Adventure, Sci-Fi, Thriller",
    overview:
      "A pragmatic paleontologist visiting an almost complete theme park is tasked with protecting a couple of kids after a power failure causes the park's cloned dinosaurs to run loose.",
    director: "Steven Spielberg",
    cast: "Sam Neill, Laura Dern, Jeff Goldblum",
    poster: "https://image.tmdb.org/t/p/w500/oU7Oq2kFAAlGqbU4VoAE36g4hoI.jpg",
    backdrop:
      "https://image.tmdb.org/t/p/original/cfCqnwy75h1ZEp6xncRKBQm15EE.jpg",
    imdb: "tt0107290",
  },
  gladiator: {
    title: "Gladiator",
    year: "2000",
    rating: "8.5",
    runtime: "155 min",
    genre: "Action, Adventure, Drama",
    overview:
      "A former Roman General sets out to exact vengeance against the corrupt emperor who murdered his family and sent him into slavery.",
    director: "Ridley Scott",
    cast: "Russell Crowe, Joaquin Phoenix, Connie Nielsen",
    poster: "https://image.tmdb.org/t/p/w500/6WBIzCgmDCYrqh64yFWREJOp5Ux.jpg",
    backdrop:
      "https://image.tmdb.org/t/p/original/tyTYHxkp0TpJhMZeeUIBcCcvGpF.jpg",
    imdb: "tt0172495",
  },
  goodfellas: {
    title: "Goodfellas",
    year: "1990",
    rating: "8.7",
    runtime: "146 min",
    genre: "Biography, Crime, Drama",
    overview:
      "The story of Henry Hill and his life in the mob, covering his relationship with his wife Karen and his mob partners Jimmy Conway and Tommy DeVito.",
    director: "Martin Scorsese",
    cast: "Robert De Niro, Ray Liotta, Joe Pesci",
    poster: "https://image.tmdb.org/t/p/w500/6QMSLvU5ziILpIhTrJEqNzO8I5M.jpg",
    backdrop:
      "https://image.tmdb.org/t/p/original/7cM9KGifNycRvDn7DvMOpC9cJ6H.jpg",
    imdb: "tt0099685",
  },
  "saving private ryan": {
    title: "Saving Private Ryan",
    year: "1998",
    rating: "8.6",
    runtime: "169 min",
    genre: "Drama, War",
    overview:
      "Following the Normandy Landings, a group of U.S. soldiers go behind enemy lines to retrieve a paratrooper whose brothers have been killed in action.",
    director: "Steven Spielberg",
    cast: "Tom Hanks, Matt Damon, Tom Sizemore",
    poster: "https://image.tmdb.org/t/p/w500/uqx37cS8cpHg8U35f9U5IBlrCV3.jpg",
    backdrop:
      "https://image.tmdb.org/t/p/original/6iy5c9TL7R3gNgpW56f0NQxI39N.jpg",
    imdb: "tt0120815",
  },
  "the silence of the lambs": {
    title: "The Silence of the Lambs",
    year: "1991",
    rating: "8.6",
    runtime: "118 min",
    genre: "Crime, Drama, Thriller",
    overview:
      "A young F.B.I. cadet must receive the help of an incarcerated and manipulative cannibal killer to help catch another serial killer.",
    director: "Jonathan Demme",
    cast: "Jodie Foster, Anthony Hopkins, Scott Glenn",
    poster: "https://image.tmdb.org/t/p/w500/rplLJ2hPcOQmkFhTqUte0MkEaO2.jpg",
    backdrop:
      "https://image.tmdb.org/t/p/original/rpBpJUnRgZKAKF4tE4T6S4OvbN8.jpg",
    imdb: "tt0102926",
  },
  se7en: {
    title: "Se7en",
    year: "1995",
    rating: "8.6",
    runtime: "127 min",
    genre: "Crime, Drama, Mystery",
    overview:
      "Two detectives, a rookie and a veteran, hunt a serial killer who uses the seven deadly sins as his motives.",
    director: "David Fincher",
    cast: "Morgan Freeman, Brad Pitt, Kevin Spacey",
    poster: "https://image.tmdb.org/t/p/w500/8zw8IL4zEPjkh8AysjcdiH2TkiU.jpg",
    backdrop:
      "https://image.tmdb.org/t/p/original/xGexaar4CzhWZgCmnbC3TwPmQKv.jpg",
    imdb: "tt0114369",
  },
  "the green mile": {
    title: "The Green Mile",
    year: "1999",
    rating: "8.6",
    runtime: "189 min",
    genre: "Crime, Drama, Fantasy",
    overview:
      "The lives of guards on Death Row are affected by one of their charges: a black man accused of child murder and rape, yet who has a mysterious gift.",
    director: "Frank Darabont",
    cast: "Tom Hanks, Michael Clarke Duncan, David Morse",
    poster: "https://image.tmdb.org/t/p/w500/velWPhVMQeQKcxggNEU8YmIo52R.jpg",
    backdrop:
      "https://image.tmdb.org/t/p/original/mo57JsxuCgtXSCP3cHd4nzLfuCt.jpg",
    imdb: "tt0120689",
  },
};

// ========== FALLBACK POSTERS ==========
const FALLBACK_POSTERS = [
  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500",
  "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500",
  "https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=500",
  "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=500",
  "https://images.unsplash.com/photo-1512149177596-f817c7ef5d4c?w=500",
];

// ========== MAIN MOVIE COMMAND ==========
export async function movie({ fullArgs, from, sock }) {
  try {
    // Show help if no arguments
    if (!fullArgs) {
      await sock.sendMessage(from, {
        text: formatInfo(
          "🎬 MOVIE COMMAND",
          "*Get detailed information about any movie*\n\n" +
            "📌 *Usage:* `.movie <movie title>`\n\n" +
            "📋 *Examples:*\n" +
            "• `.movie Inception`\n" +
            "• `.movie The Dark Knight`\n" +
            "• `.movie Avatar 2009`\n\n" +
            "✨ *Returns:* Title, year, rating, plot, cast, poster, and more!\n\n" +
            "💡 *Tip:* You can also use `.trending` for popular movies or `.recommend` for suggestions.",
        ),
      });
      return;
    }

    const query = fullArgs.trim();
    const lowerQuery = query.toLowerCase();

    // Send searching message
    await sock.sendMessage(from, {
      text: formatInfo("🔍 SEARCHING", `🎬 Looking for "${query}"...`),
    });

    // ===== STEP 1: CHECK LOCAL DATABASE (FASTEST) =====
    const localMatch = findInLocalDB(lowerQuery);
    if (localMatch) {
      return await sendMovieResponse(
        sock,
        from,
        localMatch,
        "📀 Local Database",
      );
    }

    // ===== STEP 2: TRY MULTIPLE APIS =====
    let movieData = null;
    let source = "";

    // Try TMDB first (most comprehensive)
    if (ENV.TMDB_API_KEY) {
      movieData = await tryTMDB(query);
      if (movieData) source = "🎬 TMDB";
    }

    if (!movieData && ENV.OMDB_API_KEY) {
      movieData = await tryOMDb(query);
      if (movieData) source = "🎥 OMDb";
    }

    // Try TMDB alternative search
    if (!movieData && ENV.TMDB_API_KEY) {
      movieData = await tryTMDBAlternative(query);
      if (movieData) source = "🎬 TMDB (Alt)";
    }

    // ===== STEP 3: USE LOCAL DATABASE AS ULTIMATE FALLBACK =====
    if (!movieData) {
      const fuzzyMatch = fuzzyFindInLocalDB(lowerQuery);
      if (fuzzyMatch) {
        return await sendMovieResponse(
          sock,
          from,
          fuzzyMatch,
          "📀 Local DB (Fuzzy Match)",
        );
      }

      const suggestions = getSuggestions();
      return await sock.sendMessage(from, {
        text: formatError(
          "❌ NOT FOUND",
          `No results found for "${query}".\n\n` +
            "💡 *Suggestions:*\n" +
            "• Check the spelling\n" +
            "• Try a different movie\n" +
            "• Add the year (e.g., Inception 2010)\n\n" +
            "📋 *Try these popular movies:*\n" +
            suggestions.map((s) => `• ${s}`).join("\n") +
            "\n\n⚡ *AYOBOT v1* | 👑 Created by AYOCODES",
        ),
      });
    }

    // ===== STEP 4: SEND THE MOVIE INFO =====
    await sendMovieResponse(sock, from, movieData, source);
  } catch (error) {
    console.error("Movie command error:", error);
    await sendPopularMoviesFallback(sock, from);
  }
}

// ========== API FUNCTIONS ==========

// Try TMDB API
async function tryTMDB(query) {
  try {
    if (!ENV.TMDB_API_KEY) return null;

    const searchRes = await axios.get(
      `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&api_key=${ENV.TMDB_API_KEY}&include_adult=false`,
      { timeout: 8000 },
    );

    if (!searchRes.data.results?.length) return null;

    const movie = searchRes.data.results[0];

    const detailsRes = await axios.get(
      `https://api.themoviedb.org/3/movie/${movie.id}?api_key=${ENV.TMDB_API_KEY}&append_to_response=credits,images,videos`,
      { timeout: 8000 },
    );

    const details = detailsRes.data;

    const director =
      details.credits?.crew?.find((c) => c.job === "Director")?.name || "N/A";
    const cast =
      details.credits?.cast
        ?.slice(0, 5)
        .map((c) => c.name)
        .join(", ") || "N/A";

    let trailer = "";
    if (details.videos?.results?.length > 0) {
      const trailerVideo = details.videos.results.find(
        (v) => v.type === "Trailer" && v.site === "YouTube",
      );
      if (trailerVideo) {
        trailer = `https://www.youtube.com/watch?v=${trailerVideo.key}`;
      }
    }

    return {
      title: details.title || details.original_title,
      year: details.release_date ? details.release_date.split("-")[0] : "N/A",
      rating: details.vote_average ? details.vote_average.toFixed(1) : "N/A",
      runtime: details.runtime ? `${details.runtime} min` : "N/A",
      genre: details.genres?.map((g) => g.name).join(", ") || "N/A",
      overview: details.overview || "No overview available",
      director: director,
      cast: cast,
      poster: details.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
        : getRandomFallbackPoster(),
      backdrop: details.backdrop_path
        ? `https://image.tmdb.org/t/p/original${details.backdrop_path}`
        : null,
      imdb: details.imdb_id || "",
      tagline: details.tagline || "",
      trailer: trailer,
    };
  } catch (error) {
    console.log("TMDB error:", error.message);
    return null;
  }
}

async function tryOMDb(query) {
  try {
    if (!ENV.OMDB_API_KEY) return null;

    const cleanQuery = query.replace(/\s+\d{4}$/, "").trim();

    const res = await axios.get(
      `https://www.omdbapi.com/?t=${encodeURIComponent(cleanQuery)}&apikey=${ENV.OMDB_API_KEY}&plot=full`,
      { timeout: 8000 },
    );

    if (res.data.Response === "False") return null;

    const data = res.data;

    return {
      title: data.Title || "N/A",
      year: data.Year || "N/A",
      rating: data.imdbRating || "N/A",
      runtime: data.Runtime || "N/A",
      genre: data.Genre || "N/A",
      overview: data.Plot || "No plot available",
      director: data.Director || "N/A",
      cast: data.Actors || "N/A",
      poster:
        data.Poster && data.Poster !== "N/A"
          ? data.Poster
          : getRandomFallbackPoster(),
      imdb: data.imdbID || "",
      awards: data.Awards || "",
      boxoffice: data.BoxOffice || "",
    };
  } catch (error) {
    console.log("OMDb error:", error.message);
    return null;
  }
}

// Try TMDB alternative search
async function tryTMDBAlternative(query) {
  try {
    if (!ENV.TMDB_API_KEY) return null;

    const yearMatch = query.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? yearMatch[0] : "";
    const movieQuery = year ? query.replace(year, "").trim() : query;

    const searchRes = await axios.get(
      `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(movieQuery)}&year=${year}&api_key=${ENV.TMDB_API_KEY}`,
      { timeout: 8000 },
    );

    if (!searchRes.data.results?.length) return null;

    const movie = searchRes.data.results[0];

    return {
      title: movie.title || movie.original_title,
      year: movie.release_date ? movie.release_date.split("-")[0] : "N/A",
      rating: movie.vote_average ? movie.vote_average.toFixed(1) : "N/A",
      overview: movie.overview || "No overview available",
      poster: movie.poster_path
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
        : getRandomFallbackPoster(),
    };
  } catch (error) {
    console.log("TMDB Alt error:", error.message);
    return null;
  }
}

// ========== HELPER FUNCTIONS ==========

function findInLocalDB(query) {
  if (query.length < 4) return null;

  for (const [key, movieEntry] of Object.entries(LOCAL_MOVIES_DB)) {
    // Exact key match
    if (query === key) return movieEntry;
    // Query contains the full key (e.g. "the dark knight rises" contains "dark knight")
    if (key.length >= 4 && query.includes(key)) return movieEntry;
    // Title exact match
    if (movieEntry.title.toLowerCase() === query) return movieEntry;
  }
  return null;
}

// Fuzzy find in local database
function fuzzyFindInLocalDB(query) {
  // Filter out very short words that would match everything
  const queryWords = query.split(/\s+/).filter((w) => w.length > 3);
  if (queryWords.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const movieEntry of Object.values(LOCAL_MOVIES_DB)) {
    const titleLower = movieEntry.title.toLowerCase();
    let score = 0;

    for (const word of queryWords) {
      if (titleLower.includes(word)) score += 3;
      else {
        for (const titleWord of titleLower.split(/\s+/)) {
          if (
            titleWord.length > 3 &&
            (titleWord.includes(word) || word.includes(titleWord))
          ) {
            score += 1;
          }
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = movieEntry;
    }
  }

  return bestScore > 2 ? bestMatch : null;
}

// Get movie suggestions
function getSuggestions() {
  const allTitles = Object.values(LOCAL_MOVIES_DB).map((m) => m.title);
  return allTitles.sort(() => 0.5 - Math.random()).slice(0, 5);
}

// Get random fallback poster
function getRandomFallbackPoster() {
  return FALLBACK_POSTERS[Math.floor(Math.random() * FALLBACK_POSTERS.length)];
}

// Send popular movies fallback
async function sendPopularMoviesFallback(sock, from) {
  const popularMovies = Object.values(LOCAL_MOVIES_DB).slice(0, 5);
  let fallbackText = "╔══════════════════════════╗\n";
  fallbackText += "║   🎬 *POPULAR MOVIES*    ║\n";
  fallbackText += "╚══════════════════════════╝\n\n";

  popularMovies.forEach((m, i) => {
    fallbackText += `${i + 1}. *${m.title}* (${m.year})\n`;
    fallbackText += `   ⭐ ${m.rating}/10 | ${m.genre}\n\n`;
  });

  fallbackText += "━━━━━━━━━━━━━━━━━━━━━\n";
  fallbackText += "💡 Use `.movie <title>` to search\n";
  fallbackText += "⚡ *AYOBOT v1* | 👑 Created by AYOCODES";

  await sock.sendMessage(from, { text: fallbackText });
}

// Send movie response with poster
async function sendMovieResponse(sock, from, movie, source) {
  const movieInfo = buildMovieInfo(movie, source);

  try {
    if (movie.poster) {
      await sock.sendMessage(from, {
        image: { url: movie.poster },
        caption: movieInfo,
      });
    } else {
      await sock.sendMessage(from, { text: movieInfo });
    }
  } catch (posterError) {
    console.log("Poster error:", posterError.message);
    try {
      if (movie.backdrop) {
        await sock.sendMessage(from, {
          image: { url: movie.backdrop },
          caption: movieInfo,
        });
      } else {
        await sock.sendMessage(from, { text: movieInfo });
      }
    } catch (backdropError) {
      await sock.sendMessage(from, { text: movieInfo });
    }
  }

  // Send IMDb link if available
  if (movie.imdb && movie.imdb !== "N/A" && movie.imdb !== "") {
    await sock.sendMessage(from, {
      text: formatInfo(
        "🔗 IMDB LINK",
        `https://www.imdb.com/title/${movie.imdb}`,
      ),
    });
  }

  // Send trailer if available
  if (movie.trailer && movie.trailer !== "") {
    await sock.sendMessage(from, {
      text: formatInfo("🎥 TRAILER", movie.trailer),
    });
  }

  console.log(`✅ Movie sent: ${movie.title} via ${source}`);
}

function buildMovieInfo(movie, source) {
  let info = `📽️ *Title:* ${movie.title}\n`;
  info += `📅 *Year:* ${movie.year}\n`;
  info += `⭐ *Rating:* ${movie.rating}/10\n`;

  if (movie.runtime && movie.runtime !== "N/A") {
    info += `⏱️ *Runtime:* ${movie.runtime}\n`;
  }

  if (movie.genre && movie.genre !== "N/A") {
    info += `🎭 *Genre:* ${movie.genre}\n`;
  }

  if (movie.tagline && movie.tagline !== "") {
    info += `💬 *Tagline:* "${movie.tagline}"\n`;
  }

  if (movie.awards && movie.awards !== "N/A" && movie.awards !== "") {
    info += `🏆 *Awards:* ${movie.awards}\n`;
  }

  if (movie.boxoffice && movie.boxoffice !== "N/A" && movie.boxoffice !== "") {
    info += `💰 *Box Office:* ${movie.boxoffice}\n`;
  }

  info += `\n📝 *Plot:*\n${movie.overview.substring(0, 300)}${movie.overview.length > 300 ? "..." : ""}\n\n`;

  if (movie.director && movie.director !== "N/A") {
    info += `🎬 *Director:* ${movie.director}\n`;
  }

  if (movie.cast && movie.cast !== "N/A") {
    info += `⭐ *Cast:* ${movie.cast.substring(0, 100)}${movie.cast.length > 100 ? "..." : ""}\n`;
  }

  info += `⚡ *AYOBOT v1* `;

  return info;
}

// ========== TRENDING MOVIES COMMAND ==========
export async function trending({ from, sock }) {
  try {
    await sock.sendMessage(from, {
      text: formatInfo("🔥 TRENDING", "Fetching trending movies..."),
    });

    let movies = [];

    if (ENV.TMDB_API_KEY) {
      try {
        const res = await axios.get(
          `https://api.themoviedb.org/3/trending/movie/week?api_key=${ENV.TMDB_API_KEY}`,
          { timeout: 8000 },
        );
        movies = res.data.results.slice(0, 5);
      } catch (e) {
        console.log("TMDB trending error:", e.message);
      }
    }

    if (movies.length === 0) {
      movies = Object.values(LOCAL_MOVIES_DB).slice(0, 5);
    }

    let trendingText = "╔══════════════════════════╗\n";
    trendingText += "║     🔥  *TRENDING*       ║\n";
    trendingText += "╚══════════════════════════╝\n\n";

    movies.forEach((m, i) => {
      const title = m.title || m.original_title;
      const year = m.release_date
        ? m.release_date.split("-")[0]
        : m.year || "N/A";
      const rating = m.vote_average
        ? m.vote_average.toFixed(1)
        : m.rating || "N/A";

      trendingText += `${i + 1}. *${title}* (${year})\n`;
      trendingText += `   ⭐ Rating: ${rating}/10\n`;
      if (m.genre || m.genres) {
        const genre =
          m.genre || (m.genres ? m.genres.map((g) => g.name).join(", ") : "");
        trendingText += `   🎭 ${genre}\n`;
      }
      trendingText += "\n";
    });

    trendingText += "💡 Use `.movie <title>` for details\n";
    trendingText += "⚡ *AYOBOT v1* ";

    await sock.sendMessage(from, { text: trendingText });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not fetch trending movies."),
    });
  }
}

// ========== RECOMMEND MOVIES BY GENRE ==========
export async function recommend({ fullArgs, from, sock }) {
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
    "sci fi": 878,
    "sci-fi": 878,
    scifi: 878,
    thriller: 53,
    war: 10752,
    western: 37,
  };

  if (!fullArgs) {
    const genres = Object.keys(genreMap)
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((g) => `• ${g}`)
      .join("\n");
    await sock.sendMessage(from, {
      text: formatInfo(
        "🎬 RECOMMEND",
        "*Get movie recommendations by genre*\n\n" +
          "📌 *Usage:* `.recommend <genre>`\n\n" +
          "📋 *Available Genres:*\n" +
          genres +
          "\n\n✨ *Example:* `.recommend action`",
      ),
    });
    return;
  }

  const genre = fullArgs.trim().toLowerCase();
  const genreId = genreMap[genre];

  if (!genreId) {
    return await sock.sendMessage(from, {
      text: formatError("INVALID GENRE", `Genre "${genre}" not recognized.`),
    });
  }

  await sock.sendMessage(from, {
    text: formatInfo("🎯 RECOMMENDING", `Finding ${genre} movies...`),
  });

  try {
    let movies = [];

    if (ENV.TMDB_API_KEY) {
      try {
        const res = await axios.get(
          `https://api.themoviedb.org/3/discover/movie?api_key=${ENV.TMDB_API_KEY}&with_genres=${genreId}&sort_by=popularity.desc&vote_count.gte=100`,
          { timeout: 8000 },
        );
        movies = res.data.results.slice(0, 5);
      } catch (e) {
        console.log("TMDB recommend error:", e.message);
      }
    }

    if (movies.length === 0) {
      movies = Object.values(LOCAL_MOVIES_DB)
        .filter((m) => m.genre.toLowerCase().includes(genre))
        .slice(0, 5);
    }

    if (movies.length === 0) {
      return await sock.sendMessage(from, {
        text: formatError("NOT FOUND", `No ${genre} movies found.`),
      });
    }

    // FIX #6: Genre header was not padded to fit the 28-char box — trimmed to fixed width.
    const genreLabel = genre.toUpperCase().substring(0, 14).padEnd(14);
    let recText = `╔══════════════════════════╗\n`;
    recText += `║  🎬 *${genreLabel}*  ║\n`;
    recText += `╚══════════════════════════╝\n\n`;

    movies.forEach((m, i) => {
      const title = m.title || m.original_title;
      const year = m.release_date
        ? m.release_date.split("-")[0]
        : m.year || "N/A";
      const rating = m.vote_average
        ? m.vote_average.toFixed(1)
        : m.rating || "N/A";

      recText += `${i + 1}. *${title}* (${year})\n`;
      recText += `   ⭐ Rating: ${rating}/10\n`;
      if (m.overview) {
        recText += `   📝 ${m.overview.substring(0, 100)}...\n`;
      }
      recText += "\n";
    });

    recText += "━━━━━━━━━━━━━━━━━━━━━\n";
    recText += "💡 Use `.movie <title>` for details\n";
    recText += "⚡ *AYOBOT v1* | 👑 Created by AYOCODES";

    await sock.sendMessage(from, { text: recText });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not fetch recommendations."),
    });
  }
}

// ========== TV SERIES COMMAND ==========
export async function tv({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "📺 TV SERIES",
        "*Get information about TV series*\n\n" +
          "📌 *Usage:* `.tv <series name>`\n" +
          "📋 *Examples:*\n" +
          "• `.tv Breaking Bad`\n" +
          "• `.tv Game of Thrones`\n\n" +
          "✨ *Returns:* Series details, seasons, episodes, and more!",
      ),
    });
    return;
  }

  const query = fullArgs.trim();

  await sock.sendMessage(from, {
    text: formatInfo("🔍 SEARCHING", `📺 Looking for "${query}"...`),
  });

  try {
    if (!ENV.TMDB_API_KEY) {
      return await sock.sendMessage(from, {
        text: formatError(
          "ERROR",
          "TV series search is currently unavailable.",
        ),
      });
    }

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

    const detailsRes = await axios.get(
      `https://api.themoviedb.org/3/tv/${series.id}?api_key=${ENV.TMDB_API_KEY}&append_to_response=credits,external_ids,videos`,
      { timeout: 8000 },
    );

    const details = detailsRes.data;

    let trailer = "";
    if (details.videos?.results?.length > 0) {
      const trailerVideo = details.videos.results.find(
        (v) => v.type === "Trailer" && v.site === "YouTube",
      );
      if (trailerVideo) {
        trailer = `https://www.youtube.com/watch?v=${trailerVideo.key}`;
      }
    }

    const seriesInfo = {
      title: details.name || details.original_name,
      year: details.first_air_date
        ? details.first_air_date.split("-")[0]
        : "N/A",
      rating: details.vote_average ? details.vote_average.toFixed(1) : "N/A",
      seasons: details.number_of_seasons || "N/A",
      episodes: details.number_of_episodes || "N/A",
      status: details.status || "N/A",
      network: details.networks?.map((n) => n.name).join(", ") || "N/A",
      genre: details.genres?.map((g) => g.name).join(", ") || "N/A",
      overview: details.overview || "No overview available",
      poster: details.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
        : getRandomFallbackPoster(),
      backdrop: details.backdrop_path
        ? `https://image.tmdb.org/t/p/original${details.backdrop_path}`
        : null,
      imdb: details.external_ids?.imdb_id || "",
      trailer: trailer,
    };

    let info = "╔══════════════════════════╗\n";
    info += "║     📺  *TV SERIES*       ║\n";
    info += "╚══════════════════════════╝\n\n";

    info += `📺 *Title:* ${seriesInfo.title}\n`;
    info += `📅 *First Aired:* ${seriesInfo.year}\n`;
    info += `⭐ *Rating:* ${seriesInfo.rating}/10\n`;
    info += `📊 *Seasons:* ${seriesInfo.seasons}\n`;
    info += `📝 *Episodes:* ${seriesInfo.episodes}\n`;
    info += `📡 *Status:* ${seriesInfo.status}\n`;
    info += `📺 *Network:* ${seriesInfo.network}\n`;
    info += `🎭 *Genre:* ${seriesInfo.genre}\n\n`;

    info += `📝 *Overview:*\n${seriesInfo.overview.substring(0, 300)}${seriesInfo.overview.length > 300 ? "..." : ""}\n\n`;

    info += `━━━━━━━━━━━━━━━━━━━━━\n`;
    info += `📊 *Source:* TMDB\n`;
    info += `⚡ *AYOBOT v1* | 👑 Created by AYOCODES`;

    try {
      await sock.sendMessage(from, {
        image: { url: seriesInfo.poster },
        caption: info,
      });
    } catch (e) {
      await sock.sendMessage(from, { text: info });
    }

    if (seriesInfo.imdb) {
      await sock.sendMessage(from, {
        text: formatInfo(
          "🔗 IMDB LINK",
          `https://www.imdb.com/title/${seriesInfo.imdb}`,
        ),
      });
    }

    if (seriesInfo.trailer) {
      await sock.sendMessage(from, {
        text: formatInfo("🎥 TRAILER", seriesInfo.trailer),
      });
    }
  } catch (error) {
    console.error("TV series error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not fetch TV series information."),
    });
  }
}
