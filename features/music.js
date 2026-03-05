// features/music.js - COMPLETE FIXED MUSIC MODULE
// Song lyrics, artist info, trending, and music downloads

import axios from "axios";
import * as cheerio from "cheerio";
import {
  formatSuccess,
  formatError,
  formatInfo,
  formatData,
} from "../utils/formatters.js";
import { ENV } from "../index.js";

// Local lyrics database (expanded with more songs)
const LOCAL_LYRICS = {
  "shape of you": `"Shape of You" by Ed Sheeran

[Verse 1]
The club isn't the best place to find a lover
So the bar is where I go
Me and my friends at the table doing shots
Drinking faster and then we talk slow

[Pre-Chorus]
And you come over and start up a conversation with just me
And trust me, I'll give it a chance now

[Chorus]
I'm in love with the shape of you
We push and pull like a magnet do
Although my heart is falling too
I'm in love with your body
And last night you were in my room
And now my bedsheets smell like you
Every day discovering something brand new
I'm in love with your body`,

  perfect: `"Perfect" by Ed Sheeran

[Verse 1]
I found a love for me
Darling, just dive right in and follow my lead
Well, I found a girl, beautiful and sweet
Oh, I never knew you were the someone waiting for me

[Pre-Chorus]
'Cause we were just kids when we fell in love
Not knowing what it was
I will not give you up this time

[Chorus]
But darling, just kiss me slow, your heart is all I own
And in your eyes, you're holding mine
Baby, I'm dancing in the dark with you between my arms
Barefoot on the grass, listening to our favourite song`,

  "blinding lights": `"Blinding Lights" by The Weeknd

[Verse 1]
I've been tryna call
I've been on my own for long enough
Maybe you can show me how to love, maybe
I'm going through withdrawals

[Pre-Chorus]
You don't even have to do too much
You can turn me on with just a touch, baby

[Chorus]
I look around and sin city's cold and empty (oh)
No one's around to judge me (oh)
I can't see clearly when you're gone`,

  "lose yourself": `"Lose Yourself" by Eminem

[Intro]
Look, if you had one shot, one opportunity
To seize everything you ever wanted, one moment
Would you capture it or just let it slip?

[Verse 1]
His palms are sweaty, knees weak, arms are heavy
There's vomit on his sweater already, mom's spaghetti
He's nervous, but on the surface he looks calm and ready
To drop bombs, but he keeps on forgettin'
What he wrote down, the whole crowd goes so loud
He opens his mouth, but the words won't come out
He's chokin', how, everybody's jokin' now
The clocks run out, times up, over, blaow!`,

  hello: `"Hello" by Adele

[Verse 1]
Hello, it's me
I was wondering if after all these years you'd like to meet
To go over everything
They say that time's supposed to heal ya, but I ain't done much healing

[Verse 2]
Hello, can you hear me?
I'm in California dreaming about who we used to be
When we were younger and free
I've forgotten how it felt before the world fell at our feet

[Chorus]
Hello from the other side
I must've called a thousand times
To tell you I'm sorry for everything that I've done
But when I call, you never seem to be home`,

  "bohemian rhapsody": `"Bohemian Rhapsody" by Queen

[Intro]
Is this the real life? Is this just fantasy?
Caught in a landslide, no escape from reality
Open your eyes, look up to the skies and see
I'm just a poor boy, I need no sympathy
Because I'm easy come, easy go, little high, little low
Any way the wind blows doesn't really matter to me, to me

[Verse]
Mama, just killed a man
Put a gun against his head, pulled my trigger, now he's dead
Mama, life had just begun
But now I've gone and thrown it all away
Mama, ooh, didn't mean to make you cry
If I'm not back again this time tomorrow
Carry on, carry on as if nothing really matters`,

  "someone like you": `"Someone Like You" by Adele

[Verse 1]
I heard that you're settled down
That you found a girl and you're married now
I heard that your dreams came true
Guess she gave you things I didn't give to you
Old friend, why are you so shy?
Ain't like you to hold back or hide from the light

[Chorus]
Never mind, I'll find someone like you
I wish nothing but the best for you two
Don't forget me, I beg
I remember you said
Sometimes it lasts in love, but sometimes it hurts instead`,

  "god's plan": `"God's Plan" by Drake

[Intro]
Yeah, they wishin' and wishin' and wishin' and wishin'
They wishin' on me, yuh

[Chorus]
I've been movin' calm, don't start no trouble with me
Tryna keep it peaceful is a struggle for me
Don't pull up at 6 AM to cuddle with me
You know how I like it when you lovin' on me
I don't wanna die for them to miss me
Yes, I see the things that they wishin' on me
Hope I got some brothers that outlive me
They gon' tell the story, shit was different with me`,

  believer: `"Believer" by Imagine Dragons

[Verse 1]
First things first
I'ma say all the words inside my head
I'm fired up and tired of the way that things have been, oh-ooh
The way that things have been, oh-ooh

[Pre-Chorus]
Second thing second
Don't you tell me what you think that I could be
I'm the one at the sail, I'm the master of my sea, oh-ooh
The master of my sea, oh-ooh

[Chorus]
I was broken from a young age
Taking my sulking to the masses
Writing my poems for the few
That look at me, took to me, shook to me, feeling me
Singing from heartache from the pain
Taking my message from the veins
Speaking my lesson from the brain
Seeing the beauty through the...`,

  senorita: `"Señorita" by Shawn Mendes & Camila Cabello

[Verse 1: Camila Cabello]
I love it when you call me señorita
I wish I could pretend I didn't need ya
But every touch is ooh-la-la-la
It's true, la-la-la
Ooh, I should be runnin'
Ooh, you keep me coming for ya

[Verse 2: Shawn Mendes]
Land in Miami
The air was hot from summer rain
Sweat dripping off me
Before I even knew her name, la-la-la
It felt like ooh-la-la-la
Yeah, no

[Chorus: Both]
Sapphire moonlight
We danced for hours in the sand
Tequila sunrise
Her body fit right in my hands, la-la-la
It felt like ooh-la-la-la, yeah`,
};

