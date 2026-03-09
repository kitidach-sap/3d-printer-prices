# System Architecture

This document outlines the technical architecture of the Amazon price comparison affiliate site.

## Tech Stack
- **Frontend:** Vanilla HTML, CSS, JavaScript. Hosted as static files via Express.
- **Backend:** Node.js, Express.js (deployed as Serverless Functions on Vercel)
- **Database:** Supabase (PostgreSQL)
- **Platform/Hosting:** Vercel (for serverless APIs and Cron jobs)
- **External APIs:**
  - **ScraperAPI:** For bypassing Amazon blocks during price fetching.
  - **OpenAI / Gemini:** For generating automated blog posts and X (Twitter) content.
  - **X (Twitter) API v2 (OAuth 1.0a):** For automated social media posting.

## Directory Structure
```text
/public         # Frontend static assets (HTML, CSS, JS)
  /index.html   # Main comparison table
  /admin.html   # Admin dashboard
  /blog/        # Static generated blog posts
/api
  /cron/        # Vercel Cron Job endpoints (scrape, blog, twitter)
/scraper        # Standalone scripts for local testing / debugging
/server.js      # Main Express backend, API routes, and Vercel entrypoint
/vercel.json    # Routing rules and Cron job schedules
/.env           # Environment variables (API keys, Supabase URLs)
```

## Database Schema (Supabase)

### `products`
The core catalog of items.
- `id` (uuid)
- `amazon_asin` (text, unique)
- `product_name` (text)
- `price` (numeric) - *Current price*
- `original_price` (numeric)
- `discount_percent` (numeric)
- `rating` (numeric)
- `review_count` (numeric)
- `image_url` (text)
- `brand` (text)
- `category` (text)
- `is_available` (boolean)
- `updated_at` (timestamptz)

### `scrape_logs`
Tracks the history and status of scraping and price update runs.
- `id` (uuid)
- `status` (text) - *success, partial, failed, running*
- `products_found` (integer)
- `products_saved` (integer)
- `errors_count` (integer)
- `notes` (text) - *Detailed breakdown of the job*
- `started_at` (timestamptz)
- `completed_at` (timestamptz)

### `blog_posts`
Stores generated SEO blog articles.
- `id` (uuid)
- `title` (text)
- `slug` (text, unique)
- `excerpt` (text)
- `content_html` (text)
- `published_at` (timestamptz)

### `x_posts`
Logs of automated tweets from the system.
- `id` (uuid)
- `tweet_id` (text)
- `content` (text)
- `product_asin` (text)
- `status` (text)
- `posted_at` (timestamptz)

### `settings`
Key-value store for site configuration (e.g., API keys, toggles).
- `key` (text, unique)
- `value` (text)

## Automation & Cron Jobs (vercel.json)
The project heavily relies on Vercel edge functions scheduled via cron:

1. **/api/cron/scrape (`0 6 * * *` - Daily)**
   Scrapes hardcoded Amazon search pages, extracts ASINs, checks if they exist, and saves initial data into the `products` table.
2. **/api/cron/blog (`0 8 * * 1` - Weekly)**
   Reads the `blog_schedule` table, picks the next topic, generates HTML content via GPT/Gemini, saves to DB, and statically writes the `.html` file via GitHub API or similar mechanism (or renders dynamically).
3. **/api/cron/twitter (`0 */3 * * *` - Every 3 hours)**
   Selects a highly-rated product from the database, generates a short promotional tweet via GPT, and posts it using X API.

## Core Workflows

**1. Enriching Product Data (The "Update Prices" flow)**
Because scraping search pages yields limited data, the `/api/admin/update-prices` endpoint iterates through existing products (batched) and makes requests to individual `/dp/ASIN` pages via ScraperAPI to extract rich data (`image_url`, `rating`, `original_price`, etc.). This avoids timeouts on Vercel's 10-second Hobby limit.

**2. Admin Security**
Admin endpoints in `server.js` are protected by a simple password string (`ADMIN_KEY`) passed via `x-admin-key` header or URL query parameter.
