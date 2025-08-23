export default {
  async fetch(request, env) {
    try {
      // Get last scraped ID
      const lastRow = await env.DB.prepare(
        "SELECT id FROM anime ORDER BY id DESC LIMIT 1"
      ).first();
      let startId = lastRow ? lastRow.id + 1 : 1;
      let endId = startId + 100;

      let inserted = [];

      for (let i = startId; i <= endId; i++) {
        const data = await scrapeAnime(i);

        if (data && data.name !== "❌ Error") {
          await env.DB.prepare(
            "INSERT OR IGNORE INTO anime (id, name, poster, syncData) VALUES (?, ?, ?, ?)"
          ).bind(
            data.id,
            data.name,
            data.poster,
            JSON.stringify(data.syncData)
          ).run();

          inserted.push(data.name);
        }
      }

      return new Response(`✅ Inserted ${inserted.length} entries, last ID = ${endId}`);
    } catch (err) {
      return new Response("❌ Error: " + err.message, { status: 500 });
    }
  },
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
      await new Promise(resolve => setTimeout(resolve, 3000));
      return scrapeAnime(id, retry - 1);
    } else {
      return { id, name: "❌ Error", poster: null, syncData: null };
    }
  }
}