// Cache for API responses
const musicCache = new Map();
const CACHE_TTL = 1800000; // 30 minutes (reduced from 1 hour for fresher data)

// Rate limiting for API calls
const apiRateLimit = new Map();
const API_LIMIT = 10; // 10 calls per minute
const API_WINDOW = 60000; // 1 minute

// Check rate limit for API calls
function checkApiRateLimit(endpoint) {
  const now = Date.now();
  const calls = apiRateLimit.get(endpoint) || [];
  const recentCalls = calls.filter((time) => now - time < API_WINDOW);

  if (recentCalls.length >= API_LIMIT) {
    return false;
  }

  recentCalls.push(now);
  apiRateLimit.set(endpoint, recentCalls);
  return true;
}

// ========== MAIN MUSIC COMMAND ==========
export async function music({ fullArgs, from, sock }) {
  try {
    if (!fullArgs || fullArgs.trim() === "") {
      await showMusicHelp(from, sock);
      return;
    }

    const args = fullArgs.toLowerCase().split(/\s+/);
    const subCommand = args[0];

    // Route to appropriate subcommand
    switch (subCommand) {
      case "trending":
      case "top":
        await musicTrending({ from, sock });
        break;

      case "random":
        await musicRandom({ from, sock });
        break;

      case "artist":
        await musicArtist({
          fullArgs: fullArgs.replace(/^artist\s+/i, ""),
          from,
          sock,
        });
        break;

      case "album":
        await musicAlbum({
          fullArgs: fullArgs.replace(/^album\s+/i, ""),
          from,
          sock,
        });
        break;

      case "search":
        await musicSearch({
          fullArgs: fullArgs.replace(/^search\s+/i, ""),
          from,
          sock,
        });
        break;

      case "play":
      case "download":
        await musicDownload({
          fullArgs: fullArgs.replace(/^(play|download)\s+/i, ""),
          from,
          sock,
        });
        break;

      case "genius":
        await musicGenius({
          fullArgs: fullArgs.replace(/^genius\s+/i, ""),
          from,
          sock,
        });
        break;

      default:
        // Default to lyrics search
        await musicLyrics({ fullArgs, from, sock });
    }
  } catch (error) {
    console.error("❌ Music error:", error);
    await sock.sendMessage(from, {
      text: formatError("MUSIC ERROR", "An error occurred. Please try again."),
    });
  }
}

