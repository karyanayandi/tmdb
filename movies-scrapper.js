const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

// Ganti dengan API Key dari TMDB
const TMDB_API_KEY = "b08364c6e443363275695e6752510848";

// Base URL untuk TMDB API
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Fungsi untuk membaca file JSON lokal
const readLocalMovieIds = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        return reject(`Error reading file: ${err}`);
      }
      const movieIds = data
        .split("\n")
        .map((line) => {
          try {
            const json = JSON.parse(line);
            return json.id && !json.adult ? { id: json.id } : null; // Ambil hanya ID
          } catch (parseError) {
            console.warn(
              `Error parsing line: ${line}. Error: ${parseError.message}`
            );
            return null;
          }
        })
        .filter(Boolean)
        .slice(0, 2);

      resolve(movieIds);
    });
  });
};

// Fungsi untuk mengambil detail film berdasarkan ID
const fetchMovieDetails = async (movieId) => {
  const url = `${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}`;

  try {
    const response = await axios.get(url);
    return response.data; // Kembalikan data detail film
  } catch (error) {
    console.error(`Error fetching movie details for ID ${movieId}:`, error);
    return null;
  }
};

// Fungsi untuk mengunduh gambar dan mengubahnya menjadi Blob
const downloadImageAsBlob = async (imagePath) => {
  if (!imagePath) return null; // Kembali jika tidak ada path gambar
  try {
    const response = await axios.get(
      `https://image.tmdb.org/t/p/original${imagePath}`,
      {
        responseType: "arraybuffer",
      }
    );
    return {
      blob: Buffer.from(response.data),
      contentType: response.headers["content-type"],
    };
  } catch (error) {
    console.error(`Error downloading image from TMDB: ${error.message}`);
    return null;
  }
};

// Fungsi untuk mengupload gambar ke API
const uploadImageToApi = async (logoBlob, contentType, title) => {
  try {
    const formData = new FormData(); // Buat instance FormData
    const ext = contentType.split("/")[1]; // Ambil ekstensi dari content-type
    const filename = `${title.replace(/\s+/g, "_")}.${ext}`; // Ubah nama file berdasarkan ekstensi
    formData.append("file", logoBlob, { filename, contentType }); // Tambahkan Blob sebagai file
    formData.append("type", "movie"); // Tambahkan tipe data

    const response = await axios.post(
      "http://localhost:3000/api/public/media/image", // URL endpoint untuk upload gambar
      formData,
      {
        headers: {
          ...formData.getHeaders(), // Sertakan header dari FormData
        },
      }
    );

    console.log(`Uploaded logo for company: ${title}`);
    return { data: response.data };
  } catch (error) {
    console.error("Error uploading image to API:", error.message);
  }
};
// Fungsi untuk mengirim data film ke API
const sendMovieDataToApi = async (data) => {
  try {
    const response = await axios.post(
      "http://localhost:3000/api/public/movie/create",
      data
    );
    console.log(`Inserted movie data: ${data.title}`);
  } catch (error) {
    console.error("Error inserting movie data to API:", error.message);
  }
};

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

// Fungsi untuk mengambil data berdasarkan genre ID
const getGenreByTmdbId = async (tmdbId) => {
  try {
    const response = await axios.get(
      `http://localhost:3000/api/public/genre/by-tmdb-id/${tmdbId}`
    );
    return response.data; // Kembalikan data genre yang sesuai
  } catch (error) {
    console.error(`Error fetching genre for TMDB ID ${tmdbId}:`, error.message);
    return []; // Kembalikan array kosong jika ada kesalahan
  }
};

// Fungsi untuk mengambil data production company berdasarkan TMDB ID
const getProductionCompanyByTmdbId = async (tmdbId) => {
  try {
    const response = await axios.get(
      `http://localhost:3000/api/public/production-company/by-tmdb-id/${tmdbId}`
    );
    return response.data; // Kembalikan data production company yang sesuai
  } catch (error) {
    console.error(
      `Error fetching production company for TMDB ID ${tmdbId}:`,
      error.message
    );
    return []; // Kembalikan array kosong jika ada kesalahan
  }
};

