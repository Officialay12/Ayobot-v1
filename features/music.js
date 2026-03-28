// features/music.js — AYOBOT v1.0.0 (COMPLETE FIX)
// Add this at the end of your music.js file, replacing the incomplete exports section

// ============================================================================
//  MUSIC UTILITY FUNCTIONS (Add these if they don't exist)
// ============================================================================

// Lyrics function
export async function musicLyrics({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎵 LYRICS SEARCH",
        `Usage: *${ENV.PREFIX}lyrics <song name>*\n\n` +
          `Examples:\n` +
          `• ${ENV.PREFIX}lyrics Lose Yourself\n` +
          `• ${ENV.PREFIX}lyrics Shape of You\n` +
          `• ${ENV.PREFIX}lyrics Billie Eilish Wildflower`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: `🔍 *Searching lyrics for:* "${fullArgs.trim()}"\n⏳ _Please wait..._`,
  });

  try {
    const query = encodeURIComponent(fullArgs.trim());
    const response = await axios.get(
      `https://api.lyrics.ovh/v1/${query.replace(/ /g, "%20")}`,
      { timeout: 10000 },
    );

    if (!response.data?.lyrics) {
      throw new Error("No lyrics found");
    }

    let lyrics = response.data.lyrics;
    if (lyrics.length > 4000) {
      lyrics = lyrics.substring(0, 3900) + "\n\n... (truncated)";
    }

    await sock.sendMessage(from, {
      text: `🎵 *${fullArgs.trim()}*\n\n${lyrics}\n\n${TAG}`,
    });
  } catch (error) {
    // Fallback to Genius
    try {
      const geniusRes = await axios.get(
        `https://api.genius.com/search?q=${encodeURIComponent(fullArgs.trim())}`,
        {
          headers: {
            Authorization: `Bearer ${ENV.GENIUS_API_KEY || ""}`,
          },
          timeout: 10000,
        },
      );

      const hit = geniusRes.data?.response?.hits?.[0];
      if (hit?.result?.url) {
        return sock.sendMessage(from, {
          text: formatInfo(
            "LYRICS FOUND",
            `*${hit.result.title}* by ${hit.result.primary_artist?.name}\n\n` +
              `📖 *Full lyrics:* ${hit.result.url}\n\n` +
              `_Lyrics too long to display, click the link above._`,
          ),
        });
      }
      throw new Error("No lyrics found");
    } catch (fallbackError) {
      return sock.sendMessage(from, {
        text: formatError(
          "LYRICS NOT FOUND",
          `Could not find lyrics for *"${fullArgs.trim()}"*\n\n` +
            `💡 *Tips:*\n` +
            `• Try with artist name: *${ENV.PREFIX}lyrics Lose Yourself Eminem*\n` +
            `• Check spelling\n` +
            `• Try a different song`,
        ),
      });
    }
  }
}

// Trending function
export async function musicTrending({ from, sock }) {
  await sock.sendMessage(from, {
    text: `🔍 *Fetching trending songs...*\n⏳ _Please wait..._`,
  });

  try {
    const response = await axios.get(
      "https://api.deezer.com/chart/0/tracks?limit=10",
      { timeout: 10000 },
    );

    const tracks = response.data?.data || [];
    if (!tracks.length) {
      throw new Error("No trending songs found");
    }

    let message = "🔥 *TRENDING SONGS*\n\n";
    tracks.forEach((track, i) => {
      message += `${i + 1}. *${track.title}*\n`;
      message += `   👤 ${track.artist?.name}\n`;
      message += `   🎵 ${track.album?.title || "Single"}\n\n`;
    });
    message += `\n${TAG}`;

    await sock.sendMessage(from, { text: message });
  } catch (error) {
    // Fallback to Deezer search
    try {
      const fallbackRes = await axios.get(
        "https://api.deezer.com/chart/0/tracks?limit=10",
        { timeout: 10000 },
      );
      const tracks = fallbackRes.data?.data || [];
      if (!tracks.length) throw new Error("No data");

      let message = "🔥 *TRENDING SONGS*\n\n";
      tracks.forEach((track, i) => {
        message += `${i + 1}. *${track.title}*\n`;
        message += `   👤 ${track.artist?.name}\n`;
        message += `   🎧 ${track.preview ? "Preview available" : "No preview"}\n\n`;
      });
      message += `\n${TAG}`;

      await sock.sendMessage(from, { text: message });
    } catch (fallbackError) {
      return sock.sendMessage(from, {
        text: formatError(
          "TRENDING UNAVAILABLE",
          `Could not fetch trending songs.\n\n` +
            `Try: *${ENV.PREFIX}play* to search for specific songs instead.`,
        ),
      });
    }
  }
}

