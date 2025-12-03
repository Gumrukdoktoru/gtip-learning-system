# CLAUDE.md - AI Assistant Guidelines for GTIP Learning System

## Project Overview

**GTIP Learning System** is an educational platform designed to help users learn and practice Turkish Customs Tariff Statistical Positions (Gümrük Tarife İstatistik Pozisyonu - GTIP). The system provides interactive learning modules, quizzes, and reference materials for customs classification codes used in Turkish import/export operations.

### Domain Context

- **GTIP codes** are 12-digit classification codes used in Turkey for customs tariff purposes
- They are based on the international Harmonized System (HS) codes
- Structure: First 6 digits = HS code, digits 7-8 = CN (Combined Nomenclature), digits 9-12 = National subdivision
- Used for determining customs duties, taxes, and trade statistics

## Repository Status

This is a **new repository** being set up. The project structure and codebase will be established following the guidelines in this document.

## Recommended Technology Stack

### Frontend
- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand or React Context (for simpler needs)
- **Forms**: React Hook Form with Zod validation

### Backend
- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js or Fastify
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT-based auth with refresh tokens
- **API Style**: RESTful with OpenAPI documentation

### Testing
- **Unit Tests**: Vitest (frontend), Jest (backend)
- **E2E Tests**: Playwright
- **Coverage Target**: 80% for critical business logic

## Project Structure (Recommended)

```
gtip-learning-system/
├── CLAUDE.md                 # This file
├── README.md                 # Project documentation
├── package.json              # Root package.json (monorepo)
├── .gitignore
├── .env.example
│
├── apps/
│   ├── web/                  # Frontend React application
│   │   ├── src/
│   │   │   ├── components/   # Reusable UI components
│   │   │   ├── pages/        # Page components
│   │   │   ├── hooks/        # Custom React hooks
│   │   │   ├── services/     # API client services
│   │   │   ├── stores/       # State management
│   │   │   ├── types/        # TypeScript type definitions
│   │   │   └── utils/        # Utility functions
│   │   └── package.json
│   │
│   └── api/                  # Backend API server
│       ├── src/
│       │   ├── controllers/  # Route handlers
│       │   ├── services/     # Business logic
│       │   ├── models/       # Database models
│       │   ├── middleware/   # Express middleware
│       │   ├── routes/       # API route definitions
│       │   ├── types/        # TypeScript types
│       │   └── utils/        # Utility functions
│       └── package.json
│
├── packages/
│   └── shared/               # Shared types and utilities
│       ├── src/
│       │   ├── types/        # Shared TypeScript types
│       │   └── constants/    # Shared constants
│       └── package.json
│
└── prisma/
    ├── schema.prisma         # Database schema
    └── migrations/           # Database migrations
```

## Coding Conventions

### TypeScript
- Use strict TypeScript configuration (`strict: true`)
- Prefer `interface` over `type` for object shapes
- Use explicit return types for functions
- Avoid `any` - use `unknown` when type is uncertain

### Naming Conventions
- **Files**: kebab-case for all files (`user-service.ts`, `gtip-card.tsx`)
- **Components**: PascalCase (`GtipCard`, `QuizQuestion`)
- **Functions/Variables**: camelCase (`getUserById`, `gtipCode`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`, `API_BASE_URL`)
- **Types/Interfaces**: PascalCase (`GtipCode`, `UserProfile`)
- **Database tables**: snake_case (`gtip_codes`, `user_progress`)

### React Components
- Use functional components with hooks
- Keep components small and focused (< 200 lines)
- Extract custom hooks for complex logic
- Use named exports for components

### API Design
- Use RESTful conventions for endpoints
- Version APIs: `/api/v1/...`
- Use proper HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Return consistent response format:
  ```typescript
  interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
      code: string;
      message: string;
    };
  }
  ```

### Error Handling
- Always handle errors explicitly
- Use custom error classes for domain errors
- Log errors with appropriate context
- Never expose internal error details to clients

## Development Workflow

### Git Branching
- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/*` - New features
- `fix/*` - Bug fixes
- `claude/*` - AI-assisted development branches

### Commit Messages
Use conventional commits format:
```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat(quiz): add multiple choice question support`
- `fix(auth): resolve token refresh race condition`
- `docs(api): update endpoint documentation`

### Pull Request Guidelines
- Include clear description of changes
- Reference related issues
- Ensure all tests pass
- Request review from at least one team member

