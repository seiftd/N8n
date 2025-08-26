# Sbaro

A robust, scalable, and user-friendly workflow automation platform that surpasses existing solutions like n8n.

## 🚀 Key Features

- **Unified Execution Engine**: Support for both CPU-bound and I/O-bound tasks with intelligent routing
- **Advanced State Management**: Built-in support for long-running workflows with state persistence
- **High Availability & Scaling**: Native design for horizontal scaling
- **Superior UI/UX**: Intuitive visual workflow editor with real-time collaboration
- **Native Multi-Tenancy**: Built-in support for isolating users, workflows, and credentials
- **Comprehensive API & CLI**: Every action available via REST API and command-line interface

## 🏗️ Architecture

Sbaro is built as a microservices architecture:

1. **API Service**: Handles HTTP requests, authentication, and serves the frontend
2. **Workflow Engine Core**: Parses workflow definitions, manages triggers, and queues tasks
3. **Worker Pool**: Stateless workers that execute individual nodes
4. **WebSocket Service**: Manages real-time connections for live updates

## 🛠️ Technology Stack

### Backend
- **Runtime**: Node.js
- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL
- **Cache/Queue**: Redis
- **Authentication**: JWT

### Frontend
- **Framework**: Vue 3
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Pinia
- **Build Tool**: Vite

## 🚦 Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0
- Docker & Docker Compose

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/seiftd/sbaro.git
   cd sbaro
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development services**
   ```bash
   npm run services:up
   ```

4. **Start the development servers**
   ```bash
   npm run dev
   ```

This will start:
- PostgreSQL database on port 5432
- Redis on port 6379
- API server on http://localhost:3000
- Frontend on http://localhost:5173

### Environment Configuration

Copy the environment file and update as needed:

```bash
cd apps/api
cp .env.example .env
```

## 📁 Project Structure

```
sbaro/
├── apps/
│   ├── api/                 # NestJS backend API
│   │   ├── src/
│   │   │   ├── auth/        # Authentication module
│   │   │   ├── config/      # Configuration files
│   │   │   ├── entities/    # Database entities
│   │   │   ├── workflows/   # Workflow management
│   │   │   └── ...
│   │   └── ...
│   └── frontend/            # Vue 3 frontend
│       ├── src/
│       │   ├── components/  # Vue components
│       │   ├── views/       # Page views
│       │   ├── stores/      # Pinia stores
│       │   └── ...
│       └── ...
├── packages/                # Shared packages
├── docs/                    # Documentation
├── docker-compose.yml       # Development services
└── README.md
```

## 🔌 API Documentation

### Authentication Endpoints

- `POST /api/v1/auth/register` - Register a new user
- `POST /api/v1/auth/login` - Login user
- `GET /api/v1/auth/profile` - Get user profile
- `GET /api/v1/auth/me` - Get current user

### Workflow Endpoints

- `GET /api/v1/workflows` - List workflows
- `POST /api/v1/workflows` - Create workflow
- `GET /api/v1/workflows/:id` - Get workflow details
- `PATCH /api/v1/workflows/:id` - Update workflow
- `DELETE /api/v1/workflows/:id` - Delete workflow
- `POST /api/v1/workflows/:id/activate` - Activate workflow
- `POST /api/v1/workflows/:id/deactivate` - Deactivate workflow
- `POST /api/v1/workflows/:id/duplicate` - Duplicate workflow

### Node Management

- `POST /api/v1/workflows/:id/nodes` - Add node to workflow
- `PATCH /api/v1/workflows/:id/nodes/:nodeId` - Update node
- `DELETE /api/v1/workflows/:id/nodes/:nodeId` - Remove node

## 🎯 Development Roadmap

### Phase 1: Foundation (MVP) ✅
- [x] Set up monorepo structure
- [x] Initialize NestJS backend with TypeORM
- [x] Initialize Vue 3 frontend with TypeScript
- [x] Implement JWT Authentication
- [x] Design database schema
- [x] Build core workflow management

### Phase 2: Visual Builder & Core Nodes
- [ ] Develop visual workflow editor
- [ ] Create core node types (Trigger, Logic, Action)
- [ ] Implement drag-and-drop interface
- [ ] Add node configuration panels

### Phase 3: Execution & Real-time Features
- [ ] Implement Redis-based queue system
- [ ] Build worker service for task execution
- [ ] Add WebSocket gateway for real-time updates
- [ ] Develop execution log viewing interface

### Phase 4: Advanced Features & Polish
- [ ] Credential management system
- [ ] Advanced error handling and retry policies
- [ ] Version control for workflows
- [ ] Performance optimizations and caching
- [ ] Comprehensive testing suite

## 🧪 Testing

```bash
# Run all tests
npm test

# Run API tests only
npm run test:api

# Run frontend tests only
npm run test:frontend
```

## 📜 Scripts

- `npm run dev` - Start development environment
- `npm run build` - Build all applications
- `npm run services:up` - Start Docker services
- `npm run services:down` - Stop Docker services
- `npm run services:logs` - View service logs
- `npm run db:reset` - Reset database

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by n8n but built to surpass its limitations
- Built with modern technologies for superior performance and developer experience