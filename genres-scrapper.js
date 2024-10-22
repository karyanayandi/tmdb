const axios = require("axios");

// Ganti dengan API Key dari TMDB
const TMDB_API_KEY = "b08364c6e443363275695e6752510848";

// Base URL untuk TMDB API
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const rateLimit = (func, limit, interval) => {
  let calls = 0;
  const queue = [];

  const processQueue = () => {
    if (calls < limit && queue.length > 0) {
      calls++;
      const { resolve, reject, args } = queue.shift();
      func(...args)
        .then(resolve)
        .catch(reject)
        .finally(() => {
          calls--;
          processQueue();
        });
    }
  };

  return (...args) => {
    return new Promise((resolve, reject) => {
      queue.push({ resolve, reject, args });
      setTimeout(processQueue, interval);
    });
  };
};

const fetchMovieGenres = async () => {
  const url = `${TMDB_BASE_URL}/genre/movie/list?language=en&api_key=${TMDB_API_KEY}`;

  try {
    const response = await axios.get(url);
    return response.data.genres; // Kembalikan daftar genre film
  } catch (error) {
    console.error("Error fetching movie genres from TMDB:", error);
    return [];
  }
};

// Fungsi untuk mengambil daftar genre TV
const fetchTvGenres = async () => {
  const url = `${TMDB_BASE_URL}/genre/tv/list?language=en&api_key=${TMDB_API_KEY}`;

  try {
    const response = await axios.get(url);
    return response.data.genres; // Kembalikan daftar genre TV
  } catch (error) {
    console.error("Error fetching TV genres from TMDB:", error);
    return [];
  }
};

// Fungsi untuk mengirim data genre ke endpoint baru
const sendToApi = async (genre) => {
  try {
    const response = await axios.post(
      "http://beta.nsmna.co/api/public/genre/create",
      genre,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    console.log(`Inserted genre: ${genre.title} (ID: ${genre.tmdbId})`);
  } catch (error) {
    console.error("Error inserting data to API:", error.message);
  }
};

// Fungsi utama untuk menjalankan scrapping genre
const runGenreScraper = async () => {
  try {
    // Buat versi rate-limited dari fetchMovieGenres dan fetchTvGenres
    const fetchWithRateLimit = rateLimit(
      async (fetchFunction) => {
        return await fetchFunction();
      },
      20,
      500
    ); // 20 request per 5 detik

    // Fetch genre film dan genre TV secara bersamaan dengan rate limit
    const [movieGenres, tvGenres] = await Promise.all([
      fetchWithRateLimit(fetchMovieGenres),
      fetchWithRateLimit(fetchTvGenres),
    ]);

    // Gabungkan hasil genre film dan genre TV dengan tipe yang sesuai
    const formattedGenres = [
      ...movieGenres.map((genre) => ({
        id: genre.id, // Gunakan ID dari genre film
        title: genre.name,
        language: "en", // Tandai sebagai genre film
      })),
      ...tvGenres.map((genre) => ({
        id: genre.id, // Gunakan ID dari genre TV
        title: genre.name,
        language: "en", // Tandai sebagai genre TV
      })),
    ];

    const uniqueGenres = [];
    const seenIds = new Set();

    for (const genre of formattedGenres) {
      if (!seenIds.has(genre.id)) {
        seenIds.add(genre.id);
        uniqueGenres.push(genre);
      }
    }

    for (const genre of uniqueGenres) {
      await sendToApi({ ...genre, tmdbId: genre.id.toString() });
    }
  } catch (error) {
    console.error("Error during genre scraping:", error);
  }
};

runGenreScraper();
