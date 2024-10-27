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

// Fungsi untuk mengambil data dari Supabase dengan pagination
async function fetchData(offset = 0, limit = 200) {
  const { data, error } = await supabase
    .from("article")
    .select(
      `
      *,  
      _article_topics (
        B
      )
    `,
    )
    .range(offset, offset + limit - 1); // Pagination logic
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
  const urlRegex =
    /https:\/\/assets\.nisomnia\.com\/([\w-]+)_[\w-]+\.(webp|jpg|png|jpeg|gif)/g;

  return longString.replace(urlRegex, (match, fileName, extension) => {
    return `https://assets.nisomnia.com/image/${fileName}.${extension}`;
  });
}

function cleanAfterLastUnderscore(input) {
  const lastUnderscoreIndex = input.lastIndexOf("_");
  return lastUnderscoreIndex !== -1
    ? input.substring(0, lastUnderscoreIndex)
    : input;
}

async function main() {
  const totalItems = 161; // Target jumlah item
  const limit = 100; // Jumlah item per request
  let fetchedItems = [];

  // Fetch data in batches until we get the desired number of items
  for (let offset = 0; offset < totalItems; offset += limit) {
    const data = await fetchData(offset, limit);
    if (data && data.length) {
      fetchedItems = fetchedItems.concat(data);
    }
    // Break if we've fetched enough items
    if (fetchedItems.length >= totalItems) break;
  }

  // Array untuk menyimpan indeks yang gagal
  let failedIndices = [];

  for (const [index, item] of fetchedItems.entries()) {
    let topicIdsReal = [];
    let imageUrl = "";
    let content = "";

    try {
      // Fetch topics
      for (const element of item._article_topics) {
        const { data: topic, error } = await supabase
          .from("topic")
          .select("slug")
          .eq("id", element.B)
          .single();

        if (error) {
          console.error(`Error fetching topic with ID ${element.B}:`, error);
          throw error;
        } else {
          const awe = await getTopicbyID(cleanAfterLastUnderscore(topic?.slug));
          topicIdsReal.push(awe?.id);
        }
      }

      // Fetch featured image
      if (item.featured_image_id) {
        const { data: media, error } = await supabase
          .from("media")
          .select("url")
          .eq("id", item.featured_image_id)
          .single();

        if (error) throw error;
        imageUrl = modifyFileUrl(media?.url);
      }

      // Modify content URLs
      if (item.content) {
        content = modifyUrlsInString(item.content);
      }

      // Send data to API
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
      console.error(`Error processing item at index ${index}:`, error);
      failedIndices.push(index);
    }
  }

  // Retry failed items if necessary
  if (failedIndices.length > 0) {
    console.log(`Retrying for failed indices:`, failedIndices);
    await retryFailedItems(fetchedItems, failedIndices);
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

      // Send data to API
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