// ========== MUSIC LYRICS ==========
export async function musicLyrics({ fullArgs, from, sock }) {
  try {
    if (!fullArgs || fullArgs.trim() === "") {
      await sock.sendMessage(from, {
        text: formatInfo(
          "🎵 MUSIC LYRICS",
          "*Usage:* .lyrics <song name>\n" +
            "*Enhanced:* .lyrics <song> - <artist>\n\n" +
            "*Examples:*\n" +
            "• .lyrics Shape of You\n" +
            "• .lyrics Perfect - Ed Sheeran\n" +
            "• .lyrics Bohemian Rhapsody",
        ),
      });
      return;
    }

    // Parse artist if provided with hyphen
    let songQuery = fullArgs.trim();
    let artist = null;

    if (songQuery.includes(" - ")) {
      const parts = songQuery.split(" - ");
      songQuery = parts[0].trim();
      artist = parts[1].trim();
    }

    await sock.sendMessage(from, {
      text: `🎵 *Searching lyrics for "${songQuery}"${artist ? ` by ${artist}` : ""}...*`,
    });

    const searchKey = `lyrics-${songQuery.toLowerCase()}-${artist || ""}`;

    // Check cache
    const cached = musicCache.get(searchKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      await sendLyricsResponse(sock, from, cached.data, true);
      return;
    }

    // Try local database first (case insensitive)
    const songLower = songQuery.toLowerCase();
    for (const [key, lyrics] of Object.entries(LOCAL_LYRICS)) {
      if (songLower.includes(key) || key.includes(songLower)) {
        const result = {
          lyrics,
          title: songQuery,
          artist: artist || extractArtistFromLyrics(lyrics) || "Unknown",
          source: "Local Database",
        };
        musicCache.set(searchKey, { data: result, timestamp: Date.now() });
        await sendLyricsResponse(sock, from, result);
        return;
      }
    }

    // Try online APIs with timeout and error handling
    const apis = [
      { name: "PopCat", fn: () => fetchFromPopCat(songQuery, artist) },
      { name: "Lyrist", fn: () => fetchFromLyrist(songQuery, artist) },
      { name: "LyricsOvh", fn: () => fetchFromLyricsOvh(songQuery, artist) },
      { name: "Genius", fn: () => fetchFromGenius(songQuery, artist) },
    ];

    for (const api of apis) {
      try {
        // Check rate limit for this API
        if (!checkApiRateLimit(api.name)) {
          console.log(`⚠️ Rate limited for ${api.name}, skipping...`);
          continue;
        }

        const result = await Promise.race([
          api.fn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 8000),
          ),
        ]);

        if (result && result.lyrics) {
          musicCache.set(searchKey, { data: result, timestamp: Date.now() });
          await sendLyricsResponse(sock, from, result);
          return;
        }
      } catch (e) {
        console.log(`Lyrics API ${api.name} failed:`, e.message);
        // Continue to next API
      }
    }

    // No lyrics found - try to get song info as fallback
    try {
      const songInfo = await fetchSongInfo(songQuery, artist);
      if (songInfo) {
        await sock.sendMessage(from, {
          text: formatInfo(
            "🎵 SONG INFORMATION",
            `*${songInfo.title}*\n` +
              `Artist: ${songInfo.artist}\n` +
              `Album: ${songInfo.album || "Unknown"}\n` +
              `Year: ${songInfo.year || "Unknown"}\n\n` +
              `_Lyrics not found, but here's the song information._`,
          ),
        });
        return;
      }
    } catch (e) {}

    // Ultimate fallback
    await sock.sendMessage(from, {
      text: formatInfo(
        "🎵 LYRICS NOT FOUND",
        `Could not find lyrics for "${songQuery}"${artist ? ` by ${artist}` : ""}.\n\n` +
          `💡 *Tips:*\n` +
          `• Include artist name: .lyrics ${songQuery} - Artist\n` +
          `• Check spelling\n` +
          `• Try a different song\n\n` +
          `🔍 *Try:* .music search ${songQuery}`,
      ),
    });
  } catch (error) {
    console.error("❌ Lyrics error:", error);
    await sock.sendMessage(from, {
      text: formatError(
        "LYRICS ERROR",
        "Could not fetch lyrics. Please try again.",
      ),
    });
  }
}

