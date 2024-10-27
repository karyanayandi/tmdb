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
  const { data, error } = await supabase.from("article").select(`
    *,  
    _article_topics (
      B
    )
  `);
  if (error) {
    console.error("Error fetching data:", error);
    return null;
  } else {
    return data;
  }
}

// Fungsi untuk mengirimkan data ke API
async function sendToApi(data) {
  try {
    const response = await axios.post(
      "https://nisomnia.com/api/public/article/create/",
      data,
    );
    console.log("Data successfully sent:", data.slug);
  } catch (error) {
    console.error("Error sending data:", data.slug, error.message);
  }
}
async function getTopicbyID(slug) {
  try {
    const response = await axios.get(
      "https://nisomnia.com/api/public/topic/by-slug/" + slug,
    );
    return response.data;
  } catch (error) {
    console.error("Error getting topic id data:", error);
  }
}
function modifyFileUrl(url) {
  const urlObj = new URL(url);

  const path = urlObj.pathname;

  const segments = path.split("/");

  let fileName = segments.pop();

  if (!fileName) {
    console.error("Error: Nama file tidak ditemukan di URL.");
    return url;
  }

  const [namePart, extension] = fileName.split(".");

  const cleanName = namePart.split("_")[0]; // Ambil bagian sebelum underscore

  const modifiedPath = `/image/${cleanName}.${extension}`;

  return `${urlObj.origin}${modifiedPath}`;
}

function modifyUrlsInString(longString) {
  // Regex untuk mencari URL dengan pola yang sesuai
  const urlRegex =
    /https:\/\/assets\.nisomnia\.com\/([\w-]+)_[\w-]+\.(webp|jpg|png|jpeg|gif)/g;

  // Fungsi pengganti untuk setiap URL yang ditemukan
  return longString.replace(urlRegex, (match, fileName, extension) => {
    // Buat URL yang dimodifikasi dengan menambahkan "/image" sebelum nama file dan menghapus bagian setelah underscore
    return `https://assets.nisomnia.com/image/${fileName}.${extension}`;
  });
}

function cleanAfterLastUnderscore(input) {
  // Mencari posisi underscore terakhir
  const lastUnderscoreIndex = input.lastIndexOf("_");

  // Jika ada underscore, potong string hingga posisi tersebut
  return lastUnderscoreIndex !== -1
    ? input.substring(0, lastUnderscoreIndex)
    : input;
}
async function main() {
  // Ambil data dari Supabase
  const data = await fetchData();
  const rest = data?.slice(140, 180);

  // Array untuk menyimpan indeks yang gagal
  let failedIndices = [];

  if (rest) {
    for (const [index, item] of rest.entries()) {
      let topicIdsReal = [];
      let imageUrl = "";
      let content = "";

      try {
        // Menggunakan for...of agar bisa menggunakan await di dalam loop
        for (const element of item._article_topics) {
          try {
            // Query asinkron untuk mengambil slug berdasarkan ID
            const { data: topic, error } = await supabase
              .from("topic") // Ganti dengan nama tabel topik
              .select("slug") // Ambil kolom slug
              .eq("id", element.B) // Filter berdasarkan ID
              .single(); // Ambil satu baris data

            if (error) {
              console.error(
                `Error fetching topic with ID ${element.B}:`,
                error,
              );
              throw error;
            } else {
              const awe = await getTopicbyID(
                cleanAfterLastUnderscore(topic?.slug),
              );
              topicIdsReal.push(awe?.id);
            }
          } catch (error) {
            console.error(
              `Error during fetching topic for ID ${element.B}:`,
              error,
            );
            throw error; // Menangkap error di luar try-catch utama
          }
        }

        if (item.featured_image_id) {
          const { data: media, error } = await supabase
            .from("media") // Ganti dengan nama tabel media
            .select("url") // Ambil kolom URL
            .eq("id", item.featured_image_id) // Filter berdasarkan ID
            .single();

          if (error) {
            throw error;
          }

          imageUrl = modifyFileUrl(media?.url); // Modifikasi URL gambar
        }

        if (item.content) {
          content = modifyUrlsInString(item.content); // Modifikasi URL dalam konten
        }

        // Mengirimkan data ke API
        await sendToApi({
          ...item,
          slug: cleanAfterLastUnderscore(item.slug),
          topics: topicIdsReal,
          featuredImage: imageUrl,
          content,
          authors: ["1QVv0d2sgonwKWXafbVrOH4rK4sElZmVbZUOWTV2"],
          editors: ["1QVv0d2sgonwKWXafbVrOH4rK4sElZmVbZUOWTV2"],
        });
      } catch (error) {
        // Menyimpan indeks yang gagal
        console.error(`Error processing item at index ${index}:`, error);
        failedIndices.push(index);
      }
    }

    // Jika ada indeks yang gagal, kita lakukan retry
    if (failedIndices.length > 0) {
      console.log(`Retrying for failed indices:`, failedIndices);
      await retryFailedItems(rest, failedIndices);
    }
  }
}

// Fungsi untuk retry data yang gagal
async function retryFailedItems(data, failedIndices) {
  for (const index of failedIndices) {
    const item = data[index];
    let topicIdsReal = [];
    let imageUrl = "";
    let content = "";

    try {
      for (const element of item._article_topics) {
        const { data: topic, error } = await supabase
          .from("topic")
          .select("slug")
          .eq("id", element.B)
          .single();

        if (error) {
          console.error(
            `Retry Error fetching topic with ID ${element.B}:`,
            error,
          );
          throw error;
        } else {
          const awe = await getTopicbyID(cleanAfterLastUnderscore(topic?.slug));
          topicIdsReal.push(awe?.id);
        }
      }

      if (item.featured_image_id) {
        const { data: media, error } = await supabase
          .from("media")
          .select("url")
          .eq("id", item.featured_image_id)
          .single();

        imageUrl = modifyFileUrl(media?.url);
      }

      if (item.content) {
        content = modifyUrlsInString(item.content);
      }

      // Mengirimkan data ke API
      await sendToApi({
        ...item,
        slug: cleanAfterLastUnderscore(item.slug),
        topics: topicIdsReal,
        featuredImage: imageUrl,
        content,
        authors: ["1QVv0d2sgonwKWXafbVrOH4rK4sElZmVbZUOWTV2"],
        editors: ["1QVv0d2sgonwKWXafbVrOH4rK4sElZmVbZUOWTV2"],
      });

      console.log(`Successfully retried for item at index ${index}`);
    } catch (error) {
      console.error(`Failed retry for item at index ${index}:`, error);
    }
  }
}

// Jalankan fungsi utama
main();