// Fungsi utama untuk menjalankan scraping berdasarkan file JSON lokal
const runTmdbScraper = async () => {
  const filePath = "./movies.json"; // Path ke file JSON lokal yang berisi ID film
  try {
    const movieIds = await readLocalMovieIds(filePath);

    if (movieIds.length === 0) {
      console.log("No movie IDs found in local file.");
      return;
    }

    const fetchWithRateLimit = rateLimit(fetchMovieDetails, 40, 225); // 225ms untuk mencapai 40 request dalam 9 detik

    for (const movie of movieIds) {
      const movieDetails = await fetchWithRateLimit(movie.id);
      if (movieDetails) {
        let poster_url = "";
        let backdrop_url = "";

        const genres = await Promise.all(
          movieDetails.genres.map(async (genre) => {
            return await getGenreByTmdbId(genre.id);
          })
        );

        const productionCompanies = await Promise.all(
          movieDetails.production_companies.map(async (production_company) => {
            return await getProductionCompanyByTmdbId(production_company.id);
          })
        );

        if (movieDetails.poster_path) {
          const posterImageData = await downloadImageAsBlob(
            movieDetails.poster_path
          );

          if (posterImageData?.blob) {
            const posterResults = await uploadImageToApi(
              posterImageData.blob,
              posterImageData?.contentType,
              movieDetails.title
            );
            if (posterResults?.data?.url) {
              poster_url = posterResults.url;
            }
          }
        }

        if (movieDetails.backdrop_path) {
          const backdropImageData = await downloadImageAsBlob(
            movieDetails.backdrop_path
          );

          if (backdropImageData?.blob) {
            const backdropResults = await uploadImageToApi(
              backdropImageData.blob,
              backdropImageData?.contentType,
              movieDetails.title
            );
            if (backdropResults?.data?.url) {
              backdrop_url = backdropResults?.data?.url;
            }
          }
        }

        // Data yang akan dikirim
        const dataToSend = {
          language: "en", // Tentukan bahasa default
          imdbId: movieDetails.imdb_id?.toString() ?? "", // Jika tidak ada, gunakan string kosong
          tmdbId: movieDetails.id?.toString(), // Pastikan ID TMDB dalam bentuk string
          title: movieDetails.title,
          overview: movieDetails.overview
            ? `${movieDetails.overview}\n\nSource: IMDB`
            : "", // Jika tidak ada, gunakan string kosong
          releaseDate: movieDetails.release_date
            ? new Date(movieDetails.release_date).toISOString()
            : null, // Konversi ke Date atau null
          originalLanguage: movieDetails.original_language ?? "", // Ambil original_language
          backdrop: backdrop_url ?? "", // Sertakan URL backdrop jika ada
          poster: poster_url ?? "",
          tagline: movieDetails.tagline,
          status: movieDetails.status,
          originCountry: movieDetails.origin_country?.[0] ?? "",
          spokenLanguaeg: movieDetails.spoken_language,
          budget: movieDetails.budget,
          revenue: movieDetails.revenue,
          runtime: movieDetails.runtime,
          homepage: movieDetails.homepage,
          genres: genres.map((genre) => genre.id?.toString()), // Ambil genre ID sebagai array string
          productionCompanies: productionCompanies.map((company) =>
            company.id?.toString()
          ), // Ambil production company ID sebagai array string
        };

        // Kirim langsung detail film ke API
        await sendMovieDataToApi(dataToSend);
        console.log(
          `Fetched and inserted details for movie ID ${movie.id}: ${movieDetails.title}`
        );
      }
    }
  } catch (error) {
    console.error("Error during scraping:", error);
  }
};

// Menjalankan fungsi scraper
runTmdbScraper();
