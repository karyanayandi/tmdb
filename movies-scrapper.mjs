import axios from "axios";
import fs from "fs";

const startIndex = parseInt(process.argv[2], 10) || 0;
const endIndex = parseInt(process.argv[3], 10) || 10000;

const TMDB_API_KEY = "b08364c6e443363275695e6752510848";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

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
            return json.id && !json.adult ? { id: json.id } : null;
          } catch (parseError) {
            console.warn(
              `Error parsing line: ${line}. Error: ${parseError.message}`,
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

const fetchMovieDetails = async (movieId) => {
  const url = `${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}`;

  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Error fetching movie details for ID ${movieId}:`, error);
    return null;
  }
};

const downloadImageAsBlob = async (imagePath) => {
  if (!imagePath) return null;
  try {
    const response = await axios.get(
      `https://image.tmdb.org/t/p/original${imagePath}`,
      {
        responseType: "arraybuffer",
      },
    );
    // Create a Blob object with the ArrayBuffer data
    return {
      blob: new Blob([response.data], {
        type: response.headers["content-type"],
      }),
      contentType: response.headers["content-type"],
    };
  } catch (error) {
    console.error(`Error downloading image from TMDB: ${error.message}`);
    return null;
  }
};

const uploadImageToApi = async (imageBlob, contentType, title) => {
  try {
    const formData = new FormData();
    const ext = contentType.split("/")[1];
    const filename = `${title.replace(/\s+/g, "_")}.${ext}`;
    formData.append("file", imageBlob, { filename, contentType });
    formData.append("category", "movie");
    formData.append("type", "image");

    const response = await axios.post(
      "https://nisomnia.com/api/public/media/image",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
      },
    );

    console.log(`Uploaded logo for movie: ${title}`);
    return { data: response.data };
  } catch (error) {
    console.error("Error uploading image to API:", error.message);
    return null;
  }
};

const sendMovieDataToApi = async (data) => {
  try {
    const response = await axios.post(
      "https://nisomnia.com/api/public/movie/create",
      data,
    );
    console.log(
      `Inserted movie data: ${data.title} with ID ${response.data.id}`,
    );
    saveMovieDataToFile(data);
  } catch (error) {
    console.error("Error inserting movie data to API:", error.message);
    throw error;
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

const getGenreByTmdbId = async (tmdbId) => {
  try {
    const response = await axios.get(
      `https://nisomnia.com/api/public/genre/by-tmdb-id/${tmdbId}`,
    );
    return response.data;
  } catch (error) {
    console.error(`Error fetching genre for TMDB ID ${tmdbId}:`, error.message);
    return [];
  }
};

const getProductionCompanyByTmdbId = async (tmdbId) => {
  try {
    const response = await axios.get(
      `https://nisomnia.com/api/public/production-company/by-tmdb-id/${tmdbId}`,
    );
    return response.data;
  } catch (error) {
    console.error(
      `Error fetching production company for TMDB ID ${tmdbId}:`,
      error.message,
    );
    return [];
  }
};

const saveMovieDataToFile = (movieData) => {
  fs.appendFile(
    "saved_movies.json",
    JSON.stringify(movieData) + "\n",
    (err) => {
      if (err) {
        console.error("Error saving movie data to file:", err.message);
      } else {
        console.log(`Saved movie data for: ${movieData.title}`);
      }
    },
  );
};

const logErrorMovie = (id) => {
  const errorData = {
    id: id,
  };

  fs.appendFileSync("error_movie_ids.json", JSON.stringify(errorData) + "\n");
  console.log(`Logged error movie ID: ${id}`);
};

const runTmdbScraper = async () => {
  const filePath = "./movies.json";
  try {
    const movieIds = await readLocalMovieIds(filePath);

    if (movieIds.length === 0) {
      console.log("No movie IDs found in local file.");
      return;
    }

    const fetchWithRateLimit = rateLimit(fetchMovieDetails, 40, 225);

    for (const movie of movieIds) {
      const movieDetails = await fetchWithRateLimit(movie.id);
      if (movieDetails) {
        let poster_url = null;
        let backdrop_url = null;

        try {
          const genres = await Promise.all(
            movieDetails.genres.map(async (genre) => {
              return await getGenreByTmdbId(genre.id);
            }),
          );

          const productionCompanies = await Promise.all(
            movieDetails.production_companies.map(
              async (production_company) => {
                return await getProductionCompanyByTmdbId(
                  production_company.id,
                );
              },
            ),
          );

          if (movieDetails.poster_path) {
            const posterImageData = await downloadImageAsBlob(
              movieDetails.poster_path,
            );
            if (posterImageData?.blob) {
              const posterResults = await uploadImageToApi(
                posterImageData.blob,
                posterImageData.contentType,
                `${movieDetails.title}-poster`,
              );
              if (posterResults && posterResults?.data?.[0]?.url) {
                poster_url = posterResults?.data?.[0]?.url;
              } else {
                throw new Error("Poster upload failed");
              }
            } else {
              throw new Error("Poster download failed");
            }
          }

          if (movieDetails.backdrop_path) {
            const backdropImageData = await downloadImageAsBlob(
              movieDetails.backdrop_path,
            );
            if (backdropImageData?.blob) {
              const backdropResults = await uploadImageToApi(
                backdropImageData.blob,
                backdropImageData.contentType,
                `${movieDetails.title}-backdrop`,
              );
              if (backdropResults && backdropResults?.data?.[0]?.url) {
                backdrop_url = backdropResults?.data?.[0]?.url;
              } else {
                throw new Error("Backdrop upload failed");
              }
            } else {
              throw new Error("Backdrop download failed");
            }
          }

          const dataToSend = {
            imdbId: movieDetails.imdb_id?.toString() ?? null,
            tmdbId: movieDetails.id?.toString(),
            title: movieDetails.originalTitle ?? movieDetails.title,
            otherTitle: movieDetails.title,
            overview: movieDetails.overview
              ? `${movieDetails.overview}\n\n(Source: IMDB)`
              : null,
            releaseDate: movieDetails.release_date
              ? new Date(movieDetails.release_date).toISOString()
              : null,
            originalLanguage: movieDetails.original_language ?? null,
            backdrop: backdrop_url ?? null,
            poster: poster_url ?? null,
            tagline: movieDetails.tagline ?? null,
            airingStatus: movieDetails.status ?? null,
            originCountry: movieDetails.origin_country?.[0] ?? null,
            budget: movieDetails.budget ?? null,
            runtime: movieDetails.runtime ?? null,
            revenue: movieDetails.revenue ?? null,
            homepage: movieDetails.homepage ?? null,
            spokenLanguages: movieDetails.spoken_languages
              .map((language) => language.english_name)
              .join(", "),
            genres: genres?.length > 0 ? genres.map((genre) => genre.id) : null,
            productionCompanies:
              productionCompanies?.length > 0
                ? productionCompanies.map((company) => company.id)
                : null,
          };

          await sendMovieDataToApi(dataToSend);
        } catch (error) {
          console.error(
            `Error sending movie data for ID ${movieDetails.id}: ${error.message}`,
          );
          logErrorMovie(movie.id);
        }
      } else {
        logErrorMovie(movie.id);
      }
    }
  } catch (error) {
    console.error("Error running TMDB scraper:", error);
  }
};

runTmdbScraper();