// Helper function to extract artist from lyrics
function extractArtistFromLyrics(lyrics) {
  const match = lyrics.match(/by (.*?)(?:\n|$)/);
  return match ? match[1].trim() : null;
}

// Fetch basic song info as fallback
async function fetchSongInfo(song, artist) {
  try {
    const query = artist ? `${song} ${artist}` : song;
    const res = await axios.get(
      `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`,
      { timeout: 5000 },
    );

    if (res.data?.data?.length > 0) {
      const track = res.data.data[0];
      return {
        title: track.title,
        artist: track.artist.name,
        album: track.album.title,
        year: track.release_date
          ? new Date(track.release_date).getFullYear()
          : null,
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ========== TRENDING MUSIC ==========
export async function musicTrending({ from, sock }) {
  try {
    await sock.sendMessage(from, { text: "📊 *Fetching trending music...*" });

    const res = await axios.get(
      "https://api.deezer.com/chart/0/tracks?limit=10",
      { timeout: 8000 },
    );

    if (res.data?.data?.length > 0) {
      let trendingList = "📈 *TRENDING SONGS*\n\n";

      res.data.data.forEach((track, index) => {
        const duration =
          Math.floor(track.duration / 60) +
          ":" +
          (track.duration % 60).toString().padStart(2, "0");

        trendingList += `${index + 1}. *${track.title}*\n`;
        trendingList += `   👤 ${track.artist.name}\n`;
        trendingList += `   💿 ${track.album.title}\n`;
        trendingList += `   ⏱️ ${duration}\n`;
        trendingList += `   🔥 Popularity: ${track.rank?.toLocaleString() || "N/A"}\n`;

        if (track.preview) {
          trendingList += `   🎵 Preview: ${track.preview}\n`;
        }
        trendingList += "\n";
      });

      await sock.sendMessage(from, {
        text: formatSuccess("🔥 TRENDING NOW", trendingList),
      });
    } else {
      throw new Error("No trending data");
    }
  } catch (error) {
    console.error("Trending error:", error);
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        "Could not fetch trending music. Using local data instead.",
      ),
    });

    // Fallback to local trending (random popular songs)
    const localTrending = Object.keys(LOCAL_LYRICS).slice(0, 5);
    let fallbackList = "📈 *TRENDING SONGS (Local)*\n\n";
    localTrending.forEach((song, i) => {
      fallbackList += `${i + 1}. *${song}*\n`;
    });
    await sock.sendMessage(from, {
      text: formatSuccess("🔥 TRENDING NOW", fallbackList),
    });
  }
}

// ========== RANDOM SONG ==========
export async function musicRandom({ from, sock }) {
  try {
    await sock.sendMessage(from, { text: "🎲 *Finding random song...*" });

    // Try to get from API first
    try {
      const res = await axios.get(
        "https://api.deezer.com/chart/0/tracks?limit=50",
        { timeout: 5000 },
      );

      if (res.data?.data?.length > 0) {
        const randomTrack =
          res.data.data[Math.floor(Math.random() * res.data.data.length)];

        const songInfo = {
          "🎵 Title": randomTrack.title,
          "👤 Artist": randomTrack.artist.name,
          "💿 Album": randomTrack.album.title,
          "⏱️ Duration":
            Math.floor(randomTrack.duration / 60) +
            ":" +
            (randomTrack.duration % 60).toString().padStart(2, "0"),
          "🔥 Rank": randomTrack.rank?.toLocaleString() || "N/A",
        };

        if (randomTrack.preview) {
          songInfo["🎧 Preview"] = randomTrack.preview;
        }

        await sock.sendMessage(from, {
          text: formatData("🎲 RANDOM SONG", songInfo),
        });
        return;
      }
    } catch (e) {
      console.log("API random failed, using local");
    }

    // Local fallback
    const localKeys = Object.keys(LOCAL_LYRICS);
    const randomLocal = localKeys[Math.floor(Math.random() * localKeys.length)];

    await sock.sendMessage(from, {
      text: formatSuccess(
        `🎵 RANDOM SONG`,
        `*${randomLocal}*\n\nUse .lyrics ${randomLocal} to get the full lyrics.`,
      ),
    });
  } catch (error) {
    console.error("Random error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not fetch random song."),
    });
  }
}

