/** The collab server the online browser tests talk to (started by playwright.config.ts). Not a real secret: tests only. */
export const COLLAB_TEST_PORT = 1235;
export const COLLAB_TEST_SECRET = "e2e-test-secret-not-for-real-use-0000";
export const COLLAB_TEST_URL = `ws://127.0.0.1:${COLLAB_TEST_PORT}`;
