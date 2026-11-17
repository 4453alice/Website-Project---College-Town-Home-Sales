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

## 2026-11-17: Second redesign: grainy gray, pixel aerials and index cards

- **Asked:** I sent a grayscale camping photo with a route line and asked for that typeface as the main font, a grainy gray background with a pixel feel, Sawarabi Mincho with accent colors for the campus names, and a more layered structure instead of one long page. I asked to discuss the details before building. We settled on: Hanken Grotesk with DM Mono labels; fog gray #D6D5D0, paper #F2EEE3, ink, slate blue #3F5A70, pine #3E4A2E, burnt orange #C24E1A for the Illinois reference, and small amounts of yellow #F5D35E and orange #FF6B2C taken from my second reference photo; a mostly plain grainy background with a pixelated aerial band at the bottom; circular photos in gray pixels except the selected campus in color; and layout C, six index cards that open into panels. I first picked the horizontal swipe layout, then changed my mind to C.
- **Agent produced:** New `index.html`, `style.css` and `app.js`. The six cards show a live teaser number for the selected campus (for Illinois: 3,663 sales, $156 to $174, -10%, 1,616 sq ft, 7 days). Each card opens a panel with back, previous and next buttons, numbered tabs, and the keyboard arrow keys. All numbers and calculations are unchanged.
- **Checked or changed:** The agent checked contrast before choosing colors (yellow and orange are never used as text on gray because they are too light) and rendered every panel in a test browser at desktop and phone sizes. The first version hid the panel's navigation bar under the sticky campus bar and the six tab names wrapped onto two lines, so it shortened the tabs to 01 to 06 with the current title beside them and moved the scroll position down. I uploaded the files and checked the live site.

## 2026-11-17: Heavier grain, color photos and a sticky header

- **Asked:** "1.背景的灰階像素感想要在重一點，更有顆粒感，目前看起來只是純灰色而已，且我希望底部的灰階格子方塊可以在小一些，且整體扁一些。2.圓形地圖我像要其他也能是彩色 3.當我滑到SIX WAYS TO READ THE PULL這部分時，我是否也能保留「Campus Gravity CAMPUSES 11 SALES 35,371 YEARS 2023–26 STATES 11」等這些資料在最頂端……然後這後圓形圖片可以縮小一些，我希望所有資料都不用上下滑動太多"
- **Agent produced:** A coarse gray pixel noise layer under a stronger fine grain; a bottom pixel band with 8px cells at about half the height; all circular photos in color (the selected campus sharp, the others still in pixel blocks); a sticky header that keeps the title, the four stats and the campus names at the top; smaller collage circles next to the intro text, so the six cards fit on one laptop screen; and a panel navigation bar that sticks just under the header.
- **Checked or changed:** The agent asked whether "圓形地圖" meant the circular photos or the map inside panel 01, and I confirmed it meant the photos. On the first try the pixel noise looked like TV static, so it lowered its strength. The agent also measures the header's real height in the browser so the panel bar never slides under it.
