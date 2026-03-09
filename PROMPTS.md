# AI Prompts Reference (`PROMPTS.md`)

This file logs the exact prompts used for automated AI content generation within the application. These prompts dictate the style and output for the Vercel cron jobs that interact with OpenAI/Gemini.

## 1. Automated X (Twitter) Post Generation (`api/cron/twitter.js`)

**Role:** The AI acts as a social media expert for the domain.
**Input Variables:**
- `product.product_name`
- `product.price`
- `product.brand`
- `product.rating`
- `amazonLink`
- `productLink` (Link to your comparison site)
- `style` (Randomly selected between 'deal', 'tip', 'review')

**Base Prompt:**
```text
[STYLE_PROMPT]

Product: [PRODUCT_NAME]
Price: $[PRICE]
Brand: [BRAND]
Rating: [RATING]
Amazon: [AMAZON_LINK]

Rules:
- Keep under 240 characters TOTAL (including links)
- Casual, enthusiastic US tone
- No quotes around the tweet
- Output ONLY the tweet text, nothing else
```

**Style Prompts:**
- **Deal:** "Write a short, exciting deal alert tweet (under 240 chars) for this 3D printer product targeting US hobbyists. Include price, 1-2 hashtags (#3DPrinting #3DPrinter), and this link: [PRODUCT_LINK]"
- **Tip:** "Write a helpful tip tweet (under 240 chars) referencing this product, for US 3D printing enthusiasts. End with: 'Find best prices → [PRODUCT_LINK]' and 1-2 hashtags."
- **Review:** "Write a review-style tweet (under 240 chars) highlighting this product's rating and value for US makers. Include 1-2 hashtags and: [PRODUCT_LINK]"

---

## 2. SEO Blog Generation (`api/cron/blog.js`)

**Role:** The AI creates structured, SEO-optimized semantic HTML content for the site's blog section.
**Input Variables:**
- `schedule.topic`
- `schedule.keyword`
- `schedule.target_audience`
- `schedule.length_words`
- `products` (JSON list of top-rated products from the Supabase DB to inject into the article)

**Base Prompt:**
```text
Write a comprehensive, SEO-optimized blog post about "${schedule.topic}".

Target Audience: ${schedule.target_audience}
Primary Keyword: ${schedule.keyword}
Target Length: ~${schedule.length_words} words.

IMPORTANT CONTEXT:
Here are the current top 3D printers from our database. You MUST integrate some of these into the article where relevant, using their exact names and mentioning their current Amazon prices.

Products Context: 
${productsContext}

OUTPUT FORMAT REQUIRED:
Return ONLY raw HTML. Do not include <html>, <head>, or <body> tags. Start directly with the <h1>.
Do NOT use markdown code blocks (like \`\`\`html). Output the raw text.

HTML Structure Requirements:
1. Start with an SEO-optimized <h1> title.
2. Follow with a compelling <p class="lead"> introduction.
3. Use <h2> for main sections and <h3> for sub-points.
4. When mentioning a product from the context, wrap its name in a bold tag and state its price.
5. Include at least one <ul> or <ol> list for readability.
6. Format the content with high-quality, professional, yet approachable English suitable for a tech/hobbyist audience.
7. End with a <h2>Conclusion</h2> and a final thought.
```
