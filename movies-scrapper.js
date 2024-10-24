const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const startIndex = parseInt(process.argv[2], 10) || 0; // Nilai default 0 jika tidak ada input
const endIndex = parseInt(process.argv[3], 10) || 10000; // Nilai default 10000 jika tidak ada input

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
        .slice(startIndex, endIndex);

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
      "https://beta.nsmna.co/api/public/media/image", // URL endpoint untuk upload gambar
      formData,
      {
        headers: {
          ...formData.getHeaders(), // Sertakan header dari FormData
        },
      }
    );

    console.log(`Uploaded logo for movie: ${title}`);
    return { data: response.data };
  } catch (error) {
    console.error("Error uploading image to API:", error.message);
    return null; // Jika gagal, kembalikan null
  }
};

// Fungsi untuk mengirim data film ke API
const sendMovieDataToApi = async (data) => {
  try {
    const response = await axios.post(
      "https://beta.nsmna.co/api/public/movie/create",
      data
    );
    console.log(`Inserted movie data: ${data.title}`);
  } catch (error) {
    console.error("Error inserting movie data to API:", error.message);
    throw error; // Tambahkan throw untuk menandakan kegagalan
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
      `https://beta.nsmna.co/api/public/genre/by-tmdb-id/${tmdbId}`
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
      `https://beta.nsmna.co/api/public/production-company/by-tmdb-id/${tmdbId}`
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

// Fungsi untuk menambahkan ID film ke file error
const logErrorMovie = (id) => {
  const errorData = {
    id: id,
  };

  // Append the JSON object to the error file, one per line
  fs.appendFileSync("error_movie_ids.json", JSON.stringify(errorData) + "\n");
  console.log(`Logged error movie ID: ${id}`);
};
const logUncompleted = (id) => {
  const errorData = {
    id: id,
  };

  // Append the JSON object to the error file, one per line
  fs.appendFileSync("movie_ids.json", JSON.stringify(errorData) + "\n");
  console.log(`Logged uncompleted movie ID: ${id}`);
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

        try {
          const genres = await Promise.all(
            movieDetails.genres.map(async (genre) => {
              return await getGenreByTmdbId(genre.id);
            })
          );

          const productionCompanies = await Promise.all(
            movieDetails.production_companies.map(
              async (production_company) => {
                return await getProductionCompanyByTmdbId(
                  production_company.id
                );
              }
            )
          );

          // Proses poster
          if (movieDetails.poster_path) {
            const posterImageData = await downloadImageAsBlob(
              movieDetails.poster_path
            );
            if (posterImageData?.blob) {
              const posterResults = await uploadImageToApi(
                posterImageData.blob,
                posterImageData.contentType,
                movieDetails.title
              );
              if (posterResults && posterResults?.data?.[0]?.url) {
                poster_url = posterResults?.data?.[0]?.url;
              } else {
                // Jika gagal upload, tambahkan ID film ke file error
                throw new Error("Poster upload failed");
              }
            } else {
              throw new Error("Poster download failed");
            }
          }

          // Proses backdrop
          if (movieDetails.backdrop_path) {
            const backdropImageData = await downloadImageAsBlob(
              movieDetails.backdrop_path
            );
            if (backdropImageData?.blob) {
              const backdropResults = await uploadImageToApi(
                backdropImageData.blob,
                backdropImageData.contentType,
                movieDetails.title
              );
              if (backdropResults && backdropResults?.data?.[0]?.url) {
                backdrop_url = backdropResults?.data?.[0]?.url;
              } else {
                // Jika gagal upload, tambahkan ID film ke file error
                throw new Error("Backdrop upload failed");
              }
            } else {
              throw new Error("Backdrop download failed");
            }
          }

          const dataToSend = {
            language: "en",
            imdbId: movieDetails.imdb_id?.toString() ?? "",
            tmdbId: movieDetails.id?.toString(),
            title: movieDetails.title,
            overview: movieDetails.overview
              ? `${movieDetails.overview}\n\nSource: IMDB`
              : "",
            releaseDate: movieDetails.release_date
              ? new Date(movieDetails.release_date).toISOString()
              : null,
            originalLanguage: movieDetails.original_language ?? "",
            backdrop: backdrop_url ?? "",
            poster: poster_url ?? "",
            tagline: movieDetails.tagline,
            status: movieDetails.status,
            originCountry: movieDetails.origin_country?.[0] ?? "",
            genres:
              genres?.length > 0 ? genres.map((genre) => genre.id) : undefined,
            productionCompanies:
              productionCompanies?.length > 0
                ? productionCompanies.map((company) => company.id)
                : undefined,
          };

          await sendMovieDataToApi(dataToSend);

          if (!movieDetails.imdb_id) {
            logUncompleted(movieDetails.id);
          } else if (!movieDetails.overview) {
            logUncompleted(movieDetails.id);
          }
        } catch (error) {
          console.error(
            `Error processing movie ID ${movie.id}:`,
            error.message
          );
          logErrorMovie(movieDetails.id);
        }
      }
    }
  } catch (error) {
    console.error("Error running scraper:", error.message);
  }
};

// Jalankan scraper
runTmdbScraper();
