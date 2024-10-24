const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data"); // Tambahkan import untuk FormData

const TMDB_API_KEY = "b08364c6e443363275695e6752510848";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const readLocalCompanyIds = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        return reject(`Error reading file: ${err}`);
      }
      const companyIds = data
        .split("\n")
        .map((line) => {
          try {
            const json = JSON.parse(line);
            return json.id ? { id: json.id } : null; // Ambil hanya ID
          } catch (parseError) {
            console.warn(
              `Error parsing line: ${line}. Error: ${parseError.message}`,
            );
            return null;
          }
        })
        .filter(Boolean);
      resolve(companyIds);
    });
  });
};

// Fungsi untuk mengambil detail production company berdasarkan ID
const fetchCompanyDetails = async (companyId) => {
  const url = `${TMDB_BASE_URL}/company/${companyId}?api_key=${TMDB_API_KEY}`;
  try {
    const response = await axios.get(url);
    return response.data; // Kembalikan data detail production company
  } catch (error) {
    console.error(`Error fetching company details for ID ${companyId}:`, error);
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
        responseType: "arraybuffer", // Dapatkan respon sebagai buffer
      },
    );
    return {
      blob: Buffer.from(response.data), // Mengubah buffer ke Blob
      contentType: response.headers["content-type"], // Ambil content type untuk mendapatkan ekstensi
    };
  } catch (error) {
    console.error(`Error downloading image from TMDB: ${error.message}`);
    return null;
  }
};

const sendToApi = async (data) => {
  try {
    const response = await axios.post(
      "https://beta.nsmna.co/api/public/production-company/create",
      data,
    );
    console.log(`Inserted prod company: ${data.title} (ID: ${data.tmdbId})`);
    return response.data;
  } catch (error) {
    console.error("Error inserting data to API:", error.message);
    return null;
  }
};

const uploadImageToApi = async (logoBlob, contentType, title) => {
  try {
    const formData = new FormData();
    const ext = contentType.split("/")[1];
    const filename = `${title.replace(/\s+/g, "_")}.${ext}`;
    formData.append("file", logoBlob, { filename, contentType }); // Tambahkan Blob sebagai file
    formData.append("type", "production_company"); // Tambahkan tipe data

    const response = await axios.post(
      "https://beta.nsmna.co/api/public/media/image", // URL endpoint untuk upload gambar
      formData,
      {
        headers: {
          ...formData.getHeaders(), // Sertakan header dari FormData
        },
      },
    );

    console.log(`Uploaded logo for company: ${title}`);
    return { data: response.data };
  } catch (error) {
    console.error("Error uploading image to API:", error.message);
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

const runProductionCompanyScraper = async () => {
  const filePath = "./companies.json";
  try {
    const companyIds = await readLocalCompanyIds(filePath);

    if (companyIds.length === 0) {
      console.log("No company IDs found in local file.");
      return;
    }

    const fetchWithRateLimit = rateLimit(fetchCompanyDetails, 40, 225); // 225ms untuk mencapai 40 request dalam 9 detik

    for (const company of companyIds) {
      const companyDetails = await fetchWithRateLimit(company.id);
      if (companyDetails) {
        let logo_url = null;
        if (companyDetails.logo_path) {
          const imageData = await downloadImageAsBlob(companyDetails.logo_path);

          if (imageData?.blob) {
            const results = await uploadImageToApi(
              imageData.blob,
              imageData?.contentType,
              companyDetails.name,
            );
            if (results?.data) {
              logo_url = results.data?.[0]?.url;
            }
          }
        }

        const dataToSend = {
          tmdbId: companyDetails.id.toString(),
          name: companyDetails.name,
          title: companyDetails.name,
          description: companyDetails.description ?? null,
          logo: logo_url,
        };

        await sendToApi(dataToSend);

        console.log(
          `Fetched and inserted details for company ID ${company.id}: ${companyDetails.name}`,
        );
      }
    }
  } catch (error) {
    console.error("Error during scraping:", error);
  }
};

// Menjalankan fungsi scraper
runProductionCompanyScraper();
