import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import pino from 'pino';
import { app } from '../src/index.js';
import { UserModel } from '../src/modules/auth/models/user.model.js';
import { TokenService } from '../src/modules/auth/services/token.service.js';
import { ChallengeModel } from '../src/modules/challenge/models/challenge.model.js';
import { AssessmentLifecycleService } from '../src/modules/assessment/services/assessment-lifecycle.service.js';
import { OutboxDispatcherService } from '../src/modules/assessment/services/outbox-dispatcher.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';

async function bootstrapDevServer() {
  console.log(`\n${BOLD}${MAGENTA}================================================================================`);
  console.log(`                 REPORDOJO LOCAL STANDALONE DEV SERVER`);
  console.log(`       "Train on real codebases. Prepare for real engineering."`);
  console.log(`================================================================================${RESET}\n`);

  process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(
    __dirname,
    '../../node_modules/.cache/mongodb-memory-server'
  );

  let mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.log(`${CYAN}[1/4] Starting ephemeral in-memory MongoDB server...${RESET}`);
    const mongoServer = await MongoMemoryServer.create();
    mongoUri = mongoServer.getUri();
  }

  await mongoose.connect(mongoUri);
  console.log(`${GREEN}[✓] Connected to MongoDB: ${mongoUri}${RESET}`);

  // 1. Seed demo candidate user
  console.log(`${CYAN}[2/4] Seeding demo candidate account...${RESET}`);
  let candidate = await UserModel.findOne({ email: 'alex.chen@repodojo.dev' });
  if (!candidate) {
    candidate = await UserModel.create({
      googleId: 'google-oauth-candidate-dev',
      email: 'alex.chen@repodojo.dev',
      name: 'Alex Chen',
      avatarUrl: 'https://avatar.repodojo.dev/alex.png',
      role: 'candidate',
    });
  }
  const token = TokenService.generateAccessToken(candidate);
  console.log(`${GREEN}[✓] Candidate account ready: ${candidate.email} (${candidate._id})${RESET}`);

  // 2. Seed starter challenge
  console.log(`${CYAN}[3/4] Seeding challenge catalog (node-ecommerce-01)...${RESET}`);
  let challenge = await ChallengeModel.findOne({ id: 'node-ecommerce-01' });
  if (!challenge) {
    challenge = await ChallengeModel.create({
      id: 'node-ecommerce-01',
      title: 'High-Concurrency E-Commerce Microservice',
      version: 'v1.0.0',
      description: 'Production Node.js microservice containing 8 real-world logical and concurrency defects.',
      difficulty: 'medium',
      durationMinutes: 60,
      runtime: {
        language: 'nodejs',
        nodeVersion: '22',
        ports: { frontend: 5173, backend: 5000 },
      },
      starterFiles: {
        'src/controllers/order.controller.ts':
          '// Starter code: Defect #2 off-by-one discount\nexport function calculateDiscount(qty: number) {\n  if (qty > 10) return 0.20;\n  return 0.05;\n}\n',
        'src/services/payment.service.ts':
          '// Starter code: Defect #3 unawaited promise\nexport function processPayment() {\n  return Promise.resolve({ success: true });\n}\n',
      },
      rubrics: {
        functionalWeight: 60,
        codeQualityWeight: 20,
        trajectoryWeight: 20,
      },
      manifestHash: 'sha256-node-ecommerce-01-manifest-hash-verified',
      isPublished: true,
      defects: [
        {
          id: 'DEF-01',
          title: 'Missing CORS Headers',
          description: 'CORS headers missing on public API',
          affectedFiles: ['src/index.ts'],
          prerequisites: [],
          points: 6,
        },
        {
          id: 'DEF-02',
          title: 'Off-by-One Discount Math',
          description: 'Discount calculation fails on threshold quantity',
          affectedFiles: ['src/controllers/order.controller.ts'],
          prerequisites: ['DEF-01'],
          points: 6,
        },
        {
          id: 'DEF-03',
          title: 'Unawaited Payment Promise',
          description: 'Payment gateway promise is unawaited',
          affectedFiles: ['src/controllers/order.controller.ts'],
          prerequisites: ['DEF-02'],
          points: 6,
        },
        {
          id: 'DEF-04',
          title: 'Inverted Promo Multiplier',
          description: 'Discount multiplier calculation inverted',
          affectedFiles: ['src/services/payment.service.ts'],
          prerequisites: ['DEF-02'],
          points: 6,
        },
        {
          id: 'DEF-05',
          title: 'Webhook Idempotency Race',
          description: 'Webhook idempotency key race condition',
          affectedFiles: ['src/controllers/webhook.controller.ts'],
          prerequisites: ['DEF-03'],
          points: 6,
        },
        {
          id: 'DEF-06',
          title: 'Stale Cart Cache Invalidation',
          description: 'Redis cache not invalidated on item delete',
          affectedFiles: ['src/services/cart.service.ts'],
          prerequisites: [],
          points: 6,
        },
        {
          id: 'DEF-07',
          title: 'Missing Order Sequence Lock',
          description: 'Order sequence generator concurrency race',
          affectedFiles: ['src/models/order.model.ts'],
          prerequisites: ['DEF-05'],
          points: 6,
        },
        {
          id: 'DEF-08',
          title: 'Email Template Typo',
          description: 'Notification template variable misspelled',
          affectedFiles: ['src/services/email.service.ts'],
          prerequisites: ['DEF-07'],
          points: 6,
        },
      ],
    });
  }
  console.log(`${GREEN}[✓] Challenge catalog seeded: ${challenge.title} (${challenge.defects.length} defects)${RESET}`);

  // 3. Create active assessment session
  console.log(`${CYAN}[4/4] Creating active assessment session for demo...${RESET}`);
  let session = await AssessmentLifecycleService.createSession({
    candidateId: candidate._id.toString(),
    challengeId: challenge.id,
    durationMinutes: 60,
  });
  session = await AssessmentLifecycleService.startSession(session._id.toString(), candidate._id.toString());
  console.log(`${GREEN}[✓] Active session ready: ${session._id} (Status: ${session.status})${RESET}`);

  // Start Outbox Dispatcher polling loop
  OutboxDispatcherService.startPolling(2000);

  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`\n${BOLD}${GREEN}================================================================================`);
    console.log(`  ✓ RepoDojo API Server listening at http://localhost:${port}`);
    console.log(`  ✓ Auth Cookie Token: access_token=${token.substring(0, 20)}...`);
    console.log(`  ✓ Web Frontend: http://localhost:5173`);
    console.log(`================================================================================${RESET}\n`);
    console.log(`${YELLOW}To explore the UI:${RESET}`);
    console.log(`1. In a separate terminal run: ${BOLD}pnpm --filter @repodojo/web dev${RESET}`);
    console.log(`2. Open ${BOLD}http://localhost:5173${RESET} in your browser.`);
    console.log(`3. Use active Session ID: ${BOLD}${session._id}${RESET}\n`);
  });
}

bootstrapDevServer().catch((err) => {
  logger.error({ err }, 'Failed to start RepoDojo Dev Server');
  process.exit(1);
});
