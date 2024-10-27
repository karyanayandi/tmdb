import axios from "axios";
import fs from "fs";
import https from "https";
import FormData from "form-data";

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
    console.error(
      `Error fetching movie details for ID ${movieId}:`,
      error.message,
    );
    return null;
  }
};

const downloadImageAsStream = (imageUrl) => {
  return new Promise((resolve, reject) => {
    https
      .get(imageUrl, (response) => {
        if (response.statusCode === 200) {
          resolve(response); // Resolve with the readable stream
        } else {
          reject(new Error(`Failed to download image: ${response.statusCode}`));
        }
      })
      .on("error", (error) => reject(error));
  });
};

const uploadImageToApi = async (imageStream, contentType, title) => {
  try {
    const formData = new FormData();
    const ext = contentType.split("/")[1];
    const filename = `${title.replace(/\s+/g, "_")}.${ext}`;
    formData.append("file", imageStream, { filename, contentType });
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

    console.log(`Uploaded image for movie: ${response.data[0].name}`);

    return response.data[0]; // Ensure you return the full response
  } catch (error) {
    console.error("Error uploading image to API:", error.message);
    if (error.response) {
      console.error("Error Response:", error.response.data);
    }
    return null;
  }
};

const sendMovieDataToApi = async (data) => {
  try {
    await axios.post("https://nisomnia.com/api/public/movie/create", data);
    console.log(`Inserted movie data: ${data.title} with ID ${data.tmdbId}`);
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
  const savedMovies = {
    id: movieData.id,
  };

  fs.appendFileSync(
    "saved_movies.json",
    JSON.stringify(savedMovies) + "\n",
    (err) => {
      if (err) {
        console.error("Error saving movie data to file:", err.message);
      } else {
        console.log(
          `Saved movie data for: ${movieData.title} ID ${movieData.id})`,
        );
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
  const filePath = "./movies.json"; // Path to your local movie IDs file
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
            const posterImageUrl = `https://image.tmdb.org/t/p/original${movieDetails.poster_path}`;
            const posterImageStream =
              await downloadImageAsStream(posterImageUrl);
            const posterResults = await uploadImageToApi(
              posterImageStream,
              "image/webp", // Replace with the correct content type if needed
              `${movieDetails.title}-poster`,
            );

            if (posterResults && posterResults.url) {
              poster_url = posterResults.url; // Corrected property access
            } else {
              throw new Error(
                "Poster upload failed: " + JSON.stringify(posterResults),
              );
            }
          }

          if (movieDetails.backdrop_path) {
            const backdropImageUrl = `https://image.tmdb.org/t/p/original${movieDetails.backdrop_path}`;
            const backdropImageStream =
              await downloadImageAsStream(backdropImageUrl);
            const backdropResults = await uploadImageToApi(
              backdropImageStream,
              "image/webp", // Replace with the correct content type if needed
              `${movieDetails.title}-backdrop`,
            );

            if (backdropResults && backdropResults.url) {
              backdrop_url = backdropResults.url; // Corrected property access
            } else {
              throw new Error(
                "Backdrop upload failed: " + JSON.stringify(backdropResults),
              );
            }
          }

          const dataToSend = {
            tmdbId: movieDetails.id.toString(),
            ...(movieDetails.imdb_id && {
              imdbId: movieDetails.imdb_id,
            }),
            title: movieDetails.original_title ?? movieDetails.title,
            otherTitle: movieDetails.title,
            ...(movieDetails.overview && {
              overview: `${movieDetails.overview}\n\n(Source: IMDB)`,
            }),
            ...(movieDetails.release_date && {
              releaseDate: new Date(movieDetails.release_date).toISOString(),
            }),
            ...(movieDetails.original_language && {
              originalLanguage: movieDetails.original_language,
            }),
            ...(movieDetails.backdrop_path && {
              backdrop: backdrop_url,
            }),
            ...(movieDetails.poster_path && {
              poster: poster_url,
            }),
            ...(movieDetails.homepage && {
              homepage: movieDetails.homepage,
            }),
            ...(movieDetails.tagline && {
              tagline: movieDetails.tagline,
            }),
            airingStatus: movieDetails.status.toLowerCase() ?? "released",
            ...(movieDetails.origin_country && {
              originCountry: movieDetails.origin_country?.[0],
            }),
            status: "published",
            ...(movieDetails.budget && {
              budget: movieDetails.budget,
            }),
            ...(movieDetails.runtime && {
              runtime: movieDetails.runtime,
            }),
            ...(movieDetails.revenue && {
              revenue: movieDetails.revenue,
            }),
            ...(genres?.length > 0 && {
              genres: genres.map((genre) => genre.id),
            }),
            ...(movieDetails.spoken_languages &&
              movieDetails.spoken_languages.length > 0 && {
                spokenLanguages: movieDetails.spoken_languages
                  .map((language) => language.english_name)
                  .join(", "),
              }),
            ...(productionCompanies?.length > 0 && {
              productionCompanies: productionCompanies.map(
                (productionCompany) => productionCompany.id,
              ),
            }),
          };

          await sendMovieDataToApi(dataToSend);
        } catch (error) {
          console.error(
            `Error processing movie ID ${movie.id}:`,
            error.message,
          );
          logErrorMovie(movie.id);
        }
      } else {
        console.error(`No details found for movie ID ${movie.id}.`);
        logErrorMovie(movie.id);
      }
    }
  } catch (error) {
    console.error("Error in TMDB scraper:", error.message);
  }
};

// Start the TMDB scraper
runTmdbScraper();
