// Mengimpor modul Supabase dan Axios
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");
const path = require("path");
const FormData = require("form-data"); // Tambahkan import untuk FormData

// Konfigurasi Supabase
const supabaseUrl = "https://ujlymwcsjbnmmmkokkpf.supabase.co"; // Ganti dengan URL Supabase kamu
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqbHltd2NzamJubW1ta29ra3BmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDE0OTI1NjgsImV4cCI6MjAxNzA2ODU2OH0._iO23MQu6TpYldg5pLggm4DUPfDTV0qETLxCyQFBcis"; // Ganti dengan API Key kamu
const supabase = createClient(supabaseUrl, supabaseKey);

// Fungsi untuk mengambil data dari Supabase
async function fetchData() {
  const { data, error } = await supabase
    .from("media") // Ganti dengan nama tabel kamu
    .select("url"); // Sesuaikan query yang dibutuhkan

  if (error) {
    console.error("Error fetching data:", error);
    return null;
  } else {
    return data;
  }
}

// Fungsi untuk mengirimkan data ke API
async function checkImage(data) {
  try {
    const response = await axios.get(
      "http://localhost:3000/api/public/media/image/by-id/" + data,
    );
    console.log("aya ey:", response.data?.url);
    return response.data;
  } catch (error) {
    console.error("Error sending data:", error.message);
  }
}

const downloadImageAsBlob = async (url, index) => {
  if (!url) return null; // Kembali jika tidak ada URL
  try {
    console.log(`Downloading image at index: ${index}`); // Menampilkan indeks yang sedang diunduh
    const response = await axios.get(url, {
      responseType: "arraybuffer", // Dapatkan respon sebagai buffer
    });
    return {
      blob: Buffer.from(response.data), // Mengubah buffer ke Blob
      contentType: response.headers["content-type"], // Ambil content type untuk mendapatkan ekstensi
    };
  } catch (error) {
    console.error(
      `Error downloading image from Supa at index ${index}: ${error.message}`,
    );
    return null; // Mengembalikan null jika terjadi error
  }
};

const uploadImageToApi = async (logoBlob, contentType, url, index) => {
  const filename = path.basename(url);
  const cleanedFilename = cleanFilename(filename); // Bersihkan nama file
  const checked = await checkImage(cleanedFilename);
  if (!checked) {
    try {
      const formData = new FormData();

      formData.append("file", logoBlob, {
        filename: cleanedFilename,
        contentType,
      });
      formData.append("type", "article"); // Tambahkan tipe data

      const response = await axios.post(
        "https://nisomnia.com/api/public/media/image", // URL endpoint untuk upload gambar
        formData,
        {
          headers: {
            ...formData.getHeaders(), // Sertakan header dari FormData
          },
        },
      );

      console.log(`Uploaded logo for company at index ${index}: ${url}`);
      return { data: response.data };
    } catch (error) {
      console.error(
        `Error uploading image to API at index ${index}: ${url} ${error.message}`,
      );
    }
  }
};

function cleanFilename(filename) {
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext);
  const cleanedBaseName = baseName.split("_")[0]; // Mengambil bagian sebelum underscore pertama
  return cleanedBaseName + ext;
}

async function main() {
  // Ambil data dari Supabase
  const data = await fetchData();
  const rest = data?.slice(700, 800);
  if (rest) {
    // Menggunakan forEach untuk mendapatkan indeks
    rest.forEach(async (url, index) => {
      if (url) {
        const imageData = await downloadImageAsBlob(url.url, index); // Pass index to download function

        if (imageData?.blob) {
          await uploadImageToApi(
            imageData.blob,
            imageData?.contentType,
            url.url,
            index, // Pass index to upload function
          );
        }
      }
    });
  }
}

// Jalankan fungsi utama
main();
