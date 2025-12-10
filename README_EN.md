# The Daily Artefact

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

An automated "Daily Artefact" 3D monument application that selects an interesting event from global news each day and generates a witty commentary with a 3D model to commemorate it.

🌐 **Live Demo**: [https://today.tokenroll.ai](https://today.tokenroll.ai)

## ✨ Features

- **Fully Automated**: Daily content generation without human intervention
- **AI-Powered**: Uses GPT to create witty commentary and 3D model prompts from news
- **Two-Step Generation**: Image → Model workflow for higher success rates and quality
- **Task Recovery**: Resumable generation process from any interruption point
- **Multi-language Support**: Frontend automatically displays in Chinese or English based on browser language
- **3D Visualization**: Interactive 3D models with Three.js rendering
- **URL Routing**: Share specific dates with `/YYYY-MM-DD` format
- **Zero Server**: Completely built on Cloudflare's global distributed infrastructure

## 🏗️ Architecture

The Daily Artefact is a fully automated content generation pipeline running on Cloudflare Workers serverless platform. The system automatically:

1. **Collects**: Uses Tavily API to search daily global news and filter interesting events
2. **Creates**: Calls GPT to generate:
   - Witty commentary (Chinese, 2-3 sentences, like chatting with friends)
   - Virtual "object" representing the event
   - 3D generation prompt for the object (English)
   - Geographic coordinates and location information
3. **Models** (Two-step workflow):
   - **Step 1**: Uses Tripo Nano Banana for fast intermediate image generation
   - **Step 2**: Uses generated image with Tripo 3D API to create high-quality GLB 3D models
   - **Task Recovery**: If process is interrupted, can resume from `/api/resume/:date`
4. **Stores**: Uploads models to Cloudflare R2, records metadata to D1 SQLite database
5. **Displays**: Frontend renders 3D models in real-time using Three.js with new layout and interactive experience

The entire process is fully automated, triggered daily at UTC 00:00 (Beijing Time 08:00) via Cloudflare Cron Triggers. Users can access the latest generated models and content in real-time.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare account
- API keys for OpenAI, Tavily, and Tripo

### Installation

1. Clone this repository:

```bash
git clone https://github.com/yourusername/today-3d.git
cd today-3d
```

2. Install dependencies:

```bash
npm install
```

3. Login to Cloudflare:

```bash
npx wrangler login
```

4. Create D1 database:

```bash
npx wrangler d1 create today-3d-db
```

5. Update `wrangler.toml` with your database ID:

```toml
[[d1_databases]]
binding = "DB"
database_name = "today-3d-db"
database_id = "your-database-id"  # Replace this
```

6. Create R2 storage bucket:

```bash
npx wrangler r2 bucket create today-3d-models
```

7. Set up environment variables:

```bash
# Create .dev.vars for local development
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your actual API keys

# Set production secrets
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put TAVILY_API_KEY
npx wrangler secret put TRIPO_API_KEY
```

8. Run database migrations:

```bash
# Local
npm run db:migrate

# Production
npm run db:migrate:prod
```

### Development

Start the development server:

```bash
npm run dev
```

Visit http://localhost:8787 to see the application.

### Deployment

Deploy to production:

```bash
npm run deploy
```

## 📡 API Endpoints

| Endpoint                | Method | Description                                 |
| ----------------------- | ------ | ------------------------------------------- |
| `/api/health`           | GET    | Health check                                |
| `/api/today`            | GET    | Get today's/latest model data               |
| `/api/date/:date`       | GET    | Get model data for specific date            |
| `/api/date/:date/prev`  | GET    | Get previous day's model                    |
| `/api/date/:date/next`  | GET    | Get next day's model                        |
| `/api/dates`            | GET    | Get all available dates                     |
| `/api/model/:key`       | GET    | Get GLB model file from R2                  |
| `/api/generate`         | POST   | Manually trigger generation (requires auth) |
| `/api/generate/:date`   | POST   | Generate for specific date (requires auth)  |
| `/api/regenerate/:date` | POST   | Force regenerate for date (requires auth)   |
| `/api/resume/:date`     | POST   | Resume interrupted task (requires auth)     |
| `/api/translate/:date`  | POST   | Translate record for date (requires auth)   |
| `/api/translate-all`    | POST   | Batch translate all records (requires auth) |

## 🛠️ Tech Stack

- **Backend**: Cloudflare Workers + Hono framework (TypeScript)
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2
- **Frontend**: Vanilla JavaScript + Three.js + OrbitControls + GLTFLoader
- **External APIs**:
  - Tavily API (news search)
  - OpenAI API (content generation)
  - Tripo 3D API (image and model generation)
- **Analytics**: Umami for user behavior tracking

## 📁 Project Structure

```
today-3d/
├── src/
│   ├── index.ts          # Main entry, Hono application
│   ├── types.ts          # TypeScript type definitions
│   └── services/
│       ├── tavily.ts     # Tavily search API
│       ├── openai.ts     # GPT content generation
│       ├── tripo.ts      # Tripo 3D model generation
│       ├── storage.ts    # D1 + R2 storage operations
│       └── translate.ts  # Translation service
├── migrations/
│   ├── 0001_init.sql     # Database initialization
│   ├── 0002_add_task_id.sql
│   └── 0002_add_translations.sql
├── public/
│   └── index.html        # Frontend application
├── scripts/              # Utility scripts
├── llmdoc/              # Project documentation
├── wrangler.toml        # Cloudflare configuration
└── package.json
```

## 🌍 Internationalization

The frontend supports multiple languages and automatically detects the user's browser language:

- Chinese (zh) - Default
- English (en)
- Japanese (ja)
- Korean (ko)
- Spanish (es)
- Russian (ru)
- Portuguese (pt)

Content is originally generated in Chinese and automatically translated to other languages using OpenAI API.

## 💰 Cost Estimation (Monthly)

| Service | Free Tier           | Estimated Usage |
| ------- | ------------------- | --------------- |
| Workers | 100K requests/day   | ✅ Free         |
| D1      | 5GB storage         | ✅ Free         |
| R2      | 10GB storage        | ✅ Free         |
| OpenAI  | -                   | ~$1-3           |
| Tavily  | 1000 requests/month | ✅ Free         |
| Tripo   | Pay-per-use         | ~$5-10          |

**Total: ~$10-15/month** (mainly 3D generation costs)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Tripo](https://tripo3d.ai/) - 3D model generation API
- [Cloudflare](https://www.cloudflare.com/) - Serverless platform and services
- [Three.js](https://threejs.org/) - 3D graphics library
- [Hono](https://hono.dev/) - Web framework
- [Tavily](https://tavily.com/) - Search API
- [OpenAI](https://openai.com/) - AI content generation

## 📞 Contact

If you have any questions or suggestions, feel free to open an issue or contact the project maintainers.

---

**Built with ❤️ and AI**