// Random song function
export async function musicRandom({ from, sock }) {
  await sock.sendMessage(from, {
    text: `🎲 *Finding a random song...*\n⏳ _Please wait..._`,
  });

  try {
    const randomId = Math.floor(Math.random() * 1000000) + 1;
    const response = await axios.get(
      `https://api.deezer.com/track/${randomId}`,
      { timeout: 10000 },
    );

    const track = response.data;
    if (!track?.id) {
      throw new Error("No random track found");
    }

    const message =
      `🎲 *RANDOM SONG*\n\n` +
      `🎵 *${track.title}*\n` +
      `👤 *Artist:* ${track.artist?.name || "Unknown"}\n` +
      `💿 *Album:* ${track.album?.title || "Single"}\n` +
      `⏱️ *Duration:* ${fmtDur(track.duration)}\n` +
      (track.preview ? `🎧 *Preview:* ${track.preview}\n` : "") +
      `\n${TAG}`;

    await sock.sendMessage(from, { text: message });
  } catch (error) {
    // If Deezer fails, return a popular song
    const popularSongs = [
      "Shape of You",
      "Blinding Lights",
      "Dance Monkey",
      "Someone You Loved",
      "Bad Guy",
    ];
    const randomSong =
      popularSongs[Math.floor(Math.random() * popularSongs.length)];

    return sock.sendMessage(from, {
      text: formatInfo(
        "RANDOM SONG SUGGESTION",
        `🎲 *Try this popular song:*\n\n` +
          `*${randomSong}*\n\n` +
          `Use *${ENV.PREFIX}play ${randomSong}* to download it!`,
      ),
    });
  }
}

// Artist info function
export async function musicArtist({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎤 ARTIST INFO",
        `Usage: *${ENV.PREFIX}artist <artist name>*\n\n` +
          `Examples:\n` +
          `• ${ENV.PREFIX}artist Eminem\n` +
          `• ${ENV.PREFIX}artist Billie Eilish\n` +
          `• ${ENV.PREFIX}artist Taylor Swift`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: `🔍 *Searching for:* "${fullArgs.trim()}"\n⏳ _Please wait..._`,
  });

  try {
    const query = encodeURIComponent(fullArgs.trim());
    const response = await axios.get(
      `https://api.deezer.com/search/artist?q=${query}&limit=1`,
      { timeout: 10000 },
    );

    const artist = response.data?.data?.[0];
    if (!artist?.id) {
      throw new Error("Artist not found");
    }

    // Get full artist details
    const artistDetails = await axios.get(
      `https://api.deezer.com/artist/${artist.id}`,
      { timeout: 10000 },
    );

    const details = artistDetails.data;
    const topTracks = await axios.get(
      `https://api.deezer.com/artist/${artist.id}/top?limit=5`,
      { timeout: 10000 },
    );

    let topTracksList = "";
    if (topTracks.data?.data?.length) {
      topTracksList = "\n🎵 *Top Tracks:*\n";
      topTracks.data.data.forEach((track, i) => {
        topTracksList += `${i + 1}. ${track.title}\n`;
      });
    }

    const message =
      `🎤 *ARTIST: ${details.name}*\n\n` +
      (details.nb_fan
        ? `👥 *Fans:* ${details.nb_fan.toLocaleString()}\n`
        : "") +
      (details.nb_album ? `💿 *Albums:* ${details.nb_album}\n` : "") +
      (details.radio
        ? `📻 *Radio:* ${details.radio ? "Available" : "N/A"}\n`
        : "") +
      topTracksList +
      `\n${TAG}`;

    await sock.sendMessage(from, { text: message });
  } catch (error) {
    return sock.sendMessage(from, {
      text: formatError(
        "ARTIST NOT FOUND",
        `Could not find artist *"${fullArgs.trim()}"*\n\n` +
          `💡 *Tips:*\n` +
          `• Check spelling\n` +
          `• Try with full name\n` +
          `• Use *${ENV.PREFIX}play* to search for their songs instead`,
      ),
    });
  }
}