## Common Commands

```bash
# Install dependencies
npm install

# Start development servers
npm run dev

# Run tests
npm run test

# Run linter
npm run lint

# Build for production
npm run build

# Database migrations
npm run db:migrate

# Generate Prisma client
npm run db:generate
```

## Key Domain Entities

### GtipCode
```typescript
interface GtipCode {
  id: string;
  code: string;           // 12-digit GTIP code
  description: string;    // Turkish description
  descriptionEn?: string; // English description (optional)
  hsCode: string;         // First 6 digits (HS code)
  cnCode: string;         // First 8 digits (CN code)
  dutyRate?: number;      // Customs duty rate percentage
  parentCode?: string;    // Parent code for hierarchy
  level: number;          // 2, 4, 6, 8, 10, or 12
  isLeaf: boolean;        // Whether it has children
  validFrom: Date;
  validTo?: Date;
}
```

### User
```typescript
interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'student' | 'instructor' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}
```

### Quiz
```typescript
interface Quiz {
  id: string;
  title: string;
  description: string;
  questions: QuizQuestion[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  category: string;       // GTIP section/chapter
  timeLimit?: number;     // Minutes
  passingScore: number;   // Percentage
}

interface QuizQuestion {
  id: string;
  type: 'multiple-choice' | 'classification' | 'true-false';
  question: string;
  options?: string[];
  correctAnswer: string | string[];
  explanation?: string;
  points: number;
  relatedGtipCodes: string[];
}
```

### UserProgress
```typescript
interface UserProgress {
  userId: string;
  moduleId: string;
  quizId?: string;
  score?: number;
  completed: boolean;
  attempts: number;
  lastAttemptAt: Date;
}
```

## Security Considerations

- Sanitize all user inputs
- Use parameterized queries (Prisma handles this)
- Implement rate limiting on API endpoints
- Store passwords with bcrypt (min cost factor 12)
- Use HTTPS in production
- Implement CORS properly
- Validate JWT tokens on every protected route
- Never log sensitive data (passwords, tokens)

## Performance Guidelines

- Implement pagination for list endpoints (default: 20 items)
- Use database indexes for frequently queried fields
- Cache GTIP code lookups (they change infrequently)
- Lazy load components and routes in frontend
- Optimize images and assets
- Use connection pooling for database

## Testing Guidelines

### Unit Tests
- Test business logic in isolation
- Mock external dependencies
- Aim for high coverage on services and utilities

### Integration Tests
- Test API endpoints with real database (test DB)
- Test authentication flows
- Test complex queries

### E2E Tests
- Test critical user journeys
- Run against staging environment
- Include authentication scenarios

## AI Assistant Guidelines

When working on this codebase:

1. **Read before modifying**: Always read relevant files before making changes
2. **Follow conventions**: Adhere to the naming and coding conventions above
3. **Test changes**: Run tests after making modifications
4. **Small commits**: Make focused commits with clear messages
5. **Document changes**: Update documentation when adding features
6. **Check dependencies**: Verify imports and dependencies are correct
7. **Handle errors**: Always include proper error handling
8. **Type safety**: Ensure TypeScript types are correct and complete
9. **Security first**: Consider security implications of changes
10. **Performance aware**: Consider performance impact of changes

### Common Tasks

**Adding a new API endpoint:**
1. Define types in `packages/shared/src/types/`
2. Create/update service in `apps/api/src/services/`
3. Create controller in `apps/api/src/controllers/`
4. Add route in `apps/api/src/routes/`
5. Add tests for the new endpoint

**Adding a new React component:**
1. Create component file in appropriate directory
2. Export from index if using barrel exports
3. Add unit tests
4. Update any parent components that need it

**Database schema changes:**
1. Update `prisma/schema.prisma`
2. Run `npm run db:migrate` to create migration
3. Run `npm run db:generate` to update Prisma client
4. Update related TypeScript types

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/gtip_learning

# Authentication
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=7d

# API
API_PORT=3000
API_BASE_URL=http://localhost:3000

# Frontend
VITE_API_URL=http://localhost:3000/api/v1
```

## Resources

- [Turkish Customs Tariff (GTIP) Official Site](https://uygulama.gtb.gov.tr/Tara/)
- [Harmonized System (HS) Codes](https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2022-edition.aspx)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/)
- [Prisma Documentation](https://www.prisma.io/docs/)