// ========== ARTIST INFO ==========
export async function musicArtist({ fullArgs, from, sock }) {
  if (!fullArgs || fullArgs.trim() === "") {
    await sock.sendMessage(from, {
      text: formatInfo(
        "👤 ARTIST INFO",
        "Usage: .artist <name>\nExample: .artist Ed Sheeran",
      ),
    });
    return;
  }

  try {
    await sock.sendMessage(from, {
      text: `👤 *Searching for artist: ${fullArgs}...*`,
    });

    const res = await axios.get(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(fullArgs)}&limit=1`,
      { timeout: 8000 },
    );

    if (res.data?.data?.length > 0) {
      const artist = res.data.data[0];

      // Get top tracks
      const tracksRes = await axios.get(
        `https://api.deezer.com/artist/${artist.id}/top?limit=5`,
        { timeout: 5000 },
      );

      let topTracks = "";
      if (tracksRes.data?.data?.length > 0) {
        topTracks =
          "\n\n*🎵 Top Tracks:*\n" +
          tracksRes.data.data
            .slice(0, 5)
            .map(
              (t, i) =>
                `${i + 1}. ${t.title} (${Math.floor(t.duration / 60)}:${(t.duration % 60).toString().padStart(2, "0")})`,
            )
            .join("\n");
      }

      // Get artist albums count
      const albumsRes = await axios.get(
        `https://api.deezer.com/artist/${artist.id}/albums?limit=1`,
        { timeout: 5000 },
      );

      const artistInfo = {
        "👤 Name": artist.name,
        "🎵 Top Tracks": tracksRes.data?.data?.length || 0,
        "💿 Total Albums":
          albumsRes.data?.total || artist.nb_album?.toLocaleString() || "N/A",
        "👥 Fans": artist.nb_fan?.toLocaleString() || "N/A",
        "🔗 Link": artist.link,
      };

      await sock.sendMessage(from, {
        text: formatData("👤 ARTIST INFORMATION", artistInfo) + topTracks,
      });
    } else {
      throw new Error("Artist not found");
    }
  } catch (error) {
    console.error("Artist error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not find artist "${fullArgs}".`),
    });
  }
}

// ========== ALBUM INFO ==========
export async function musicAlbum({ fullArgs, from, sock }) {
  if (!fullArgs || fullArgs.trim() === "") {
    await sock.sendMessage(from, {
      text: formatInfo(
        "💿 ALBUM INFO",
        "Usage: .album <name>\nExample: .album Divide",
      ),
    });
    return;
  }

  try {
    await sock.sendMessage(from, {
      text: `💿 *Searching for album: ${fullArgs}...*`,
    });

    const res = await axios.get(
      `https://api.deezer.com/search/album?q=${encodeURIComponent(fullArgs)}&limit=1`,
      { timeout: 8000 },
    );

    if (res.data?.data?.length > 0) {
      const album = res.data.data[0];

      // Get album tracks
      const tracksRes = await axios.get(
        `https://api.deezer.com/album/${album.id}/tracks?limit=20`,
        { timeout: 5000 },
      );

      let trackList = "";
      if (tracksRes.data?.data?.length > 0) {
        trackList =
          "\n\n*📝 Tracklist:*\n" +
          tracksRes.data.data
            .map(
              (t, i) =>
                `${i + 1}. ${t.title} (${Math.floor(t.duration / 60)}:${(t.duration % 60).toString().padStart(2, "0")})`,
            )
            .join("\n");

        if (tracksRes.data.total > tracksRes.data.data.length) {
          trackList += `\n... and ${tracksRes.data.total - tracksRes.data.data.length} more tracks`;
        }
      }

      const albumInfo = {
        "💿 Album": album.title,
        "👤 Artist": album.artist.name,
        "📅 Release": album.release_date || "N/A",
        "🎵 Tracks": album.nb_tracks || tracksRes.data?.total || "N/A",
        "⏱️ Duration": album.duration
          ? Math.floor(album.duration / 3600) +
            "h " +
            Math.floor((album.duration % 3600) / 60) +
            "m"
          : "N/A",
        "🔗 Link": album.link,
      };

      await sock.sendMessage(from, {
        text: formatData("💿 ALBUM INFORMATION", albumInfo) + trackList,
      });
    } else {
      throw new Error("Album not found");
    }
  } catch (error) {
    console.error("Album error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not find album "${fullArgs}".`),
    });
  }
}