// Album info function
export async function musicAlbum({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "💿 ALBUM INFO",
        `Usage: *${ENV.PREFIX}album <album name>*\n\n` +
          `Examples:\n` +
          `• ${ENV.PREFIX}album The Eminem Show\n` +
          `• ${ENV.PREFIX}album Happier Than Ever`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: `🔍 *Searching for album:* "${fullArgs.trim()}"\n⏳ _Please wait..._`,
  });

  try {
    const query = encodeURIComponent(fullArgs.trim());
    const response = await axios.get(
      `https://api.deezer.com/search/album?q=${query}&limit=1`,
      { timeout: 10000 },
    );

    const album = response.data?.data?.[0];
    if (!album?.id) {
      throw new Error("Album not found");
    }

    const albumDetails = await axios.get(
      `https://api.deezer.com/album/${album.id}`,
      { timeout: 10000 },
    );

    const details = albumDetails.data;
    let tracksList = "";
    if (details.tracks?.data?.length) {
      tracksList = "\n🎵 *Tracklist:*\n";
      details.tracks.data.forEach((track, i) => {
        tracksList += `${i + 1}. ${track.title} (${fmtDur(track.duration)})\n`;
      });
      if (details.tracks.data.length > 10) {
        tracksList += `\n_... and ${details.tracks.data.length - 10} more tracks_`;
      }
    }

    const message =
      `💿 *ALBUM: ${details.title}*\n\n` +
      `👤 *Artist:* ${details.artist?.name || "Unknown"}\n` +
      `📅 *Release:* ${details.release_date || "Unknown"}\n` +
      (details.nb_tracks ? `🎵 *Tracks:* ${details.nb_tracks}\n` : "") +
      (details.fans ? `👥 *Fans:* ${details.fans.toLocaleString()}\n` : "") +
      tracksList +
      `\n${TAG}`;

    await sock.sendMessage(from, { text: message });
  } catch (error) {
    return sock.sendMessage(from, {
      text: formatError(
        "ALBUM NOT FOUND",
        `Could not find album *"${fullArgs.trim()}"*\n\n` +
          `💡 *Tips:*\n` +
          `• Check spelling\n` +
          `• Try with artist name: *${ENV.PREFIX}album Eminem Show*\n` +
          `• Use *${ENV.PREFIX}artist* to find an artist's albums`,
      ),
    });
  }
}

// Music search function
export async function musicSearch({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎵 MUSIC SEARCH",
        `Usage: *${ENV.PREFIX}musicsearch <song name>*\n\n` +
          `Examples:\n` +
          `• ${ENV.PREFIX}musicsearch Lose Yourself\n` +
          `• ${ENV.PREFIX}musicsearch Shape of You\n\n` +
          `💡 Use *${ENV.PREFIX}play* to download the song!`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: `🔍 *Searching for:* "${fullArgs.trim()}"\n⏳ _Please wait..._`,
  });

  try {
    const query = encodeURIComponent(fullArgs.trim());
    const response = await axios.get(
      `https://api.deezer.com/search?q=${query}&limit=5`,
      { timeout: 10000 },
    );

    const tracks = response.data?.data || [];
    if (!tracks.length) {
      throw new Error("No results found");
    }

    let message = `🔍 *SEARCH RESULTS FOR:* "${fullArgs.trim()}"\n\n`;
    tracks.forEach((track, i) => {
      message += `${i + 1}. *${track.title}*\n`;
      message += `   👤 ${track.artist?.name}\n`;
      message += `   💿 ${track.album?.title || "Single"}\n`;
      message += `   ⏱️ ${fmtDur(track.duration)}\n`;
      message += `   🎧 ${track.preview ? "Preview available" : "No preview"}\n\n`;
    });
    message += `💡 *To download:* ${ENV.PREFIX}play ${fullArgs.trim()}\n\n${TAG}`;

    await sock.sendMessage(from, { text: message });
  } catch (error) {
    return sock.sendMessage(from, {
      text: formatError(
        "SEARCH FAILED",
        `Could not find songs matching *"${fullArgs.trim()}"*\n\n` +
          `💡 *Tips:*\n` +
          `• Check spelling\n` +
          `• Try with artist name\n` +
          `• Use *${ENV.PREFIX}play* to search and download directly`,
      ),
    });
  }
}

