import { Test, TestingModule } from '@nestjs/testing';
import { ContextBuilderService } from '../src/auth/context-builder.service';
import { DatabaseService } from '../src/db/database.service';

// These tests are integration-style and require a running test database configured
// via DATABASE_URL. They mock minimal queries by stubbing DatabaseService.query.

describe('ContextBuilderService', () => {
  let service: ContextBuilderService;
  let db: Partial<DatabaseService>;

  beforeEach(async () => {
    db = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextBuilderService,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();

    service = module.get<ContextBuilderService>(ContextBuilderService);
  });

  it('returns context when orgId header present and user member', async () => {
    const fakeRow = {
      context: {
        actor: { userId: 'u1', realUserId: 'u1', isImpersonated: false },
        org: { id: 'o1', name: 'Org 1' },
        project: null,
        permissions: ['read', 'write'],
        limits: { cards: 100 },
        flags: { beta: true },
        meta: { orgRole: 'owner', projectRole: null },
      },
    };

    (db.query as jest.Mock).mockResolvedValue({ rows: [fakeRow] });

    const res = await service.build({ userId: 'u1', orgId: 'o1' });
    expect(res.org?.id).toBe('o1');
    expect(res.permissions).toEqual(['read', 'write']);
  });

  it('throws ConflictException when org not resolved', async () => {
    (db.query as jest.Mock).mockResolvedValue({ rows: [{ context: null }] });

    await expect(service.build({ userId: 'u1' })).rejects.toThrow();
  });
});