// ========== SEARCH MUSIC ==========
export async function musicSearch({ fullArgs, from, sock }) {
  if (!fullArgs || fullArgs.trim() === "") {
    await sock.sendMessage(from, {
      text: formatInfo(
        "🔍 MUSIC SEARCH",
        "Usage: .search <query>\nExample: .search Ed Sheeran Perfect",
      ),
    });
    return;
  }

  try {
    await sock.sendMessage(from, {
      text: `🔍 *Searching for: ${fullArgs}...*`,
    });

    const res = await axios.get(
      `https://api.deezer.com/search?q=${encodeURIComponent(fullArgs)}&limit=8`,
      { timeout: 8000 },
    );

    if (res.data?.data?.length > 0) {
      let searchResults = "🔍 *SEARCH RESULTS*\n\n";

      res.data.data.forEach((track, index) => {
        const duration =
          Math.floor(track.duration / 60) +
          ":" +
          (track.duration % 60).toString().padStart(2, "0");

        searchResults += `${index + 1}. *${track.title}*\n`;
        searchResults += `   👤 ${track.artist.name}\n`;
        searchResults += `   💿 ${track.album.title}\n`;
        searchResults += `   ⏱️ ${duration}\n`;
        searchResults += `   🆔 ID: ${track.id}\n\n`;
      });

      searchResults += `_Total results: ${res.data.total}_\n`;
      searchResults += `_Use .play <id> to get song info_`;

      await sock.sendMessage(from, {
        text: formatSuccess("🔍 MUSIC SEARCH", searchResults),
      });
    } else {
      throw new Error("No results found");
    }
  } catch (error) {
    console.error("Search error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `No results found for "${fullArgs}".`),
    });
  }
}

// ========== PLAY/GET SONG INFO ==========
export async function musicDownload({ fullArgs, from, sock }) {
  if (!fullArgs || fullArgs.trim() === "") {
    await sock.sendMessage(from, {
      text: formatInfo(
        "⬇️ MUSIC INFO",
        "Usage: .play <song name or ID>\n" +
          "Example: .play 3135556\n" +
          "Example: .play Perfect Ed Sheeran\n\n" +
          "_First search with .search to get ID_",
      ),
    });
    return;
  }

  await sock.sendMessage(from, { text: "🎵 *Fetching song information...*" });

  try {
    let trackId = fullArgs;
    let track;

    // If not a numeric ID, search for it
    if (!/^\d+$/.test(fullArgs)) {
      const searchRes = await axios.get(
        `https://api.deezer.com/search?q=${encodeURIComponent(fullArgs)}&limit=1`,
        { timeout: 8000 },
      );

      if (searchRes.data?.data?.length > 0) {
        trackId = searchRes.data.data[0].id;
        track = searchRes.data.data[0];
      } else {
        throw new Error("Song not found");
      }
    } else {
      // Get track info by ID
      const trackRes = await axios.get(
        `https://api.deezer.com/track/${trackId}`,
        { timeout: 8000 },
      );
      track = trackRes.data;
    }

    const trackInfo = {
      "🎵 Title": track.title,
      "👤 Artist": track.artist.name,
      "💿 Album": track.album.title,
      "⏱️ Duration":
        Math.floor(track.duration / 60) +
        ":" +
        (track.duration % 60).toString().padStart(2, "0"),
      "📊 BPM": track.bpm || "N/A",
      "🔢 Track Number": track.track_position || "N/A",
    };

    if (track.preview) {
      trackInfo["🎧 Preview"] = track.preview;
    }

    trackInfo["🔗 Deezer"] = track.link;

    await sock.sendMessage(from, {
      text:
        formatData("🎵 TRACK INFORMATION", trackInfo) +
        "\n\n_Note: Direct download may not be available due to copyright._\n" +
        `_Try searching YouTube: https://www.youtube.com/results?search_query=${encodeURIComponent(track.title + " " + track.artist.name)}_`,
    });
  } catch (error) {
    console.error("Play error:", error);
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        "Could not find song. Try searching with .search first.",
      ),
    });
  }
}

