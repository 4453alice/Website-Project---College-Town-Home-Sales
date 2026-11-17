# Agent log

Add a dated entry each time you work with your AI coding agent, with the newest entry at the bottom. Each entry records what you asked the agent, what it produced, and what you checked or changed. Paste your key prompts in exactly as you typed them. Include at least one time the agent got something wrong, and how you caught it.

Copy this outline for each entry:

```markdown
## YYYY-MM-DD: What you worked on

- **Asked:** "Paste your prompt here."
- **Agent produced:** What it made or changed.
- **Checked or changed:** How you checked it, and what you fixed.
```

## 2026-11-17: Planned the site and built the first version of the dashboard

- **Asked:** "我想要做很特別有創意的A（互動 Dashboard）" and then "基礎架構我先做好，細節你再自己用 agent 加。" (Claude Opus 5.5, in the Claude app)
- **Agent produced:** A plan called "Campus Gravity", then the first version of the site: `index.html`, `assets/style.css`, `assets/app.js`, a local copy of the Leaflet map library in `assets/vendor/leaflet/`, the script `scripts/build_site_data.py`, and the file it writes, `data/derived/site_points.json`. The page has a dark map of every sale around the selected campus, a "gravity curve" of median price per sq ft by distance, a campus premium leaderboard, a budget simulator, and median days on market. The dataset files in `data/` were not changed.
- **Checked or changed:** The agent re-computed the key numbers with pandas and they matched the page (Illinois: 3,663 sales, median $245,000, $156/sq ft within 1 mile vs $174 at 4+ miles, so -10%; Michigan +96%; days on market from 7 to 27). The first version crashed with "Set map center and zoom first" because the map tried to draw dots before it had a starting view. The agent caught this by loading the page in a test browser and taking a screenshot, then fixed it by setting the view when the map is created. I still need to check the live site myself.

## 2026-11-17: Fixed the live site after the upload lost its folders

- **Asked:** "都上傳好了" (I had uploaded the files through GitHub's "Upload files" page in Safari.)
- **Agent produced:** It opened the live site, saw that the page loaded with no styling, map or charts, and checked which file addresses existed. Safari had uploaded every file into the top level of the repository, so `assets/app.js`, `assets/style.css`, the Leaflet files and `data/derived/site_points.json` were all missing from the paths the page asked for. It made new versions of `index.html`, `app.js` and `build_site_data.py` that point to the files where they actually are.
- **Checked or changed:** The agent's upload instructions were wrong for Safari, which does not keep folders when you drag them onto GitHub. I uploaded the three fixed files and checked the live site again.

## 2026-11-17: Replaced the map background

- **Asked:** "上傳好了" (after uploading the fixed files)
- **Agent produced:** It checked the live site again. The dashboard now worked, but the map background showed "API KEY REQUIRED" across it, because the CARTO map tiles now need a key on public sites. It switched the map to Esri's free dark gray tiles, which need no key, and updated the credit line in the footer.
- **Checked or changed:** The agent tested that the Esri tiles load from my site's address before changing the code. I uploaded the two changed files and checked the map.

## 2026-11-17: Redesigned the look as a cream editorial collage

- **Asked:** "我很喜歡整體邏輯架構，不過在設計上面我想要有我自己的想法，以下設計風格是我期望的，是否可以幫我更改介面設計. Use the warm cream editorial collage as the main design direction, and borrow only the restrained image-annotation idea from the documentary reference. Do not combine every visual treatment at once. Preserve the cream background, circular photo crops, and italic serif headlines as the dominant visual identity." (I attached four reference images.)
- **Agent produced:** A new `style.css`, `index.html` and `app.js` with the same sections and the same numbers. Cream background, italic serif headings (Instrument Serif), and circular aerial photo crops of each campus, arranged like a collage at the top, which also work as the campus picker. The map now sits inside a large circle. From the documentary reference it borrowed only the thin blue annotation box with a label such as "(selected) Illinois" and the (01), (02) numbering. The bar charts became thin lollipop lines with circle ends.
- **Checked or changed:** The agent checked that the circular photos and new map tiles load from my site's address, and loaded the page in a test browser on desktop and phone sizes. It fixed the map legend labels, which were squeezed together, and text in the budget section that wrapped badly. I uploaded the files and reviewed the design on the live site.
