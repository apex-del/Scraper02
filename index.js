export default {
  async fetch(request, env, ctx) {
    return new Response("Anime Scraper Worker Active ✅");
  },

  async scheduled(event, env, ctx) {
    try {
      const lastRow = await env.DB.prepare(
        "SELECT id FROM anime ORDER BY id DESC LIMIT 1"
      ).first();

      const startId = lastRow ? lastRow.id + 1 : 1;
      const endId = startId + 99; // Scrape 10 entries per run

      let insertedCount = 0;

      for (let id = startId; id <= endId; id++) {
        const data = await scrapeAnime(id);

        if (data.name !== "❌ Error") {
          await env.DB.prepare(
            "INSERT OR IGNORE INTO anime (id, name, poster, syncData) VALUES (?, ?, ?, ?)"
          )
          .bind(id, data.name, data.poster, JSON.stringify(data.syncData))
          .run();

          insertedCount++;
        }
      }

      console.log(
        `Cron run succeeded. Inserted ${insertedCount} entries. Last scraped ID = ${endId}`
      );

    } catch (err) {
      console.error("Cron run failed:", err);
    }
  }
};

async function scrapeAnime(id, retry = 1) {
  const targetUrl = `https://hianime.pe/sakamoto-days-${id}`;
  const proxyUrl = `https://proxy-api-kyot.onrender.com/proxy?url=${encodeURIComponent(targetUrl)}`;

  try {
    const res = await fetch(proxyUrl);
    const html = await res.text();

    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const rawTitle = titleMatch ? titleMatch[1] : "❌ Not Found";
    const animeName = rawTitle.replace(/^Watch\s+/, "").replace(/\s+English.*$/, "").trim();

    const posterMatch = html.match(/<div class="film-poster">[\s\S]*?<img[^>]+src="([^"]+)"/i);
    const posterUrl = posterMatch ? posterMatch[1] : "❌ Not Found";

    const syncDataMatch = html.match(/<script id="syncData" type="application\/json">\s*(\{[\s\S]*?\})\s*<\/script>/i);
    let syncData = null;
    if (syncDataMatch) {
      try {
        const parsed = JSON.parse(syncDataMatch[1]);
        delete parsed.series_url;
        delete parsed.selector_position;
        syncData = parsed;
      } catch {
        syncData = "❌ Invalid JSON";
      }
    } else {
      syncData = "❌ Not Found";
    }

    return { id, name: animeName, poster: posterUrl, syncData };

  } catch (err) {
    if (retry > 0) {
      await new Promise(res => setTimeout(res, 3000));
      return scrapeAnime(id, retry - 1);
    }
    return { id, name: "❌ Error", poster: null, syncData: null };
  }
}