// ========== GENIUS LYRICS ==========
export async function musicGenius({ fullArgs, from, sock }) {
  if (!fullArgs || fullArgs.trim() === "") {
    await sock.sendMessage(from, {
      text: formatInfo(
        "🎤 GENIUS LYRICS",
        "Usage: .genius <song>\nExample: .genius Lose Yourself",
      ),
    });
    return;
  }

  try {
    await sock.sendMessage(from, {
      text: `🔍 *Searching Genius for: ${fullArgs}...*`,
    });

    const result = await fetchFromGenius(fullArgs);

    if (result && result.lyrics) {
      await sendLyricsResponse(sock, from, result);
    } else {
      throw new Error("No lyrics found");
    }
  } catch (error) {
    console.error("Genius error:", error);
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Could not find lyrics on Genius for "${fullArgs}".`,
      ),
    });
  }
}

// ========== API FETCH FUNCTIONS ==========

async function fetchFromPopCat(song, artist) {
  const query = artist ? `${song} ${artist}` : song;
  const res = await axios.get(
    `https://api.popcat.xyz/lyrics?song=${encodeURIComponent(query)}`,
    { timeout: 8000 },
  );

  if (res.data && res.data.lyrics) {
    return {
      lyrics: res.data.lyrics,
      title: res.data.title || song,
      artist: res.data.artist || artist || "Unknown",
      image: res.data.image,
      source: "PopCat",
    };
  }
  throw new Error("No lyrics from PopCat");
}

async function fetchFromLyrist(song, artist) {
  const query = artist ? `${song}/${artist}` : song;
  const res = await axios.get(
    `https://lyrist.vercel.app/api/${encodeURIComponent(query)}`,
    { timeout: 8000 },
  );

  if (res.data && res.data.lyrics) {
    return {
      lyrics: res.data.lyrics,
      title: res.data.title || song,
      artist: res.data.artist || artist || "Unknown",
      source: "Lyrist",
    };
  }
  throw new Error("No lyrics from Lyrist");
}

async function fetchFromLyricsOvh(song, artist) {
  if (!artist) {
    // Try to guess artist from song
    const searchRes = await axios.get(
      `https://api.deezer.com/search?q=${encodeURIComponent(song)}&limit=1`,
      { timeout: 5000 },
    );

    if (searchRes.data?.data?.length > 0) {
      artist = searchRes.data.data[0].artist.name;
    } else {
      artist = "unknown";
    }
  }

  const artistParam = encodeURIComponent(artist);
  const songParam = encodeURIComponent(song);

  const res = await axios.get(
    `https://api.lyrics.ovh/v1/${artistParam}/${songParam}`,
    { timeout: 8000 },
  );

  if (res.data && res.data.lyrics) {
    return {
      lyrics: res.data.lyrics,
      title: song,
      artist: artist,
      source: "Lyrics.ovh",
    };
  }
  throw new Error("No lyrics from Lyrics.ovh");
}

