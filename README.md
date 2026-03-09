# 3D Printer Prices
A 3D printer price comparison site that helps users find the best deals on Amazon.
This project uses Node.js, Express, a Supabase PostgreSQL backend, and Vercel for hosting and cron jobs.

## Features
- Fetches live 3D printer prices from Amazon via ScraperAPI.
- Stores data in a Supabase PostgreSQL database.
- AI-generated blog posts using OpenAI / Gemini.
- Automated X (Twitter) posting using X API v2 (OAuth 1.0a).
- Admin dashboard to trigger manual scrapes, price updates, blog posts, and tweet posts.

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- Supabase account and a new project/database
- Vercel account
- APIs: ScraperAPI, OpenAI or Gemini Key, X (Twitter) Developer Keys

### 1. Environment Variables
Copy `.env.example` to `.env` and fill in the values:
```bash
cp .env.example .env
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Locally
```bash
npm start
```

### 4. Deploy to Vercel
Connect your repository to Vercel and import the project. Ensure you add all environment variables in the Vercel Settings panel.

### Supabase Schema Setup
Create the required tables (`products`, `scrape_logs`, `blog_posts`, `blog_schedule`, `x_posts`, `settings`) by executing the SQL files or by letting the API auto-initialize them where applicable.