// Genius lyrics function
export async function musicGenius({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎵 GENIUS LYRICS",
        `Usage: *${ENV.PREFIX}genius <song name>*\n\n` +
          `Examples:\n` +
          `• ${ENV.PREFIX}genius Lose Yourself\n` +
          `• ${ENV.PREFIX}genius Shape of You\n\n` +
          `_Powered by Genius.com_`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: `🔍 *Searching Genius for:* "${fullArgs.trim()}"\n⏳ _Please wait..._`,
  });

  try {
    const response = await axios.get(
      `https://api.genius.com/search?q=${encodeURIComponent(fullArgs.trim())}`,
      {
        headers: {
          Authorization: `Bearer ${ENV.GENIUS_API_KEY || ""}`,
        },
        timeout: 10000,
      },
    );

    const hit = response.data?.response?.hits?.[0];
    if (!hit?.result?.url) {
      throw new Error("No Genius page found");
    }

    const result = hit.result;
    const message =
      `🎵 *${result.title}*\n` +
      `👤 *Artist:* ${result.primary_artist?.name}\n\n` +
      `📖 *Full lyrics and annotations:*\n` +
      `${result.url}\n\n` +
      `${TAG}`;

    await sock.sendMessage(from, { text: message });
  } catch (error) {
    return sock.sendMessage(from, {
      text: formatError(
        "GENIUS NOT FOUND",
        `Could not find *"${fullArgs.trim()}"* on Genius\n\n` +
          `💡 Try: *${ENV.PREFIX}lyrics ${fullArgs.trim()}* for plain lyrics instead`,
      ),
    });
  }
}

// Music hub function
export async function music({ from, sock }) {
  const message =
    `🎵 *AYOBOT MUSIC HUB*\n\n` +
    `📋 *Available Music Commands:*\n\n` +
    `🎵 *${ENV.PREFIX}play <song>* - Download and play music\n` +
    `📝 *${ENV.PREFIX}lyrics <song>* - Get song lyrics\n` +
    `🔥 *${ENV.PREFIX}trending* - View trending songs\n` +
    `🎲 *${ENV.PREFIX}random* - Random song suggestion\n` +
    `🎤 *${ENV.PREFIX}artist <name>* - Artist information\n` +
    `💿 *${ENV.PREFIX}album <name>* - Album information\n` +
    `🔍 *${ENV.PREFIX}musicsearch <song>* - Search for songs\n` +
    `📖 *${ENV.PREFIX}genius <song>* - Genius lyrics & annotations\n\n` +
    `💡 *Examples:*\n` +
    `• ${ENV.PREFIX}play Lose Yourself\n` +
    `• ${ENV.PREFIX}lyrics Shape of You\n` +
    `• ${ENV.PREFIX}artist Eminem\n\n` +
    `${TAG}`;

  await sock.sendMessage(from, { text: message });
}

// ============================================================================
//  DEFAULT EXPORT (COMPLETE)
// ============================================================================
export default {
  music, // Music hub menu
  musicLyrics, // Lyrics search
  musicTrending, // Trending songs
  musicRandom, // Random song
  musicSearch, // Search for songs
  musicDownload, // Download music (the .play command)
  musicArtist, // Artist info
  musicAlbum, // Album info
  musicGenius, // Genius lyrics

  // Aliases for easier access
  lyrics: musicLyrics,
  trending: musicTrending,
  random: musicRandom,
  search: musicSearch,
  play: musicDownload,
  artist: musicArtist,
  album: musicAlbum,
  genius: musicGenius,
};