async function fetchFromGenius(song, artist) {
  const searchRes = await axios.get(
    `https://genius.com/api/search/multi?q=${encodeURIComponent(song + (artist ? ` ${artist}` : ""))}`,
    { timeout: 8000 },
  );

  const hits = searchRes.data?.response?.sections
    ?.flatMap((s) => s.hits)
    .filter((h) => h.type === "song");

  if (hits?.length > 0) {
    let bestMatch = hits[0];
    if (artist) {
      const artistMatch = hits.find((h) =>
        h.result.artist_names?.toLowerCase().includes(artist.toLowerCase()),
      );
      if (artistMatch) bestMatch = artistMatch;
    }

    const songUrl = bestMatch.result.url;
    const lyricsRes = await axios.get(songUrl, {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const $ = cheerio.load(lyricsRes.data);

    // Try different Genius selectors
    let lyrics =
      $('[data-lyrics-container="true"]').text() ||
      $(".lyrics").text() ||
      $(".song_body-lyrics").text();

    if (lyrics) {
      // Clean up the lyrics
      lyrics = lyrics.replace(/\[.*?\]/g, "").trim();

      return {
        lyrics,
        title: bestMatch.result.title,
        artist: bestMatch.result.artist_names,
        image: bestMatch.result.song_art_image_url,
        url: songUrl,
        source: "Genius",
      };
    }
  }
  throw new Error("No lyrics from Genius");
}

// ========== SEND LYRICS RESPONSE ==========
async function sendLyricsResponse(sock, from, data, cached = false) {
  const { lyrics, title, artist, source, url } = data;

  // Clean up lyrics
  let cleanLyrics = lyrics
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Truncate if too long
  const MAX_LENGTH = 4000;
  if (cleanLyrics.length > MAX_LENGTH) {
    // Try to split at a natural break
    const truncated = cleanLyrics.substring(0, MAX_LENGTH);
    const lastPeriod = truncated.lastIndexOf(".");
    const lastNewline = truncated.lastIndexOf("\n");
    const breakPoint = Math.max(lastPeriod, lastNewline);

    if (breakPoint > MAX_LENGTH - 500) {
      cleanLyrics =
        truncated.substring(0, breakPoint + 1) +
        `\n\n... [Lyrics truncated. Full lyrics at ${url || "source"}]`;
    } else {
      cleanLyrics =
        truncated +
        `\n\n... [Lyrics truncated. Full lyrics at ${url || "source"}]`;
    }
  }

  const header = `🎵 *${title}*${artist ? ` by *${artist}*` : ""}`;
  const footer =
    `\n\n━━━━━━━━━━━━━━━━━━━━━\n` +
    `📡 Source: ${source}${cached ? " (cached)" : ""}\n` +
    `⚡ *AYOBOT v1* | 👑 Created by AYOCODES`;

  await sock.sendMessage(from, {
    text: formatSuccess(header, cleanLyrics + footer),
  });
}

// ========== SHOW MUSIC HELP ==========
async function showMusicHelp(from, sock) {
  const helpText = `🎵 *MUSIC COMMANDS*

*Main Commands:*
• .music <song> - Get lyrics (alias: .lyrics)
• .music <song> - <artist> - Lyrics with artist
• .trending - Top 10 trending songs
• .random - Random song
• .search <query> - Search for songs
• .artist <name> - Artist information
• .album <name> - Album information
• .play <id> - Get song info
• .genius <song> - Genius lyrics

*Examples:*
.music Shape of You
.lyrics Perfect - Ed Sheeran
.trending
.artist Drake
.search Adele Hello
.play 3135556

━━━━━━━━━━━━━━━━━━━━━
⚡ *AYOBOT v1* | 👑 Created by AYOCODES`;

  await sock.sendMessage(from, {
    text: formatInfo("🎵 MUSIC HUB", helpText),
  });
}

// ========== EXPORTS ==========
export default {
  music,
  musicLyrics,
  musicTrending,
  musicRandom,
  musicArtist,
  musicAlbum,
  musicSearch,
  musicDownload,
  musicGenius,
};
