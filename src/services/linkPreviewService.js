/**
 * @file linkPreviewService.js
 * @description Generate link preview (title, description, image) from URL
 */

const axios = require("axios");
const cheerio = require("cheerio");

/**
 * Extract first valid URL from text
 * @param {string} text
 * @returns {string|null}
 */
const extractUrl = (text) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const match = text.match(urlRegex);
  return match ? match[0] : null;
};

/**
 * Generate link preview
 * @param {string} content
 * @returns {Promise<Object|null>}
 */
const generateLinkPreview = async (content) => {
  const url = extractUrl(content);
  if (!url) return null;

  try {
    const { data } = await axios.get(url, {
      timeout: 5000,
      headers: { "User-Agent": "LinkUp-Bot/1.0" },
    });

    const $ = cheerio.load(data);

    const title = $('meta[property="og:title"]').attr("content") ||
                  $("title").text() ||
                  $('meta[name="title"]').attr("content") ||
                  "";

    const description = $('meta[property="og:description"]').attr("content") ||
                        $('meta[name="description"]').attr("content") ||
                        $('meta[property="twitter:description"]').attr("content") ||
                        "";

    const image = $('meta[property="og:image"]').attr("content") ||
                  $('meta[property="twitter:image"]').attr("content") ||
                  $('link[rel="image_src"]').attr("href") ||
                  "";

    if (!title && !description && !image) return null;

    return {
      url,
      title: title.trim().slice(0, 150),
      description: description.trim().slice(0, 300),
      image: image.startsWith("http") ? image : null,
    };
  } catch (error) {
    console.error("Link preview failed:", error.message);
    return null;
  }
};

module.exports = { generateLinkPreview };