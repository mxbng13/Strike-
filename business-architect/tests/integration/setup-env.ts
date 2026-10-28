process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://ba:ba@localhost:5432/business_architect_test";
process.env.APP_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
// Integration tests must never hit paid APIs implicitly.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.BRAVE_SEARCH_API_KEY;
delete process.env.TAVILY_API_KEY;
delete process.env.EXA_API_KEY;
process.env.SANDBOX_DIR = "./sandbox-runs/test";
