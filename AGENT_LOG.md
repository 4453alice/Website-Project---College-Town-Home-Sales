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
