// Mengimpor modul Supabase dan Axios
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

// Konfigurasi Supabase
const supabaseUrl = "https://ujlymwcsjbnmmmkokkpf.supabase.co"; // Ganti dengan URL Supabase kamu
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqbHltd2NzamJubW1ta29ra3BmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDE0OTI1NjgsImV4cCI6MjAxNzA2ODU2OH0._iO23MQu6TpYldg5pLggm4DUPfDTV0qETLxCyQFBcis"; // Ganti dengan API Key kamu
const supabase = createClient(supabaseUrl, supabaseKey);

// Fungsi untuk mengambil data dari Supabase
async function fetchData() {
  const { data, error } = await supabase.from("topic").select("*");
  if (error) {
    console.error("Error fetching data:", error);
    return null;
  } else {
    return data;
  }
}

// Fungsi untuk mengirimkan data ke API dengan retry jika gagal
async function sendToApi(data) {
  const maxRetries = 2; // Jumlah retry maksimal (2 kali tambahan jika gagal)
  let attempt = 0;
  let success = false;

  while (attempt <= maxRetries && !success) {
    try {
      // Coba mengirim data ke API
      await axios.post("https://beta.nsmna.co/api/public/topic/create/", data);
      console.log("Data successfully sent:", data.title);
      success = true; // Tandai pengiriman berhasil
    } catch (error) {
      attempt++;
      console.error(
        `Error sending data on attempt ${attempt} for ${data.title}:`,
        error.message
      );

      if (attempt > maxRetries) {
        console.error(`Failed to send data after ${maxRetries + 1} attempts.`);
      } else {
        console.log(`Retrying... (${attempt}/${maxRetries})`);
      }
    }
  }
}

// Fungsi untuk membersihkan karakter setelah underscore terakhir
function cleanAfterLastUnderscore(input) {
  const lastUnderscoreIndex = input.lastIndexOf("_");
  return lastUnderscoreIndex !== -1
    ? input.substring(0, lastUnderscoreIndex)
    : input;
}

// Fungsi delay untuk menambahkan jeda waktu
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // Ambil data dari Supabase
  const data = await fetchData();
  if (data) {
    // Gunakan for...of untuk menunggu setiap operasi selesai
    for (const item of data) {
      await sendToApi({
        slug: cleanAfterLastUnderscore(item.slug),
        language: item.language,
        title: item.title,
        description: item.description,
        type: item.type,
        status: item.status,
      });

      // Tambahkan delay 1 detik antara pengiriman untuk menghindari overload
      await delay(500);
    }
  }
}

// Jalankan fungsi utama
main();
